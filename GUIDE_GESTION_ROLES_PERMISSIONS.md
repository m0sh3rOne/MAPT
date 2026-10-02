# Guide de Gestion des Rôles, Permissions & Assignations de Groupes (RBAC)

Ce document décrit en détail le modèle de sécurité et de contrôle d'accès basé sur les rôles (**RBAC — Role-Based Access Control**) au sein de la plateforme **MAPT**.

---

## 1. Vue d'ensemble des Rôles

La plateforme MAPT définit 4 niveaux de privilèges hiérarchiques :

| Rôle | Identifiant technique | Description générale |
| :--- | :--- | :--- |
| 🛡️ **Super Administrateur** | `super_admin` | Contrôle absolu sur la plateforme, les utilisateurs, la configuration système et l'audit. |
| 👑 **Administrateur** | `administrator` | Gestion complète du catalogue de packages/scripts, des groupes, des machines et de l'assignation des opérateurs. |
| ⚙️ **Opérateur** | `operator` | Déploiement et actions rapides **exclusivement restreints aux groupes assignés** par un administrateur. Création/modification de scripts, packages et groupes **interdite**. |
| 👁️ **Lecteur** | `viewer` | Consultation en lecture seule stricte (monitoring, inventaire, logs) sans aucun droit d'action ni d'écriture. |

---

## 2. Tableau Récapitulatif des Droits & Permissions

| Fonctionnalité / Action | Super Admin (`super_admin`) | Administrateur (`administrator`) | Opérateur (`operator`) | Lecteur (`viewer`) |
| :--- | :---: | :---: | :---: | :---: |
| **📦 Packages & Snapins** | | | | |
| Consulter le catalogue des packages | ✅ Oui | ✅ Oui | ✅ Oui | ✅ Oui |
| Créer / Uploader un nouveau package (MSI, EXE, VBS, etc.) | ✅ Oui | ✅ Oui | ❌ **Non (Interdit)** | ❌ **Non** |
| Modifier la configuration Snapin / arguments | ✅ Oui | ✅ Oui | ❌ **Non (Interdit)** | ❌ **Non** |
| Uploader une nouvelle version de binaire | ✅ Oui | ✅ Oui | ❌ **Non (Interdit)** | ❌ **Non** |
| Supprimer un package | ✅ Oui | ✅ Oui | ❌ **Non (Interdit)** | ❌ **Non** |
| Déployer un package sur tout le parc / n'importe quel groupe | ✅ Oui | ✅ Oui | ❌ **Non** | ❌ **Non** |
| Déployer un package sur **ses groupes assignés** | ✅ Oui | ✅ Oui | ✅ **Oui (Assigné uniquement)** | ❌ **Non** |
| **📜 Scripts PowerShell, Python, VBS, Batch** | | | | |
| Consulter les scripts et l'historique des versions | ✅ Oui | ✅ Oui | ✅ Oui | ✅ Oui |
| Créer un nouveau script | ✅ Oui | ✅ Oui | ❌ **Non (Interdit)** | ❌ **Non** |
| Éditer / Publier une nouvelle version de code | ✅ Oui | ✅ Oui | ❌ **Non (Interdit)** | ❌ **Non** |
| Importer un script depuis un fichier JSON | ✅ Oui | ✅ Oui | ❌ **Non (Interdit)** | ❌ **Non** |
| Exporter un script au format JSON | ✅ Oui | ✅ Oui | ✅ Oui | ✅ Oui |
| Supprimer un script | ✅ Oui | ✅ Oui | ❌ **Non (Interdit)** | ❌ **Non** |
| Exécuter un script sur tout le parc / groupes libres | ✅ Oui | ✅ Oui | ❌ **Non** | ❌ **Non** |
| Exécuter un script sur **ses groupes assignés** | ✅ Oui | ✅ Oui | ✅ **Oui (Assigné uniquement)** | ❌ **Non** |
| **📁 Groupes de Machines** | | | | |
| Consulter les groupes et leurs machines membres | ✅ Oui | ✅ Oui | ✅ Oui | ✅ Oui |
| Créer un nouveau groupe | ✅ Oui | ✅ Oui | ❌ **Non (Interdit)** | ❌ **Non** |
| Modifier un groupe (Nom, description) | ✅ Oui | ✅ Oui | ❌ **Non (Interdit)** | ❌ **Non** |
| **Assigner des Opérateurs à un groupe** | ✅ Oui | ✅ Oui | ❌ **Non (Interdit)** | ❌ **Non** |
| Gérer les machines membres d'un groupe | ✅ Oui | ✅ Oui | ❌ **Non (Interdit)** | ❌ **Non** |
| Supprimer un groupe | ✅ Oui | ✅ Oui | ❌ **Non (Interdit)** | ❌ **Non** |
| Lancer des Actions Rapides de groupe (WoL, Reboot, Net Send...) | ✅ Oui | ✅ Oui | ✅ **Oui (Groupes assignés)** | ❌ **Non** |
| **💻 Machines du Parc** | | | | |
| Consulter la liste des machines et leur statut | ✅ Oui | ✅ Oui | ✅ Oui | ✅ Oui |
| Consulter l'inventaire matériel, réseau, logiciels, comptes | ✅ Oui | ✅ Oui | ✅ Oui | ✅ Oui |
| Activer / Désactiver une machine | ✅ Oui | ✅ Oui | ❌ **Non** | ❌ **Non** |
| Supprimer une machine du parc (individuelle ou en lot) | ✅ Oui | ✅ Oui | ❌ **Non (Interdit)** | ❌ **Non** |
| Réveil Wake-on-LAN (Individuel, lot, groupe, MAC personnalisée) | ✅ Oui | ✅ Oui | ✅ **Oui (Groupes assignés)** | ❌ **Non** |
| Actions distantes (Redémarrage, Arrêt, Annulation de job) | ✅ Oui | ✅ Oui | ✅ **Oui (Groupes assignés)** | ❌ **Non** |
| **👥 Gestion des Utilisateurs & Sécurité** | | | | |
| Créer / Modifier / Désactiver des utilisateurs | ✅ Oui | ✅ Oui | ❌ **Non** | ❌ **Non** |
| Modifier les rôles utilisateurs | ✅ **Super Admin** | ❌ Non | ❌ **Non** | ❌ **Non** |
| Modifier son propre mot de passe & profil | ✅ Oui | ✅ Oui | ✅ Oui | ✅ Oui |
| Consulter le journal d'audit des actions administratives | ✅ Oui | ✅ Oui | ❌ **Non** | ❌ **Non** |

