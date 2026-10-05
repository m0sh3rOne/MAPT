import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { DeviceGroup, WolResult, Package as PackageType, Script as ScriptType, User as UserType } from '../../types';
import {
  FolderKanban,
  Plus,
  Trash2,
  Users,
  Monitor,
  Check,
  X,
  Loader2,
  Edit2,
  Search,
  CheckSquare,
  Square,
  AlertCircle,
  Zap,
  RotateCw,
  Power,
  MessageSquare,
  FileCode,
  Package,
  UserCheck,
  Send,
  Eye,
  EyeOff,
  Layers,
  Clock,
  Sparkles,
  Terminal,
  Play,
  Info,
  Shield,
  ShieldAlert,
  UserPlus,
  UserMinus,
  UserX
} from 'lucide-react';

export const Groups: React.FC = () => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const isAdmin = user?.role === 'super_admin' || user?.role === 'administrator';
  const isOperator = user?.role === 'operator';
  const isAppStoreClient = user?.role === 'app_store_client';
  const isViewer = user?.role === 'viewer';

  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<DeviceGroup | null>(null);
  const [selectedGroupForMembers, setSelectedGroupForMembers] = useState<DeviceGroup | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<DeviceGroup | null>(null);

  // Group Quick Actions Modal
  const [selectedGroupForActions, setSelectedGroupForActions] = useState<DeviceGroup | null>(null);
  const [activeActionTab, setActiveActionTab] = useState<
    'wol' | 'restart' | 'shutdown' | 'message' | 'script' | 'package' | 'logon' | 'create_user' | 'delete_user'
  >('wol');

  // Form states for creation/editing
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [selectedOperatorIds, setSelectedOperatorIds] = useState<string[]>([]);
  const [searchGroupQuery, setSearchGroupQuery] = useState('');
  const [deviceSearchQuery, setDeviceSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Form states for quick actions
  const [actionDelay, setActionDelay] = useState(10);
  const [actionForce, setActionForce] = useState(true);
  const [actionMessage, setActionMessage] = useState('Opération initiée par votre administrateur MAPT.');

  // Message Net Send
  const [msgText, setMsgText] = useState('');
  const [msgDuration, setMsgDuration] = useState(60);

  // Script
  const [scriptMode, setScriptMode] = useState<'catalog' | 'adhoc'>('catalog');
  const [selectedScriptId, setSelectedScriptId] = useState('');
  const [adhocLanguage, setAdhocLanguage] = useState<'powershell' | 'vbscript' | 'cmd' | 'python'>('powershell');
  const [adhocScriptContent, setAdhocScriptContent] = useState('');
  const [adhocTimeout, setAdhocTimeout] = useState(300);

  // Package
  const [selectedPackageId, setSelectedPackageId] = useState('');

  // Logon
  const [logonAccountType, setLogonAccountType] = useState<'domain' | 'local'>('domain');
  const [logonDomain, setLogonDomain] = useState('');
  const [logonUsername, setLogonUsername] = useState('');
  const [logonPassword, setLogonPassword] = useState('');
  const [logonOneTime, setLogonOneTime] = useState(true);
  const [logonRestartNow, setLogonRestartNow] = useState(true);
  const [logonShowPassword, setLogonShowPassword] = useState(false);

  // Group Create User
  const [groupCreateUsername, setGroupCreateUsername] = useState('');
  const [groupCreatePassword, setGroupCreatePassword] = useState('');
  const [groupCreateFullName, setGroupCreateFullName] = useState('');
  const [groupCreateIsAdmin, setGroupCreateIsAdmin] = useState(false);
  const [groupCreatePasswordNeverExpires, setGroupCreatePasswordNeverExpires] = useState(true);
  const [groupCreateShowPassword, setGroupCreateShowPassword] = useState(false);

  // Group Delete User / Profile
  const [groupDeleteUsername, setGroupDeleteUsername] = useState('');
  const [groupDeleteProfileFiles, setGroupDeleteProfileFiles] = useState(true);
  const [groupDeleteLocalAccount, setGroupDeleteLocalAccount] = useState(true);
  const [groupDeleteForceLogoff, setGroupDeleteForceLogoff] = useState(true);

  // Concurrency & WoL options for group actions
  const [actionConcurrency, setActionConcurrency] = useState<number>(8);
  const [actionWakeOnLan, setActionWakeOnLan] = useState(false);

  // Notification toast
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
    details?: string[];
  } | null>(null);

  // Queries
  const { data: groups = [], isLoading: loadingGroups } = useQuery({
    queryKey: ['groups'],
    queryFn: api.getGroups,
  });

  const { data: devices = [], isLoading: loadingDevices } = useQuery({
    queryKey: ['devices'],
    queryFn: api.getDevices,
  });

  const { data: packages = [] } = useQuery({
    queryKey: ['packages'],
    queryFn: api.getPackages,
    enabled: !!selectedGroupForActions,
  });

  const { data: scripts = [] } = useQuery({
    queryKey: ['scripts'],
    queryFn: api.getScripts,
    enabled: !!selectedGroupForActions,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: api.getUsers,
    enabled: isAdmin,
  });

  const assignableMembers = allUsers.filter(
    (u) => u.role === 'operator' || u.role === 'app_store_client' || u.role === 'administrator' || u.role === 'super_admin'
  );

  // Wake-on-LAN Mutation
  const wakeGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      return api.wakeGroup(groupId);
    },
    onSuccess: (results: WolResult[]) => {
      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      if (successful.length > 0) {
        setNotification({
          type: 'success',
          message: `${successful.length} machine(s) du groupe réveillée(s) par Wake-on-LAN avec succès !`,
          details: failed.map((f) => `Échec ${f.mac_address || 'inconnue'} : ${f.message}`),
        });
      } else {
        setNotification({
          type: 'error',
          message: `Aucune machine n'a pu être réveillée (${failed.length} échecs ou pas d'adresse MAC).`,
          details: failed.map((f) => f.message),
        });
      }
      setTimeout(() => setNotification(null), 7000);
    },
    onError: (err: any) => {
      setNotification({
        type: 'error',
        message: err?.response?.data?.detail || 'Erreur lors du réveil du groupe',
      });
      setTimeout(() => setNotification(null), 7000);
    },
  });

  // Group Action / Deployment Mutation
  const createGroupActionMutation = useMutation({
    mutationFn: (deploymentData: any) => api.createDeployment(deploymentData),
    onSuccess: (_, variables) => {
      setSelectedGroupForActions(null);
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      setNotification({
        type: 'success',
        message: `Action rapide "${variables.name}" lancée sur le groupe avec succès !`,
      });
      setTimeout(() => setNotification(null), 6000);
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || err.message || "Erreur lors du lancement de l'action");
    },
  });

  // Group CRUD Mutations
  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; operator_ids?: string[] }) =>
      api.createGroup(data.name, data.description, data.operator_ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setShowCreateModal(false);
      setName('');
      setDescription('');
      setSelectedOperatorIds([]);
      setError(null);
    },
    onError: (err: any) => setError(err.response?.data?.detail || 'Erreur lors de la création du groupe'),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; name: string; description?: string; operator_ids?: string[] }) =>
      api.updateGroup(data.id, data.name, data.description, data.operator_ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setEditingGroup(null);
      setName('');
      setDescription('');
      setSelectedOperatorIds([]);
      setError(null);
    },
    onError: (err: any) => setError(err.response?.data?.detail || 'Erreur lors de la modification du groupe'),
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      setGroupToDelete(null);
    },
  });

  const saveMembersMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGroupForMembers) return;
      return api.setGroupDevices(selectedGroupForMembers.id, selectedDeviceIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      setSelectedGroupForMembers(null);
      setSelectedDeviceIds([]);
    },
  });

  const handleOpenMembers = (grp: DeviceGroup) => {
    setSelectedGroupForMembers(grp);
    setDeviceSearchQuery('');
    const initialIds =
      grp.device_ids && grp.device_ids.length > 0
        ? [...grp.device_ids]
        : devices.filter((d) => d.group_ids?.includes(grp.id)).map((d) => d.id);
    setSelectedDeviceIds(initialIds);
  };

  const handleOpenEdit = (grp: DeviceGroup) => {
    setEditingGroup(grp);
    setName(grp.name);
    setDescription(grp.description || '');
    setSelectedOperatorIds(grp.operator_ids || []);
    setError(null);
  };

  const handleOpenQuickActions = (grp: DeviceGroup) => {
    setSelectedGroupForActions(grp);
    setActiveActionTab(isAppStoreClient ? 'package' : 'wol');
    setActionDelay(10);
    setActionForce(true);
    setActionMessage('Opération initiée par votre administrateur MAPT.');
    setMsgText('');
    setAdhocScriptContent('');
    setSelectedScriptId('');
    setSelectedPackageId('');
    setLogonUsername('');
    setLogonPassword('');
    setActionConcurrency(8);
    setActionWakeOnLan(false);
    setError(null);
  };

  // Group Quick Actions Handlers
  const handleGroupRestart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupForActions) return;

    createGroupActionMutation.mutate({
      name: `🔄 Redémarrage Groupé - ${selectedGroupForActions.name}`,
      description: `Redémarrage système à distance (${actionDelay}s) sur ${selectedGroupForActions.name}`,
      deployment_type: 'command',
      custom_command: `shutdown.exe /r /t ${actionDelay} /f`,
      target_all_devices: false,
      target_group_ids: [selectedGroupForActions.id],
      target_device_ids: [],
      max_concurrency: actionConcurrency,
      wake_on_lan: actionWakeOnLan,
      schedule_type: 'immediate',
      is_recurring: false,
    });
  };

  const handleGroupShutdown = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupForActions) return;

    createGroupActionMutation.mutate({
      name: `⚡ Arrêt Groupé - ${selectedGroupForActions.name}`,
      description: `Extinction forcée à distance (${actionDelay}s) sur ${selectedGroupForActions.name}`,
      deployment_type: 'command',
      custom_command: `shutdown.exe /s /t ${actionDelay} /f`,
      target_all_devices: false,
      target_group_ids: [selectedGroupForActions.id],
      target_device_ids: [],
      max_concurrency: actionConcurrency,
      wake_on_lan: actionWakeOnLan,
      schedule_type: 'immediate',
      is_recurring: false,
    });
  };

  const handleGroupSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupForActions || !msgText.trim()) return;

    const safeText = msgText.replace(/"/g, '""');
    const cmd = `msg * /TIME:${msgDuration} "${safeText}"`;

    createGroupActionMutation.mutate({
      name: `💬 Message Groupé - ${selectedGroupForActions.name}`,
      description: `Diffusion message sur ${selectedGroupForActions.name}: "${msgText.slice(0, 35)}..."`,
      deployment_type: 'command',
      custom_command: cmd,
      target_all_devices: false,
      target_group_ids: [selectedGroupForActions.id],
      target_device_ids: [],
      max_concurrency: actionConcurrency,
      wake_on_lan: actionWakeOnLan,
      schedule_type: 'immediate',
      is_recurring: false,
    });
  };

  const encodePowerShellUtf16Base64 = (script: string): string => {
    const utf16Bytes = new Uint8Array(script.length * 2);
    for (let i = 0; i < script.length; i++) {
      const code = script.charCodeAt(i);
      utf16Bytes[i * 2] = code & 0xff;
      utf16Bytes[i * 2 + 1] = (code >> 8) & 0xff;
    }
    let binary = '';
    for (let i = 0; i < utf16Bytes.byteLength; i++) {
      binary += String.fromCharCode(utf16Bytes[i]);
    }
    return btoa(binary);
  };

  const handleGroupExecuteScript = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupForActions) return;

    if (scriptMode === 'catalog') {
      const script = scripts.find((s) => s.id === selectedScriptId);
      if (!script || !script.latest_version) {
        setError('Veuillez sélectionner un script valide.');
        return;
      }

      createGroupActionMutation.mutate({
        name: `📜 Script: ${script.name} - ${selectedGroupForActions.name}`,
        description: `Exécution du script ${script.name} sur ${selectedGroupForActions.name}`,
        deployment_type: 'script',
        script_version_id: script.latest_version.id,
        target_all_devices: false,
        target_group_ids: [selectedGroupForActions.id],
        target_device_ids: [],
        max_concurrency: actionConcurrency,
        wake_on_lan: actionWakeOnLan,
        schedule_type: 'immediate',
        is_recurring: false,
      });
    } else {
      if (!adhocScriptContent.trim()) {
        setError('Veuillez saisir le contenu du script.');
        return;
      }

      let cmd = '';
      if (adhocLanguage === 'powershell') {
        const encoded = encodePowerShellUtf16Base64(adhocScriptContent);
        cmd = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`;
      } else if (adhocLanguage === 'cmd') {
        cmd = adhocScriptContent.replace(/\r?\n/g, ' && ');
      } else if (adhocLanguage === 'python') {
        const escaped = adhocScriptContent.replace(/"/g, '\\"').replace(/\r?\n/g, '; ');
        cmd = `python -c "${escaped}"`;
      }

      createGroupActionMutation.mutate({
        name: `⚡ Script Ad-Hoc (${adhocLanguage}) - ${selectedGroupForActions.name}`,
        description: `Exécution personnalisée ${adhocLanguage} sur ${selectedGroupForActions.name}`,
        deployment_type: 'command',
        custom_command: cmd,
        target_all_devices: false,
        target_group_ids: [selectedGroupForActions.id],
        target_device_ids: [],
        max_concurrency: actionConcurrency,
        wake_on_lan: actionWakeOnLan,
        schedule_type: 'immediate',
        is_recurring: false,
      });
    }
  };

  const handleGroupDeployPackage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupForActions) return;

    const pkg = packages.find((p) => p.id === selectedPackageId);
    if (!pkg || !pkg.latest_version) {
      setError('Veuillez sélectionner un package disponible.');
      return;
    }

    createGroupActionMutation.mutate({
      name: `📦 Déploiement: ${pkg.name} - ${selectedGroupForActions.name}`,
      description: `Installation du package ${pkg.name} (${pkg.latest_version.version}) sur ${selectedGroupForActions.name}`,
      deployment_type: 'package',
      package_version_id: pkg.latest_version.id,
      target_all_devices: false,
      target_group_ids: [selectedGroupForActions.id],
      target_device_ids: [],
      max_concurrency: actionConcurrency,
      wake_on_lan: actionWakeOnLan,
      schedule_type: 'immediate',
      is_recurring: false,
    });
  };

  const handleGroupLogon = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupForActions) return;
    const user = logonUsername.trim();
    if (!user) {
      setError("Veuillez renseigner un nom d'utilisateur.");
      return;
    }

    const domain = logonAccountType === 'domain' ? (logonDomain.trim() || '.') : '.';
    const psScript = `
$d = "${domain.replace(/"/g, '`"')}"
$u = "${user.replace(/"/g, '`"')}"
$p = "${logonPassword.replace(/"/g, '`"')}"

