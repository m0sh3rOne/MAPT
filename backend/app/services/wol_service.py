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
    if not mac_hex or len(mac_hex) != 12:
        return mac_hex
    return ":".join(mac_hex[i:i+2] for i in range(0, 12, 2))


def build_magic_packet(mac_hex: str) -> bytes:
    """
    Construit le paquet magique Wake-on-LAN standard :
    6 octets de 0xFF suivis de 16 répétitions des 6 octets de l'adresse MAC.
    """
    hw_addr = bytes.fromhex(mac_hex)
    return b'\xff' * 6 + hw_addr * 16


def calculate_broadcast_ips(
    device_ip: Optional[str] = None,
    network_interfaces: Optional[List[Dict[str, Any]]] = None
) -> List[str]:
    """
    Calcule la liste exhaustive des adresses de diffusion (broadcast) cibles :
    - L'adresse universelle '255.255.255.255'
    - Les adresses de broadcast calculées à partir des interfaces physiques rapportées par l'agent (IP + Masque de sous-réseau)
    - Les broadcast de passerelle et sous-réseaux locaux du parc.
    """
    broadcast_list = ["255.255.255.255"]

    # 1. Analyse des interfaces réseau de l'inventaire matériel
    if network_interfaces and isinstance(network_interfaces, list):
        for iface in network_interfaces:
            if not isinstance(iface, dict):
                continue
            
            ips = list(iface.get("ip_addresses") or [])
            primary_ip = iface.get("primary_ip")
            if primary_ip and primary_ip not in ips:
                ips.append(primary_ip)
                
            masks = list(iface.get("subnet_masks") or [])

            for idx, ip_str in enumerate(ips):
                if not ip_str or ":" in str(ip_str):  # Ignorer IPv6
                    continue
                ip_str = str(ip_str).strip()
                if ip_str.startswith("127.") or ip_str.startswith("169.254."):
                    continue

                mask_str = str(masks[idx]).strip() if idx < len(masks) else "255.255.255.0"
                if ":" in mask_str or not mask_str:
                    mask_str = "255.255.255.0"

                try:
                    # Calcul du broadcast exact selon le masque (ex: /20 pour 255.255.240.0)
                    net = ipaddress.IPv4Network(f"{ip_str}/{mask_str}", strict=False)
                    bcast = str(net.broadcast_address)
                    if bcast not in broadcast_list:
                        broadcast_list.append(bcast)
                except Exception:
                    pass

                try:
                    # Ajout également du broadcast /24 par précaution
                    net24 = ipaddress.IPv4Network(f"{ip_str}/24", strict=False)
                    bcast24 = str(net24.broadcast_address)
                    if bcast24 not in broadcast_list:
                        broadcast_list.append(bcast24)
                except Exception:
                    pass

                # Ajout de l'IP directe (unicast WoL accepté par certains switchs et cartes mères)
                if ip_str not in broadcast_list:
                    broadcast_list.append(ip_str)

            # Passerelle par défaut
            gw = iface.get("default_gateways")
            if isinstance(gw, str) and gw and ":" not in gw and not gw.startswith("127."):
                try:
                    gw_net = ipaddress.IPv4Network(f"{gw}/24", strict=False)
                    gw_bcast = str(gw_net.broadcast_address)
                    if gw_bcast not in broadcast_list:
                        broadcast_list.append(gw_bcast)
                except Exception:
                    pass

    # 2. IP directe enregistrée dans l'objet device
    if device_ip and ":" not in device_ip and not device_ip.startswith("127.") and not device_ip.startswith("172.18."):
        try:
            net = ipaddress.IPv4Network(f"{device_ip}/24", strict=False)
            bcast = str(net.broadcast_address)
            if bcast not in broadcast_list:
                broadcast_list.append(bcast)
        except Exception:
            pass

    # 3. Broadcasts standards du réseau local du serveur MAPT (Proxmox LAN)
    common_subnets = ["192.168.224.255", "192.168.239.255", "192.168.236.255", "192.168.237.255", "192.168.1.255"]
    for cs in common_subnets:
        if cs not in broadcast_list:
            broadcast_list.append(cs)

    return broadcast_list


def send_magic_packet(
    mac: str,
    broadcast_ip: Optional[str] = None,
    device_ip: Optional[str] = None,
    network_interfaces: Optional[List[Dict[str, Any]]] = None,
    ports: Tuple[int, ...] = (9, 7)
) -> Dict[str, Any]:
    """
    Envoie un paquet magique WoL pour une adresse MAC donnée sur l'ensemble des cibles réseau.
    """
    clean_mac = clean_mac_address(mac)
    if not clean_mac:
        return {
            "mac_address": mac,
            "broadcast_ip": broadcast_ip or "255.255.255.255",
            "port": 9,
            "success": False,
            "message": f"Format d'adresse MAC invalide: {mac}"
        }

    packet = build_magic_packet(clean_mac)
    targets = [broadcast_ip] if broadcast_ip else calculate_broadcast_ips(device_ip, network_interfaces)
    
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
    primary_target = targets[0] if targets else "255.255.255.255"
    logger.info(f"[Wake-on-LAN] Paquet magique émis pour {formatted} vers {targets} sur les ports {ports}")

    return {
        "mac_address": formatted,
        "broadcast_ip": primary_target,
        "port": 9,
        "success": sent_count > 0,
        "packets_sent": sent_count,
        "broadcast_targets": targets,
        "message": f"Paquet magique Wake-on-LAN diffusé avec succès vers {formatted} ({sent_count} paquets sur {len(targets)} cibles).",
        "errors": errors if errors else None
    }