---

## 3. Fonctionnement de l'Assignation des Opérateurs aux Groupes

### A. Principe de Ségrégation
Pour garantir la sécurité et éviter les modifications accidentelles sur le parc :
1. **Les Opérateurs ne peuvent ni créer ni modifier** le code des scripts ou les packages exécutables. Ils utilisent exclusivement les packages et scripts certifiés et validés par les administrateurs.
2. **Un Opérateur ne peut pas cibler la totalité du parc** (`target_all_devices`).
3. **Un Opérateur n'a accès aux déploiements et aux actions rapides (WoL, redémarrage, arrêt, session...) que sur les groupes pour lesquels il a été explicitement désigné comme opérateur**.
4. Toute tentative de déploiement d'un opérateur en dehors de ses groupes assignés est bloquée tant côté **Interface Web** (boutons désactivés/masqués) que côté **Backend API** avec renvoi d'une erreur HTTP `403 Forbidden` (`Accès refusé : vous n'êtes pas assigné à ce groupe`).

### B. Procédure d'Assignation par un Administrateur
1. Rendez-vous dans le menu **Groupes** de l'interface web.
2. Cliquez sur l'icône de modification d'un groupe (ou sur **Nouveau Groupe**).
3. Dans la section **Opérateurs Assignés**, cochez les comptes opérateurs autorisés à intervenir sur ce groupe.
4. Cliquez sur **Enregistrer** : l'assignation est immédiatement effective.
5. Sur la vignette du groupe, un badge `👤 X op.` récapitule les opérateurs habilités.

---

## 4. Matrice de Référence pour les Audits

Toutes les opérations d'assignation, de création, d'exécution ou de déploiement sont tracées de façon immuable dans la table `audit_logs` avec :
- L'identifiant de l'utilisateur initiateur (`user_id`), son rôle et son adresse IP (`ip_address`).
- Le type d'action (`group_created`, `group_updated`, `deployment_created`, `device_wol`, `device_deleted`, etc.).
- Les cibles exactes et les détails de l'assignation.
