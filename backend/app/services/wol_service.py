import socket
import re
import ipaddress
from typing import List, Optional, Tuple, Dict, Any
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.device import Device
from app.models.inventory import DeviceInventory
from app.models.group import DeviceGroupMember
from app.core.logging import logger


def clean_mac_address(mac: str) -> Optional[str]:
    """
    Nettoie et valide une adresse MAC (formats supportés: XX:XX:XX:XX:XX:XX, XX-XX-XX-XX-XX-XX, XXXXXXXXXXXX).
    Retourne la chaîne hexadécimale de 12 caractères en majuscules ou None si invalide.
    """
    if not mac or not isinstance(mac, str):
        return None
    cleaned = re.sub(r'[^0-9A-Fa-f]', '', mac).upper()
    if len(cleaned) == 12:
        return cleaned
    return None


def format_mac(mac_hex: str) -> str:
    """Formate une adresse MAC brute en format standard XX:XX:XX:XX:XX:XX"""
    return ":".join(mac_hex[i:i+2] for i in range(0, 12, 2))


def build_magic_packet(mac_hex: str) -> bytes:
    """
    Construit le paquet magique Wake-on-LAN standard :
    6 octets de 0xFF suivis de 16 répétitions des 6 octets de l'adresse MAC.
    """
    hw_addr = bytes.fromhex(mac_hex)
    return b'\xff' * 6 + hw_addr * 16


def calculate_broadcast_ips(device_ip: Optional[str] = None) -> List[str]:
    """
    Calcule les adresses de diffusion (broadcast) cibles :
    - L'adresse universelle '255.255.255.255'
    - Si l'adresse IP de la machine est connue, déduit l'adresse de diffusion du sous-réseau (ex: 192.168.224.255 pour un /24).
    """
    broadcast_list = ["255.255.255.255"]
    if device_ip:
        try:
            ip_obj = ipaddress.IPv4Address(device_ip)
            if not ip_obj.is_loopback and not ip_obj.is_link_local:
                net = ipaddress.IPv4Network(f"{device_ip}/24", strict=False)
                subnet_broadcast = str(net.broadcast_address)
                if subnet_broadcast not in broadcast_list:
                    broadcast_list.append(subnet_broadcast)
        except Exception:
            pass
    return broadcast_list


def send_magic_packet(mac: str, broadcast_ip: Optional[str] = None, device_ip: Optional[str] = None, ports: Tuple[int, ...] = (9, 7)) -> Dict[str, Any]:
    """
    Envoie un paquet magique WoL pour une adresse MAC donnée sur les ports spécifiés.
    """
    clean_mac = clean_mac_address(mac)
    if not clean_mac:
        return {
            "mac": mac,
            "success": False,
            "error": "Format d'adresse MAC invalide."
        }

    packet = build_magic_packet(clean_mac)
    targets = [broadcast_ip] if broadcast_ip else calculate_broadcast_ips(device_ip)
    
    sent_count = 0
    errors = []

    for target in targets:
        for port in ports:
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
                    sock.settimeout(2.0)
                    sock.sendto(packet, (target, port))
                    sent_count += 1
            except Exception as e:
                errors.append(f"Erreur envoi vers {target}:{port} - {str(e)}")

    formatted = format_mac(clean_mac)
    logger.info(f"[Wake-on-LAN] Paquet magique émis pour {formatted} vers {targets} sur les ports {ports}")

    return {
        "mac": formatted,
        "success": sent_count > 0,
        "packets_sent": sent_count,
        "broadcast_targets": targets,
        "errors": errors if errors else None
    }


class WolService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_device_macs(self, device: Device) -> List[str]:
        """Extrait toutes les adresses MAC valides d'une machine à partir de son inventaire."""
        macs = []
        
        # 1. Vérifier la relation inventaire
        res = await self.db.execute(
            select(DeviceInventory).where(DeviceInventory.device_id == device.id)
        )
        inv = res.scalar_one_or_none()
        
        if inv:
            # mac_addresses est une liste JSON
            if inv.mac_addresses and isinstance(inv.mac_addresses, list):
                for m in inv.mac_addresses:
                    cleaned = clean_mac_address(m)
                    if cleaned and cleaned not in macs:
                        macs.append(cleaned)

            # network_interfaces est une liste de dicts
            if inv.network_interfaces and isinstance(inv.network_interfaces, list):
                for iface in inv.network_interfaces:
                    if isinstance(iface, dict):
                        m = iface.get("mac_address") or iface.get("mac")
                        cleaned = clean_mac_address(m)
                        if cleaned and cleaned not in macs:
                            macs.append(cleaned)

        return macs

    async def wake_device(self, device_id: UUID) -> Dict[str, Any]:
        """Réveille une machine unique par son identifiant MAPT."""
        res = await self.db.execute(select(Device).where(Device.id == device_id))
        device = res.scalar_one_or_none()
        if not device:
            return {"device_id": str(device_id), "success": False, "error": "Machine introuvable."}

        macs = await self.get_device_macs(device)
        if not macs:
            return {
                "device_id": str(device.id),
                "hostname": device.hostname,
                "success": False,
                "error": "Aucune adresse MAC connue dans l'inventaire de cette machine."
            }

        results = []
        for mac_hex in macs:
            r = send_magic_packet(mac_hex, device_ip=device.ip_address)
            results.append(r)

        return {
            "device_id": str(device.id),
            "hostname": device.hostname,
            "ip_address": device.ip_address,
            "success": any(r.get("success") for r in results),
            "mac_results": results,
            "message": f"Paquets magiques envoyés pour {device.hostname} ({len(macs)} interface(s) MAC)."
        }

    async def wake_devices(self, device_ids: List[UUID]) -> Dict[str, Any]:
        """Réveille une liste de machines en parallèle."""
        results = []
        successful = 0
        
        for d_id in device_ids:
            res = await self.wake_device(d_id)
            results.append(res)
            if res.get("success"):
                successful += 1

        return {
            "total_requested": len(device_ids),
            "successful": successful,
            "devices": results,
            "message": f"Wake-on-LAN exécuté sur {successful}/{len(device_ids)} machine(s)."
        }

    async def wake_group(self, group_id: UUID) -> Dict[str, Any]:
        """Réveille toutes les machines membres d'un groupe."""
        res = await self.db.execute(
            select(DeviceGroupMember.device_id).where(DeviceGroupMember.group_id == group_id)
        )
        device_ids = [row[0] for row in res.all()]
        
        if not device_ids:
            return {
                "group_id": str(group_id),
                "total_devices": 0,
                "successful": 0,
                "message": "Aucune machine membre dans ce groupe."
            }

        batch_result = await self.wake_devices(device_ids)
        batch_result["group_id"] = str(group_id)
        return batch_result