$w = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon"
$s = "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System"

Set-ItemProperty $w -Name "AutoAdminLogon" -Value "1" -Type String -Force
Set-ItemProperty $w -Name "DefaultUserName" -Value $u -Type String -Force
Set-ItemProperty $w -Name "DefaultDomainName" -Value $d -Type String -Force
Set-ItemProperty $w -Name "DefaultPassword" -Value $p -Type String -Force
Set-ItemProperty $w -Name "DisableCAD" -Value 1 -Type DWord -Force
Remove-ItemProperty $w -Name "ForceAutoLogon" -ErrorAction SilentlyContinue

${
  logonOneTime
    ? `$cleanupCmd = 'powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 5; Set-ItemProperty ''HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon'' -Name AutoAdminLogon -Value ''0'' -Force; Remove-ItemProperty ''HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon'' -Name DefaultPassword -ErrorAction SilentlyContinue"'
Set-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce" -Name "MAPT_DisableAutoLogon" -Value $cleanupCmd -Type String -Force
Set-ItemProperty $w -Name "AutoLogonCount" -Value 1 -Type DWord -Force`
    : `Set-ItemProperty $w -Name "ForceAutoLogon" -Value "1" -Type String -Force`
}

if (Test-Path $s) {
    Set-ItemProperty $s -Name "DisableCAD" -Value 1 -Type DWord -Force
    Set-ItemProperty $s -Name "DontDisplayLastUserName" -Value 0 -Type DWord -Force
}

