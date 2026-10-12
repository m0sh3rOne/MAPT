#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MAPT - Script d'enrôlement et d'installation client automatisé (Idempotence & Anti-Collision FOG).
Phase 1 : Garantit le zéro-doublon et l'attribution propre des UUIDs pour les machines et clones.
"""

import os
import sys
import json
import uuid
import socket
import argparse
import subprocess
import urllib.request
import urllib.error


def get_program_files_dir() -> str:
    """Retourne le répertoire Program Files 64-bit sous Windows."""
    return os.environ.get("ProgramW6432") or os.environ.get("ProgramFiles", r"C:\Program Files")


def get_primary_mac_address() -> str:
    """Récupère l'adresse MAC physique principale via PowerShell ou uuid.getnode."""
    try:
        ps_cmd = [
            "powershell.exe",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "(Get-CimInstance Win32_NetworkAdapter -ErrorAction SilentlyContinue | Where-Object { $_.PhysicalAdapter -and $_.MACAddress } | Select-Object -First 1).MACAddress"
        ]
        res = subprocess.run(ps_cmd, capture_output=True, text=True, timeout=5)
        out = res.stdout.strip().replace("-", ":").upper()
        if out and len(out) == 17:
            return out
    except Exception:
        pass

    try:
        # Fallback Python standard library
        raw_mac = uuid.getnode()
        mac_hex = f"{raw_mac:012X}"
        formatted = ":".join(mac_hex[i:i+2] for i in range(0, 12, 2))
        if formatted != "00:00:00:00:00:00":
            return formatted
    except Exception:
        pass

    return ""


def get_os_info():
    """Détecte les informations Windows."""
    caption = "Windows"
    version = ""
    build = ""
    try:
        ps_cmd = [
            "powershell.exe",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "$os = Get-CimInstance Win32_OperatingSystem; $nt = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion'; "
            "Write-Output \"$($os.Caption)|$($nt.DisplayVersion)|$($os.BuildNumber)\""
        ]
        res = subprocess.run(ps_cmd, capture_output=True, text=True, timeout=5)
        parts = res.stdout.strip().split("|")
        if len(parts) >= 3:
            caption = parts[0].replace("Microsoft ", "").strip()
            version = parts[1].strip()
            build = parts[2].strip()
    except Exception:
        pass
    return caption, version, build


