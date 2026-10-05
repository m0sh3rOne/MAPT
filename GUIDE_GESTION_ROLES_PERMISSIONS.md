# Guide de Gestion des Rôles, Permissions & Assignations de Groupes (RBAC)

Ce document décrit en détail le modèle de sécurité et de contrôle d'accès basé sur les rôles (**RBAC — Role-Based Access Control**) au sein de la plateforme **MAPT**.

---

## 1. Vue d'ensemble des Rôles

La plateforme MAPT définit **5 niveaux de privilèges hiérarchiques** :

| Rôle | Identifiant technique | Description générale |
| :--- | :--- | :--- |
| 🛡️ **Super Administrateur** | `super_admin` | Contrôle absolu sur la plateforme, les utilisateurs, la configuration système et l'audit. |
| 👑 **Administrateur** | `administrator` | Gestion complète du catalogue de packages/scripts, des groupes, des machines et de l'assignation des membres. |
| ⚙️ **Opérateur** | `operator` | Déploiement de packages, exécution de scripts et actions rapides **exclusivement restreints aux groupes où il est membre assigné**. Création/modification de scripts, packages et groupes **interdite**. |
| 🛍️ **Client App Store** | `app_store_client` | Déploiement et accès aux **Packages MSI/EXE uniquement**, strictement restreint aux machines des groupes auxquels il est rattaché en tant que **membre assigné**. Accès aux scripts PowerShell/Python/Batch, modifications et actions avancées **interdits**. |
| 👁️ **Lecteur** | `viewer` | Consultation en lecture seule stricte (monitoring, inventaire) sans aucun droit d'action ni d'écriture. |

---

## 2. Tableau Récapitulatif des Droits & Permissions

| Fonctionnalité / Action | Super Admin (`super_admin`) | Administrateur (`administrator`) | Opérateur (`operator`) | Client App Store (`app_store_client`) | Lecteur (`viewer`) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **📦 Packages & Snapins (MSI/EXE/ZIP)** | | | | | |
| Consulter le catalogue des packages | ✅ Oui | ✅ Oui | ✅ Oui | ✅ Oui | ✅ Oui |
| Déployer un package sur tout le parc libre | ✅ Oui | ✅ Oui | ❌ Non | ❌ Non | ❌ Non |
| Déployer un package sur **ses groupes assignés** | ✅ Oui | ✅ Oui | ✅ **Oui (Assigné)** | ✅ **Oui (Assigné)** | ❌ Non |
| Exporter un package sous forme de ZIP (.zip) | ✅ Oui | ✅ Oui | ✅ Oui | ✅ Oui | ✅ Oui |
| Créer / Uploader un nouveau package | ✅ Oui | ✅ Oui | ❌ **Non (Interdit)** | ❌ **Non (Interdit)** | ❌ Non |
| Importer un package depuis un fichier ZIP | ✅ Oui | ✅ Oui | ❌ **Non (Interdit)** | ❌ **Non (Interdit)** | ❌ Non |
| Modifier la configuration Snapin / arguments | ✅ Oui | ✅ Oui | ❌ **Non (Interdit)** | ❌ **Non (Interdit)** | ❌ Non |
| Uploader une nouvelle version de binaire | ✅ Oui | ✅ Oui | ❌ **Non (Interdit)** | ❌ **Non (Interdit)** | ❌ Non |
| Supprimer ou archiver un package | ✅ Oui | ✅ Oui | ❌ **Non (Interdit)** | ❌ **Non (Interdit)** | ❌ Non |
| **📜 Scripts PowerShell, Python, VBS, Batch** | | | | | |
| Consulter les scripts et versions | ✅ Oui | ✅ Oui | ✅ Oui | ❌ **Non (Masqué)** | ✅ Oui |
| Exécuter un script sur tout le parc | ✅ Oui | ✅ Oui | ❌ Non | ❌ **Non (Interdit)** | ❌ Non |
| Exécuter un script sur **ses groupes assignés** | ✅ Oui | ✅ Oui | ✅ **Oui (Assigné)** | ❌ **Non (Interdit)** | ❌ Non |
| Créer / Éditer / Supprimer un script | ✅ Oui | ✅ Oui | ❌ **Non (Interdit)** | ❌ **Non (Interdit)** | ❌ Non |
| Importer / Exporter des scripts JSON | ✅ Oui | ✅ Oui | ❌ Non / Exporter ✅ | ❌ **Non (Interdit)** | Exporter ✅ |
| **📁 Groupes de Machines** | | | | | |
| Consulter les groupes et machines membres | ✅ Oui | ✅ Oui | ✅ Oui | ✅ Oui | ✅ Oui |
| Créer / Modifier / Supprimer un groupe | ✅ Oui | ✅ Oui | ❌ **Non (Interdit)** | ❌ **Non (Interdit)** | ❌ Non |
| **Assigner des Membres (Opérateurs & App Store)** | ✅ Oui | ✅ Oui | ❌ **Non (Interdit)** | ❌ **Non (Interdit)** | ❌ Non |
| Gérer les machines membres d'un groupe | ✅ Oui | ✅ Oui | ❌ **Non (Interdit)** | ❌ **Non (Interdit)** | ❌ Non |
| Lancer un Déploiement Package depuis le groupe | ✅ Oui | ✅ Oui | ✅ **Oui (Groupes assignés)** | ✅ **Oui (Groupes assignés)** | ❌ Non |
| Actions Rapides (WoL, Reboot, Shutdown, Msg, AutoLogon) | ✅ Oui | ✅ Oui | ✅ **Oui (Groupes assignés)** | ❌ **Non (Interdit)** | ❌ Non |
| **💻 Machines du Parc** | | | | | |
| Consulter la liste et l'inventaire matériel/logiciel | ✅ Oui | ✅ Oui | ✅ Oui | ✅ Oui | ✅ Oui |
| Activer / Désactiver / Approuver des machines | ✅ Oui | ✅ Oui | ❌ Non | ❌ Non | ❌ Non |
| Supprimer une machine du parc | ✅ Oui | ✅ Oui | ❌ **Non (Interdit)** | ❌ **Non (Interdit)** | ❌ Non |
| Réveil Wake-on-LAN et actions distantes directes | ✅ Oui | ✅ Oui | ✅ **Oui (Groupes assignés)** | ❌ **Non** | ❌ Non |
| **👥 Gestion des Utilisateurs & Sécurité** | | | | | |
| Créer / Modifier / Désactiver des utilisateurs | ✅ Oui | ✅ Oui | ❌ Non | ❌ Non | ❌ Non |
| Modifier les rôles utilisateurs | ✅ **Super Admin** | ❌ Non | ❌ Non | ❌ Non | ❌ Non |
| Modifier son propre mot de passe & profil | ✅ Oui | ✅ Oui | ✅ Oui | ✅ Oui | ✅ Oui |
| Consulter le journal d'audit administratif | ✅ Oui | ✅ Oui | ❌ Non | ❌ Non | ❌ Non |