Write-Output "AutoLogon configure avec succes pour $d\\$u"
${logonRestartNow ? 'shutdown.exe /r /t 2 /f /c "MAPT - Connexion automatique session: $d\\$u"' : ''}
`.trim();

    const encoded = encodePowerShellUtf16Base64(psScript);
    const cmd = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`;

    createGroupActionMutation.mutate({
      name: `👤 Session AutoLogon (${domain}\\${user}) - ${selectedGroupForActions.name}`,
      description: `Connexion automatique de l'utilisateur ${domain}\\${user} sur ${selectedGroupForActions.name}`,
      deployment_type: 'command',
      custom_command: cmd,
      target_all_devices: false,
      target_group_ids: [selectedGroupForActions.id],
      target_device_ids: [],
      max_concurrency: actionConcurrency,
      wake_on_lan: actionWakeOnLan,
      schedule_type: 'immediate',
      is_recurring: false,
    });
  };

  const handleGroupCreateLocalUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupForActions) return;
    const u = groupCreateUsername.trim();
    if (!u) {
      setError("Veuillez renseigner un nom d'utilisateur.");
      return;
    }

    const p = groupCreatePassword;
    const fn = groupCreateFullName.trim();
    const isAdmin = groupCreateIsAdmin;
    const pne = groupCreatePasswordNeverExpires;

    const psScript = `
$u = "${u.replace(/"/g, '`"')}"
$p = "${p.replace(/"/g, '`"')}"
$fn = "${fn.replace(/"/g, '`"')}"
$isAdmin = $${isAdmin ? 'True' : 'False'}
$pne = $${pne ? 'True' : 'False'}

$ErrorActionPreference = 'SilentlyContinue'
$hasCreated = $false

try {
    $existing = Get-LocalUser -Name $u -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Output "L'utilisateur local '$u' existe deja. Mise a jour des parametres..."
        if ($p -and $p.Trim().Length -gt 0) {
            $secPass = ConvertTo-SecureString $p -AsPlainText -Force
            Set-LocalUser -Name $u -Password $secPass -FullName $fn -PasswordNeverExpires:$pne -ErrorAction Stop
        } else {
            Set-LocalUser -Name $u -FullName $fn -PasswordNeverExpires:$pne -ErrorAction Stop
        }
        $hasCreated = $true
    } else {
        if ($p -and $p.Trim().Length -gt 0) {
            $secPass = ConvertTo-SecureString $p -AsPlainText -Force
            New-LocalUser -Name $u -Password $secPass -FullName $fn -Description "Compte cree via MAPT" -PasswordNeverExpires:$pne -ErrorAction Stop
        } else {
            New-LocalUser -Name $u -NoPassword -FullName $fn -Description "Compte cree via MAPT" -PasswordNeverExpires:$pne -ErrorAction Stop
        }
        Write-Output "Utilisateur local '$u' cree avec succes."
        $hasCreated = $true
    }

    if ($isAdmin) {
        Add-LocalGroupMember -Group "Administrateurs" -Member $u -ErrorAction SilentlyContinue
        Add-LocalGroupMember -Group "Administrators" -Member $u -ErrorAction SilentlyContinue
        Write-Output "Privileges Administrateur accordes a '$u'."
    } else {
        Remove-LocalGroupMember -Group "Administrateurs" -Member $u -ErrorAction SilentlyContinue
        Remove-LocalGroupMember -Group "Administrators" -Member $u -ErrorAction SilentlyContinue
        Add-LocalGroupMember -Group "Utilisateurs" -Member $u -ErrorAction SilentlyContinue
        Add-LocalGroupMember -Group "Users" -Member $u -ErrorAction SilentlyContinue
        Write-Output "Compte '$u' defini comme Utilisateur Standard."
    }
} catch {
    $hasCreated = $false
}

if (-not $hasCreated) {
    if ($p -and $p.Trim().Length -gt 0) {
        & net.exe user "$u" "$p" /add /comment:"Compte cree via MAPT" /fullname:"$fn" 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            & net.exe user "$u" "$p" /comment:"Compte cree via MAPT" /fullname:"$fn" 2>&1 | Out-Null
        }
    } else {
        & net.exe user "$u" /add /comment:"Compte cree via MAPT" /fullname:"$fn" 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            & net.exe user "$u" /comment:"Compte cree via MAPT" /fullname:"$fn" 2>&1 | Out-Null
        }
    }

    if ($pne) {
        try {
            $adsiUser = [adsi]"WinNT://$env:COMPUTERNAME/$u,user"
            $adsiUser.UserFlags = $adsiUser.UserFlags.Value -bor 0x10000
            $adsiUser.SetInfo()
        } catch {}
    }

    if ($isAdmin) {
        & net.exe localgroup "Administrateurs" "$u" /add 2>&1 | Out-Null
        & net.exe localgroup "Administrators" "$u" /add 2>&1 | Out-Null
        Write-Output "Privileges Administrateur accordes a '$u' via net.exe."
    } else {
        & net.exe localgroup "Administrateurs" "$u" /delete 2>&1 | Out-Null
        & net.exe localgroup "Administrators" "$u" /delete 2>&1 | Out-Null
        & net.exe localgroup "Utilisateurs" "$u" /add 2>&1 | Out-Null
        & net.exe localgroup "Users" "$u" /add 2>&1 | Out-Null
        Write-Output "Compte '$u' defini comme Utilisateur Standard via net.exe."
    }
    Write-Output "Compte '$u' configure avec succes."
}
`.trim();

    const encoded = encodePowerShellUtf16Base64(psScript);
    const cmd = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`;

    createGroupActionMutation.mutate({
      name: `👤➕ Créer utilisateur local (${u}) - ${selectedGroupForActions.name}`,
      description: `Création du compte local ${u} (${isAdmin ? 'Administrateur' : 'Standard'}) sur le groupe ${selectedGroupForActions.name}`,
      deployment_type: 'command',
      custom_command: cmd,
      target_all_devices: false,
      target_group_ids: [selectedGroupForActions.id],
      target_device_ids: [],
      max_concurrency: actionConcurrency,
      wake_on_lan: actionWakeOnLan,
      schedule_type: 'immediate',
      is_recurring: false,
    });
  };

  const handleGroupDeleteLocalUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupForActions) return;
    const u = groupDeleteUsername.trim();
    if (!u) {
      setError("Veuillez renseigner un nom d'utilisateur.");
      return;
    }

    if (!confirm(`Confirmez-vous la suppression ${groupDeleteProfileFiles ? 'du profil et fichiers Windows' : ''} ${groupDeleteLocalAccount ? 'et du compte ' + u : ''} sur TOUTES les machines du groupe ${selectedGroupForActions.name} ?`)) {
      return;
    }

    const delProfile = groupDeleteProfileFiles;
    const delAccount = groupDeleteLocalAccount;
    const forceLogoff = groupDeleteForceLogoff;

    const psScript = `
$u = "${u.replace(/"/g, '`"')}"
$delProfile = $${delProfile ? 'True' : 'False'}
$delAccount = $${delAccount ? 'True' : 'False'}
$forceLogoff = $${forceLogoff ? 'True' : 'False'}

Write-Output "=== Suppression Profil / Compte : $u sur $env:COMPUTERNAME ==="

