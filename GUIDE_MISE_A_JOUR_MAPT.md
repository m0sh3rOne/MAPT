# Guide de Mise à Jour du Serveur MAPT (Depuis GitHub)

Ce guide explique comment mettre à jour facilement et en toute sécurité votre serveur **MAPT (Modular Automated Provisioning & Tracking)** hébergé sur une machine virtuelle Ubuntu (Proxmox VE, KVM ou serveur dédié) vers la dernière version publiée sur le dépôt GitHub officiel.

---

## 🛡️ Garantie de Préservation des Données

La mise à jour de MAPT est **non destructive** :
- Vos **comptes utilisateurs** et **mots de passe** sont conservés.
- Vos **machines enrôlées**, historiques d'inventaire et clés d'agents restent intacts.
- Vos **paquets MSI/EXE** et **scripts** stockés dans la base de données et MinIO ne sont pas modifiés.
- Les volumes Docker persistants (`mapt_pgdata`, `mapt_minio_data`, `mapt_redis_data`) sont préservés lors de la reconstruction des conteneurs.

---

## Méthode 1 : Mise à Jour Automatisée en 1 Commande (Recommandée)

Connectez-vous en SSH à votre machine virtuelle serveur Ubuntu :

```bash
ssh utilisateur@<IP_SERVEUR_MAPT>
```

Puis exécutez simplement le script de mise à jour automatisée :

```bash
cd /opt/MAPT
sudo ./scripts/update-server-production.sh
```

### Que fait ce script automatiquement ?
1. **Synchronisation Git** : Récupère les derniers correctifs et fonctionnalités depuis la branche `main` du dépôt GitHub.
2. **Recompilation de l'Agent** : Recompile le binaire client `mapt-agent.exe` pour Windows afin qu'il intègre les dernières fonctionnalités.
3. **Reconstruction Docker** : Reconstruit les images de l'application (Backend FastAPI, Frontend Web, Worker, Relai WoL) et applique les éventuelles migrations de schéma de base de données.
4. **Nettoyage** : Supprime les anciennes images Docker temporaires pour libérer de l'espace disque.
5. **Vérification** : Valide le bon démarrage et la santé de tous les micro-services.

---

## Méthode 2 : Mise à Jour Pas-à-Pas Manuelle

Si vous préférez exécuter chaque étape manuellement dans votre terminal :

### Étape 1 — Se connecter et se placer dans le répertoire du projet
```bash
cd /opt/MAPT
```

### Étape 2 — Vérifier l'URL du dépôt GitHub distant
Assurez-vous que le dépôt pointe bien vers le dépôt principal :
```bash
git remote -v
```
*Si l'URL n'est pas configurée vers le bon dépôt, mettez-la à jour :*
```bash
git remote set-url origin https://github.com/m0sh3rOne/MAPT.git
```

### Étape 3 — Récupérer les dernières modifications de code
```bash
# Annuler d'éventuelles modifications locales de test
git stash

# Récupérer les nouveautés
git fetch origin main
git checkout main
git pull origin main
```

### Étape 4 — Recompiler le binaire de l'Agent Windows
```bash
cd /opt/MAPT/agent
GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o mapt-agent.exe ./cmd/agent
cd /opt/MAPT
```

### Étape 5 — Reconstruire et redémarrer les conteneurs Docker
```bash
sudo docker compose -f infrastructure/docker-compose.yml up -d --build
```

### Étape 6 — Vérifier l'état des services
```bash
sudo docker compose -f infrastructure/docker-compose.yml ps
```
Tous les conteneurs (`mapt-backend`, `mapt-frontend`, `mapt-worker`, `mapt-wol-relay`, `mapt-postgres`, `mapt-redis`, `mapt-minio`) doivent afficher l'état **Up** / **healthy**.

---

## 🔧 Dépannage & Résolution des Cas Fréquents

### 1. Conflit Git lors du `git pull`

**Symptôme :**
> `error: Your local changes to the following files would be overwritten by merge...`

**Solution :**
Écrasez les modifications locales pour vous aligner strictement sur la version officielle de GitHub :
```bash
cd /opt/MAPT
git reset --hard HEAD
git pull origin main
```

---

### 2. Erreur de permissions (`Permission denied`)

**Symptôme :**
> `fatal: could not create work tree dir: Permission denied`

**Solution :**
Réassignez les droits du dossier `/opt/MAPT` à votre utilisateur Linux standard :
```bash
sudo chown -R $USER:$USER /opt/MAPT
```

---

### 3. Le script de mise à jour n'a pas les droits d'exécution

**Symptôme :**
> `sudo: ./scripts/update-server-production.sh: command not found` ou `Permission denied`

**Solution :**
Rendez le script exécutable avec `chmod` :
```bash
sudo chmod +x /opt/MAPT/scripts/update-server-production.sh
sudo /opt/MAPT/scripts/update-server-production.sh
```

---

### 4. Mise à jour de l'Agent Windows sur les postes clients du parc

Lorsque le serveur est mis à jour, les nouvelles versions de l'Agent Windows (`mapt-agent.exe`) sont automatiquement mises à disposition dans l'interface Web (bouton **Télécharger l'Agent (.exe)**).

Pour mettre à jour automatiquement les agents existants sur vos machines clientes sans réinstallation manuelle :
1. Rendez-vous dans **Éditeur de Scripts** sur l'interface Web MAPT.
2. Utilisez le script préintégré **`Self Update Agent Binary`** (ou créez un job PowerShell pour remplacer le binaire dans `C:\Program Files\MAPT\mapt-agent.exe`).
3. Déployez-le sur toutes vos machines clientes en 1 clic.