---

## 3. Fonctionnement de l'Assignation des Membres aux Groupes

### A. Principe de Ségrégation & Moindre Privilège
Pour garantir la sécurité de l'infrastructure et éviter les déploiements non autorisés :
1. **Membres Assignés** : Les comptes ayant le rôle **Opérateur** ou **Client App Store** doivent obligatoirement être attachés à un groupe par un administrateur pour pouvoir agir dessus.
2. **Client App Store** :
   - Conçu pour les gestionnaires applicatifs ou enseignants / référents de salles.
   - Accès exclusif aux **Packages MSI/EXE** certifiés dans le catalogue.
   - Les menus et actions liés aux scripts personnalisés, aux commandes directes du terminal et aux extinctions distantes sont masqués et interdits via l'API (HTTP `403 Forbidden`).
3. **Opérateur** :
   - Déploie des packages et des scripts certifiés, et exécute les actions rapides de maintenance (WoL, Redémarrage, Auto-Logon...) **uniquement sur ses groupes assignés**.
4. **Ciblage Global Interdit** : Ni l'Opérateur ni le Client App Store ne peuvent cibler la totalité du parc (`target_all_devices`).
5. **Contrôle Backend Rigoureux** : Toute tentative de contournement déclenche un rejet immédiat côté serveur avec enregistrement dans le journal d'audit.

### B. Procédure d'Assignation par un Administrateur
1. Rendez-vous dans le menu **Groupes** de l'interface web.
2. Cliquez sur l'icône de modification d'un groupe (ou sur **Nouveau Groupe**).
3. Dans la section **Membres Assignés**, cochez les comptes (Opérateurs ou Clients App Store) autorisés à intervenir sur ce groupe.
4. Cliquez sur **Enregistrer** : l'assignation est immédiatement prise en compte.
5. Sur la vignette du groupe, un badge `👤 X membre(s)` récapitule les membres habilités.

---

## 4. Matrice de Traçabilité & Audit

Toutes les opérations d'assignation de membres, de déploiement de packages, d'exécution ou d'approbation sont enregistrées dans le journal d'audit (`audit_logs`) avec :
- L'identifiant utilisateur (`user_id`), son nom et son rôle (`super_admin`, `administrator`, `operator`, `app_store_client`, `viewer`).
- L'adresse IP de la session (`ip_address`).
- Le type d'action (`group_created`, `group_updated`, `deployment_created`, `device_wol`, `package_imported`, etc.).
- Les cibles exactes (identifiants de groupes et de machines).
