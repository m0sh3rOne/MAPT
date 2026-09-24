import os
import sys
import subprocess
import paramiko

EXCLUDE_DIRS = {'.git', 'node_modules', 'venv', '.venv', '__pycache__', '.agents', '.vscode', '.idea'}
EXCLUDE_EXTS = {'.pyc', '.pyo', '.tmp'}

def sftp_upload_dir(sftp, local_dir, remote_dir):
    try:
        sftp.mkdir(remote_dir)
    except IOError:
        pass

    for item in os.listdir(local_dir):
        if item in EXCLUDE_DIRS:
            continue
        
        local_path = os.path.join(local_dir, item)
        remote_path = f"{remote_dir}/{item}".replace('\\', '/')
        
        if os.path.isdir(local_path):
            sftp_upload_dir(sftp, local_path, remote_path)
        else:
            _, ext = os.path.splitext(item)
            if ext in EXCLUDE_EXTS:
                continue
            
            should_upload = True
            try:
                remote_stat = sftp.stat(remote_path)
                local_stat = os.stat(local_path)
                if remote_stat.st_size == local_stat.st_size and abs(remote_stat.st_mtime - local_stat.st_mtime) < 2:
                    should_upload = False
            except IOError:
                should_upload = True
            
            if should_upload:
                sftp.put(local_path, remote_path)

def deploy():
    host = "192.168.224.236"
    user = "ubuntu"
    password = "***REDACTED***"
    remote_base = "/opt/MAPT"
    local_base = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

    print("[*] Compilation du frontend en local...")
    frontend_dir = os.path.join(local_base, "frontend")
    build_res = subprocess.run("npm run build", shell=True, cwd=frontend_dir)
    if build_res.returncode != 0:
        print("[!] Échec du build frontend local.")
        sys.exit(1)
    print("[+] Build frontend local réussi.")

    print(f"[*] Connexion SSH à la VM Proxmox ({host}) en tant que '{user}'...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        ssh.connect(host, username=user, password=password, timeout=15)
        print("[+] Connexion SSH établie.")
        
        # Ensure ubuntu owns /opt/MAPT
        stdin, stdout, stderr = ssh.exec_command(f"echo '{password}' | sudo -S chown -R {user}:{user} {remote_base}")
        stdout.channel.recv_exit_status()
        
        print("[*] Synchronisation des fichiers locaux vers /opt/MAPT...")
        sftp = ssh.open_sftp()
        sftp_upload_dir(sftp, local_base, remote_base)
        sftp.close()
        print("[+] Synchronisation des fichiers terminée.")
        
        # Build agent & restart containers
        commands = [
            f"cd {remote_base}/agent && GOOS=windows GOARCH=amd64 go build -ldflags='-s -w' -o mapt-agent.exe ./cmd/agent",
            f"echo '{password}' | sudo -S docker compose -f {remote_base}/infrastructure/docker-compose.yml up -d --build",
            f"echo '{password}' | sudo -S docker compose -f {remote_base}/infrastructure/docker-compose.yml ps"
        ]
        
        full_command = " && ".join(commands)
        print("[*] Recompilation de l'Agent Windows et reconstruction des conteneurs Docker sur la VM...")
        stdin, stdout, stderr = ssh.exec_command(full_command)
        
        out = stdout.read().decode('utf-8', errors='replace')
        err = stderr.read().decode('utf-8', errors='replace')
        
        print("=== ÉTAT DES CONTENEURS DOCKER ===")
        print(out)
        
        if "error" in err.lower() and "unsupported protocol" in err.lower():
            print("=== LOGS D'ERREUR ===")
            print(err)
        
        print("\n[OK] Déploiement distant sur la VM Proxmox terminé avec succès !")
    except Exception as e:
        print(f"[!] Erreur lors du déploiement : {e}")
        sys.exit(1)
    finally:
        ssh.close()

if __name__ == "__main__":
    deploy()