if ($forceLogoff) {
    try {
        $sessions = quser 2>$null
        if ($sessions) {
            foreach ($line in $sessions) {
                if ($line -match $u) {
                    $parts = ($line -replace '\\s+', ' ').Trim().Split(' ')
                    $sessionId = $null
                    foreach ($part in $parts) {
                        if ($part -match '^\\d+$') { $sessionId = $part; break }
                    }
                    if ($sessionId) {
                        Write-Output "Deconnexion forcee session ID: $sessionId pour $u"
                        logoff $sessionId 2>$null
                        Start-Sleep -Seconds 2
                    }
                }
            }
        }
    } catch {
        Write-Warning "Erreur tentative deconnexion: $($_.Exception.Message)"
    }
}

if ($delProfile) {
    Write-Output "Recherche et suppression du profil Windows WMI pour '$u'..."
    try {
        $profiles = Get-CimInstance -ClassName Win32_UserProfile | Where-Object { 
            $_.LocalPath -and ($_.LocalPath.Split('\\')[-1] -ieq $u -or $_.LocalPath.EndsWith("\\$u", [System.StringComparison]::InvariantCultureIgnoreCase))
        }
        if ($profiles) {
            foreach ($prof in $profiles) {
                Write-Output "Suppression du profil WMI : $($prof.LocalPath)"
                Remove-CimInstance -InputObject $prof -ErrorAction Stop
            }
            Write-Output "Profil WMI supprime avec succes."
        } else {
            Write-Output "Aucun profil WMI trouve correspondant a '$u'."
        }
    } catch {
        Write-Warning "Erreur suppression WMI Win32_UserProfile: $($_.Exception.Message)"
    }

    $userFolder = "C:\\Users\\$u"
    if (Test-Path $userFolder) {
        Write-Output "Nettoyage du dossier de profil $userFolder..."
        try {
            takeown.exe /F $userFolder /R /D O 2>$null
            icacls.exe $userFolder /grant "*S-1-5-32-544:F" /T /C /Q 2>$null
            Remove-Item -Path $userFolder -Recurse -Force -ErrorAction SilentlyContinue
            if (Test-Path $userFolder) {
                Write-Warning "Certains fichiers du dossier $userFolder sont verrouilles par Windows."
            } else {
                Write-Output "Dossier de fichiers $userFolder supprime avec succes."
            }
        } catch {
            Write-Warning "Erreur suppression dossier $userFolder : $($_.Exception.Message)"
        }
    }
}

if ($delAccount) {
    Write-Output "Suppression du compte utilisateur local '$u'..."
    try {
        Remove-LocalUser -Name $u -ErrorAction Stop
        Write-Output "Compte local '$u' supprime avec succes via Remove-LocalUser."
    } catch {
        try {
            net user "$u" /delete
            Write-Output "Compte local '$u' supprime via net.exe."
        } catch {
            Write-Warning "Impossible de supprimer le compte local '$u' (compte de domaine ou deja supprime)."
        }
    }
}