class WolService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_device_network_info(self, device: Device) -> Tuple[List[str], List[Dict[str, Any]], Optional[str]]:
        """Extrait toutes les adresses MAC valides, les interfaces et la meilleure IP d'une machine."""
        macs = []
        interfaces = []
        best_ip = None
        
        res = await self.db.execute(
            select(DeviceInventory).where(DeviceInventory.device_id == device.id)
        )
        inv = res.scalar_one_or_none()
        
        if inv:
            # 1. mac_addresses liste
            if inv.mac_addresses and isinstance(inv.mac_addresses, list):
                for m in inv.mac_addresses:
                    cleaned = clean_mac_address(m)
                    if cleaned and cleaned not in macs:
                        macs.append(cleaned)

            # 2. network_interfaces liste
            if inv.network_interfaces and isinstance(inv.network_interfaces, list):
                interfaces = inv.network_interfaces
                for iface in inv.network_interfaces:
                    if isinstance(iface, dict):
                        m = iface.get("mac_address") or iface.get("mac")
                        cleaned = clean_mac_address(m)
                        # Priorité aux cartes physiques connectées
                        if iface.get("is_physical", True) and cleaned and cleaned not in macs:
                            macs.insert(0, cleaned)
                        elif cleaned and cleaned not in macs:
                            macs.append(cleaned)
                        
                        # Extraire la meilleure IP réelle
                        if not best_ip and iface.get("status") == "Connected" and iface.get("primary_ip"):
                            best_ip = iface.get("primary_ip")

        if not best_ip and device.ip_address and not device.ip_address.startswith("172.18."):
            best_ip = device.ip_address

        return macs, interfaces, best_ip

    async def wake_device(self, device_id: UUID) -> Dict[str, Any]:
        """Réveille une machine unique par son identifiant MAPT."""
        res = await self.db.execute(select(Device).where(Device.id == device_id))
        device = res.scalar_one_or_none()
        if not device:
            return {
                "device_id": str(device_id),
                "mac_address": "",
                "broadcast_ip": "255.255.255.255",
                "port": 9,
                "success": False,
                "message": "Machine introuvable."
            }

        macs, interfaces, real_ip = await self.get_device_network_info(device)
        if not macs:
            return {
                "device_id": str(device.id),
                "hostname": device.hostname,
                "mac_address": "",
                "broadcast_ip": "255.255.255.255",
                "port": 9,
                "success": False,
                "message": f"Aucune adresse MAC connue dans l'inventaire de la machine {device.hostname}."
            }

        primary_mac_formatted = format_mac(macs[0])
        results = []
        for mac_hex in macs:
            r = send_magic_packet(
                mac_hex,
                device_ip=real_ip or device.ip_address,
                network_interfaces=interfaces
            )
            results.append(r)

        all_targets = set()
        for r in results:
            for t in r.get("broadcast_targets", []):
                all_targets.add(t)

        success = any(r.get("success") for r in results)
        targets_str = ", ".join(list(all_targets)[:4])

        return {
            "device_id": str(device.id),
            "hostname": device.hostname,
            "mac_address": primary_mac_formatted,
            "mac_addresses": [format_mac(m) for m in macs],
            "broadcast_ip": targets_str or "255.255.255.255",
            "port": 9,
            "ip_address": real_ip or device.ip_address,
            "success": success,
            "mac_results": results,
            "message": f"Paquet magique Wake-on-LAN envoyé avec succès à {primary_mac_formatted} ({device.hostname}) sur {len(all_targets)} cibles réseau."
        }

    async def wake_devices(self, device_ids: List[UUID]) -> List[Dict[str, Any]]:
        """Réveille une liste de machines en parallèle et retourne les résultats."""
        results = []
        for d_id in device_ids:
            res = await self.wake_device(d_id)
            results.append(res)
        return results

    async def wake_group(self, group_id: UUID) -> List[Dict[str, Any]]:
        """Réveille toutes les machines membres d'un groupe."""
        res = await self.db.execute(
            select(DeviceGroupMember.device_id).where(DeviceGroupMember.group_id == group_id)
        )
        device_ids = [row[0] for row in res.all()]
        
        if not device_ids:
            return [{
                "device_id": str(group_id),
                "mac_address": "",
                "broadcast_ip": "255.255.255.255",
                "port": 9,
                "success": False,
                "message": "Aucune machine membre dans ce groupe."
            }]

        return await self.wake_devices(device_ids)


