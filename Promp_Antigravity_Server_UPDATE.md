Tu es un administrateur système DevOps expert. Ta mission est de mettre à jour le serveur de déploiement MAPT (Modular Automated Provisioning & Tracking) hébergé sur cette machine virtuelle Ubuntu (Proxmox VE) vers la dernière version officielle disponible sur le dépôt GitHub.

Voici les consignes précises à suivre étape par étape :

### 1. Préparation et synchronisation Git
1. Place-toi dans le répertoire du projet (généralement `/opt/MAPT` ou le chemin où le projet est cloné).
2. Assure-toi que le dépôt distant `origin` pointe bien sur `https://github.com/m0sh3rOne/MAPT.git` :
   ```bash
   git remote set-url origin https://github.com/m0sh3rOne/MAPT.git
   ```
3. Nettoie les éventuelles modifications locales résiduelles et synchronise la branche `main` :
   ```bash
   git reset --hard HEAD
   git fetch origin main
   git checkout main
   git pull origin main
   ```

### 2. Recompilation de l'Agent Windows (Go)
1. Va dans le dossier `agent/` et recompile le binaire Windows 64-bit :
   ```bash
   cd /opt/MAPT/agent
   GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o mapt-agent.exe ./cmd/agent
   cd /opt/MAPT
   ```

### 3. Reconstruction et redémarrage des conteneurs Docker
1. Reconstruis et relance l'ensemble de la pile Docker Compose (Frontend Vite/Nginx multi-stage, Backend FastAPI, Worker, Relai WoL) :
   ```bash
   sudo docker compose -f infrastructure/docker-compose.yml up -d --build --force-recreate
   ```

### 4. Migration & Vérification de la Base de Données PostgreSQL
1. Assure-toi que la nouvelle colonne `is_approved` est bien présente dans la table `devices` pour éviter toute erreur 500 :
   ```bash
   sudo docker exec -i mapt-postgres psql -U mapt -d mapt -c "ALTER TABLE devices ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT TRUE;"
   sudo docker exec -i mapt-postgres psql -U mapt -d mapt -c "ALTER TABLE deployments ADD COLUMN IF NOT EXISTS max_concurrency INTEGER DEFAULT 8;"
   ```

### 5. Validation et Santé des Services
1. Vérifie l'état de tous les conteneurs :
   ```bash
   sudo docker compose -f infrastructure/docker-compose.yml ps
   ```
2. Contrôle les logs récents du backend pour t'assurer qu'il n'y a aucune exception ou erreur de démarrage :
   ```bash
   sudo docker logs --tail 30 mapt-backend
   ```
3. Confirme que l'interface Web (port 80) et l'API répondent correctement.
4. Rappelle à l'utilisateur de vider le cache de son navigateur (Ctrl + F5 ou Ctrl + Shift + R) pour charger immédiatement la nouvelle interface.