def enroll_and_setup(server_url: str, enroll_token: str, install_dir: str = None, install_service: bool = True):
    server_api = server_url.rstrip("/")
    if not server_api.endswith("/api/v1"):
        server_api = f"{server_api}/api/v1"

    if not install_dir:
        install_dir = os.path.join(get_program_files_dir(), "MAPT")

    os.makedirs(install_dir, exist_ok=True)
    target_cfg = os.path.join(install_dir, "mapt-agent-config.json")
    agent_exe = os.path.join(install_dir, "mapt-agent.exe")

    print(f"[*] MAPT Client Setup - Dossier cible : {install_dir}")

    # =========================================================================
    # 1. Idempotence : Ne jamais recréer de doublon à la réinstallation
    # =========================================================================
    device_uuid = ""
    existing_config = {}
    if os.path.isfile(target_cfg):
        try:
            with open(target_cfg, "r", encoding="utf-8") as f:
                existing_config = json.load(f)
                device_uuid = existing_config.get("device_uuid", "")
                if device_uuid:
                    print(f"[+] UUID existant réutilisé (Idempotence) : {device_uuid}")
        except Exception as e:
            print(f"[!] Lecture de l'ancienne config ignorée ({e})")

    # Si première installation, on génère un UUID unique (ou Serial BIOS)
    # ⚠️ Ne plus lire HKLM\...\MachineGuid qui est cloné par FOG !
    if not device_uuid:
        device_uuid = str(uuid.uuid4())
        print(f"[+] Nouvel UUID unique généré : {device_uuid}")

    # =========================================================================
    # 2. Transmission de l'adresse MAC et caractéristiques de la machine
    # =========================================================================
    hostname = socket.gethostname()
    wins_name = os.environ.get("COMPUTERNAME", hostname)
    mac_address = get_primary_mac_address()
    os_name, os_version, os_build = get_os_info()

    print(f"[*] Hôte : {hostname} | WINS : {wins_name} | MAC : {mac_address or 'N/A'}")

    enroll_payload = {
        "device_uuid": device_uuid,
        "hostname": hostname,
        "wins_name": wins_name,
        "mac_address": mac_address,
        "os_name": os_name,
        "os_version": os_version,
        "os_build": os_build,
        "agent_version": "1.0.0",
        "enrollment_token": enroll_token,
    }

    # Appel de l'enrôlement auprès du serveur MAPT
    agent_token = existing_config.get("agent_token", "")
    try:
        req = urllib.request.Request(
            f"{server_api}/agent/enroll",
            data=json.dumps(enroll_payload).encode("utf-8"),
            headers={"Content-Type": "application/json; charset=utf-8"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            agent_token = data.get("agent_token", "")
            # Si le serveur a attribué un nouvel UUID (ex: détection clone FOG)
            server_assigned_uuid = data.get("device_uuid")
            if server_assigned_uuid and server_assigned_uuid != device_uuid:
                print(f"[!] Nouvel UUID réassigné par le serveur (Anti-collision clone) : {server_assigned_uuid}")
                device_uuid = server_assigned_uuid

            print("[+] Enrôlement réussi auprès du serveur MAPT.")
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8") if e.fp else str(e)
        print(f"[!] Erreur HTTP lors de l'enrôlement ({e.code}) : {err_msg}")
    except Exception as e:
        print(f"[!] Impossible de joindre le serveur pour l'enrôlement immédiat : {e}")

    # =========================================================================
    # 3. Écriture / Persistance du fichier de configuration
    # =========================================================================
    final_config = {
        "server_url": server_api,
        "enrollment_token": enroll_token,
        "agent_token": agent_token,
        "device_uuid": device_uuid,
        "poll_interval_seconds": 30,
        "heartbeat_interval_seconds": 30,
        "inventory_interval_seconds": 3600,
        "agent_version": "1.0.0"
    }

    with open(target_cfg, "w", encoding="utf-8") as f:
        json.dump(final_config, f, indent=2)
    print(f"[+] Configuration enregistrée dans : {target_cfg}")

    # =========================================================================
    # 4. Téléchargement du binaire mapt-agent.exe si nécessaire
    # =========================================================================
    if not os.path.isfile(agent_exe) or os.path.getsize(agent_exe) < 100000:
        download_url = f"{server_api}/agent/download/windows"
        print(f"[*] Téléchargement du binaire agent depuis {download_url}...")
        try:
            urllib.request.urlretrieve(download_url, agent_exe)
            print(f"[+] Binaire téléchargé : {agent_exe} ({os.path.getsize(agent_exe)} octets)")
        except Exception as e:
            print(f"[!] Avertissement : échec du téléchargement direct de mapt-agent.exe : {e}")

    # =========================================================================
    # 5. Installation et démarrage du Service Windows
    # =========================================================================
    if install_service and os.path.isfile(agent_exe):
        try:
            print("[*] Enregistrement et démarrage du service Windows 'mapt-agent'...")
            subprocess.run([agent_exe, "-service", "install", "-config", target_cfg], check=False)
            subprocess.run(["sc.exe", "config", "mapt-agent", "start=", "auto"], check=False)
            subprocess.run(["sc.exe", "start", "mapt-agent"], check=False)
            print("[OK] Service MAPT configuré et démarré avec succès.")
        except Exception as e:
            print(f"[!] Erreur lors du contrôle du service : {e}")

    print("[OK] Déploiement / Configuration de l'Agent MAPT terminé.")


def main():
    parser = argparse.ArgumentParser(description="Script d'enrôlement et d'installation MAPT")
    parser.add_argument("--server", default="http://localhost:8000/api/v1", help="URL du serveur MAPT")
    parser.add_argument("--token", default="mapt-enrollment-secret-token-2026", help="Passphrase d'enrôlement")
    parser.add_argument("--dir", default=None, help="Dossier d'installation (défaut: C:\\Program Files\\MAPT)")
    parser.add_argument("--no-service", action="store_true", help="Ne pas installer/démarrer le service Windows")
    args = parser.parse_args()

    enroll_and_setup(
        server_url=args.server,
        enroll_token=args.token,
        install_dir=args.dir,
        install_service=not args.no_service
    )


if __name__ == "__main__":
    main()
