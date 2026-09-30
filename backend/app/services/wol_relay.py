"""
Service de relai Wake-on-LAN exécuté sur l'hôte (network_mode: host).
Ce relai écoute sur le port UDP 9009 et rediffuse les paquets magiques WoL
directement sur les interfaces physiques de l'hôte (ex: ens18) en broadcast
universel (255.255.255.255) et broadcast de sous-réseau (ex: 192.168.239.255).
"""

import socket
import os
import sys
import time
import logging
import subprocess
import re
from typing import List, Set

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [mapt-wol-relay] %(message)s"
)
logger = logging.getLogger("mapt-wol-relay")

LISTEN_PORT = int(os.getenv("WOL_RELAY_PORT", "9009"))
LISTEN_HOST = os.getenv("WOL_RELAY_HOST", "0.0.0.0")
TARGET_PORTS = (9, 7)


def get_host_broadcast_addresses() -> List[str]:
    """
    Détecte automatiquement les adresses de diffusion IPv4 de l'hôte.
    """
    bcasts: Set[str] = {"255.255.255.255"}
    try:
        out = subprocess.check_output(["ip", "-4", "-o", "addr", "show"], timeout=5).decode("utf-8", errors="replace")
        for line in out.splitlines():
            m = re.search(r'brd\s+(\S+)', line)
            if m:
                b = m.group(1).strip()
                # Ignorer les bridges Docker locaux et le loopback
                if not b.startswith("172.1") and not b.startswith("127."):
                    bcasts.add(b)
    except Exception as e:
        logger.warning(f"Impossible de lister dynamiquement les interfaces IP: {e}")
        # Sous-réseaux connus par défaut du parc
        bcasts.update(["192.168.239.255", "192.168.224.255", "192.168.236.255", "192.168.237.255"])

    return sorted(list(bcasts))


def format_mac(raw_bytes: bytes) -> str:
    return ":".join(f"{b:02X}" for b in raw_bytes)


def run_relay():
    logger.info(f"Démarrage du relai Wake-on-LAN MAPT sur {LISTEN_HOST}:{LISTEN_PORT}...")
    broadcast_targets = get_host_broadcast_addresses()
    logger.info(f"Cibles de diffusion initiales : {broadcast_targets}")

    # Socket de réception
    recv_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        recv_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        recv_sock.bind((LISTEN_HOST, LISTEN_PORT))
    except Exception as e:
        logger.error(f"Échec de liaison du socket de réception sur {LISTEN_HOST}:{LISTEN_PORT} : {e}")
        sys.exit(1)

    # Socket d'émission en broadcast
    send_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    send_sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)

    last_bcast_refresh = time.time()

    while True:
        try:
            # Rafraîchir les broadcast toutes les 5 minutes
            if time.time() - last_bcast_refresh > 300:
                broadcast_targets = get_host_broadcast_addresses()
                last_bcast_refresh = time.time()

            data, client_addr = recv_sock.recvfrom(2048)
            if not data:
                continue

            # Vérifier si c'est un paquet magique WoL standard (au moins 102 octets, commence par 6x 0xFF)
            if len(data) >= 102 and data.startswith(b"\xff\xff\xff\xff\xff\xff"):
                target_mac = format_mac(data[6:12])
                logger.info(f"Paquet magique reçu de {client_addr} pour MAC {target_mac}. Rediffusion physique...")

                # Émission de 2 salves espacées de 40ms (bonne pratique WoL)
                for salvo in range(2):
                    for target_ip in broadcast_targets:
                        for port in TARGET_PORTS:
                            try:
                                send_sock.sendto(data, (target_ip, port))
                            except Exception as ex:
                                logger.debug(f"Erreur d'envoi vers {target_ip}:{port} : {ex}")
                    if salvo == 0:
                        time.sleep(0.04)

        except Exception as e:
            logger.error(f"Erreur dans la boucle de relai WoL : {e}")
            time.sleep(0.5)


if __name__ == "__main__":
    run_relay()