Write-Output "Operation terminee avec succes pour '$u'."
`.trim();

    const encoded = encodePowerShellUtf16Base64(psScript);
    const cmd = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`;

    createGroupActionMutation.mutate({
      name: `👤🗑️ Supprimer profil/compte (${u}) - ${selectedGroupForActions.name}`,
      description: `Suppression ${delProfile ? 'du profil et fichiers' : ''} ${delAccount ? 'et du compte ' + u : ''} sur le groupe ${selectedGroupForActions.name}`,
      deployment_type: 'command',
      custom_command: cmd,
      target_all_devices: false,
      target_group_ids: [selectedGroupForActions.id],
      target_device_ids: [],
      max_concurrency: actionConcurrency,
      wake_on_lan: actionWakeOnLan,
      schedule_type: 'immediate',
      is_recurring: false,
    });
  };

  const filteredGroups = groups.filter(
    (g) =>
      g.name.toLowerCase().includes(searchGroupQuery.toLowerCase()) ||
      (g.description && g.description.toLowerCase().includes(searchGroupQuery.toLowerCase()))
  );

  const filteredDevices = devices.filter((d) => {
    const q = deviceSearchQuery.trim().toLowerCase();
    if (!q) return true;
    const qClean = q.replace(/-/g, '');
    const uuidClean = (d.device_uuid || '').toLowerCase().replace(/-/g, '');
    const idClean = (d.id || '').toLowerCase().replace(/-/g, '');

    return (
      d.hostname.toLowerCase().includes(q) ||
      (d.ip_address && d.ip_address.toLowerCase().includes(q)) ||
      (d.mac_address && d.mac_address.toLowerCase().includes(q)) ||
      (d.device_uuid && d.device_uuid.toLowerCase().includes(q)) ||
      (d.id && d.id.toLowerCase().includes(q)) ||
      (uuidClean && qClean && uuidClean.includes(qClean)) ||
      (idClean && qClean && idClean.includes(qClean)) ||
      (d.os_name && d.os_name.toLowerCase().includes(q))
    );
  });

  const toggleAllFilteredDevices = () => {
    const filteredIds = filteredDevices.map((d) => d.id);
    const allSelected = filteredIds.every((id) => selectedDeviceIds.includes(id));
    if (allSelected) {
      setSelectedDeviceIds(selectedDeviceIds.filter((id) => !filteredIds.includes(id)));
    } else {
      const merged = Array.from(new Set([...selectedDeviceIds, ...filteredIds]));
      setSelectedDeviceIds(merged);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`p-4 rounded-2xl border flex items-start justify-between shadow-xl transition animate-in fade-in slide-in-from-top-2 duration-200 ${
            notification.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-950/80 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-start space-x-3">
            {notification.type === 'success' ? (
              <Zap className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="text-sm font-semibold">{notification.message}</p>
              {notification.details && notification.details.length > 0 && (
                <ul className="text-xs text-rose-400/80 list-disc list-inside mt-1">
                  {notification.details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-200 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight flex items-center gap-2">
            <FolderKanban className="w-7 h-7 text-emerald-400" />
            Groupes de Machines
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Organisation logique et dynamique du parc pour le ciblage massif des déploiements et des actions rapides
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Rechercher un groupe..."
              value={searchGroupQuery}
              onChange={(e) => setSearchGroupQuery(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-emerald-500 outline-none w-56 transition"
            />
          </div>

          {isAdmin && (
            <button
              onClick={() => {
                setError(null);
                setName('');
                setDescription('');
                setSelectedOperatorIds([]);
                setShowCreateModal(true);
              }}
              className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-600/20 transition whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Nouveau Groupe</span>
            </button>
          )}
        </div>
      </div>

      {/* Loading state */}
      {loadingGroups ? (
        <div className="flex items-center justify-center p-16 text-slate-500 space-x-3">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
          <span>Chargement des groupes...</span>
        </div>
      ) : (
        /* Groups Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredGroups.map((grp) => {
            const canRunGroupActions =
              isAdmin || ((isOperator || isAppStoreClient) && grp.operator_ids?.includes(user?.id || ''));

            return (
              <div
                key={grp.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-6 flex flex-col justify-between space-y-4 transition shadow-lg relative overflow-hidden group"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none -mr-10 -mt-10" />

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
                      <FolderKanban className="w-5 h-5" />
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {grp.operators && grp.operators.length > 0 && (
                        <span
                          className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-950 text-indigo-400 border border-indigo-500/20 flex items-center gap-1.5"
                          title={`Membres assignés: ${grp.operators.map((o) => o.username).join(', ')}`}
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          {grp.operators.length} membre{grp.operators.length > 1 ? 's' : ''}
                        </span>
                      )}
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-950 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
                        <Monitor className="w-3.5 h-3.5" />
                        {grp.device_count || 0} machine{(grp.device_count || 0) > 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-slate-100 group-hover:text-emerald-400 transition">{grp.name}</h3>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                    {grp.description || 'Aucune description spécifiée.'}
                  </p>

                  {grp.operators && grp.operators.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-slate-500 font-medium">Membres assignés :</span>
                      {grp.operators.map((op) => (
                        <span key={op.id} className="text-[10px] bg-slate-950 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-md font-mono">
                          {op.username}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Group Card Action Bar */}
                <div className="flex items-center space-x-2 pt-4 border-t border-slate-800/80">
                  <button
                    onClick={() => handleOpenMembers(grp)}
                    className="flex-1 flex items-center justify-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 py-2 px-2.5 rounded-xl text-xs font-semibold transition border border-slate-700/50"
                    title="Gérer les machines membres"
                  >
                    <Users className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Membres ({grp.device_count || 0})</span>
                  </button>

                  {!isViewer && (
                    <button
                      onClick={() => canRunGroupActions && handleOpenQuickActions(grp)}
                      disabled={!canRunGroupActions}
                      className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-white transition text-xs font-semibold shadow-md shrink-0 ${
                        canRunGroupActions
                          ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/30'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                      }`}
                      title={
                        canRunGroupActions
                          ? 'Lancer une action rapide sur tout le groupe (Wake-on-LAN, Redémarrage, Arrêt, Scripts, Packages...)'
                          : "Assignation requise : vous n'êtes pas assigné à ce groupe en tant que membre."
                      }
                    >
                      <Zap className={`w-3.5 h-3.5 ${canRunGroupActions ? 'text-amber-300 fill-current' : 'text-slate-500'}`} />
                      <span>Actions</span>
                    </button>
                  )}

                  {isAdmin && (
                    <>
                      <button
                        onClick={() => handleOpenEdit(grp)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700/50 text-slate-300 hover:text-white transition"
                        title="Modifier le groupe et assigner les opérateurs"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setGroupToDelete(grp)}
                        className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition"
                        title="Supprimer le groupe"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loadingGroups && filteredGroups.length === 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 space-y-2">
          <FolderKanban className="w-10 h-10 mx-auto text-slate-600 mb-2" />
          <p className="text-sm font-semibold text-slate-400">Aucun groupe trouvé</p>
          <p className="text-xs text-slate-600">Créez des groupes pour organiser et administrer vos machines en masse.</p>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL : ACTIONS RAPIDES SUR LE GROUPE */}
      {/* ========================================================================= */}
      {selectedGroupForActions && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 max-w-2xl w-full shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                    <span>Actions Rapides de Groupe</span>
                    <span className="px-2 py-0.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-emerald-400 font-mono">
                      {selectedGroupForActions.name}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400">
                    Cible l'ensemble des <strong>{selectedGroupForActions.device_count || 0} machine(s)</strong> de ce groupe
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedGroupForActions(null)}
                className="text-slate-400 hover:text-slate-200 p-1.5 rounded-xl hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-500/40 text-rose-300 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Action Tabs Bar */}
            {isAppStoreClient ? (
              <div className="p-3 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2 text-indigo-300 font-semibold">
                  <Package className="w-4 h-4 text-indigo-400" />
                  <span>Déploiement Package MSI/EXE sur {selectedGroupForActions.name}</span>
                </div>
                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2.5 py-0.5 rounded-full font-mono">
                  Rôle Client App Store
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => { setActiveActionTab('wol'); setError(null); }}
                  className={`p-2.5 rounded-xl border flex items-center justify-center space-x-2 transition ${
                    activeActionTab === 'wol'
                      ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 shadow-sm shadow-amber-900/30'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-slate-200'
                  }`}
                >
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>Wake-on-LAN</span>
                </button>

                <button
                  type="button"
                  onClick={() => { setActiveActionTab('restart'); setError(null); }}
                  className={`p-2.5 rounded-xl border flex items-center justify-center space-x-2 transition ${
                    activeActionTab === 'restart'
                      ? 'bg-amber-600 text-white border-amber-500 shadow-sm shadow-amber-900/30'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-slate-200'
                  }`}
                >
                  <RotateCw className="w-4 h-4" />
                  <span>Redémarrer</span>
                </button>

                <button
                  type="button"
                  onClick={() => { setActiveActionTab('shutdown'); setError(null); }}
                  className={`p-2.5 rounded-xl border flex items-center justify-center space-x-2 transition ${
                    activeActionTab === 'shutdown'
                      ? 'bg-rose-600 text-white border-rose-500 shadow-sm shadow-rose-900/30'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-slate-200'
                  }`}
                >
                  <Power className="w-4 h-4" />
                  <span>Éteindre</span>
                </button>

                <button
                  type="button"
                  onClick={() => { setActiveActionTab('message'); setError(null); }}
                  className={`p-2.5 rounded-xl border flex items-center justify-center space-x-2 transition ${
                    activeActionTab === 'message'
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm shadow-emerald-900/30'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-slate-200'
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Message</span>
                </button>

                <button
                  type="button"
                  onClick={() => { setActiveActionTab('script'); setError(null); }}
                  className={`p-2.5 rounded-xl border flex items-center justify-center space-x-2 transition ${
                    activeActionTab === 'script'
                      ? 'bg-cyan-600 text-white border-cyan-500 shadow-sm shadow-cyan-900/30'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-slate-200'
                  }`}
                >
                  <FileCode className="w-4 h-4" />
                  <span>Script PS/Py</span>
                </button>

                <button
                  type="button"
                  onClick={() => { setActiveActionTab('package'); setError(null); }}
                  className={`p-2.5 rounded-xl border flex items-center justify-center space-x-2 transition ${
                    activeActionTab === 'package'
                      ? 'bg-blue-600 text-white border-blue-500 shadow-sm shadow-blue-900/30'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-slate-200'
                  }`}
                >
                  <Package className="w-4 h-4" />
                  <span>Package MSI</span>
                </button>

                <button
                  type="button"
                  onClick={() => { setActiveActionTab('logon'); setError(null); }}
                  className={`p-2.5 rounded-xl border flex items-center justify-center space-x-2 transition ${
                    activeActionTab === 'logon'
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm shadow-indigo-900/30'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-slate-200'
                  }`}
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Session (AutoLogon)</span>
                </button>

                <button
                  type="button"
                  onClick={() => { setActiveActionTab('create_user'); setError(null); }}
                  className={`p-2.5 rounded-xl border flex items-center justify-center space-x-2 transition ${
                    activeActionTab === 'create_user'
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm shadow-emerald-900/30'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-slate-200'
                  }`}
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Créer Utilisateur</span>
                </button>

                <button
                  type="button"
                  onClick={() => { setActiveActionTab('delete_user'); setError(null); }}
                  className={`p-2.5 rounded-xl border flex items-center justify-center space-x-2 transition ${
                    activeActionTab === 'delete_user'
                      ? 'bg-rose-600 text-white border-rose-500 shadow-sm shadow-rose-900/30'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-slate-200'
                  }`}
                >
                  <UserX className="w-4 h-4" />
                  <span>Supprimer Profil</span>
                </button>
              </div>
            )}

            {/* TAB 1: Wake-on-LAN */}
            {activeActionTab === 'wol' && (
              <div className="space-y-4 bg-slate-950/60 border border-slate-800 rounded-2xl p-5">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/20">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100">Réveil à Distance (Wake-on-LAN)</h3>
                    <p className="text-xs text-slate-400">
                      Émet un paquet magique UDP à toutes les adresses MAC enregistrées pour ce groupe.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-900 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-1">
                  <div className="flex justify-between">
                    <span>Groupe ciblé :</span>
                    <strong className="text-emerald-400">{selectedGroupForActions.name}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Machines membres :</span>
                    <strong className="text-slate-100">{selectedGroupForActions.device_count || 0} machine(s)</strong>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={wakeGroupMutation.isPending}
                    onClick={() => {
                      wakeGroupMutation.mutate(selectedGroupForActions.id);
                      setSelectedGroupForActions(null);
                    }}
                    className="w-full sm:w-auto px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl shadow-lg shadow-amber-500/20 flex items-center justify-center space-x-2 transition"
                  >
                    {wakeGroupMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 fill-current" />}
                    <span>Envoyer le signal Wake-on-LAN à tout le groupe</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: Redémarrer */}
            {activeActionTab === 'restart' && (
              <form onSubmit={handleGroupRestart} className="space-y-4 bg-slate-950/60 border border-slate-800 rounded-2xl p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Délai avant redémarrage (secondes)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={3600}
                      value={actionDelay}
                      onChange={(e) => setActionDelay(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-amber-500 outline-none font-mono"
                    />
                  </div>

                  <div className="flex items-center pt-5">
                    <label className="flex items-center space-x-2 cursor-pointer text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={actionForce}
                        onChange={(e) => setActionForce(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-800 text-amber-500 focus:ring-amber-500"
                      />
                      <span>Forcer la fermeture des applications ouvertes</span>
                    </label>
                  </div>
                </div>

                {/* Common Concurrency & WoL bar */}
                <div className="p-3.5 bg-slate-900 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center space-x-2">
                    <Layers className="w-4 h-4 text-purple-400" />
                    <span className="text-slate-300">Vagues simultanées :</span>
                    <select
                      value={actionConcurrency}
                      onChange={(e) => setActionConcurrency(parseInt(e.target.value))}
                      className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 font-mono"
                    >
                      <option value={4}>4 machines</option>
                      <option value={8}>8 machines (Défaut)</option>
                      <option value={16}>16 machines</option>
                      <option value={0}>Illimité</option>
                    </select>
                  </div>

                  <label className="flex items-center space-x-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={actionWakeOnLan}
                      onChange={(e) => setActionWakeOnLan(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-800 text-amber-500"
                    />
                    <span>Réveiller par WoL avant l'ordre</span>
                  </label>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={createGroupActionMutation.isPending}
                    className="w-full sm:w-auto px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-amber-600/20 flex items-center justify-center space-x-2 transition"
                  >
                    {createGroupActionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />}
                    <span>Redémarrer le groupe ({selectedGroupForActions.device_count || 0} machines)</span>
                  </button>
                </div>
              </form>
            )}

            {/* TAB 3: Arrêter */}
            {activeActionTab === 'shutdown' && (
              <form onSubmit={handleGroupShutdown} className="space-y-4 bg-slate-950/60 border border-slate-800 rounded-2xl p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Délai avant extinction (secondes)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={3600}
                      value={actionDelay}
                      onChange={(e) => setActionDelay(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-rose-500 outline-none font-mono"
                    />
                  </div>

                  <div className="flex items-center pt-5">
                    <label className="flex items-center space-x-2 cursor-pointer text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={actionForce}
                        onChange={(e) => setActionForce(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-800 text-rose-500 focus:ring-rose-500"
                      />
                      <span>Forcer l'arrêt immédiat sans attendre</span>
                    </label>
                  </div>
                </div>

                {/* Concurrency bar */}
                <div className="p-3.5 bg-slate-900 rounded-xl border border-slate-800 flex items-center space-x-2 text-xs">
                  <Layers className="w-4 h-4 text-purple-400" />
                  <span className="text-slate-300">Vagues simultanées :</span>
                  <select
                    value={actionConcurrency}
                    onChange={(e) => setActionConcurrency(parseInt(e.target.value))}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 font-mono"
                  >
                    <option value={4}>4 machines</option>
                    <option value={8}>8 machines (Défaut)</option>
                    <option value={16}>16 machines</option>
                    <option value={0}>Illimité</option>
                  </select>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={createGroupActionMutation.isPending}
                    className="w-full sm:w-auto px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-600/20 flex items-center justify-center space-x-2 transition"
                  >
                    {createGroupActionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
                    <span>Éteindre le groupe ({selectedGroupForActions.device_count || 0} machines)</span>
                  </button>
                </div>
              </form>
            )}

            {/* TAB 4: Message */}
            {activeActionTab === 'message' && (
              <form onSubmit={handleGroupSendMessage} className="space-y-4 bg-slate-950/60 border border-slate-800 rounded-2xl p-5">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Texte du Message
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={msgText}
                    onChange={(e) => setMsgText(e.target.value)}
                    placeholder="Ex: Maintenance du parc dans 10 minutes. Merci d'enregistrer vos documents."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:border-emerald-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Durée d'affichage (secondes)
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={3600}
                      value={msgDuration}
                      onChange={(e) => setMsgDuration(parseInt(e.target.value) || 60)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-emerald-500 outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={createGroupActionMutation.isPending}
                    className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 flex items-center justify-center space-x-2 transition"
                  >
                    {createGroupActionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>Diffuser le message à tout le groupe</span>
                  </button>
                </div>
              </form>
            )}

            {/* TAB 5: Script */}
            {activeActionTab === 'script' && (
              <form onSubmit={handleGroupExecuteScript} className="space-y-4 bg-slate-950/60 border border-slate-800 rounded-2xl p-5">
                <div className="flex items-center space-x-3 border-b border-slate-800 pb-3">
                  <button
                    type="button"
                    onClick={() => setScriptMode('catalog')}
                    className={`text-xs px-3 py-1.5 rounded-xl border font-semibold transition ${
                      scriptMode === 'catalog'
                        ? 'bg-cyan-600 text-white border-cyan-500'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Depuis la bibliothèque ({scripts.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setScriptMode('adhoc')}
                    className={`text-xs px-3 py-1.5 rounded-xl border font-semibold transition ${
                      scriptMode === 'adhoc'
                        ? 'bg-cyan-600 text-white border-cyan-500'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Code personnalisé (Ad-hoc)
                  </button>
                </div>

                {scriptMode === 'catalog' ? (
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Sélectionner un Script
                    </label>
                    <select
                      value={selectedScriptId}
                      onChange={(e) => setSelectedScriptId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-cyan-500 outline-none"
                    >
                      <option value="">-- Choisir un script --</option>
                      {scripts.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.language}) {s.latest_version ? `- v${s.latest_version.version}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        Langage & Code
                      </label>
                      <div className="flex gap-1">
                        {(['powershell', 'python', 'cmd'] as const).map((lang) => (
                          <button
                            key={lang}
                            type="button"
                            onClick={() => setAdhocLanguage(lang)}
                            className={`px-2 py-0.5 rounded text-[11px] font-mono uppercase ${
                              adhocLanguage === lang
                                ? 'bg-cyan-500 text-slate-950 font-bold'
                                : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {lang}
                          </button>
                        ))}
                      </div>
                    </div>
                    <textarea
                      rows={5}
                      value={adhocScriptContent}
                      onChange={(e) => setAdhocScriptContent(e.target.value)}
                      placeholder="# Écrivez votre script ici..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs font-mono text-emerald-300 focus:border-cyan-500 outline-none"
                    />
                  </div>
                )}

                {/* Concurrency & WoL */}
                <div className="p-3.5 bg-slate-900 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center space-x-2">
                    <Layers className="w-4 h-4 text-purple-400" />
                    <span className="text-slate-300">Vagues :</span>
                    <select
                      value={actionConcurrency}
                      onChange={(e) => setActionConcurrency(parseInt(e.target.value))}
                      className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 font-mono"
                    >
                      <option value={4}>4 machines</option>
                      <option value={8}>8 machines</option>
                      <option value={16}>16 machines</option>
                      <option value={0}>Illimité</option>
                    </select>
                  </div>

                  <label className="flex items-center space-x-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={actionWakeOnLan}
                      onChange={(e) => setActionWakeOnLan(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-800 text-amber-500"
                    />
                    <span>Réveiller par WoL avant l'exécution</span>
                  </label>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={createGroupActionMutation.isPending}
                    className="w-full sm:w-auto px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-cyan-600/20 flex items-center justify-center space-x-2 transition"
                  >
                    {createGroupActionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                    <span>Lancer le script sur le groupe</span>
                  </button>
                </div>
              </form>
            )}

            {/* TAB 6: Package */}
            {activeActionTab === 'package' && (
              <form onSubmit={handleGroupDeployPackage} className="space-y-4 bg-slate-950/60 border border-slate-800 rounded-2xl p-5">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Sélectionner un Package Logiciel
                  </label>
                  <select
                    value={selectedPackageId}
                    onChange={(e) => setSelectedPackageId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-blue-500 outline-none"
                  >
                    <option value="">-- Choisir un package --</option>
                    {packages.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.package_type?.toUpperCase()}) {p.latest_version ? `- v${p.latest_version.version}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Concurrency & WoL */}
                <div className="p-3.5 bg-slate-900 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center space-x-2">
                    <Layers className="w-4 h-4 text-purple-400" />
                    <span className="text-slate-300">Vagues de déploiement :</span>
                    <select
                      value={actionConcurrency}
                      onChange={(e) => setActionConcurrency(parseInt(e.target.value))}
                      className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 font-mono"
                    >
                      <option value={4}>4 machines</option>
                      <option value={8}>8 machines (Recommandé)</option>
                      <option value={16}>16 machines</option>
                      <option value={0}>Illimité</option>
                    </select>
                  </div>

                  <label className="flex items-center space-x-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={actionWakeOnLan}
                      onChange={(e) => setActionWakeOnLan(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-800 text-amber-500"
                    />
                    <span>Réveiller par WoL avant l'installation</span>
                  </label>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={createGroupActionMutation.isPending}
                    className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/20 flex items-center justify-center space-x-2 transition"
                  >
                    {createGroupActionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                    <span>Déployer le package sur le groupe</span>
                  </button>
                </div>
              </form>
            )}

            {/* TAB 7: AutoLogon */}
            {activeActionTab === 'logon' && (
              <form onSubmit={handleGroupLogon} className="space-y-4 bg-slate-950/60 border border-slate-800 rounded-2xl p-5">
                <div className="flex items-center space-x-3 border-b border-slate-800 pb-3">
                  <button
                    type="button"
                    onClick={() => setLogonAccountType('domain')}
                    className={`text-xs px-3 py-1.5 rounded-xl border font-semibold transition ${
                      logonAccountType === 'domain'
                        ? 'bg-indigo-600 text-white border-indigo-500'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    🌐 Compte de Domaine (Active Directory)
                  </button>
                  <button
                    type="button"
                    onClick={() => setLogonAccountType('local')}
                    className={`text-xs px-3 py-1.5 rounded-xl border font-semibold transition ${
                      logonAccountType === 'local'
                        ? 'bg-indigo-600 text-white border-indigo-500'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    💻 Compte Local
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {logonAccountType === 'domain' && (
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                        Domaine Active Directory
                      </label>
                      <input
                        type="text"
                        value={logonDomain}
                        onChange={(e) => setLogonDomain(e.target.value)}
                        placeholder="Ex: ECOLE ou MON-DOMAINE"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Identifiant Utilisateur
                    </label>
                    <input
                      type="text"
                      required
                      value={logonUsername}
                      onChange={(e) => setLogonUsername(e.target.value)}
                      placeholder="Ex: eleve ou jdupont"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                    />
                  </div>

                  <div className="relative">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Mot de passe
                    </label>
                    <input
                      type={logonShowPassword ? 'text' : 'password'}
                      value={logonPassword}
                      onChange={(e) => setLogonPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-3 pr-9 py-2 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setLogonShowPassword(!logonShowPassword)}
                      className="absolute right-3 top-8 text-slate-500 hover:text-slate-300"
                    >
                      {logonShowPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <label className="flex items-center space-x-2 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={logonOneTime}
                      onChange={(e) => setLogonOneTime(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-800 text-indigo-500"
                    />
                    <span>Usage unique (nettoyage automatique du mot de passe après ouverture)</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={logonRestartNow}
                      onChange={(e) => setLogonRestartNow(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-800 text-indigo-500"
                    />
                    <span>Redémarrer immédiatement pour ouvrir la session</span>
                  </label>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={createGroupActionMutation.isPending}
                    className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/20 flex items-center justify-center space-x-2 transition"
                  >
                    {createGroupActionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                    <span>Activer et ouvrir la session sur le groupe</span>
                  </button>
                </div>
              </form>
            )}

            {/* TAB 8: Create Local User */}
            {activeActionTab === 'create_user' && (
              <form onSubmit={handleGroupCreateLocalUser} className="space-y-4 bg-slate-950/60 border border-slate-800 rounded-2xl p-5">
                <div className="flex items-center space-x-3 border-b border-slate-800 pb-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100">Créer un Utilisateur Local sur tout le Groupe</h3>
                    <p className="text-xs text-slate-400">
                      Déploie un compte local uniforme sur l'ensemble des machines de ce groupe.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Nom d'utilisateur (Login) <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={groupCreateUsername}
                      onChange={(e) => setGroupCreateUsername(e.target.value)}
                      placeholder="ex: eleve, stagiaire, adminlocal"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-emerald-500 outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Nom complet / Description
                    </label>
                    <input
                      type="text"
                      value={groupCreateFullName}
                      onChange={(e) => setGroupCreateFullName(e.target.value)}
                      placeholder="ex: Compte Stagiaire Formation"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Mot de passe
                  </label>
                  <div className="relative">
                    <input
                      type={groupCreateShowPassword ? 'text' : 'password'}
                      value={groupCreatePassword}
                      onChange={(e) => setGroupCreatePassword(e.target.value)}
                      placeholder="Saisissez un mot de passe (ou vide si aucun)"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-emerald-500 outline-none font-mono pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setGroupCreateShowPassword(!groupCreateShowPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2 text-xs">
                  <label className="flex items-center space-x-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={groupCreateIsAdmin}
                      onChange={(e) => setGroupCreateIsAdmin(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-800 text-rose-500"
                    />
                    <span className="font-semibold text-rose-300">Privilèges Administrateur Local</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={groupCreatePasswordNeverExpires}
                      onChange={(e) => setGroupCreatePasswordNeverExpires(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-800 text-emerald-500"
                    />
                    <span>Le mot de passe n'expire jamais (évite le changement forcé)</span>
                  </label>
                </div>

                {/* Concurrency & WoL */}
                <div className="p-3.5 bg-slate-900 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center space-x-2">
                    <Layers className="w-4 h-4 text-purple-400" />
                    <span className="text-slate-300">Vagues :</span>
                    <select
                      value={actionConcurrency}
                      onChange={(e) => setActionConcurrency(parseInt(e.target.value))}
                      className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 font-mono"
                    >
                      <option value={4}>4 machines</option>
                      <option value={8}>8 machines</option>
                      <option value={16}>16 machines</option>
                      <option value={0}>Illimité</option>
                    </select>
                  </div>

                  <label className="flex items-center space-x-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={actionWakeOnLan}
                      onChange={(e) => setActionWakeOnLan(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-800 text-amber-500"
                    />
                    <span>Réveiller par WoL avant l'opération</span>
                  </label>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={createGroupActionMutation.isPending}
                    className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 flex items-center justify-center space-x-2 transition"
                  >
                    {createGroupActionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                    <span>Créer l'utilisateur sur le groupe</span>
                  </button>
                </div>
              </form>
            )}

            {/* TAB 9: Delete Local Profile / User */}
            {activeActionTab === 'delete_user' && (
              <form onSubmit={handleGroupDeleteLocalUser} className="space-y-4 bg-slate-950/60 border border-slate-800 rounded-2xl p-5">
                <div className="flex items-center space-x-3 border-b border-slate-800 pb-3 text-rose-400">
                  <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center shrink-0 border border-rose-500/20">
                    <UserX className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100">Purger Profil & Compte sur tout le Groupe</h3>
                    <p className="text-xs text-slate-400">
                      Supprime le profil utilisateur (fichiers C:\Users\..., WMI) et le compte local sur l'ensemble des machines.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Nom d'utilisateur ciblé <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={groupDeleteUsername}
                    onChange={(e) => setGroupDeleteUsername(e.target.value)}
                    placeholder="ex: stagiaire, eleve, session_temp..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-rose-500 outline-none font-mono"
                  />
                </div>

                <div className="p-3 bg-rose-950/20 border border-rose-900/40 rounded-xl space-y-2 text-xs">
                  <label className="flex items-center space-x-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={groupDeleteProfileFiles}
                      onChange={(e) => setGroupDeleteProfileFiles(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-800 text-rose-500"
                    />
                    <span className="font-semibold text-slate-200">Supprimer le profil Windows et ses fichiers (C:\Users\...)</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={groupDeleteLocalAccount}
                      onChange={(e) => setGroupDeleteLocalAccount(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-800 text-rose-500"
                    />
                    <span className="font-semibold text-slate-200">Supprimer le compte local de la base SAM</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={groupDeleteForceLogoff}
                      onChange={(e) => setGroupDeleteForceLogoff(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-800 text-rose-500"
                    />
                    <span>Fermer la session active si l'utilisateur est connecté</span>
                  </label>
                </div>

                {/* Concurrency & WoL */}
                <div className="p-3.5 bg-slate-900 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center space-x-2">
                    <Layers className="w-4 h-4 text-purple-400" />
                    <span className="text-slate-300">Vagues :</span>
                    <select
                      value={actionConcurrency}
                      onChange={(e) => setActionConcurrency(parseInt(e.target.value))}
                      className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 font-mono"
                    >
                      <option value={4}>4 machines</option>
                      <option value={8}>8 machines</option>
                      <option value={16}>16 machines</option>
                      <option value={0}>Illimité</option>
                    </select>
                  </div>

                  <label className="flex items-center space-x-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={actionWakeOnLan}
                      onChange={(e) => setActionWakeOnLan(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-800 text-amber-500"
                    />
                    <span>Réveiller par WoL avant l'opération</span>
                  </label>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={createGroupActionMutation.isPending}
                    className="w-full sm:w-auto px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-600/20 flex items-center justify-center space-x-2 transition"
                  >
                    {createGroupActionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    <span>Purger profil & compte sur le groupe</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal: Création / Modification de Groupe */}
      {(showCreateModal || editingGroup) && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <FolderKanban className="w-5 h-5 text-emerald-400" />
                <span>{editingGroup ? 'Modifier le Groupe' : 'Nouveau Groupe'}</span>
              </h2>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingGroup(null);
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="p-3 bg-rose-950/50 border border-rose-500/30 rounded-xl text-rose-300 text-xs">
                {error}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (editingGroup) {
                  updateMutation.mutate({ id: editingGroup.id, name, description, operator_ids: selectedOperatorIds });
                } else {
                  createMutation.mutate({ name, description, operator_ids: selectedOperatorIds });
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Nom du Groupe *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Salle Informatique 101, Portables..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:border-emerald-500 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Postes fixes de la salle informatique..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 focus:border-emerald-500 outline-none transition"
                />
              </div>

              {/* Assignation des Membres par l'Administrateur */}
              {isAdmin && (
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Membres Assignés</span>
                    </label>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {selectedOperatorIds.length} sélectionné{selectedOperatorIds.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Les membres assignés (opérateurs et clients app store) sont autorisés à déployer des packages et exécuter des actions sur ce groupe.
                  </p>

                  <div className="max-h-36 overflow-y-auto space-y-1.5 bg-slate-950 border border-slate-800 rounded-xl p-2">
                    {assignableMembers.length === 0 ? (
                      <p className="text-xs text-slate-500 italic py-2 text-center">Aucun compte utilisateur disponible.</p>
                    ) : (
                      assignableMembers.map((u) => {
                        const isSelected = selectedOperatorIds.includes(u.id);
                        return (
                          <div
                            key={u.id}
                            onClick={() => {
                              setSelectedOperatorIds((prev) =>
                                isSelected ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                              );
                            }}
                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition text-xs select-none ${
                              isSelected
                                ? 'bg-indigo-950/40 border border-indigo-500/40 text-indigo-200'
                                : 'bg-slate-900/80 border border-slate-800/80 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                            }`}
                          >
                            <div className="flex items-center space-x-2">
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-indigo-400 shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-600 shrink-0" />
                              )}
                              <span className="font-semibold text-slate-200">{u.username}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
                                {u.role === 'app_store_client' ? 'Client App Store' : u.role}
                              </span>
                            </div>
                            {u.email && <span className="text-[11px] text-slate-500 truncate max-w-[120px]">{u.email}</span>}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingGroup(null);
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold flex items-center space-x-2 transition shadow-lg shadow-emerald-600/20"
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  <span>{editingGroup ? 'Enregistrer' : 'Créer le groupe'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Gestion des Membres */}
      {selectedGroupForMembers && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 max-w-2xl w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    Machines Membres du Groupe "{selectedGroupForMembers.name}"
                  </h3>
                  <p className="text-xs text-slate-400">
                    Cochez ou décochez les machines à intégrer dans ce groupe
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedGroupForMembers(null)}
                className="text-slate-400 hover:text-slate-200 p-1.5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search & Select All Toolbar */}
            <div className="flex items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filtrer par nom, IP, OS..."
                  value={deviceSearchQuery}
                  onChange={(e) => setDeviceSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:border-emerald-500 outline-none transition"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleAllFilteredDevices}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  {filteredDevices.length > 0 &&
                  filteredDevices.every((d) => selectedDeviceIds.includes(d.id)) ? (
                    <>
                      <Square className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Tout désélectionner</span>
                    </>
                  ) : (
                    <>
                      <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Tout sélectionner ({filteredDevices.length})</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Devices Checklist */}
            <div className="max-h-80 overflow-y-auto border border-slate-800 rounded-xl p-2 bg-slate-950 space-y-1 divide-y divide-slate-800/40">
              {loadingDevices ? (
                <div className="p-8 text-center text-slate-500 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>Chargement des machines...</span>
                </div>
              ) : filteredDevices.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  Aucune machine trouvée.
                </div>
              ) : (
                filteredDevices.map((dev) => {
                  const isChecked = selectedDeviceIds.includes(dev.id);
                  return (
                    <label
                      key={dev.id}
                      className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer text-sm transition ${
                        isChecked ? 'bg-emerald-500/10 border border-emerald-500/20' : 'hover:bg-slate-900 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedDeviceIds([...selectedDeviceIds, dev.id]);
                            } else {
                              setSelectedDeviceIds(selectedDeviceIds.filter((id) => id !== dev.id));
                            }
                          }}
                          className="w-4 h-4 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-800 accent-emerald-500"
                        />
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-200 text-sm">{dev.hostname}</span>
                            <span
                              className={`w-2 h-2 rounded-full ${
                                dev.is_online ? 'bg-emerald-400 shadow-emerald-400/50 shadow-sm' : 'bg-slate-600'
                              }`}
                              title={dev.is_online ? 'En ligne' : 'Hors ligne'}
                            />
                          </div>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {dev.ip_address || '127.0.0.1'} {dev.os_name ? `• ${dev.os_name}` : ''}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        {isChecked && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            <Check className="w-3 h-3" /> Membre
                          </span>
                        )}
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            {/* Footer / Summary */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-800">
              <span className="text-xs text-slate-400">
                <strong className="text-emerald-400 font-bold">{selectedDeviceIds.length}</strong> machine(s) sélectionnée(s)
              </span>

              <div className="flex justify-end space-x-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setSelectedGroupForMembers(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => saveMembersMutation.mutate()}
                  disabled={saveMembersMutation.isPending}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold flex items-center space-x-2 transition shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                >
                  {saveMembersMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Enregistrer les membres ({selectedDeviceIds.length})</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Suppression de Groupe */}
      {groupToDelete && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center space-x-3 text-rose-400 border-b border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">Supprimer le Groupe</h3>
                <p className="text-xs text-slate-400">Action irréversible</p>
              </div>
            </div>

            <p className="text-sm text-slate-300">
              Êtes-vous certain de vouloir supprimer définitivement le groupe{' '}
              <strong className="text-slate-100">"{groupToDelete.name}"</strong> ? Les machines ne seront pas supprimées, mais perdront leur assignation à ce groupe.
            </p>

            <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setGroupToDelete(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(groupToDelete.id)}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-semibold flex items-center space-x-2 transition shadow-lg shadow-rose-600/20"
              >
                {deleteMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Confirmer la suppression</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
