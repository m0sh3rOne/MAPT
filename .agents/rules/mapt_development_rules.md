---
description: Règles d'architecture, standards asynchrones et bonnes pratiques de développement pour la plateforme MAPT.
always_on: true
---

# Règles de Développement & Standards d'Architecture MAPT

Ce document définit les règles d'architecture et les standards techniques à appliquer impérativement lors du développement et de la maintenance du projet **MAPT**.

---

## 1. Backend FastAPI & SQLAlchemy Asynchrone (MissingGreenlet)

- **Eager Loading Systématique** : Lors de requêtes sur des entités dont les relations sont utilisées dans les schémas de réponse Pydantic (ex: `DeviceGroup.members`), toujours utiliser `.options(selectinload(Model.relation))` dans les repositories.
- **Sécurisation des Mappers** : Dans les méthodes `_map_to_response` des services :
  - Ne jamais accéder directement à une relation qui risque de déclencher un lazy load asynchrone non-greenlet.
  - Vérifier la présence dans l'instance avant lecture :
    ```python
    if "members" in group.__dict__ and group.members is not None:
        device_ids = [m.device_id for m in group.members]
    ```

---

## 2. Déploiement & Installateurs (.EXE / .MSI)

- **Pas d'argument silencieux forcé pour les EXE** : Les arguments comme `/S`, `/silent`, `/quiet`, `/qn` ou `/VERYSILENT` ne doivent **jamais** être appliqués par défaut ou codés en dur pour les packages `.exe`.
- **Flexibilité & Personnalisation** : Laisser le champ d'arguments libre et configurable par l'administrateur dans l'interface et le backend, car chaque exécutable d'installation tiers gère ses commutateurs différemment.

---

## 3. Planification & Déploiements (Anti-Double Exécution)

- **Gestion de `next_run_at`** :
  - Pour les déploiements immédiats non récurrents (`schedule_type == "immediate"` et `is_recurring == False`), la valeur `next_run_at` doit impérativement être initialisée à `None` (ou vidée dès la création des cibles initiales).
  - Cela évite que le `deployment_worker` d'arrière-plan ne déclenche une seconde exécution des mêmes cibles.

---

## 4. Interpréteurs de Scripts Client Windows (Agent Go)

Tous les moteurs de script de l'agent doivent s'exécuter de façon non interactive et sécurisée :
- **PowerShell** : `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <script.ps1>`
- **VBScript** : `cscript.exe //NoLogo <script.vbs>` (mode console pur, sans fenêtres bloquantes)
- **Batch / CMD** : `cmd.exe /c <script.bat>`
- **Python** : `python <script.py>`
- Toujours appliquer un `timeout_seconds` avec respect du contexte d'annulation et capture conjointe de `stdout` et `stderr`.

---

## 5. Scripts de Déploiement & Installation Serveur

- **Assistant Interactif** : Les scripts de déploiement d'infrastructure (ex: `install-server-production.sh`) doivent comporter un assistant interactif invitant l'administrateur à définir ses identifiants (nom d'utilisateur, mot de passe masqué avec confirmation) et la passphrase du jeton d'enrôlement (`$enrollToken`).
- **Secrets & Sécurité** : Générer une clé JWT aléatoire robuste et stocker les variables d'environnement dans un fichier `.env` avec permissions strictes (`0600`).
