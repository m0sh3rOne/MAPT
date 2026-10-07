# 🤖 Guide de Configuration & Déploiement du Serveur MCP MAPT

Le serveur **MAPT MCP (Model Context Protocol)** permet à un assistant d'intelligence artificielle (Google Antigravity IDE, Claude Desktop, Cursor, VS Code, etc.) de se connecter en toute sécurité à l'API REST officielle de la plateforme **MAPT** afin de piloter, superviser et administrer le parc de machines.

---

## 📋 Spécifications Générales

* **Base URL par défaut** : `http://192.168.224.236/api/v1` (configurable via `MAPT_API_URL`)
* **Transport supporté** :
  1. **Mode stdio (recommandé)** : Exécution directe en sous-processus par l'IDE / Claude Desktop.
  2. **Mode HTTP / SSE** : `http://192.168.224.236:8080/sse` pour connexion réseau distante.
* **Authentification** : Gestion automatique du jeton JWT (`POST /api/v1/auth/login`) et rafraîchissement transparent en cas de code HTTP `401 Unauthorized`.
* **Règle critique PowerShell** : Les scripts PowerShell sont automatiquement encodés en Base64 UTF-16LE (`-EncodedCommand`) pour garantir une exécution parfaite sans altération par `cmd.exe /c`.

---

## 🛠️ Catalogue des 15 Outils MCP

| Outil | Catégorie | Description |
|---|---|---|
| `mapt_list_devices` | Inventaire & Parc | Liste les machines avec statut en ligne, IP, MAC, OS et date de dernière vue. |
| `mapt_get_device` | Inventaire & Parc | Récupère la fiche détaillée, processeur, mémoire, disques, interfaces et logiciels installés. |
| `mapt_find_device_by_name` | Inventaire & Parc | Recherche une machine spécifique par son nom d'hôte NetBIOS (ex: `PC-COMPTA-01`). |
| `mapt_run_command` | Exécution & Scripts | Lance une commande personnalisée ou un script PowerShell/CMD à distance sur un ou plusieurs postes. |
| `mapt_get_deployment_status` | Exécution & Scripts | Vérifie le statut d'un déploiement (RUNNING, COMPLETED, FAILED) et l'état détaillé par machine. |
| `mapt_get_target_logs` | Exécution & Scripts | Récupère les sorties de console (`stdout`/`stderr`) de l'agent pour une machine donnée. |
| `mapt_cancel_deployment` | Exécution & Scripts | Annule un déploiement ou une exécution de script en cours. |
| `mapt_wake_device` | Alimentation & Énergie | Allume une machine à distance par émission d'un paquet magique Wake-on-LAN. |
| `mapt_reboot_device` | Alimentation & Énergie | Redémarre à distance un ou plusieurs postes avec message d'information. |
| `mapt_shutdown_device` | Alimentation & Énergie | Éteint proprement à distance un ou plusieurs postes (délai minimum sécurisé de 10s). |
| `mapt_list_groups` | Organisation | Liste les groupes logiques de machines créés dans MAPT. |
| `mapt_list_scripts` | Bibliothèque de Scripts | Liste les scripts disponibles dans la bibliothèque MAPT (PowerShell, Batch, Python). |
| `mapt_create_script` | Bibliothèque de Scripts | Crée et intègre un nouveau script réutilisable directement dans la bibliothèque officielle MAPT. |
| `mapt_get_script` | Bibliothèque de Scripts | Récupère le code source et les métadonnées d'un script existant du catalogue MAPT. |
| `mapt_deploy_script` | Bibliothèque de Scripts | Déploie et exécute un script du catalogue MAPT sur une sélection de machines ou groupes. |

---

## 💻 Intégration dans Google Antigravity IDE

1. Ouvrez le fichier de configuration des serveurs MCP d'Antigravity :
   - Fichier : `~/.gemini/config/mcp_config.json` ou dans votre workspace `.gemini/mcp_config.json`
2. Ajoutez le bloc suivant dans `"mcpServers"` :

```json
{
  "mcpServers": {
    "mapt-admin": {
      "command": "python",
      "args": [
        "c:/Users/Admin/Documents/Github/MAPT/mcp/server.py"
      ],
      "env": {
        "MAPT_API_URL": "http://192.168.224.236/api/v1",
        "MAPT_USERNAME": "admin",
        "MAPT_PASSWORD": "VOTRE_MOT_DE_PASSE",
        "MAPT_VERIFY_SSL": "false"
      }
    }
  }
}
```

---

## 🟣 Intégration dans Claude Desktop

1. Ouvrez ou créez le fichier de configuration de Claude Desktop :
   - **Windows** : `%APPDATA%\Claude\claude_desktop_config.json`
   - **macOS** : `~/Library/Application Support/Claude/claude_desktop_config.json`
2. Ajoutez la configuration :

```json
{
  "mcpServers": {
    "mapt": {
      "command": "python",
      "args": [
        "C:\\Users\\Admin\\Documents\\Github\\MAPT\\mcp\\server.py"
      ],
      "env": {
        "MAPT_API_URL": "http://192.168.224.236/api/v1",
        "MAPT_USERNAME": "admin",
        "MAPT_PASSWORD": "VOTRE_MOT_DE_PASSE",
        "MAPT_VERIFY_SSL": "false"
      }
    }
  }
}
```
3. Redémarrez Claude Desktop. Le logo 🔨 marteau apparaîtra avec l'ensemble des 15 outils MAPT disponibles.

---

## ⚡ Intégration dans Cursor & VS Code (Mode SSE)

1. Démarrez le serveur MCP en mode SSE sur le serveur ou en local :
```bash
python mcp/server.py --sse --port 8080 --host 0.0.0.0
```
2. Dans les paramètres Cursor (`Features` > `MCP Servers`), ajoutez :
   - **Nom** : `mapt`
   - **Type** : `sse`
   - **URL** : `http://192.168.224.236:8080/sse`

---

## 🧪 Test de Connexion Rapide (CLI)

Pour vérifier instantanément la connectivité avec l'API MAPT :
```bash
python mcp/server.py --test-auth
```
Résultat attendu :
```text
[OK] Connexion réussie à MAPT (http://192.168.224.236/api/v1) ! Token généré avec succès.
[OK] Test inventaire : 83 machine(s) détectée(s).
```

---

## 🔒 Administration & Rôles

* La gestion du serveur MCP dans l'interface web MAPT se trouve dans le menu **ADMINISTRATION > Serveur MCP**.
* Cette section est strictement réservée au rôle **SUPER ADMIN**.
* Elle permet d'activer ou désactiver les accès MCP d'un simple clic et de consulter l'adresse du serveur.
