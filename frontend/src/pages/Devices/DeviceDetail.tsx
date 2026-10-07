import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import {
  Monitor,
  ArrowLeft,
  Cpu,
  HardDrive,
  Network,
  User,
  Clock,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Activity,
  Layers,
  Zap,
  RotateCw,
  Power,
  Tag,
  MessageSquare,
  Terminal,
  Package as PackageIcon,
  Play,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Eye,
  X,
  Send,
  Check,
  FileCode,
  Info,
  Trash2,
  Search,
  Users,
  ShieldAlert,
  Sparkles,
  Filter,
  Wifi,
  Globe,
  UserCheck,
  LogIn,
  Lock,
  KeyRound,
  UserPlus,
  UserMinus,
  UserX,
  Plus,
  ChevronUp,
  ChevronDown,
  ListOrdered,
  Download,
  Copy,
  CheckCheck,
  ScrollText,
  FileText,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { DeviceActionHistory, Package, Script, JobLog, LocalUser, InstalledSoftware, NetworkInterface } from '../../types';
import { useResizableColumns } from '../../hooks/useResizableColumns';

export const DeviceDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'inventory' | 'software' | 'network' | 'general' | 'actions' | 'logs'>('inventory');

  // Execution Logs tab search & filter state
  const [logsSearchTerm, setLogsSearchTerm] = useState('');
  const [logsStatusFilter, setLogsStatusFilter] = useState<'all' | 'SUCCEEDED' | 'FAILED' | 'RUNNING' | 'PENDING'>('all');
  const [expandedLogIds, setExpandedLogIds] = useState<string[]>([]);
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);
  const [isExportingAllLogs, setIsExportingAllLogs] = useState<boolean>(false);

  // Software search & filter & sort state
  const [softwareSearch, setSoftwareSearch] = useState('');
  const [softwareFilterPublisher, setSoftwareFilterPublisher] = useState<string>('all');
  const [softwareSortBy, setSoftwareSortBy] = useState<'name' | 'version' | 'publisher' | 'install_date'>('name');
  const [softwareSortDir, setSoftwareSortDir] = useState<'asc' | 'desc'>('asc');

  // Users search & filter & sort state
  const [userSearch, setUserSearch] = useState('');
  const [userFilterRole, setUserFilterRole] = useState<
    'all' | 'domain' | 'local' | 'connected' | 'active' | 'admin' | 'standard'
  >('all');
  const [userAccountsSortBy, setUserAccountsSortBy] = useState<'name' | 'account_type' | 'full_name' | 'session' | 'is_admin' | 'last_login'>('name');
  const [userAccountsSortDir, setUserAccountsSortDir] = useState<'asc' | 'desc'>('asc');

  // Network search & filter & sort state
  const [netSearch, setNetSearch] = useState('');
  const [netFilter, setNetFilter] = useState<'all' | 'connected' | 'physical' | 'disconnected'>('all');
  const [netSortBy, setNetSortBy] = useState<'name' | 'mac' | 'ip' | 'gateway' | 'dhcp' | 'status'>('name');
  const [netSortDir, setNetSortDir] = useState<'asc' | 'desc'>('asc');

  // Resizable columns hooks
  const { getColStyle: getSoftwareColStyle, ResizeHandle: SoftwareResizeHandle } = useResizableColumns<
    'name' | 'version' | 'publisher' | 'install_date' | 'actions'
  >('device_software', {
    name: 240,
    version: 150,
    publisher: 200,
    install_date: 160,
    actions: 120,
  });

  const { getColStyle: getNetColStyle, ResizeHandle: NetResizeHandle } = useResizableColumns<
    'name' | 'mac' | 'ip' | 'gateway' | 'dhcp' | 'status'
  >('device_network', {
    name: 220,
    mac: 180,
    ip: 200,
    gateway: 200,
    dhcp: 110,
    status: 120,
  });

  const { getColStyle: getUsersColStyle, ResizeHandle: UsersResizeHandle } = useResizableColumns<
    'name' | 'account_type' | 'full_name' | 'session' | 'is_admin' | 'last_login' | 'actions'
  >('device_users', {
    name: 200,
    account_type: 140,
    full_name: 220,
    session: 160,
    is_admin: 150,
    last_login: 160,
    actions: 120,
  });

  const { getColStyle: getActionsColStyle, ResizeHandle: ActionsResizeHandle } = useResizableColumns<
    'created_at' | 'deployment_name' | 'deployment_type' | 'status' | 'exit_code' | 'actions'
  >('device_actions', {
    created_at: 160,
    deployment_name: 260,
    deployment_type: 120,
    status: 140,
    exit_code: 120,
    actions: 120,
  });

  // Action Modals state
  const [activeModal, setActiveModal] = useState<
    'restart' | 'shutdown' | 'rename' | 'message' | 'script' | 'package' | 'logon' | 'uninstall_software' | 'create_user' | 'delete_user' | null
  >(null);

  // Software uninstallation state
  const [softwareToUninstall, setSoftwareToUninstall] = useState<InstalledSoftware | null>(null);
  const [uninstallSilentMode, setUninstallSilentMode] = useState<boolean>(true);
  const [uninstallTimeout, setUninstallTimeout] = useState<number>(300);
  const [customUninstallScript, setCustomUninstallScript] = useState<string>('');
  const [showAdvancedUninstallScript, setShowAdvancedUninstallScript] = useState<boolean>(false);

  // Restart / Shutdown form state
  const [powerDelay, setPowerDelay] = useState(10);
  const [powerForce, setPowerForce] = useState(true);
  const [powerMessage, setPowerMessage] = useState('Opération initiée par votre administrateur MAPT.');

  // Rename form state
  const [newName, setNewName] = useState('');
  const [renameRestart, setRenameRestart] = useState(true);

  // Message form state
  const [msgTarget, setMsgTarget] = useState<'*' | 'user'>('*');
  const [msgDuration, setMsgDuration] = useState(60);
  const [msgText, setMsgText] = useState('');
  const [msgTitle, setMsgTitle] = useState('Notification Administrateur MAPT');

  // Script form state
  const [scriptMode, setScriptMode] = useState<'catalog' | 'adhoc'>('catalog');
  const [selectedScriptId, setSelectedScriptId] = useState('');
  const [adhocLanguage, setAdhocLanguage] = useState<'powershell' | 'vbscript' | 'cmd' | 'python'>('powershell');
  const [adhocScriptContent, setAdhocScriptContent] = useState('');
  const [adhocTimeout, setAdhocTimeout] = useState(300);

  // Package form state
  const [selectedPackageId, setSelectedPackageId] = useState('');

  // Logon form state
  const [logonAccountType, setLogonAccountType] = useState<'domain' | 'local'>('domain');
  const [logonDomain, setLogonDomain] = useState('');
  const [logonUsername, setLogonUsername] = useState('');
  const [logonPassword, setLogonPassword] = useState('');
  const [logonOneTime, setLogonOneTime] = useState(true);
  const [logonRestartNow, setLogonRestartNow] = useState(true);
  const [logonShowPassword, setLogonShowPassword] = useState(false);

  // Create Local User form state
  const [createUsername, setCreateUsername] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createFullName, setCreateFullName] = useState('');
  const [createIsAdmin, setCreateIsAdmin] = useState(false);
  const [createPasswordNeverExpires, setCreatePasswordNeverExpires] = useState(true);
  const [createShowPassword, setCreateShowPassword] = useState(false);
  const [createPostScriptIds, setCreatePostScriptIds] = useState<string[]>([]);
  const [selectedPostScriptToAdd, setSelectedPostScriptToAdd] = useState('');

  // Delete Local User & Profile form state
  const [deleteUsername, setDeleteUsername] = useState('');
  const [deleteProfileFiles, setDeleteProfileFiles] = useState(true);
  const [deleteLocalAccount, setDeleteLocalAccount] = useState(true);
  const [deleteForceLogoff, setDeleteForceLogoff] = useState(true);

  // Logs inspection modal
  const [selectedActionForLogs, setSelectedActionForLogs] = useState<DeviceActionHistory | null>(null);

  // Clear action history state
  const [showClearActionsModal, setShowClearActionsModal] = useState(false);
  const [actionToDelete, setActionToDelete] = useState<DeviceActionHistory | null>(null);

  // Queries
  const { data: device, isLoading: loadingDevice } = useQuery({
    queryKey: ['device', id],
    queryFn: () => api.getDevice(id!),
    enabled: !!id,
    refetchInterval: 10000,
  });

  const { data: inventory, refetch: refetchInventory, isFetching: fetchingInventory } = useQuery({
    queryKey: ['device-inventory', id],
    queryFn: () => api.getDeviceInventory(id!),
    enabled: !!id,
    refetchInterval: 4000,
  });

  const { data: actions = [], isLoading: loadingActions, refetch: refetchActions } = useQuery({
    queryKey: ['device-actions', id],
    queryFn: () => api.getDeviceActions(id!),
    enabled: !!id,
    refetchInterval: 5000,
  });

  const { data: packages = [] } = useQuery({
    queryKey: ['packages'],
    queryFn: api.getPackages,
    enabled: activeTab === 'actions' || activeModal === 'package',
  });

  const { data: scripts = [] } = useQuery({
    queryKey: ['scripts'],
    queryFn: api.getScripts,
    enabled: activeTab === 'actions' || activeModal === 'script' || activeModal === 'create_user',
  });

  const { data: targetLogs = [], isLoading: loadingTargetLogs } = useQuery({
    queryKey: ['target-logs', selectedActionForLogs?.deployment_id, selectedActionForLogs?.id],
    queryFn: async () => {
      if (!selectedActionForLogs?.deployment_id) {
        return [
          {
            id: 'wol-log-1',
            deployment_target_id: selectedActionForLogs?.id || '',
            timestamp: selectedActionForLogs?.created_at || new Date().toISOString(),
            level: selectedActionForLogs?.status === 'succeeded' ? 'INFO' : 'ERROR',
            message: selectedActionForLogs?.status === 'succeeded'
              ? `Paquet magique Wake-on-LAN diffusé avec succès sur le réseau (${selectedActionForLogs?.custom_command || 'Broadcast'}).`
              : (selectedActionForLogs?.error_message || 'Échec d\'envoi du paquet magique Wake-on-LAN.')
          }
        ];
      }
      return api.getTargetLogs(selectedActionForLogs.deployment_id, selectedActionForLogs.id);
    },
    enabled: !!selectedActionForLogs,
    refetchInterval: (query) => (selectedActionForLogs?.deployment_id ? 3000 : false),
  });

  // Action mutation
  const createActionMutation = useMutation({
    mutationFn: (deploymentData: any) => api.createDeployment(deploymentData),
    onSuccess: () => {
      setActiveModal(null);
      queryClient.invalidateQueries({ queryKey: ['device', id] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['device-actions', id] });
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
    },
    onError: (err: any) => {
      alert("Erreur lors de l'exécution de l'action : " + (err.response?.data?.detail || err.message));
    },
  });

  // Clear action history mutation
  const clearActionsMutation = useMutation({
    mutationFn: () => api.clearDeviceActions(id!),
    onSuccess: () => {
      setShowClearActionsModal(false);
      queryClient.invalidateQueries({ queryKey: ['device-actions', id] });
    },
    onError: (err: any) => {
      alert("Erreur lors du nettoyage de l'historique : " + (err.response?.data?.detail || err.message));
    },
  });

  // Delete single action mutation
  const deleteActionMutation = useMutation({
    mutationFn: (targetId: string) => api.deleteDeviceAction(id!, targetId),
    onSuccess: () => {
      setActionToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['device-actions', id] });
    },
    onError: (err: any) => {
      alert("Erreur lors de la suppression de l'action : " + (err.response?.data?.detail || err.message));
    },
  });

  // WoL state and mutation
  const [wolNotification, setWolNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Execution Logs helpers
  const toggleExpandLog = (logId: string) => {
    setExpandedLogIds((prev) =>
      prev.includes(logId) ? prev.filter((i) => i !== logId) : [...prev, logId]
    );
  };

  const expandAllLogs = () => {
    setExpandedLogIds(actions.map((a) => a.id));
  };

  const collapseAllLogs = () => {
    setExpandedLogIds([]);
  };

  const handleCopySingleLog = (action: DeviceActionHistory) => {
    const lines: string[] = [];
    lines.push(`=== LOG D'EXÉCUTION : ${action.deployment_name} ===`);
    lines.push(`Machine : ${device?.hostname || ''} (${device?.ip_address || ''})`);
    lines.push(`Date : ${new Date(action.created_at).toLocaleString('fr-FR')}`);
    lines.push(`Statut : ${action.status} | Code retour : ${action.exit_code !== null && action.exit_code !== undefined ? action.exit_code : 'N/A'}`);
    if (action.custom_command) lines.push(`Commande : ${action.custom_command}`);
    if (action.error_message) lines.push(`Erreur : ${action.error_message}`);
    lines.push(`\n--- SORTIE CONSOLE ---`);
    if (action.logs && action.logs.length > 0) {
      action.logs.forEach((l) => {
        lines.push(`[${new Date(l.timestamp).toLocaleTimeString()}] [${l.level}] ${l.message}`);
      });
    } else {
      lines.push(`(Aucune sortie console enregistrée)`);
    }
    const fullText = lines.join('\n');
    navigator.clipboard.writeText(fullText);
    setCopiedLogId(action.id);
    setTimeout(() => setCopiedLogId(null), 2000);
  };

  const handleDownloadSingleLog = (action: DeviceActionHistory) => {
    const lines: string[] = [];
    lines.push(`================================================================================`);
    lines.push(` RAPPORT D'EXÉCUTION - ${action.deployment_name.toUpperCase()}`);
    lines.push(` Machine : ${device?.hostname || 'Machine'} (${device?.ip_address || 'IP N/A'})`);
    lines.push(` Date : ${new Date(action.created_at).toLocaleString('fr-FR')}`);
    lines.push(` Statut : ${action.status} | Code retour : ${action.exit_code !== null && action.exit_code !== undefined ? action.exit_code : 'N/A'}`);
    if (action.started_at) lines.push(` Début : ${new Date(action.started_at).toLocaleString('fr-FR')}`);
    if (action.completed_at) lines.push(` Fin   : ${new Date(action.completed_at).toLocaleString('fr-FR')}`);
    if (action.custom_command) lines.push(` Commande : ${action.custom_command}`);
    if (action.error_message) lines.push(` Message d'erreur : ${action.error_message}`);
    lines.push(`================================================================================\n`);
    lines.push(`--- SORTIE CONSOLE / LOGS DE L'AGENT ---`);

    if (action.logs && action.logs.length > 0) {
      action.logs.forEach((l) => {
        lines.push(`[${new Date(l.timestamp).toLocaleTimeString()}] [${l.level}] ${l.message}`);
      });
    } else {
      lines.push(`(Aucune sortie console textuelle enregistrée pour cette action)`);
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = action.deployment_name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
    const dateStr = new Date(action.created_at).toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `log_${device?.hostname || 'device'}_${safeName}_${dateStr}.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleExportAllLogs = async () => {
    if (!device) return;
    setIsExportingAllLogs(true);
    try {
      const { blob, filename } = await api.exportDeviceExecutionLogs(device.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert("Erreur lors de l'export des logs : " + (err.response?.data?.detail || err.message));
    } finally {
      setIsExportingAllLogs(false);
    }
  };

  const filteredExecutionLogs = actions.filter((act) => {
    const matchSearch =
      !logsSearchTerm.trim() ||
      act.deployment_name.toLowerCase().includes(logsSearchTerm.toLowerCase()) ||
      (act.custom_command && act.custom_command.toLowerCase().includes(logsSearchTerm.toLowerCase())) ||
      (act.error_message && act.error_message.toLowerCase().includes(logsSearchTerm.toLowerCase())) ||
      (act.logs && act.logs.some((l) => l.message.toLowerCase().includes(logsSearchTerm.toLowerCase())));

    const matchStatus =
      logsStatusFilter === 'all' ||
      (logsStatusFilter === 'SUCCEEDED' && (act.status.toUpperCase() === 'SUCCEEDED' || act.status === 'succeeded')) ||
      (logsStatusFilter === 'FAILED' && (act.status.toUpperCase() === 'FAILED' || act.status === 'failed' || act.status === 'timed_out')) ||
      (logsStatusFilter === 'RUNNING' && (act.status.toUpperCase() === 'RUNNING' || act.status === 'running' || act.status === 'acked' || act.status === 'offered')) ||
      (logsStatusFilter === 'PENDING' && (act.status.toUpperCase() === 'PENDING' || act.status === 'pending'));

    return matchSearch && matchStatus;
  });

  const wakeMutation = useMutation({
    mutationFn: () => api.wakeDevice(id!),
    onSuccess: (res) => {
      if (res.success) {
        setWolNotification({
          type: 'success',
          message: res.message || `Paquet magique Wake-on-LAN envoyé avec succès à ${res.mac_address || 'la machine'}`,
        });
      } else {
        setWolNotification({
          type: 'error',
          message: res.message || "Erreur lors de l'envoi du paquet Wake-on-LAN",
        });
      }
      queryClient.invalidateQueries({ queryKey: ['device', id] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      setTimeout(() => setWolNotification(null), 7000);
    },
    onError: (err: any) => {
      setWolNotification({
        type: 'error',
        message: err?.response?.data?.detail || "Échec de l'envoi du paquet Wake-on-LAN",
      });
      setTimeout(() => setWolNotification(null), 7000);
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => api.approveDevice(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device', id] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (err: any) => {
      alert("Erreur lors de l'approbation de la machine : " + (err.response?.data?.detail || err.message));
    },
  });

  const acknowledgeRenameMutation = useMutation({
    mutationFn: async ({ deleteOld }: { deleteOld: boolean }) => {
      return api.acknowledgeDeviceRename(id!, deleteOld);
    },
    onSuccess: (updatedDev) => {
      queryClient.setQueryData(['device', id], updatedDev);
      queryClient.invalidateQueries({ queryKey: ['device', id] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (err: any) => {
      alert("Erreur lors de l'acquittement du renommage : " + (err.response?.data?.detail || err.message));
    },
  });

  if (loadingDevice || !device) {
    return <div className="py-12 text-center text-slate-500">Chargement des données de la machine...</div>;
  }

  // Action Handlers
  const handleRestart = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = `shutdown.exe /r /t ${powerDelay} /f`;

    createActionMutation.mutate({
      name: `🔄 Redémarrage - ${device.hostname}`,
      description: `Redémarrage système rapide (délai: ${powerDelay}s)`,
      deployment_type: 'command',
      custom_command: cmd,
      target_all_devices: false,
      target_device_ids: [device.id],
      target_group_ids: [],
      schedule_type: 'immediate',
      is_recurring: false,
    });
  };

  const handleShutdown = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = `shutdown.exe /s /t ${powerDelay} /f`;

    createActionMutation.mutate({
      name: `⚡ Arrêt - ${device.hostname}`,
      description: `Arrêt système rapide (délai: ${powerDelay}s)`,
      deployment_type: 'command',
      custom_command: cmd,
      target_all_devices: false,
      target_device_ids: [device.id],
      target_group_ids: [],
      schedule_type: 'immediate',
      is_recurring: false,
    });
  };

  const handleRename = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newName.trim().toUpperCase();
    if (!cleanName) return;

    const psScript = `
$ErrorActionPreference = 'Stop'
$newName = '${cleanName.replace(/'/g, "''")}'
Write-Output "Renommage du poste en '$newName'..."
try {
    Rename-Computer -NewName $newName -Force -ErrorAction Stop
    Write-Output "Machine renommee en '$newName' avec succes."
    ${renameRestart ? 'Write-Output "Redemarrage de la machine dans 3 secondes..."; Start-Sleep -Seconds 2; Restart-Computer -Force' : 'Write-Output "Note : Un redemarrage est necessaire pour appliquer definitivement le nom sur le reseau."'}
} catch {
    Write-Error "Echec du renommage : $($_.Exception.Message)"
    exit 1
}
`.trim();

    const base64Encoded = encodePowerShellUtf16Base64(psScript);
    const psCmd = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${base64Encoded}`;

    createActionMutation.mutate({
      name: `🏷️ Renommer poste -> ${cleanName}`,
      description: `Renommage NetBIOS en ${cleanName}${renameRestart ? ' avec redémarrage' : ''}`,
      deployment_type: 'command',
      custom_command: psCmd,
      target_all_devices: false,
      target_device_ids: [device.id],
      target_group_ids: [],
      schedule_type: 'immediate',
      is_recurring: false,
    }, {
      onSuccess: () => {
        setActiveModal(null);
        setNewName('');
      }
    });
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgText.trim()) return;

    const targetUser = msgTarget === '*' ? '*' : (inventory?.current_user?.split('\\').pop() || '*');
    const safeText = msgText.replace(/"/g, '""');
    const cmd = `msg ${targetUser} /TIME:${msgDuration} "${safeText}"`;

    createActionMutation.mutate({
      name: `💬 Message utilisateur - ${device.hostname}`,
      description: `Message à ${targetUser} : "${msgText.slice(0, 40)}${msgText.length > 40 ? '...' : ''}"`,
      deployment_type: 'command',
      custom_command: cmd,
      target_all_devices: false,
      target_device_ids: [device.id],
      target_group_ids: [],
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

  const encodeUtf8Base64 = (str: string): string => {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const generateUninstallScript = (sw: InstalledSoftware, silent: boolean = true): string => {
    const cleanName = (sw.name || '').replace(/'/g, "''");
    const cleanGuid = (sw.pschildname || '').replace(/'/g, "''");
    const cleanUninstall = (sw.uninstall_string || '').replace(/'/g, "''");
    const cleanQuiet = (sw.quiet_uninstall_string || '').replace(/'/g, "''");

    return `# ========================================================
# MAPT - Script de désinstallation silencieuse
# Application : ${cleanName}
# ========================================================
$ErrorActionPreference = 'Continue'
$swName = '${cleanName}'
$swGuid = '${cleanGuid}'
$rawUninstall = @'
${sw.uninstall_string || ''}
'@
$rawQuiet = @'
${sw.quiet_uninstall_string || ''}
'@

Write-Output "[MAPT] Début de la désinstallation de '$swName' sur $env:COMPUTERNAME..."
$uninstalled = $false

# 1. Désinstallation directe via GUID MSI
if ($swGuid -and $swGuid -match '^\\{[0-9A-Fa-f\\-]{36}\\}$') {
    Write-Output "[MAPT] Détection d'un composant Windows Installer (MSI) : $swGuid"
    $p = Start-Process "msiexec.exe" -ArgumentList "/x \`"$swGuid\`" /qn /norestart" -Wait -PassThru -NoNewWindow
    Write-Output "[MAPT] MsiExec terminé avec le code de sortie : $($p.ExitCode)"
    if ($p.ExitCode -eq 0 -or $p.ExitCode -eq 3010) { $uninstalled = $true }
}

# 2. Désinstallation via QuietUninstallString déclaré par l'éditeur
if (-not $uninstalled -and $rawQuiet.Trim()) {
    Write-Output "[MAPT] Exécution de la commande de désinstallation silencieuse native (QuietUninstallString)..."
    $cmd = $rawQuiet.Trim()
    if ($cmd -match '(?i)msiexec.*\\{([0-9a-f\\-]+)\\}') {
        $guid = $matches[1]
        $p = Start-Process "msiexec.exe" -ArgumentList "/x \`"$guid\`" /qn /norestart" -Wait -PassThru -NoNewWindow
        if ($p.ExitCode -eq 0 -or $p.ExitCode -eq 3010) { $uninstalled = $true }
    } else {
        $p = Start-Process "cmd.exe" -ArgumentList "/c \`"$cmd\`"" -Wait -PassThru -NoNewWindow
        if ($p.ExitCode -eq 0) { $uninstalled = $true }
    }
}

# 3. Analyse et injection silencieuse sur UninstallString
if (-not $uninstalled -and $rawUninstall.Trim()) {
    Write-Output "[MAPT] Analyse de la clé UninstallString..."
    $cmd = $rawUninstall.Trim()
    if ($cmd -match '(?i)msiexec(?:\\.exe)?\\s+(?:/[IXix])\\s*(\\{[0-9a-f\\-]+\\})') {
        $guid = $matches[1]
        Write-Output "[MAPT] Lancement de MsiExec pour le GUID $guid..."
        $p = Start-Process "msiexec.exe" -ArgumentList "/x $guid /qn /norestart" -Wait -PassThru -NoNewWindow
        if ($p.ExitCode -eq 0 -or $p.ExitCode -eq 3010) { $uninstalled = $true }
    } elseif ($cmd -match '^(?:\\"([^\\"]+)\\"|([^\\s]+))\\s*(.*)$') {
        $exe = if ($matches[1]) { $matches[1] } else { $matches[2] }
        $origArgs = if ($matches[3]) { $matches[3] } else { "" }
        $silentArgs = $origArgs
        if ($silentArgs -notmatch '(?i)/S|/silent|/verysilent|/quiet|/qn') {
            if ($exe -match '(?i)unins\\d*\\.exe|setup\\.exe') {
                $silentArgs = "$origArgs /VERYSILENT /SUPPRESSMSGBOXES /NORESTART".Trim()
            } else {
                $silentArgs = "$origArgs /S /quiet /norestart".Trim()
            }
        }
        Write-Output "[MAPT] Lancement de l'exécutable : '$exe' avec paramètres : '$silentArgs'"
        if (Test-Path $exe) {
            $p = Start-Process -FilePath $exe -ArgumentList $silentArgs -Wait -PassThru -NoNewWindow
            Write-Output "[MAPT] Code de sortie de l'exécutable : $($p.ExitCode)"
            if ($p.ExitCode -eq 0) { $uninstalled = $true }
        }
    }
}

# 4. Recherche dynamique de secours dans la base de registre
if (-not $uninstalled) {
    Write-Output "[MAPT] Recherche dynamique dans les clés Uninstall du registre..."
    $keys = Get-ItemProperty HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*, HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*, HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\* -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -and ($_.DisplayName -eq $swName -or $_.DisplayName -like "$swName*") }
    foreach ($k in $keys) {
        if ($k.PSChildName -match '^\\{[0-9A-Fa-f\\-]{36}\\}$' -or $k.WindowsInstaller) {
            $g = $k.PSChildName
            Write-Output "[MAPT] MsiExec dynamique pour $g"
            $p = Start-Process "msiexec.exe" -ArgumentList "/x \`"$g\`" /qn /norestart" -Wait -PassThru -NoNewWindow
            if ($p.ExitCode -eq 0 -or $p.ExitCode -eq 3010) { $uninstalled = $true; break }
        } elseif ($k.QuietUninstallString) {
            $p = Start-Process "cmd.exe" -ArgumentList "/c \`"$($k.QuietUninstallString)\`"" -Wait -PassThru -NoNewWindow
            if ($p.ExitCode -eq 0) { $uninstalled = $true; break }
        } elseif ($k.UninstallString) {
            $u = $k.UninstallString
            if ($u -match '(?i)msiexec(?:\\.exe)?\\s+(?:/[IXix])\\s*(\\{[0-9a-f\\-]+\\})') {
                $g = $matches[1]
                $p = Start-Process "msiexec.exe" -ArgumentList "/x $g /qn /norestart" -Wait -PassThru -NoNewWindow
                if ($p.ExitCode -eq 0 -or $p.ExitCode -eq 3010) { $uninstalled = $true; break }
            }
        }
    }
}

Write-Output "[MAPT] Procédure de désinstallation terminée avec succès."
Start-Sleep -Seconds 2
`;
  };

  const handleOpenUninstallModal = (sw: InstalledSoftware) => {
    setSoftwareToUninstall(sw);
    setCustomUninstallScript(generateUninstallScript(sw, true));
    setShowAdvancedUninstallScript(false);
    setUninstallSilentMode(true);
    setUninstallTimeout(300);
    setActiveModal('uninstall_software');
  };

  const handleConfirmUninstallSoftware = (e: React.FormEvent) => {
    e.preventDefault();
    if (!softwareToUninstall) return;

    const scriptToRun = customUninstallScript || generateUninstallScript(softwareToUninstall, uninstallSilentMode);
    const encoded = encodePowerShellUtf16Base64(scriptToRun);
    const cmd = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`;

    createActionMutation.mutate(
      {
        name: `🗑️ Désinstallation - ${softwareToUninstall.name}`,
        description: `Désinstallation à distance de l'application ${softwareToUninstall.name} (${softwareToUninstall.version || 'v?'})`,
        deployment_type: 'command',
        custom_command: cmd,
        target_all_devices: false,
        target_device_ids: [device.id],
        target_group_ids: [],
        schedule_type: 'immediate',
        is_recurring: false,
      },
      {
        onSuccess: () => {
          setActiveModal(null);
          setSoftwareToUninstall(null);
          setActiveTab('actions');
        },
      }
    );
  };

  const handleExecuteScript = (e: React.FormEvent) => {
    e.preventDefault();

    if (scriptMode === 'catalog') {
      const script = scripts.find((s) => s.id === selectedScriptId);
      if (!script || !script.latest_version) {
        alert('Veuillez sélectionner un script valide.');
        return;
      }

      createActionMutation.mutate({
        name: `📜 Script: ${script.name} - ${device.hostname}`,
        description: `Exécution instantanée du script ${script.name} (v${script.latest_version.version})`,
        deployment_type: 'script',
        script_version_id: script.latest_version.id,
        target_all_devices: false,
        target_device_ids: [device.id],
        target_group_ids: [],
        schedule_type: 'immediate',
        is_recurring: false,
      });
    } else {
      if (!adhocScriptContent.trim()) {
        alert('Veuillez saisir le contenu du script.');
        return;
      }

      let cmd = '';
      if (adhocLanguage === 'powershell') {
        const encoded = encodePowerShellUtf16Base64(adhocScriptContent);
        cmd = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`;
      } else if (adhocLanguage === 'vbscript') {
        const encoded = encodePowerShellUtf16Base64(adhocScriptContent);
        cmd = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$f = [System.IO.Path]::Combine($env:TEMP, 'mapt_adhoc_' + (Get-Random) + '.vbs'); [System.IO.File]::WriteAllText($f, [System.Text.Encoding]::Unicode.GetString([System.Convert]::FromBase64String('${encoded}'))); cscript.exe //NoLogo $f; Remove-Item -Force $f"`;
      } else if (adhocLanguage === 'cmd') {
        cmd = adhocScriptContent.replace(/\r?\n/g, ' && ');
      } else if (adhocLanguage === 'python') {
        const escaped = adhocScriptContent.replace(/"/g, '\\"').replace(/\r?\n/g, '; ');
        cmd = `python -c "${escaped}"`;
      }

      createActionMutation.mutate({
        name: `⚡ Script Ad-Hoc (${adhocLanguage}) - ${device.hostname}`,
        description: `Exécution personnalisée ${adhocLanguage}`,
        deployment_type: 'command',
        custom_command: cmd,
        target_all_devices: false,
        target_device_ids: [device.id],
        target_group_ids: [],
        schedule_type: 'immediate',
        is_recurring: false,
      });
    }
  };

  const handleDeployPackage = (e: React.FormEvent) => {
    e.preventDefault();
    const pkg = packages.find((p) => p.id === selectedPackageId);
    if (!pkg || !pkg.latest_version) {
      alert('Veuillez sélectionner un package avec une version disponible.');
      return;
    }

    createActionMutation.mutate({
      name: `📦 Déploiement: ${pkg.name} - ${device.hostname}`,
      description: `Installation rapide du package ${pkg.name} (${pkg.latest_version.version})`,
      deployment_type: 'package',
      package_version_id: pkg.latest_version.id,
      target_all_devices: false,
      target_device_ids: [device.id],
      target_group_ids: [],
      schedule_type: 'immediate',
      is_recurring: false,
    });
  };

  const getDetectedAdDomain = (currentUser?: string, hostname?: string): string => {
    if (!currentUser || !currentUser.includes('\\')) return '';
    const domainPart = currentUser.split('\\')[0].trim().toUpperCase();
    const invalid = [
      'WORKGROUP',
      'WORKGÉROUP',
      'WORKGROUPE',
      'AUTORITE NT',
      'AUTORITÉ NT',
      'NT AUTHORITY',
      'BUILTIN',
      (hostname || '').trim().toUpperCase(),
    ];
    if (invalid.includes(domainPart)) return '';
    return domainPart;
  };

  const handleLogon = (e: React.FormEvent) => {
    e.preventDefault();
    const user = logonUsername.trim();
    if (!user) {
      alert("Veuillez renseigner un nom d'utilisateur.");
      return;
    }

    const domain = logonAccountType === 'domain' ? (logonDomain.trim() || '.') : '.';
    const targetLabel = logonAccountType === 'domain' ? `${domain}\\${user}` : `.\\${user}`;

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
Remove-ItemProperty $w -Name "IgnoreShiftOvrd" -ErrorAction SilentlyContinue

${logonOneTime ? `
# Mode usage unique : RunOnce nettoie automatiquement des l'ouverture de la session
$cleanupCmd = 'powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 5; Set-ItemProperty ''HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon'' -Name AutoAdminLogon -Value ''0'' -Force; Remove-ItemProperty ''HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon'' -Name DefaultPassword -ErrorAction SilentlyContinue; Remove-ItemProperty ''HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon'' -Name ForceAutoLogon -ErrorAction SilentlyContinue; Remove-ItemProperty ''HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon'' -Name AutoLogonCount -ErrorAction SilentlyContinue; Remove-ItemProperty ''HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce'' -Name ''MAPT_DisableAutoLogon'' -ErrorAction SilentlyContinue"'
Set-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce" -Name "MAPT_DisableAutoLogon" -Value $cleanupCmd -Type String -Force
Set-ItemProperty $w -Name "AutoLogonCount" -Value 1 -Type DWord -Force
` : `
# Mode persistant : reconnexion permanente
Remove-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce" -Name "MAPT_DisableAutoLogon" -ErrorAction SilentlyContinue
Set-ItemProperty $w -Name "ForceAutoLogon" -Value "1" -Type String -Force
Remove-ItemProperty $w -Name "AutoLogonCount" -ErrorAction SilentlyContinue
`}

if (Test-Path $s) {
    Set-ItemProperty $s -Name "DisableCAD" -Value 1 -Type DWord -Force
    Set-ItemProperty $s -Name "DontDisplayLastUserName" -Value 0 -Type DWord -Force
    Set-ItemProperty $s -Name "LegalNoticeCaption" -Value "" -Type String -Force
    Set-ItemProperty $s -Name "LegalNoticeText" -Value "" -Type String -Force
}

Write-Output "AutoLogon configure avec succes pour $d\\$u (${logonOneTime ? 'Usage unique' : 'Persistant'})"
${logonRestartNow ? 'shutdown.exe /r /t 2 /f /c "MAPT - Connexion automatique session: $d\\$u"' : ''}
`.trim();

    const base64Encoded = encodePowerShellUtf16Base64(psScript);
    const cmd = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${base64Encoded}`;

    createActionMutation.mutate({
      name: `👤 Connexion utilisateur (${targetLabel}) - ${device.hostname}`,
      description: `Configuration AutoLogon pour ${targetLabel}${logonRestartNow ? ' avec redémarrage immédiat' : ''}`,
      deployment_type: 'command',
      custom_command: cmd,
      target_all_devices: false,
      target_device_ids: [device.id],
      target_group_ids: [],
      schedule_type: 'immediate',
      is_recurring: false,
    });
  };

  const handleResetLogon = () => {
    if (!confirm(`Désactiver immédiatement la connexion automatique (AutoLogon) sur ${device.hostname} ?`)) {
      return;
    }

    const resetScript = `
$w = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon"
Set-ItemProperty $w -Name "AutoAdminLogon" -Value "0" -Type String -Force
Remove-ItemProperty $w -Name "DefaultPassword" -ErrorAction SilentlyContinue
Remove-ItemProperty $w -Name "ForceAutoLogon" -ErrorAction SilentlyContinue
Remove-ItemProperty $w -Name "AutoLogonCount" -ErrorAction SilentlyContinue
Remove-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce" -Name "MAPT_DisableAutoLogon" -ErrorAction SilentlyContinue
Write-Output "AutoLogon desactive et nettoye avec succes sur le poste."
`.trim();

    const base64Encoded = encodePowerShellUtf16Base64(resetScript);
    const cmd = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${base64Encoded}`;

    createActionMutation.mutate({
      name: `🔒 Désactiver AutoLogon - ${device.hostname}`,
      description: `Désactivation de la connexion automatique et purge des identifiants Winlogon`,
      deployment_type: 'command',
      custom_command: cmd,
      target_all_devices: false,
      target_device_ids: [device.id],
      target_group_ids: [],
      schedule_type: 'immediate',
      is_recurring: false,
    });
    setActiveModal(null);
  };

  const handleCreateLocalUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!device || !createUsername.trim()) return;

    const u = createUsername.trim();
    const p = createPassword;
    const fn = createFullName.trim();
    const isAdmin = createIsAdmin;
    const pne = createPasswordNeverExpires;

    // Récupérer les scripts post-création sélectionnés dans l'ordre
    const selectedScripts = createPostScriptIds
      .map((sId) => scripts.find((s) => s.id === sId))
      .filter(Boolean) as Script[];

    let postScriptsPs = '';
    if (selectedScripts.length > 0) {
      postScriptsPs += `\n# --- Execution séquentielle des scripts post-création (${selectedScripts.length} script(s)) ---\n`;
      postScriptsPs += `$env:MAPT_TARGET_USER = $u\n$env:MAPT_TARGET_FULLNAME = $fn\n$env:MAPT_IS_ADMIN = "$isAdmin"\n`;

      selectedScripts.forEach((s, idx) => {
        const stepNum = idx + 1;
        const totalSteps = selectedScripts.length;
        const sName = s.name.replace(/"/g, '`"');
        const lang = (s.language || 'powershell').toLowerCase();
        const content = s.latest_version?.content || '';
        const b64 = encodeUtf8Base64(content);
        const safeName = s.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'script';
        const ext = (lang === 'cmd' || lang === 'batch' || lang === 'bat') ? 'bat' : (lang === 'vbs' || lang === 'vbscript') ? 'vbs' : (lang === 'python' || lang === 'py') ? 'py' : 'ps1';

        postScriptsPs += `
Write-Output ""
Write-Output "=========================================================="
Write-Output "[Script ${stepNum}/${totalSteps}] Lancement de : ${sName} (${lang})"
Write-Output "=========================================================="
try {
    $b64_${stepNum} = "${b64}"
    $bytes_${stepNum} = [System.Convert]::FromBase64String($b64_${stepNum})
    $code_${stepNum} = [System.Text.Encoding]::UTF8.GetString($bytes_${stepNum})
    $tmpFile_${stepNum} = Join-Path $env:TEMP "mapt_post_${stepNum}_${safeName}.${ext}"
    [System.IO.File]::WriteAllText($tmpFile_${stepNum}, $code_${stepNum}, [System.Text.Encoding]::UTF8)

    if ("${lang}" -eq "cmd" -or "${lang}" -eq "batch" -or "${lang}" -eq "bat") {
        & cmd.exe /c $tmpFile_${stepNum} "$u" "$fn"
    } elseif ("${lang}" -eq "vbs" -or "${lang}" -eq "vbscript") {
        & cscript.exe //nologo $tmpFile_${stepNum} "$u" "$fn"
    } elseif ("${lang}" -eq "python" -or "${lang}" -eq "py") {
        & python.exe $tmpFile_${stepNum} "$u" "$fn"
    } else {
        & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $tmpFile_${stepNum} "$u" "$fn"
    }
    Remove-Item $tmpFile_${stepNum} -Force -ErrorAction SilentlyContinue
    Write-Output "[OK] Script '${sName}' termine avec succes."
} catch {
    Write-Warning "Erreur lors de l'execution du script '${sName}' : $($_.Exception.Message)"
}
`;
      });
    }

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

${postScriptsPs}
`.trim();

    const base64Encoded = encodePowerShellUtf16Base64(psScript);
    const cmd = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${base64Encoded}`;

    const scriptSuffix = selectedScripts.length > 0 ? ` + ${selectedScripts.length} script(s)` : '';

    createActionMutation.mutate({
      name: `👤➕ Créer utilisateur local (${u})${scriptSuffix} - ${device.hostname}`,
      description: `Création du compte local ${u} (${isAdmin ? 'Administrateur' : 'Standard'})${fn ? ' - ' + fn : ''}${selectedScripts.length > 0 ? ` avec exécution de : ${selectedScripts.map(s => s.name).join(' -> ')}` : ''}`,
      deployment_type: 'command',
      custom_command: cmd,
      target_all_devices: false,
      target_device_ids: [device.id],
      target_group_ids: [],
      schedule_type: 'immediate',
      is_recurring: false,
    });
    setActiveModal(null);
  };

  const handleDeleteLocalUser = (e: React.FormEvent) => {
    e.preventDefault();
    const u = deleteUsername.trim();
    if (!u) return;

    if (!confirm(`Confirmez-vous la suppression ${deleteProfileFiles ? 'du profil et fichiers Windows' : ''} ${deleteLocalAccount ? 'et du compte ' + u : ''} sur ${device.hostname} ?`)) {
      return;
    }

    const delProfile = deleteProfileFiles;
    const delAccount = deleteLocalAccount;
    const forceLogoff = deleteForceLogoff;

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

    const base64Encoded = encodePowerShellUtf16Base64(psScript);
    const cmd = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${base64Encoded}`;

    createActionMutation.mutate({
      name: `👤🗑️ Supprimer profil/compte (${u}) - ${device.hostname}`,
      description: `Suppression ${delProfile ? 'du profil et fichiers' : ''} ${delAccount ? 'et du compte ' + u : ''}`,
      deployment_type: 'command',
      custom_command: cmd,
      target_all_devices: false,
      target_device_ids: [device.id],
      target_group_ids: [],
      schedule_type: 'immediate',
      is_recurring: false,
    });
    setActiveModal(null);
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return (
          <span className="inline-flex items-center space-x-1 font-mono text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
            <CheckCircle2 className="w-3 h-3" />
            <span>Réussi</span>
          </span>
        );
      case 'running':
      case 'offered':
        return (
          <span className="inline-flex items-center space-x-1 font-mono text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>En cours</span>
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center space-x-1 font-mono text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-950/80 text-amber-400 border border-amber-800/60">
            <Clock className="w-3 h-3" />
            <span>En attente agent</span>
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center space-x-1 font-mono text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-950/80 text-rose-400 border border-rose-800/60">
            <XCircle className="w-3 h-3" />
            <span>Échoué</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 font-mono text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
            <span>{status}</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <Link
            to="/devices"
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-black text-slate-100 tracking-tight">{device.hostname}</h1>
              {device.is_approved === false ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Non approuvé</span>
                </span>
              ) : (
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                    device.is_online
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {device.is_online ? 'En ligne' : 'Hors ligne'}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 font-mono mt-1">UUID: {device.device_uuid}</p>
          </div>
        </div>

      {/* WoL Toast Notification */}
      {wolNotification && (
        <div
          className={`p-4 rounded-2xl border flex items-start justify-between shadow-xl transition animate-in fade-in slide-in-from-top-2 duration-200 ${
            wolNotification.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-950/80 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-start space-x-3">
            {wolNotification.type === 'success' ? (
              <Zap className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            )}
            <p className="text-sm font-semibold">{wolNotification.message}</p>
          </div>
          <button
            onClick={() => setWolNotification(null)}
            className="text-slate-400 hover:text-slate-200 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Quick launch action button in header */}
      <div className="flex items-center gap-2.5">
        {device.is_approved === false && (
          <button
            onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending}
            className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/30 px-4 py-2 rounded-xl text-sm font-semibold transition shadow-sm disabled:opacity-50"
            title="Approuver cette machine sur le serveur"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{approveMutation.isPending ? 'Approbation...' : 'Approuver la machine'}</span>
          </button>
        )}

        <button
          onClick={() => wakeMutation.mutate()}
          disabled={wakeMutation.isPending}
          className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-amber-400 border border-amber-500/30 hover:border-amber-500/60 px-4 py-2 rounded-xl text-sm font-semibold transition shadow-sm disabled:opacity-50"
          title="Envoyer un paquet magique Wake-on-LAN pour allumer ce poste"
        >
          <Zap className="w-4 h-4" />
          <span>{wakeMutation.isPending ? 'Envoi...' : 'Réveiller (WoL)'}</span>
        </button>

        <button
          onClick={() => setActiveTab('actions')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-semibold transition border ${
            activeTab === 'actions'
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-500 shadow-lg shadow-emerald-950/40'
              : 'bg-slate-900 hover:bg-slate-800 text-emerald-400 border-emerald-500/30'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>Actions Rapides</span>
        </button>
      </div>
      </div>

      {/* Rename Detected Alert Banner */}
      {device.previous_hostname && (
        <div className="p-4 bg-gradient-to-r from-blue-950/60 to-indigo-950/40 border border-blue-500/40 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-start space-x-3.5">
            <div className="p-2.5 bg-blue-500/20 border border-blue-500/30 rounded-xl text-blue-400 shrink-0 mt-0.5">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h4 className="text-sm font-bold text-slate-100">Renommage de poste détecté</h4>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/30">
                  Resynchronisation auto
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                Ce poste s'appelait précédemment <span className="font-mono font-bold text-blue-400 bg-slate-900/80 px-1.5 py-0.5 rounded border border-blue-500/30">{device.previous_hostname}</span> et a été renommé en <span className="font-mono font-bold text-emerald-400 bg-slate-900/80 px-1.5 py-0.5 rounded border border-emerald-500/30">{device.hostname}</span>.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2.5 w-full md:w-auto justify-end shrink-0">
            <button
              onClick={() => acknowledgeRenameMutation.mutate({ deleteOld: true })}
              disabled={acknowledgeRenameMutation.isPending}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-950/50 transition flex items-center space-x-1.5 disabled:opacity-50"
              title="Confirmer le nouveau nom et supprimer automatiquement les anciens doublons / fantômes"
            >
              {acknowledgeRenameMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              <span>Acquitter et purger l'ancien nom</span>
            </button>
            <button
              onClick={() => acknowledgeRenameMutation.mutate({ deleteOld: false })}
              disabled={acknowledgeRenameMutation.isPending}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 hover:border-slate-600 transition disabled:opacity-50"
              title="Conserver l'historique sans supprimer de fiches"
            >
              <span>Acquitter</span>
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-800 space-x-6 text-sm font-semibold overflow-x-auto">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`pb-3 border-b-2 transition flex items-center space-x-2 whitespace-nowrap ${
            activeTab === 'inventory'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>Inventaire Matériel</span>
        </button>

        <button
          onClick={() => setActiveTab('software')}
          className={`pb-3 border-b-2 transition flex items-center space-x-2 whitespace-nowrap ${
            activeTab === 'software'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          <PackageIcon className="w-4 h-4" />
          <span>Inventaire Logiciel</span>
          {inventory?.installed_software && inventory.installed_software.length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 text-[10px] font-mono rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              {inventory.installed_software.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('network')}
          className={`pb-3 border-b-2 transition flex items-center space-x-2 whitespace-nowrap ${
            activeTab === 'network'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          <Network className="w-4 h-4" />
          <span>Interfaces & Réseau</span>
        </button>

        <button
          onClick={() => setActiveTab('general')}
          className={`pb-3 border-b-2 transition flex items-center space-x-2 whitespace-nowrap ${
            activeTab === 'general'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Informations Générales</span>
          {inventory?.local_users && inventory.local_users.length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 text-[10px] font-mono rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              {inventory.local_users.length} users
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('actions')}
          className={`pb-3 border-b-2 transition flex items-center space-x-2 whitespace-nowrap ${
            activeTab === 'actions'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>Actions & Télémaintenance</span>
          {actions.length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 text-[10px] font-mono rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              {actions.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`pb-3 border-b-2 transition flex items-center space-x-2 whitespace-nowrap ${
            activeTab === 'logs'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>Logs d'Exécution</span>
          {actions.length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 text-[10px] font-mono rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              {actions.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab 1: Hardware Inventory */}
      {activeTab === 'inventory' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* CPU Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-400 uppercase font-bold">Processeur</div>
                <div className="text-base font-semibold text-slate-100">{inventory?.cpu_model || 'Intel / AMD'}</div>
              </div>
            </div>
            <div className="text-sm text-slate-400">
              Cœurs : <span className="font-semibold text-slate-200">{inventory?.cpu_cores || 4} cœurs</span>
            </div>
          </div>

          {/* Memory Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-400 uppercase font-bold">Mémoire RAM</div>
                <div className="text-base font-semibold text-slate-100">
                  {inventory?.total_memory_mb ? `${Math.round(inventory.total_memory_mb / 1024)} Go` : '16 Go'}
                </div>
              </div>
            </div>
            <div className="text-sm text-slate-400">
              Total : <span className="font-mono text-slate-200">{inventory?.total_memory_mb || 16384} Mo</span>
            </div>
          </div>

          {/* Disk Storage Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-400 uppercase font-bold">Stockage Principal</div>
                <div className="text-base font-semibold text-slate-100">{inventory?.disk_total_gb || 500} Go</div>
              </div>
            </div>
            <div className="text-sm text-slate-400">
              Espace libre : <span className="font-semibold text-emerald-400">{inventory?.disk_free_gb || 250} Go</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Software Inventory (NEW!) */}
      {activeTab === 'software' && (() => {
        const softwareList = inventory?.installed_software || [];
        const publishers = Array.from(new Set(softwareList.map((s) => s.publisher).filter(Boolean))) as string[];

        const filteredList = softwareList.filter((s) => {
          const matchSearch =
            !softwareSearch.trim() ||
            s.name?.toLowerCase().includes(softwareSearch.toLowerCase()) ||
            s.publisher?.toLowerCase().includes(softwareSearch.toLowerCase()) ||
            s.version?.toLowerCase().includes(softwareSearch.toLowerCase());
          const matchPub = softwareFilterPublisher === 'all' || s.publisher === softwareFilterPublisher;
          return matchSearch && matchPub;
        });

        const sortedSoftwareList = [...filteredList].sort((a, b) => {
          let comparison = 0;
          if (softwareSortBy === 'name') {
            comparison = (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' });
          } else if (softwareSortBy === 'version') {
            comparison = (a.version || '').localeCompare(b.version || '', undefined, { numeric: true });
          } else if (softwareSortBy === 'publisher') {
            comparison = (a.publisher || '').localeCompare(b.publisher || '', undefined, { sensitivity: 'base' });
          } else if (softwareSortBy === 'install_date') {
            comparison = (a.install_date || '').localeCompare(b.install_date || '');
          }
          return softwareSortDir === 'asc' ? comparison : -comparison;
        });

        const handleSoftwareSort = (field: 'name' | 'version' | 'publisher' | 'install_date') => {
          if (softwareSortBy === field) {
            setSoftwareSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
          } else {
            setSoftwareSortBy(field);
            setSoftwareSortDir('asc');
          }
        };

        const getSoftwareSortIcon = (field: 'name' | 'version' | 'publisher' | 'install_date') => {
          if (softwareSortBy !== field) {
            return <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 opacity-60" />;
          }
          return softwareSortDir === 'asc' ? (
            <ArrowUp className="w-3.5 h-3.5 text-purple-400" />
          ) : (
            <ArrowDown className="w-3.5 h-3.5 text-purple-400" />
          );
        };

        return (
          <div className="space-y-6">
            {/* Header / Stats & Filter bar */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                    <PackageIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-100">Applications & Logiciels Installés</h2>
                    <p className="text-xs text-slate-400">
                      Inventaire complet des programmes 32/64 bits détectés sur le poste Windows
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 font-mono text-xs">
                  <button
                    type="button"
                    onClick={() => refetchInventory()}
                    disabled={fetchingInventory}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 transition"
                    title="Forcer l'actualisation immédiate de l'inventaire logiciel"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${fetchingInventory ? 'animate-spin' : ''}`} />
                    <span className="font-sans font-medium text-xs">Actualiser</span>
                  </button>
                  <span className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300">
                    Total : <strong className="text-emerald-400">{softwareList.length}</strong> applications
                  </span>
                  {softwareSearch.trim() && (
                    <span className="px-3 py-1.5 rounded-xl bg-purple-950/60 border border-purple-800/60 text-purple-300">
                      Filtrées : <strong>{filteredList.length}</strong>
                    </span>
                  )}
                </div>
              </div>

              {/* Search and Filters */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Rechercher par nom d'application, version, éditeur..."
                    value={softwareSearch}
                    onChange={(e) => setSoftwareSearch(e.target.value)}
                    className="w-full pl-10 pr-10 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                  />
                  {softwareSearch && (
                    <button
                      onClick={() => setSoftwareSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {publishers.length > 0 && (
                  <div className="sm:w-64">
                    <select
                      value={softwareFilterPublisher}
                      onChange={(e) => setSoftwareFilterPublisher(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                    >
                      <option value="all">Tous les éditeurs ({publishers.length})</option>
                      {publishers.sort().map((pub, idx) => (
                        <option key={idx} value={pub}>
                          {pub}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Software Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              {sortedSoftwareList.length > 0 ? (
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-950/80 sticky top-0 backdrop-blur z-10 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      <tr>
                        {/* Tri par Application */}
                        <th
                          onClick={() => handleSoftwareSort('name')}
                          style={getSoftwareColStyle('name')}
                          className="py-3 px-4 cursor-pointer hover:bg-slate-900 transition select-none relative group/th"
                          title="Cliquer pour trier par Application"
                        >
                          <div className="flex items-center space-x-1.5 pr-2">
                            <span>Application</span>
                            {getSoftwareSortIcon('name')}
                          </div>
                          <SoftwareResizeHandle colKey="name" />
                        </th>

                        {/* Tri par Version */}
                        <th
                          onClick={() => handleSoftwareSort('version')}
                          style={getSoftwareColStyle('version')}
                          className="py-3 px-4 cursor-pointer hover:bg-slate-900 transition select-none relative group/th"
                          title="Cliquer pour trier par Version"
                        >
                          <div className="flex items-center space-x-1.5 pr-2">
                            <span>Version</span>
                            {getSoftwareSortIcon('version')}
                          </div>
                          <SoftwareResizeHandle colKey="version" />
                        </th>

                        {/* Tri par Éditeur */}
                        <th
                          onClick={() => handleSoftwareSort('publisher')}
                          style={getSoftwareColStyle('publisher')}
                          className="py-3 px-4 cursor-pointer hover:bg-slate-900 transition select-none relative group/th"
                          title="Cliquer pour trier par Éditeur / Fournisseur"
                        >
                          <div className="flex items-center space-x-1.5 pr-2">
                            <span>Éditeur / Fournisseur</span>
                            {getSoftwareSortIcon('publisher')}
                          </div>
                          <SoftwareResizeHandle colKey="publisher" />
                        </th>

                        {/* Tri par Date d'installation */}
                        <th
                          onClick={() => handleSoftwareSort('install_date')}
                          style={getSoftwareColStyle('install_date')}
                          className="py-3 px-4 cursor-pointer hover:bg-slate-900 transition select-none relative group/th"
                          title="Cliquer pour trier par Date d'installation"
                        >
                          <div className="flex items-center space-x-1.5 pr-2">
                            <span>Date d'installation</span>
                            {getSoftwareSortIcon('install_date')}
                          </div>
                          <SoftwareResizeHandle colKey="install_date" />
                        </th>

                        <th style={getSoftwareColStyle('actions')} className="py-3 px-4 text-right relative group/th">
                          <span>Actions</span>
                          <SoftwareResizeHandle colKey="actions" />
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-sm">
                      {sortedSoftwareList.map((sw, idx) => (
                        <tr key={idx} className="hover:bg-slate-850/60 transition group/row">
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                                <PackageIcon className="w-4 h-4" />
                              </div>
                              <span className="font-semibold text-slate-100">{sw.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono text-xs">
                            {sw.version ? (
                              <span className="px-2.5 py-1 rounded-md bg-slate-950 border border-slate-800 text-slate-300">
                                v{sw.version}
                              </span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-300">
                            {sw.publisher || <span className="text-slate-600">Non spécifié</span>}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-slate-400">
                            {sw.install_date ? (
                              sw.install_date.length === 8 ? (
                                `${sw.install_date.slice(6, 8)}/${sw.install_date.slice(4, 6)}/${sw.install_date.slice(0, 4)}`
                              ) : (
                                sw.install_date
                              )
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleOpenUninstallModal(sw)}
                              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 hover:border-rose-500/60 text-rose-300 hover:text-rose-100 text-xs font-semibold transition group shadow-sm"
                              title={`Désinstaller ${sw.name} de ce poste`}
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-400 group-hover:scale-110 transition" />
                              <span>Désinstaller</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-16 text-center text-slate-500">
                  <PackageIcon className="w-12 h-12 mx-auto mb-3 text-slate-700 stroke-1" />
                  <p className="text-sm font-semibold text-slate-400">
                    {softwareSearch.trim() || softwareFilterPublisher !== 'all'
                      ? 'Aucun logiciel ne correspond à votre filtre de recherche.'
                      : 'Aucun inventaire logiciel remonté pour cette machine.'}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    L'agent MAPT collecte la liste des logiciels lors de l'enrôlement et des cycles périodiques.
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Tab 2: Network Interfaces & Configuration (ipconfig /all style) */}
      {activeTab === 'network' && (() => {
        const rawInterfaces = inventory?.network_interfaces || [];

        const isIfaceConnected = (iface: any) => {
          const status = iface.status?.toLowerCase();
          const hasValidIp =
            iface.ip_addresses &&
            iface.ip_addresses.length > 0 &&
            iface.ip_addresses.some(
              (ip: string) => !ip.startsWith('169.254.') && !ip.startsWith('127.')
            );
          return (
            status === 'connected' ||
            (status === 'active' && hasValidIp) ||
            iface.is_connected === true ||
            hasValidIp
          );
        };

        // Smart sort: Connected physical with gateways first, connected next, then physical disconnected, then virtual
        const sortedInterfaces = [...rawInterfaces].sort((a, b) => {
          const aConn = isIfaceConnected(a);
          const bConn = isIfaceConnected(b);
          if (aConn && !bConn) return -1;
          if (!aConn && bConn) return 1;

          const aGw = Array.isArray(a.default_gateways) && a.default_gateways.length > 0;
          const bGw = Array.isArray(b.default_gateways) && b.default_gateways.length > 0;
          if (aGw && !bGw) return -1;
          if (!aGw && bGw) return 1;

          const aPhys = Boolean(a.is_physical);
          const bPhys = Boolean(b.is_physical);
          if (aPhys && !bPhys) return -1;
          if (!aPhys && bPhys) return 1;
          return 0;
        });

        const primaryConnectedIface = sortedInterfaces.find(isIfaceConnected);
        const resolvedPrimaryIp =
          primaryConnectedIface?.primary_ip ||
          primaryConnectedIface?.ip_addresses?.[0] ||
          (device.ip_address && !device.ip_address.startsWith('172.18.') ? device.ip_address : null) ||
          device.ip_address ||
          '127.0.0.1';

        const connectedCount = sortedInterfaces.filter(isIfaceConnected).length;
        const physicalCount = sortedInterfaces.filter((i) => Boolean(i.is_physical)).length;
        const disconnectedCount = sortedInterfaces.length - connectedCount;

        const filteredInterfaces = sortedInterfaces.filter((iface) => {
          const conn = isIfaceConnected(iface);
          if (netFilter === 'connected' && !conn) return false;
          if (netFilter === 'disconnected' && conn) return false;
          if (netFilter === 'physical' && !iface.is_physical) return false;

          if (!netSearch.trim()) return true;
          const q = netSearch.toLowerCase();
          const nameMatch = iface.name?.toLowerCase().includes(q);
          const descMatch = iface.description?.toLowerCase().includes(q);
          const macMatch = iface.mac?.toLowerCase().includes(q);
          const ipMatch = iface.ip_addresses?.some((ip: string) => ip.toLowerCase().includes(q));
          return nameMatch || descMatch || macMatch || ipMatch;
        });

        const sortedNetInterfaces = [...filteredInterfaces].sort((a, b) => {
          let comparison = 0;
          if (netSortBy === 'name') {
            comparison = (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' });
          } else if (netSortBy === 'mac') {
            comparison = (a.mac || '').localeCompare(b.mac || '');
          } else if (netSortBy === 'ip') {
            const ipA = a.ip_addresses?.[0] || '';
            const ipB = b.ip_addresses?.[0] || '';
            comparison = ipA.localeCompare(ipB, undefined, { numeric: true });
          } else if (netSortBy === 'dhcp') {
            comparison = (a.dhcp_enabled === b.dhcp_enabled ? 0 : a.dhcp_enabled ? -1 : 1);
          } else if (netSortBy === 'status') {
            const connA = isIfaceConnected(a);
            const connB = isIfaceConnected(b);
            comparison = (connA === connB ? 0 : connA ? -1 : 1);
          }
          return netSortDir === 'asc' ? comparison : -comparison;
        });

        const handleNetSort = (field: 'name' | 'mac' | 'ip' | 'gateway' | 'dhcp' | 'status') => {
          if (netSortBy === field) {
            setNetSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
          } else {
            setNetSortBy(field);
            setNetSortDir('asc');
          }
        };

        const getNetSortIcon = (field: 'name' | 'mac' | 'ip' | 'gateway' | 'dhcp' | 'status') => {
          if (netSortBy !== field) {
            return <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 opacity-60" />;
          }
          return netSortDir === 'asc' ? (
            <ArrowUp className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <ArrowDown className="w-3.5 h-3.5 text-emerald-400" />
          );
        };

        return (
          <div className="space-y-6">
            {/* Network Overview Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                    <Network className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                      <span>Configuration Réseau & Adaptateurs</span>
                      <span className="font-mono text-xs text-slate-500 font-normal">(ipconfig /all)</span>
                    </h2>
                    <p className="text-xs text-slate-400">
                      Cartes réseau actives et connectées en priorité, adresses IPv4, passerelles et serveurs DNS
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                  <span className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300">
                    IP Principale :{' '}
                    <strong className="text-emerald-400 font-bold">{resolvedPrimaryIp}</strong>
                  </span>
                  <span className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300">
                    Total : <strong className="text-slate-100">{sortedInterfaces.length}</strong>
                  </span>
                  <span className="px-3 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-800/60 text-emerald-300">
                    Connectés : <strong>{connectedCount}</strong>
                  </span>
                </div>
              </div>

              {/* Filters & Search Toolbar */}
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
                {/* Search */}
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={netSearch}
                    onChange={(e) => setNetSearch(e.target.value)}
                    placeholder="Filtrer par nom, IP, MAC ou description..."
                    className="w-full bg-slate-950/90 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                  />
                  {netSearch && (
                    <button
                      onClick={() => setNetSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 text-xs font-medium">
                  <button
                    onClick={() => setNetFilter('all')}
                    className={`px-3 py-1.5 rounded-xl transition border ${
                      netFilter === 'all'
                        ? 'bg-emerald-600 text-white border-emerald-500 font-semibold shadow-sm shadow-emerald-900/30'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    Tous ({sortedInterfaces.length})
                  </button>
                  <button
                    onClick={() => setNetFilter('connected')}
                    className={`px-3 py-1.5 rounded-xl transition border ${
                      netFilter === 'connected'
                        ? 'bg-emerald-600 text-white border-emerald-500 font-semibold shadow-sm shadow-emerald-900/30'
                        : 'bg-slate-950 text-emerald-400 border-slate-800 hover:bg-emerald-950/40 hover:border-emerald-800/40'
                    }`}
                  >
                    Connectés ({connectedCount})
                  </button>
                  <button
                    onClick={() => setNetFilter('physical')}
                    className={`px-3 py-1.5 rounded-xl transition border ${
                      netFilter === 'physical'
                        ? 'bg-emerald-600 text-white border-emerald-500 font-semibold shadow-sm shadow-emerald-900/30'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    Physiques ({physicalCount})
                  </button>
                  <button
                    onClick={() => setNetFilter('disconnected')}
                    className={`px-3 py-1.5 rounded-xl transition border ${
                      netFilter === 'disconnected'
                        ? 'bg-emerald-600 text-white border-emerald-500 font-semibold shadow-sm shadow-emerald-900/30'
                        : 'bg-slate-950 text-slate-500 border-slate-800 hover:bg-slate-800 hover:text-slate-300'
                    }`}
                  >
                    Déconnectés ({disconnectedCount})
                  </button>
                </div>
              </div>
            </div>

            {/* Adapters Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              {sortedNetInterfaces.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-950/80 sticky top-0 backdrop-blur z-10 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      <tr>
                        {/* Tri par Interface */}
                        <th
                          onClick={() => handleNetSort('name')}
                          style={getNetColStyle('name')}
                          className="py-3.5 px-4 cursor-pointer hover:bg-slate-900 transition select-none relative group/th"
                          title="Cliquer pour trier par Interface"
                        >
                          <div className="flex items-center space-x-1.5 pr-2">
                            <span>Interface / Carte réseau</span>
                            {getNetSortIcon('name')}
                          </div>
                          <NetResizeHandle colKey="name" />
                        </th>

                        {/* Tri par MAC */}
                        <th
                          onClick={() => handleNetSort('mac')}
                          style={getNetColStyle('mac')}
                          className="py-3.5 px-4 cursor-pointer hover:bg-slate-900 transition select-none relative group/th"
                          title="Cliquer pour trier par Adresse MAC"
                        >
                          <div className="flex items-center space-x-1.5 pr-2">
                            <span>Adresse MAC (Physique)</span>
                            {getNetSortIcon('mac')}
                          </div>
                          <NetResizeHandle colKey="mac" />
                        </th>

                        {/* Tri par IP */}
                        <th
                          onClick={() => handleNetSort('ip')}
                          style={getNetColStyle('ip')}
                          className="py-3.5 px-4 cursor-pointer hover:bg-slate-900 transition select-none relative group/th"
                          title="Cliquer pour trier par Adresse IP"
                        >
                          <div className="flex items-center space-x-1.5 pr-2">
                            <span>Adresse(s) IPv4 & Masque</span>
                            {getNetSortIcon('ip')}
                          </div>
                          <NetResizeHandle colKey="ip" />
                        </th>

                        <th style={getNetColStyle('gateway')} className="py-3.5 px-4 relative group/th">
                          <span>Passerelle & DNS</span>
                          <NetResizeHandle colKey="gateway" />
                        </th>

                        {/* Tri par DHCP */}
                        <th
                          onClick={() => handleNetSort('dhcp')}
                          style={getNetColStyle('dhcp')}
                          className="py-3.5 px-4 cursor-pointer hover:bg-slate-900 transition select-none relative group/th"
                          title="Cliquer pour trier par DHCP"
                        >
                          <div className="flex items-center space-x-1.5 pr-2">
                            <span>DHCP</span>
                            {getNetSortIcon('dhcp')}
                          </div>
                          <NetResizeHandle colKey="dhcp" />
                        </th>

                        {/* Tri par Statut */}
                        <th
                          onClick={() => handleNetSort('status')}
                          style={getNetColStyle('status')}
                          className="py-3.5 px-4 cursor-pointer hover:bg-slate-900 transition select-none text-right relative group/th"
                          title="Cliquer pour trier par Statut"
                        >
                          <div className="flex items-center justify-end space-x-1.5 pr-2">
                            <span>Statut</span>
                            {getNetSortIcon('status')}
                          </div>
                          <NetResizeHandle colKey="status" />
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-sm">
                      {sortedNetInterfaces.map((iface, idx) => {
                        const isConnected = isIfaceConnected(iface);
                        const isPrimary = primaryConnectedIface?.mac && iface.mac === primaryConnectedIface.mac;

                        const isWifi =
                          iface.name?.toLowerCase().includes('wi-fi') ||
                          iface.name?.toLowerCase().includes('wireless') ||
                          iface.description?.toLowerCase().includes('wi-fi') ||
                          iface.description?.toLowerCase().includes('wireless');

                        const formatNetItem = (val: any): string => {
                          if (!val) return '';
                          if (typeof val === 'string') return val;
                          if (typeof val === 'object') {
                            return val.ip_address || val.ip || val.address || val.server || JSON.stringify(val);
                          }
                          return String(val);
                        };

                        const rawGateways = Array.isArray(iface.default_gateways)
                          ? iface.default_gateways
                          : iface.default_gateways
                          ? [iface.default_gateways]
                          : [];
                        const gateways = rawGateways.map(formatNetItem).filter(Boolean);

                        const rawDns = Array.isArray(iface.dns_servers)
                          ? iface.dns_servers
                          : iface.dns_servers
                          ? [iface.dns_servers]
                          : [];
                        const dnsList = rawDns.map(formatNetItem).filter(Boolean);

                        return (
                          <tr
                            key={idx}
                            className={`transition ${
                              isConnected
                                ? 'bg-slate-900/90 hover:bg-slate-850/80'
                                : 'opacity-65 hover:opacity-100 hover:bg-slate-850/40'
                            }`}
                          >
                            {/* Interface Name & Description */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-start space-x-3">
                                <div
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                                    isConnected
                                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                      : 'bg-slate-800 text-slate-500 border border-slate-700'
                                  }`}
                                >
                                  {isWifi ? <Wifi className="w-4 h-4" /> : <Network className="w-4 h-4" />}
                                </div>
                                <div>
                                  <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                    <span className="font-bold text-slate-100">{iface.name}</span>
                                    {isPrimary && (
                                      <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-md bg-emerald-950/80 text-emerald-300 border border-emerald-700/60">
                                        ★ Principale
                                      </span>
                                    )}
                                    {iface.is_physical !== undefined && (
                                      <span
                                        className={`px-1.5 py-0.2 text-[10px] font-mono rounded-md border ${
                                          iface.is_physical
                                            ? 'bg-slate-950 text-slate-400 border-slate-800'
                                            : 'bg-purple-950/40 text-purple-400 border-purple-800/40'
                                        }`}
                                      >
                                        {iface.is_physical ? 'Physique' : 'Virtuel'}
                                      </span>
                                    )}
                                  </div>
                                  {iface.description && iface.description !== iface.name && (
                                    <p
                                      className="text-xs text-slate-500 mt-0.5 max-w-xs truncate"
                                      title={iface.description}
                                    >
                                      {iface.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* MAC Address */}
                            <td className="py-3.5 px-4">
                              {iface.mac ? (
                                <span className="font-mono text-xs px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-semibold inline-block">
                                  {iface.mac}
                                </span>
                              ) : (
                                <span className="text-slate-600 text-xs">—</span>
                              )}
                            </td>

                            {/* IPv4 & Subnet Mask */}
                            <td className="py-3.5 px-4">
                              {iface.ip_addresses && iface.ip_addresses.length > 0 ? (
                                <div className="space-y-1">
                                  {iface.ip_addresses.map((ip: string, i: number) => (
                                    <div key={i} className="flex flex-col">
                                      <span
                                        className={`font-mono text-xs font-bold px-2 py-0.5 rounded-md inline-block w-fit border ${
                                          isConnected
                                            ? 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40'
                                            : 'text-slate-400 bg-slate-950 border-slate-800'
                                        }`}
                                      >
                                        {ip}
                                      </span>
                                      {iface.subnet_masks && iface.subnet_masks[i] && (
                                        <span className="text-[11px] font-mono text-slate-500 mt-0.5">
                                          Masque : {iface.subnet_masks[i]}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-600 text-xs italic">Non configurée</span>
                              )}
                            </td>

                            {/* Gateway & DNS */}
                            <td className="py-3.5 px-4 text-xs font-mono">
                              <div className="space-y-1">
                                {gateways.length > 0 ? (
                                  <div>
                                    <span className="text-[10px] text-slate-500 block uppercase font-sans">
                                      Passerelle :
                                    </span>
                                    <span className="text-slate-300 font-semibold">{gateways.join(', ')}</span>
                                  </div>
                                ) : null}
                                {dnsList.length > 0 ? (
                                  <div>
                                    <span className="text-[10px] text-slate-500 block uppercase font-sans">
                                      DNS :
                                    </span>
                                    <span className="text-slate-400">{dnsList.join(', ')}</span>
                                  </div>
                                ) : null}
                                {gateways.length === 0 && dnsList.length === 0 && (
                                  <span className="text-slate-600">—</span>
                                )}
                              </div>
                            </td>

                            {/* DHCP */}
                            <td className="py-3.5 px-4">
                              {iface.dhcp_enabled !== undefined ? (
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                                    iface.dhcp_enabled
                                      ? 'bg-blue-950/60 text-blue-300 border-blue-800/50'
                                      : 'bg-slate-950 text-slate-400 border-slate-800'
                                  }`}
                                >
                                  {iface.dhcp_enabled ? 'DHCP' : 'Statique'}
                                </span>
                              ) : (
                                <span className="text-slate-600 text-xs">—</span>
                              )}
                            </td>

                            {/* Status */}
                            <td className="py-3.5 px-4 text-right">
                              {isConnected ? (
                                <span className="inline-flex items-center space-x-1.5 font-semibold text-xs px-2.5 py-1 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                  <span>Connecté</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center space-x-1.5 font-medium text-xs px-2.5 py-1 rounded-full bg-slate-950 text-slate-500 border border-slate-800">
                                  <XCircle className="w-3.5 h-3.5 text-slate-600" />
                                  <span>Déconnecté</span>
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-12 text-center text-slate-500">
                  <Network className="w-10 h-10 mx-auto mb-2 text-slate-700 stroke-1" />
                  <p className="text-sm font-semibold text-slate-400">
                    {netSearch.trim() || netFilter !== 'all'
                      ? 'Aucune interface ne correspond à ce filtre.'
                      : 'Aucune interface réseau remontée par l’agent.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Tab 3: General Info & Local/Domain Users (NEW!) */}
      {activeTab === 'general' && (() => {
        const rawUserList = inventory?.local_users || [];
        let userList = [...rawUserList];

        // Garantir que l'utilisateur ACTUELLEMENT CONNECTÉ est TOUJOURS dans la liste et marqué connecté
        if (inventory?.current_user && inventory.current_user.trim()) {
          const curFull = inventory.current_user.trim();
          let curDom = '';
          let curName = curFull;
          if (curFull.includes('\\')) {
            const parts = curFull.split('\\');
            curDom = parts[0];
            curName = parts[1];
          }
          const isDom = Boolean(
            curDom &&
            curDom.toUpperCase() !== (device.hostname || '').toUpperCase() &&
            curDom.toUpperCase() !== 'BUILTIN' &&
            curDom.toUpperCase() !== 'NT AUTHORITY' &&
            curDom.toUpperCase() !== 'AUTORITE NT'
          );
          const existingIdx = userList.findIndex(
            (u) =>
              (u.name && u.name.toLowerCase() === curName.toLowerCase()) ||
              (u.full_name && u.full_name.toLowerCase() === curFull.toLowerCase())
          );
          if (existingIdx === -1) {
            userList.unshift({
              name: curName,
              domain: curDom || (isDom ? 'Domaine' : device.hostname),
              account_type: isDom ? 'Domaine' : 'Local',
              full_name: curFull,
              description: 'Session utilisateur active actuellement ouverte',
              enabled: true,
              privilege: 'Utilisateur standard',
              is_admin: false,
              is_logged_in: true,
              last_logon: new Date().toISOString(),
            });
          } else {
            userList[existingIdx] = {
              ...userList[existingIdx],
              is_logged_in: true,
              account_type: isDom ? 'Domaine' : userList[existingIdx].account_type || 'Local',
              domain: curDom || userList[existingIdx].domain,
            };
          }
        }

        const totalUsers = userList.length;
        const domainUsersCount = userList.filter((u) => u.account_type?.toLowerCase() === 'domaine' || (u.domain && u.domain !== device.hostname)).length;
        const localUsersCount = totalUsers - domainUsersCount;
        const loggedInUsersCount = userList.filter((u) => u.is_logged_in).length;
        const activeUsersCount = userList.filter((u) => u.enabled).length;
        const adminUsersCount = userList.filter((u) => u.is_admin).length;

        const filteredUsers = userList.filter((u) => {
          const matchSearch =
            !userSearch.trim() ||
            u.name?.toLowerCase().includes(userSearch.toLowerCase()) ||
            u.domain?.toLowerCase().includes(userSearch.toLowerCase()) ||
            u.full_name?.toLowerCase().includes(userSearch.toLowerCase()) ||
            u.description?.toLowerCase().includes(userSearch.toLowerCase());
          if (!matchSearch) return false;
          if (userFilterRole === 'domain') return u.account_type?.toLowerCase() === 'domaine' || (u.domain && u.domain !== device.hostname);
          if (userFilterRole === 'local') return u.account_type?.toLowerCase() !== 'domaine' && (!u.domain || u.domain === device.hostname);
          if (userFilterRole === 'connected') return u.is_logged_in;
          if (userFilterRole === 'active') return u.enabled;
          if (userFilterRole === 'admin') return u.is_admin;
          if (userFilterRole === 'standard') return !u.is_admin;
          return true;
        });

        const currentUsername = inventory?.current_user ? inventory.current_user.split('\\').pop() : '';

        const sortedUsersList = [...filteredUsers].sort((a, b) => {
          let comparison = 0;
          if (userAccountsSortBy === 'name') {
            comparison = (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
          } else if (userAccountsSortBy === 'account_type') {
            comparison = (a.account_type || '').localeCompare(b.account_type || '');
          } else if (userAccountsSortBy === 'full_name') {
            const descA = a.full_name || a.description || '';
            const descB = b.full_name || b.description || '';
            comparison = descA.localeCompare(descB, undefined, { sensitivity: 'base' });
          } else if (userAccountsSortBy === 'session') {
            const isConnA = Boolean(a.is_logged_in || (currentUsername && a.name?.toLowerCase() === currentUsername.toLowerCase()));
            const isConnB = Boolean(b.is_logged_in || (currentUsername && b.name?.toLowerCase() === currentUsername.toLowerCase()));
            comparison = (isConnA === isConnB ? 0 : isConnA ? -1 : 1);
          } else if (userAccountsSortBy === 'is_admin') {
            comparison = (a.is_admin === b.is_admin ? 0 : a.is_admin ? -1 : 1);
          } else if (userAccountsSortBy === 'last_login') {
            const timeA = a.last_logon ? new Date(a.last_logon).getTime() : 0;
            const timeB = b.last_logon ? new Date(b.last_logon).getTime() : 0;
            comparison = timeA - timeB;
          }
          return userAccountsSortDir === 'asc' ? comparison : -comparison;
        });

        const handleUserAccountsSort = (field: 'name' | 'account_type' | 'full_name' | 'session' | 'is_admin' | 'last_login') => {
          if (userAccountsSortBy === field) {
            setUserAccountsSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
          } else {
            setUserAccountsSortBy(field);
            setUserAccountsSortDir('asc');
          }
        };

        const getUserAccountsSortIcon = (field: 'name' | 'account_type' | 'full_name' | 'session' | 'is_admin' | 'last_login') => {
          if (userAccountsSortBy !== field) {
            return <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 opacity-60" />;
          }
          return userAccountsSortDir === 'asc' ? (
            <ArrowUp className="w-3.5 h-3.5 text-teal-400" />
          ) : (
            <ArrowDown className="w-3.5 h-3.5 text-teal-400" />
          );
        };

        return (
          <div className="space-y-6">
            {/* System Details */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-base font-bold text-slate-100 mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>Détails Système & Enrôlement</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 text-sm">
                <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800">
                  <span className="text-slate-500 text-xs block mb-1">Version de l'Agent</span>
                  <span className="font-mono font-semibold text-slate-200">v{device.agent_version || '1.0.0'}</span>
                </div>
                <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800">
                  <span className="text-slate-500 text-xs block mb-1">Système d'Exploitation</span>
                  <span className="font-semibold text-slate-200">
                    {device.os_name} {device.os_version}
                  </span>
                </div>
                <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800">
                  <span className="text-slate-500 text-xs block mb-1">Date d'Enrôlement Initial</span>
                  <span className="font-semibold text-slate-200">{new Date(device.created_at).toLocaleString()}</span>
                </div>
                <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800">
                  <span className="text-slate-500 text-xs block mb-1">Dernière Activité (Heartbeat)</span>
                  <span className="font-semibold text-slate-200">
                    {device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : 'Jamais'}
                  </span>
                </div>
                <div className={`p-3.5 rounded-xl border transition ${
                  inventory?.current_user
                    ? 'bg-emerald-950/30 border-emerald-800/60'
                    : 'bg-slate-950 border-slate-800'
                }`}>
                  <span className="text-slate-500 text-xs block mb-1">Utilisateur Connecté</span>
                  <div className="flex items-center space-x-2">
                    {inventory?.current_user ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
                        <span className="font-semibold text-emerald-300 truncate" title={inventory.current_user}>
                          {inventory.current_user}
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-500 italic text-xs">Aucune session active</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Users Table (Local & Domain Users) */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                      <span>Comptes Utilisateurs du Poste & Domaine</span>
                      <span className="font-mono text-xs text-slate-500 font-normal">(SAM & Active Directory)</span>
                    </h2>
                    <p className="text-xs text-slate-400">
                      Détection des comptes locaux, des profils de domaine connectés et état des sessions en temps réel
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                  <span className="px-3 py-1 rounded-xl bg-slate-950 border border-slate-800 text-slate-300">
                    Total : <strong className="text-slate-100">{totalUsers}</strong>
                  </span>
                  {domainUsersCount > 0 && (
                    <span className="px-3 py-1 rounded-xl bg-purple-950/60 border border-purple-800/60 text-purple-300">
                      Domaine : <strong>{domainUsersCount}</strong>
                    </span>
                  )}
                  {loggedInUsersCount > 0 && (
                    <span className="px-3 py-1 rounded-xl bg-emerald-950/80 border border-emerald-800/80 text-emerald-300 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      Connecté(s) : <strong>{loggedInUsersCount}</strong>
                    </span>
                  )}
                  <span className="px-3 py-1 rounded-xl bg-rose-950/60 border border-rose-800/60 text-rose-300">
                    Admins : <strong>{adminUsersCount}</strong>
                  </span>
                  <button
                    onClick={() => {
                      setCreateUsername('');
                      setCreatePassword('');
                      setCreateFullName('');
                      setCreateIsAdmin(false);
                      setCreatePasswordNeverExpires(true);
                      setActiveModal('create_user');
                    }}
                    className="flex items-center space-x-1.5 px-3 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-semibold transition shadow-sm ml-auto"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Créer un compte local</span>
                  </button>
                </div>
              </div>

              {/* User search & filter */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Filtrer par identifiant, nom, domaine (ex: ECOLE\prof)..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="w-full pl-10 pr-10 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                  />
                  {userSearch && (
                    <button
                      onClick={() => setUserSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold">
                  <button
                    onClick={() => setUserFilterRole('all')}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      userFilterRole === 'all'
                        ? 'bg-slate-800 text-slate-100 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Tous ({totalUsers})
                  </button>
                  {domainUsersCount > 0 && (
                    <button
                      onClick={() => setUserFilterRole('domain')}
                      className={`px-3 py-1.5 rounded-lg transition ${
                        userFilterRole === 'domain'
                          ? 'bg-purple-950 text-purple-300 border border-purple-800/60'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Domaine ({domainUsersCount})
                    </button>
                  )}
                  <button
                    onClick={() => setUserFilterRole('local')}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      userFilterRole === 'local'
                        ? 'bg-teal-950 text-teal-300 border border-teal-800/60'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Locaux ({localUsersCount})
                  </button>
                  {loggedInUsersCount > 0 && (
                    <button
                      onClick={() => setUserFilterRole('connected')}
                      className={`px-3 py-1.5 rounded-lg transition ${
                        userFilterRole === 'connected'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Connectés ({loggedInUsersCount})
                    </button>
                  )}
                  <button
                    onClick={() => setUserFilterRole('admin')}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      userFilterRole === 'admin'
                        ? 'bg-rose-950 text-rose-300 border border-rose-800/60'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Admins ({adminUsersCount})
                  </button>
                  <button
                    onClick={() => setUserFilterRole('standard')}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      userFilterRole === 'standard'
                        ? 'bg-blue-950 text-blue-300 border border-blue-800/60'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Standards ({totalUsers - adminUsersCount})
                  </button>
                </div>
              </div>

              {/* Users Table */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden mt-4">
                {sortedUsersList.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-900/90 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        <tr>
                          {/* Tri par Compte Utilisateur */}
                          <th
                            onClick={() => handleUserAccountsSort('name')}
                            style={getUsersColStyle('name')}
                            className="py-3 px-4 cursor-pointer hover:bg-slate-850 transition select-none relative group/th"
                            title="Cliquer pour trier par Compte Utilisateur"
                          >
                            <div className="flex items-center space-x-1.5 pr-2">
                              <span>Compte Utilisateur</span>
                              {getUserAccountsSortIcon('name')}
                            </div>
                            <UsersResizeHandle colKey="name" />
                          </th>

                          {/* Tri par Origine / Type */}
                          <th
                            onClick={() => handleUserAccountsSort('account_type')}
                            style={getUsersColStyle('account_type')}
                            className="py-3 px-4 cursor-pointer hover:bg-slate-850 transition select-none relative group/th"
                            title="Cliquer pour trier par Origine / Type"
                          >
                            <div className="flex items-center space-x-1.5 pr-2">
                              <span>Origine / Type</span>
                              {getUserAccountsSortIcon('account_type')}
                            </div>
                            <UsersResizeHandle colKey="account_type" />
                          </th>

                          {/* Tri par Nom complet & Description */}
                          <th
                            onClick={() => handleUserAccountsSort('full_name')}
                            style={getUsersColStyle('full_name')}
                            className="py-3 px-4 cursor-pointer hover:bg-slate-850 transition select-none relative group/th"
                            title="Cliquer pour trier par Nom complet & Description"
                          >
                            <div className="flex items-center space-x-1.5 pr-2">
                              <span>Nom complet & Description</span>
                              {getUserAccountsSortIcon('full_name')}
                            </div>
                            <UsersResizeHandle colKey="full_name" />
                          </th>

                          {/* Tri par Statut de Session */}
                          <th
                            onClick={() => handleUserAccountsSort('session')}
                            style={getUsersColStyle('session')}
                            className="py-3 px-4 cursor-pointer hover:bg-slate-850 transition select-none relative group/th"
                            title="Cliquer pour trier par Statut de Session"
                          >
                            <div className="flex items-center space-x-1.5 pr-2">
                              <span>Statut de Session</span>
                              {getUserAccountsSortIcon('session')}
                            </div>
                            <UsersResizeHandle colKey="session" />
                          </th>

                          {/* Tri par Niveau de Privilège */}
                          <th
                            onClick={() => handleUserAccountsSort('is_admin')}
                            style={getUsersColStyle('is_admin')}
                            className="py-3 px-4 cursor-pointer hover:bg-slate-850 transition select-none relative group/th"
                            title="Cliquer pour trier par Niveau de Privilège"
                          >
                            <div className="flex items-center space-x-1.5 pr-2">
                              <span>Niveau de Privilège</span>
                              {getUserAccountsSortIcon('is_admin')}
                            </div>
                            <UsersResizeHandle colKey="is_admin" />
                          </th>

                          {/* Tri par Dernière connexion */}
                          <th
                            onClick={() => handleUserAccountsSort('last_login')}
                            style={getUsersColStyle('last_login')}
                            className="py-3 px-4 cursor-pointer hover:bg-slate-850 transition select-none relative group/th"
                            title="Cliquer pour trier par Dernière connexion"
                          >
                            <div className="flex items-center space-x-1.5 pr-2">
                              <span>Dernière connexion</span>
                              {getUserAccountsSortIcon('last_login')}
                            </div>
                            <UsersResizeHandle colKey="last_login" />
                          </th>

                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-sm">
                        {sortedUsersList.map((u, idx) => {
                          const isDomain = u.account_type?.toLowerCase() === 'domaine' || (u.domain && u.domain.toLowerCase() !== device.hostname?.toLowerCase());
                          const isConnected = Boolean(
                            u.is_logged_in ||
                            (currentUsername && u.name?.toLowerCase() === currentUsername.toLowerCase())
                          );

                          return (
                            <tr key={idx} className={`hover:bg-slate-900/50 transition ${isConnected ? 'bg-emerald-950/20' : ''}`}>
                              {/* User name & session badge */}
                              <td className="py-3.5 px-4">
                                <div className="flex items-center space-x-3">
                                  <div
                                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                                      isConnected
                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                        : isDomain
                                        ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                        : u.is_admin
                                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                        : 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                                    }`}
                                  >
                                    <User className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <div className="flex items-center space-x-2">
                                      <span className="font-bold text-slate-100">{u.name}</span>
                                      {isConnected && (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                          Connecté
                                        </span>
                                      )}
                                    </div>
                                    {u.domain && (
                                      <span className="text-[11px] font-mono text-slate-500">
                                        {u.domain}\{u.name}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* Account Type (Domaine vs Local) */}
                              <td className="py-3.5 px-4">
                                <span
                                  className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                                    isDomain
                                      ? 'bg-purple-950/60 text-purple-300 border-purple-800/60'
                                      : 'bg-slate-900 text-slate-300 border-slate-800'
                                  }`}
                                >
                                  {isDomain ? '🌐 Domaine' : '💻 Local'}
                                </span>
                              </td>

                              {/* Description & Full Name */}
                              <td className="py-3.5 px-4 text-xs text-slate-400">
                                {u.full_name || u.description ? (
                                  <div>
                                    {u.full_name && <div className="text-slate-200 font-medium">{u.full_name}</div>}
                                    {u.description && <div className="text-slate-500">{u.description}</div>}
                                  </div>
                                ) : (
                                  <span className="text-slate-600">—</span>
                                )}
                              </td>

                              {/* Session Status */}
                              <td className="py-3.5 px-4">
                                {isConnected ? (
                                  <span className="inline-flex items-center space-x-1.5 font-semibold text-xs px-2.5 py-1 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                    <span>Session active</span>
                                  </span>
                                ) : u.enabled !== false ? (
                                  <span className="inline-flex items-center space-x-1.5 font-semibold text-xs px-2.5 py-1 rounded-full bg-slate-900 text-slate-400 border border-slate-800">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
                                    <span>Inactif (Déconnecté)</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center space-x-1.5 font-semibold text-xs px-2.5 py-1 rounded-full bg-slate-900 text-slate-500 border border-slate-800">
                                    <XCircle className="w-3.5 h-3.5" />
                                    <span>Désactivé</span>
                                  </span>
                                )}
                              </td>

                              {/* Privilege Level */}
                              <td className="py-3.5 px-4">
                                {u.is_admin ? (
                                  <span className="inline-flex items-center space-x-1.5 font-semibold text-xs px-2.5 py-1 rounded-full bg-rose-950/80 text-rose-300 border border-rose-800/60">
                                    <ShieldAlert className="w-3.5 h-3.5" />
                                    <span>Administrateur</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center space-x-1.5 font-semibold text-xs px-2.5 py-1 rounded-full bg-blue-950/80 text-blue-300 border border-blue-800/60">
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                    <span>Utilisateur standard</span>
                                  </span>
                                )}
                              </td>

                              {/* Last Logon */}
                              <td className="py-3.5 px-4 font-mono text-xs text-slate-400">
                                {u.last_logon ? (
                                  new Date(u.last_logon).toLocaleString()
                                ) : (
                                  <span className="text-slate-600">Jamais / Non enregistrée</span>
                                )}
                              </td>

                              {/* Actions: Delete Profile / Account */}
                              <td className="py-3.5 px-4 text-right">
                                <button
                                  onClick={() => {
                                    setDeleteUsername(u.name);
                                    setDeleteProfileFiles(true);
                                    setDeleteLocalAccount(!isDomain);
                                    setDeleteForceLogoff(isConnected);
                                    setActiveModal('delete_user');
                                  }}
                                  className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition inline-flex items-center gap-1.5 text-xs font-semibold"
                                  title={`Supprimer le profil Windows ou le compte local de ${u.name}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Supprimer</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-12 text-center text-slate-500">
                    <Users className="w-10 h-10 mx-auto mb-2 text-slate-700 stroke-1" />
                    <p className="text-sm font-medium text-slate-400">
                      {totalUsers === 0
                        ? "Aucun compte utilisateur n'a encore été rapporté par l'agent."
                        : 'Aucun utilisateur ne correspond à ce filtre.'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Tab 4: Actions & Quick Management (NEW!) */}
      {activeTab === 'actions' && (
        <div className="space-y-6">
          {/* Quick Action Tiles */}
          <div>
            <h2 className="text-base font-bold text-slate-100 mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span>Actions Rapides d'Administration</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Card 1: Redémarrer */}
              <div
                onClick={() => setActiveModal('restart')}
                className="group bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-amber-500/50 rounded-2xl p-5 cursor-pointer transition shadow-sm hover:shadow-lg hover:shadow-amber-950/20"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center group-hover:scale-110 transition">
                    <RotateCw className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-500 group-hover:text-amber-400 transition flex items-center gap-1">
                    Lancer <Play className="w-3 h-3 fill-current" />
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-100 mb-1">Redémarrer la machine</h3>
                <p className="text-xs text-slate-400">
                  Déclenche un redémarrage système contrôlé avec délai et message d'avertissement.
                </p>
              </div>

              {/* Card 2: Arrêter */}
              <div
                onClick={() => setActiveModal('shutdown')}
                className="group bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-rose-500/50 rounded-2xl p-5 cursor-pointer transition shadow-sm hover:shadow-lg hover:shadow-rose-950/20"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center group-hover:scale-110 transition">
                    <Power className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-500 group-hover:text-rose-400 transition flex items-center gap-1">
                    Lancer <Play className="w-3 h-3 fill-current" />
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-100 mb-1">Arrêter la machine</h3>
                <p className="text-xs text-slate-400">
                  Éteint le poste à distance avec fermeture des applications en cours.
                </p>
              </div>

              {/* Card 3: Renommer */}
              <div
                onClick={() => {
                  setNewName(device.hostname);
                  setActiveModal('rename');
                }}
                className="group bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-blue-500/50 rounded-2xl p-5 cursor-pointer transition shadow-sm hover:shadow-lg hover:shadow-blue-950/20"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center group-hover:scale-110 transition">
                    <Tag className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-500 group-hover:text-blue-400 transition flex items-center gap-1">
                    Configurer <Play className="w-3 h-3 fill-current" />
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-100 mb-1">Renommer (WINS / NetBIOS)</h3>
                <p className="text-xs text-slate-400">
                  Modifie le nom d'hôte Windows de la machine et applique le changement NetBIOS.
                </p>
              </div>

              {/* Card 4: Message msg.exe */}
              <div
                onClick={() => setActiveModal('message')}
                className="group bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-5 cursor-pointer transition shadow-sm hover:shadow-lg hover:shadow-emerald-950/20"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-500 group-hover:text-emerald-400 transition flex items-center gap-1">
                    Envoyer <Send className="w-3 h-3" />
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-100 mb-1">Envoyer un Message (Net Send)</h3>
                <p className="text-xs text-slate-400">
                  Affiche une alerte instantanée à l'utilisateur de la session Windows active via msg.exe.
                </p>
              </div>

              {/* Card 5: Script instantané */}
              <div
                onClick={() => {
                  if (scripts.length > 0 && !selectedScriptId) {
                    setSelectedScriptId(scripts[0].id);
                  }
                  setActiveModal('script');
                }}
                className="group bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-purple-500/50 rounded-2xl p-5 cursor-pointer transition shadow-sm hover:shadow-lg hover:shadow-purple-950/20"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center group-hover:scale-110 transition">
                    <Terminal className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-500 group-hover:text-purple-400 transition flex items-center gap-1">
                    Exécuter <Play className="w-3 h-3 fill-current" />
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-100 mb-1">Exécuter un Script (PS / Python)</h3>
                <p className="text-xs text-slate-400">
                  Lance immédiatement un script de la bibliothèque ou un code PowerShell personnalisé.
                </p>
              </div>

              {/* Card 6: Package MSI/EXE */}
              <div
                onClick={() => {
                  if (packages.length > 0 && !selectedPackageId) {
                    setSelectedPackageId(packages[0].id);
                  }
                  setActiveModal('package');
                }}
                className="group bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-teal-500/50 rounded-2xl p-5 cursor-pointer transition shadow-sm hover:shadow-lg hover:shadow-teal-950/20"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center group-hover:scale-110 transition">
                    <PackageIcon className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-500 group-hover:text-teal-400 transition flex items-center gap-1">
                    Déployer <Play className="w-3 h-3 fill-current" />
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-100 mb-1">Déployer un Package MSI/EXE</h3>
                <p className="text-xs text-slate-400">
                  Installe un logiciel du catalogue d'applications sur ce poste en mode silencieux.
                </p>
              </div>

              {/* Card 7: Connecter un utilisateur (Domaine / Local) */}
              <div
                onClick={() => {
                  const detectedDomain = getDetectedAdDomain(inventory?.current_user, device.hostname);
                  if (detectedDomain) {
                    setLogonDomain(detectedDomain);
                    setLogonAccountType('domain');
                  } else {
                    if (logonDomain === 'WORKGROUP' || logonDomain === 'WORKGÉROUP' || logonDomain === 'AUTORITE NT' || logonDomain === 'NT AUTHORITY') {
                      setLogonDomain('');
                    }
                    if (!logonDomain) {
                      setLogonAccountType('local');
                    }
                  }
                  setActiveModal('logon');
                }}
                className="group bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-cyan-500/50 rounded-2xl p-5 cursor-pointer transition shadow-sm hover:shadow-lg hover:shadow-cyan-950/20"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center group-hover:scale-110 transition">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-500 group-hover:text-cyan-400 transition flex items-center gap-1">
                    Connecter <Play className="w-3 h-3 fill-current" />
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-100 mb-1">Connecter un utilisateur</h3>
                <p className="text-xs text-slate-400">
                  Ouvre à distance une session utilisateur (compte local ou domaine Active Directory).
                </p>
              </div>

              {/* Card 8: Créer un utilisateur local */}
              <div
                onClick={() => {
                  setCreateUsername('');
                  setCreatePassword('');
                  setCreateFullName('');
                  setCreateIsAdmin(false);
                  setCreatePasswordNeverExpires(true);
                  setActiveModal('create_user');
                }}
                className="group bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-5 cursor-pointer transition shadow-sm hover:shadow-lg hover:shadow-emerald-950/20"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-500 group-hover:text-emerald-400 transition flex items-center gap-1">
                    Créer <Play className="w-3 h-3 fill-current" />
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-100 mb-1">Créer un Utilisateur Local</h3>
                <p className="text-xs text-slate-400">
                  Crée un compte Windows local avec privilèges standards ou Administrateur et mot de passe personnalisé.
                </p>
              </div>

              {/* Card 9: Supprimer un Profil / Compte */}
              <div
                onClick={() => {
                  setDeleteUsername('');
                  setDeleteProfileFiles(true);
                  setDeleteLocalAccount(true);
                  setDeleteForceLogoff(true);
                  setActiveModal('delete_user');
                }}
                className="group bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-rose-500/50 rounded-2xl p-5 cursor-pointer transition shadow-sm hover:shadow-lg hover:shadow-rose-950/20"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center group-hover:scale-110 transition">
                    <UserX className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-500 group-hover:text-rose-400 transition flex items-center gap-1">
                    Supprimer <Play className="w-3 h-3 fill-current" />
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-100 mb-1">Supprimer un Profil Local</h3>
                <p className="text-xs text-slate-400">
                  Purge le profil Windows (fichiers C:\Users\..., ruche WMI) et supprime le compte utilisateur local.
                </p>
              </div>
            </div>
          </div>

          {/* Action History Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-bold text-slate-200">Historique des Actions sur cette Machine</h3>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                  {actions.length}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowClearActionsModal(true)}
                  disabled={actions.length === 0 || clearActionsMutation.isPending}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/50 hover:border-rose-600 text-xs font-semibold transition disabled:opacity-40"
                  title="Nettoyer / Purger l'historique des actions de cette machine"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Nettoyer l'historique</span>
                </button>
                <button
                  onClick={() => refetchActions()}
                  className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition"
                  title="Actualiser l'historique"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-950/90 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th style={getActionsColStyle('created_at')} className="px-5 py-3.5 relative group/th">
                      <span>Horodatage</span>
                      <ActionsResizeHandle colKey="created_at" />
                    </th>
                    <th style={getActionsColStyle('deployment_name')} className="px-5 py-3.5 relative group/th">
                      <span>Action / Déploiement</span>
                      <ActionsResizeHandle colKey="deployment_name" />
                    </th>
                    <th style={getActionsColStyle('deployment_type')} className="px-5 py-3.5 relative group/th">
                      <span>Type</span>
                      <ActionsResizeHandle colKey="deployment_type" />
                    </th>
                    <th style={getActionsColStyle('status')} className="px-5 py-3.5 relative group/th">
                      <span>Statut</span>
                      <ActionsResizeHandle colKey="status" />
                    </th>
                    <th style={getActionsColStyle('exit_code')} className="px-5 py-3.5 relative group/th">
                      <span>Code retour</span>
                      <ActionsResizeHandle colKey="exit_code" />
                    </th>
                    <th style={getActionsColStyle('actions')} className="px-4 py-3.5 text-right relative group/th">
                      <span>Actions</span>
                      <ActionsResizeHandle colKey="actions" />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {actions.map((act) => (
                    <tr key={act.id} className="hover:bg-slate-850/50 transition">
                      <td className="px-5 py-3.5 text-xs font-mono text-slate-400 whitespace-nowrap">
                        {new Date(act.created_at).toLocaleString('fr-FR', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-200 text-xs">{act.deployment_name}</div>
                        {act.custom_command && (
                          <div className="font-mono text-[10px] text-slate-500 truncate max-w-xs" title={act.custom_command}>
                            {act.custom_command}
                          </div>
                        )}
                        {act.error_message && (
                          <div className="text-[11px] text-rose-400 mt-0.5 truncate max-w-xs" title={act.error_message}>
                            {act.error_message}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-xs">
                        <span
                          className={`font-mono text-[11px] uppercase px-2 py-0.5 rounded border ${
                            act.deployment_type === 'wol'
                              ? 'bg-amber-950/80 border-amber-700/60 text-amber-300 font-bold'
                              : 'bg-slate-950 border-slate-800 text-slate-300'
                          }`}
                        >
                          {act.deployment_type === 'wol' ? '⚡ WOL' : act.deployment_type}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">{getStatusBadge(act.status)}</td>
                      <td className="px-5 py-3.5 text-xs font-mono">
                        {act.exit_code !== null && act.exit_code !== undefined ? (
                          <span
                            className={`px-2 py-0.5 rounded font-bold ${
                              act.exit_code === 0
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                                : 'bg-rose-950 text-rose-400 border border-rose-800/60'
                            }`}
                          >
                            Code {act.exit_code}
                          </span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => setSelectedActionForLogs(act)}
                            className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 border border-slate-700 text-xs font-medium transition"
                            title="Voir les logs d'exécution"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Logs</span>
                          </button>
                          <button
                            onClick={() => setActionToDelete(act)}
                            className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition"
                            title="Supprimer cette action de l'historique"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {actions.length === 0 && !loadingActions && (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-slate-500 text-xs">
                        Aucune action enregistrée pour le moment. Utilisez les boutons ci-dessus pour lancer une action.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Execution Logs (NEW!) */}
      {activeTab === 'logs' && (() => {
        const totalCount = actions.length;
        const succeededCount = actions.filter((a) => a.status.toUpperCase() === 'SUCCEEDED' || a.status === 'succeeded').length;
        const failedCount = actions.filter((a) => a.status.toUpperCase() === 'FAILED' || a.status === 'failed' || a.status === 'timed_out').length;
        const runningCount = actions.filter((a) => a.status.toUpperCase() === 'RUNNING' || a.status === 'running' || a.status === 'acked' || a.status === 'offered').length;

        return (
          <div className="space-y-6">
            {/* Header Stats Banner */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center shrink-0">
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Exécutions</div>
                  <div className="text-xl font-bold font-mono text-slate-100">{totalCount}</div>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">Succès</div>
                  <div className="text-xl font-bold font-mono text-emerald-300">{succeededCount}</div>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center shrink-0">
                  <XCircle className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-rose-400 uppercase tracking-wider">Échecs</div>
                  <div className="text-xl font-bold font-mono text-rose-300">{failedCount}</div>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center shrink-0">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-sky-400 uppercase tracking-wider">En cours / Offerts</div>
                  <div className="text-xl font-bold font-mono text-sky-300">{runningCount}</div>
                </div>
              </div>
            </div>

            {/* Toolbar / Search & Global Actions */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
              {/* Search input & Filter pills */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={logsSearchTerm}
                    onChange={(e) => setLogsSearchTerm(e.target.value)}
                    placeholder="Filtrer par nom, commande, sortie console..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-emerald-500"
                  />
                  {logsSearchTerm && (
                    <button
                      onClick={() => setLogsSearchTerm('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Status selector */}
                <div className="flex items-center space-x-1.5 bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs">
                  <button
                    onClick={() => setLogsStatusFilter('all')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition ${
                      logsStatusFilter === 'all'
                        ? 'bg-slate-800 text-slate-200 font-semibold'
                        : 'text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    Tous ({actions.length})
                  </button>
                  <button
                    onClick={() => setLogsStatusFilter('SUCCEEDED')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition ${
                      logsStatusFilter === 'SUCCEEDED'
                        ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 font-semibold'
                        : 'text-slate-400 hover:text-emerald-400'
                    }`}
                  >
                    Succès ({succeededCount})
                  </button>
                  <button
                    onClick={() => setLogsStatusFilter('FAILED')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition ${
                      logsStatusFilter === 'FAILED'
                        ? 'bg-rose-950/80 text-rose-300 border border-rose-800/60 font-semibold'
                        : 'text-slate-400 hover:text-rose-400'
                    }`}
                  >
                    Échecs ({failedCount})
                  </button>
                  {runningCount > 0 && (
                    <button
                      onClick={() => setLogsStatusFilter('RUNNING')}
                      className={`px-2.5 py-1 rounded-lg font-medium transition ${
                        logsStatusFilter === 'RUNNING'
                          ? 'bg-sky-950/80 text-sky-300 border border-sky-800/60 font-semibold'
                          : 'text-slate-400 hover:text-sky-400'
                      }`}
                    >
                      En cours ({runningCount})
                    </button>
                  )}
                </div>
              </div>

              {/* Action Buttons: Expand/Collapse All, Download All, Clear All */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={expandedLogIds.length === actions.length && actions.length > 0 ? collapseAllLogs : expandAllLogs}
                  disabled={actions.length === 0}
                  className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-semibold flex items-center space-x-1.5 transition disabled:opacity-40"
                  title="Tout déplier ou tout replier"
                >
                  <ListOrdered className="w-3.5 h-3.5 text-slate-400" />
                  <span>{expandedLogIds.length === actions.length && actions.length > 0 ? 'Tout replier' : 'Tout déplier'}</span>
                </button>

                <button
                  onClick={() => refetchActions()}
                  className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition"
                  title="Actualiser les logs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingActions ? 'animate-spin text-emerald-400' : ''}`} />
                </button>

                <button
                  onClick={handleExportAllLogs}
                  disabled={actions.length === 0 || isExportingAllLogs}
                  className="px-3 py-1.5 rounded-xl bg-cyan-950/50 hover:bg-cyan-900/60 border border-cyan-800/50 hover:border-cyan-600 text-cyan-300 text-xs font-semibold flex items-center space-x-1.5 transition disabled:opacity-40 shadow-sm"
                  title="Télécharger l'intégralité des logs d'exécution de cette machine sous forme de fichier .txt"
                >
                  {isExportingAllLogs ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  <span>Télécharger tout (.txt)</span>
                </button>

                <button
                  onClick={() => setShowClearActionsModal(true)}
                  disabled={actions.length === 0 || clearActionsMutation.isPending}
                  className="px-3 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/50 hover:border-rose-600 text-xs font-semibold flex items-center space-x-1.5 transition disabled:opacity-40 shadow-sm"
                  title="Purger / Effacer tous les logs et l'historique d'exécution"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Purger les logs</span>
                </button>
              </div>
            </div>

            {/* List of Execution Log Accordions */}
            {filteredExecutionLogs.length > 0 ? (
              <div className="space-y-3">
                {filteredExecutionLogs.map((act) => {
                  const isExpanded = expandedLogIds.includes(act.id);
                  const isSucceeded = act.status.toUpperCase() === 'SUCCEEDED' || act.status === 'succeeded';
                  const isFailed = act.status.toUpperCase() === 'FAILED' || act.status === 'failed' || act.status === 'timed_out';
                  const isRunning = act.status.toUpperCase() === 'RUNNING' || act.status === 'running' || act.status === 'acked' || act.status === 'offered';
                  const logItems = act.logs || [];

                  return (
                    <div
                      key={act.id}
                      className={`bg-slate-900 border rounded-2xl overflow-hidden transition shadow-sm ${
                        isExpanded
                          ? isFailed
                            ? 'border-rose-900/60 bg-slate-900/95 ring-1 ring-rose-500/20'
                            : 'border-emerald-900/60 bg-slate-900/95 ring-1 ring-emerald-500/20'
                          : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {/* Accordion Header Row */}
                      <div
                        onClick={() => toggleExpandLog(act.id)}
                        className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer hover:bg-slate-850/50 transition select-none"
                      >
                        {/* Left Info: Status Badge + Action Title + Timestamp */}
                        <div className="flex items-start md:items-center space-x-3 min-w-0 flex-1">
                          <div className="shrink-0 mt-0.5 md:mt-0">
                            {getStatusBadge(act.status)}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                              <span className="font-bold text-slate-100 text-sm">{act.deployment_name}</span>
                              <span
                                className={`text-[10px] font-mono font-bold uppercase px-1.5 py-0.2 rounded border ${
                                  act.deployment_type === 'wol'
                                    ? 'bg-amber-950/80 border-amber-700/60 text-amber-300'
                                    : act.deployment_type === 'package'
                                    ? 'bg-teal-950/80 border-teal-700/60 text-teal-300'
                                    : act.deployment_type === 'script'
                                    ? 'bg-purple-950/80 border-purple-700/60 text-purple-300'
                                    : 'bg-slate-950 border-slate-800 text-slate-300'
                                }`}
                              >
                                {act.deployment_type === 'wol' ? '⚡ WOL' : act.deployment_type}
                              </span>

                              {act.exit_code !== null && act.exit_code !== undefined && (
                                <span
                                  className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border ${
                                    act.exit_code === 0
                                      ? 'bg-emerald-950/80 border-emerald-700/60 text-emerald-300'
                                      : 'bg-rose-950/80 border-rose-700/60 text-rose-300'
                                  }`}
                                >
                                  Code {act.exit_code}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center space-x-3 text-xs text-slate-400 mt-1">
                              <span className="font-mono text-[11px] text-slate-400 flex items-center space-x-1">
                                <Clock className="w-3 h-3 text-slate-500 inline mr-1" />
                                {new Date(act.created_at).toLocaleString('fr-FR', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })}
                              </span>

                              {act.started_at && act.completed_at && (
                                <span className="text-[11px] text-slate-500 font-mono">
                                  Durée : {Math.max(1, Math.round((new Date(act.completed_at).getTime() - new Date(act.started_at).getTime()) / 1000))}s
                                </span>
                              )}

                              {logItems.length > 0 && (
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-950 text-slate-400 border border-slate-800">
                                  {logItems.length} ligne{logItems.length > 1 ? 's' : ''} de log
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right Quick Action Buttons */}
                        <div className="flex items-center space-x-1.5 shrink-0 self-end md:self-center">
                          {/* Copy Log */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopySingleLog(act);
                            }}
                            className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition"
                            title="Copier le contenu des logs dans le presse-papiers"
                          >
                            {copiedLogId === act.id ? (
                              <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* Download Single Log .txt */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadSingleLog(act);
                            }}
                            className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-cyan-400 hover:text-cyan-300 transition"
                            title="Télécharger ce log d'exécution (.txt)"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete Single Action */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionToDelete(act);
                            }}
                            className="p-1.5 rounded-lg bg-slate-950 hover:bg-rose-950/50 border border-slate-800 hover:border-rose-800/60 text-slate-500 hover:text-rose-400 transition"
                            title="Supprimer ce log d'exécution"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Expand/Collapse Chevron */}
                          <div className="p-1.5 text-slate-500 hover:text-slate-300">
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </div>
                        </div>
                      </div>

                      {/* Accordion Expanded Content: Terminal Viewer & Details */}
                      {isExpanded && (
                        <div className="border-t border-slate-800/80 bg-slate-950/70 p-4 space-y-3">
                          {/* Metadata row */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs bg-slate-900/90 p-3 rounded-xl border border-slate-800">
                            <div>
                              <span className="text-slate-500 block text-[10px] uppercase font-bold">Horodatage Début</span>
                              <span className="font-mono text-slate-200">
                                {act.started_at ? new Date(act.started_at).toLocaleString('fr-FR') : 'Non démarré'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[10px] uppercase font-bold">Horodatage Fin</span>
                              <span className="font-mono text-slate-200">
                                {act.completed_at ? new Date(act.completed_at).toLocaleString('fr-FR') : 'En cours...'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[10px] uppercase font-bold">Code Retour Agent</span>
                              <span className="font-mono text-slate-200">
                                {act.exit_code !== null && act.exit_code !== undefined ? `Code ${act.exit_code}` : 'N/A'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[10px] uppercase font-bold">Identifiant Cible</span>
                              <span className="font-mono text-slate-400 text-[11px] truncate block" title={act.id}>
                                {act.id}
                              </span>
                            </div>
                          </div>

                          {act.custom_command && (
                            <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800 text-xs">
                              <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Commande exécutée :</span>
                              <pre className="font-mono text-[11px] text-slate-300 whitespace-pre-wrap break-all bg-slate-950 p-2 rounded-lg border border-slate-850 max-h-24 overflow-y-auto">
                                {act.custom_command}
                              </pre>
                            </div>
                          )}

                          {act.error_message && (
                            <div className="bg-rose-950/20 border border-rose-900/40 p-3 rounded-xl text-xs text-rose-300 flex items-start space-x-2">
                              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                              <div className="flex-1">
                                <span className="font-bold block text-rose-200">Message d'erreur retourné :</span>
                                <span className="font-mono text-[11px]">{act.error_message}</span>
                              </div>
                            </div>
                          )}

                          {/* Terminal Output */}
                          <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-inner font-mono text-xs">
                            <div className="px-3.5 py-2 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
                              <div className="flex items-center space-x-2 text-slate-400 text-[11px]">
                                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="font-bold text-slate-300">Console Agent — Logs d'exécution</span>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleCopySingleLog(act)}
                                className="text-[10px] text-slate-400 hover:text-slate-200 flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-750 transition"
                              >
                                {copiedLogId === act.id ? (
                                  <>
                                    <CheckCheck className="w-3 h-3 text-emerald-400" />
                                    <span className="text-emerald-400">Copié !</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>Copier console</span>
                                  </>
                                )}
                              </button>
                            </div>

                            <div className="p-3.5 max-h-80 overflow-y-auto space-y-1 text-slate-200">
                              {logItems.length > 0 ? (
                                logItems.map((logLine, lineIdx) => {
                                  const lvl = logLine.level.toUpperCase();
                                  const lvlClass =
                                    lvl === 'ERROR'
                                      ? 'text-rose-400'
                                      : lvl === 'WARNING'
                                      ? 'text-amber-400'
                                      : 'text-cyan-400';

                                  return (
                                    <div key={lineIdx} className="flex items-start space-x-2.5 leading-relaxed hover:bg-slate-900/40 px-1 py-0.5 rounded">
                                      <span className="text-slate-600 select-none text-[10px] whitespace-nowrap">
                                        [{new Date(logLine.timestamp).toLocaleTimeString()}]
                                      </span>
                                      <span className={`font-bold select-none text-[10px] ${lvlClass}`}>
                                        [{lvl}]
                                      </span>
                                      <span className={`whitespace-pre-wrap break-all flex-1 ${lvl === 'ERROR' ? 'text-rose-300' : 'text-slate-200'}`}>
                                        {logLine.message}
                                      </span>
                                    </div>
                                  );
                                })
                              ) : isRunning ? (
                                <div className="flex items-center space-x-2 text-slate-500 py-3 italic">
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                                  <span>Exécution en cours... En attente des flux console de l'agent.</span>
                                </div>
                              ) : (
                                <div className="text-slate-500 italic py-2">
                                  Aucune ligne de sortie console spécifique enregistrée pour cette action.
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Empty state */
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-500 flex items-center justify-center mx-auto">
                  <Terminal className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-200">
                  {logsSearchTerm || logsStatusFilter !== 'all'
                    ? 'Aucun log ne correspond à vos filtres'
                    : 'Aucun log d\'exécution enregistré'}
                </h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  {logsSearchTerm || logsStatusFilter !== 'all'
                    ? 'Essayez de réinitialiser la recherche ou le filtre de statut pour voir tous les logs.'
                    : 'Les résultats et sorties consoles de chaque déploiement, script ou action rapide exécutés sur cette machine apparaîtront ici.'}
                </p>
                {(logsSearchTerm || logsStatusFilter !== 'all') && (
                  <button
                    onClick={() => {
                      setLogsSearchTerm('');
                      setLogsStatusFilter('all');
                    }}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition inline-flex items-center space-x-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Réinitialiser les filtres</span>
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* MODAL 1: RESTART MACHINE                                                  */}
      {/* ========================================================================= */}
      {activeModal === 'restart' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 text-amber-400">
                <div className="p-2.5 bg-amber-950/60 border border-amber-800/50 rounded-xl">
                  <RotateCw className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Redémarrer la machine</h3>
                  <p className="text-xs text-slate-400">{device.hostname}</p>
                </div>
              </div>
              <button onClick={() => setActiveModal(null)} className="text-slate-500 hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRestart} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">Délai avant redémarrage (secondes)</label>
                <div className="grid grid-cols-4 gap-2">
                  {[0, 10, 30, 60].map((sec) => (
                    <button
                      type="button"
                      key={sec}
                      onClick={() => setPowerDelay(sec)}
                      className={`py-2 px-3 rounded-xl border font-mono font-semibold text-center transition ${
                        powerDelay === sec
                          ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      {sec === 0 ? 'Immédiat' : `${sec}s`}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Message d'avertissement affiché à l'utilisateur
                </label>
                <input
                  type="text"
                  value={powerMessage}
                  onChange={(e) => setPowerMessage(e.target.value)}
                  placeholder="Ex: Redémarrage demandé par l'administration..."
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div
                onClick={() => setPowerForce(!powerForce)}
                className="flex items-center space-x-3 p-3 bg-slate-950 rounded-xl border border-slate-800 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={powerForce}
                  onChange={() => {}}
                  className="w-4 h-4 text-amber-500 rounded bg-slate-900 border-slate-700"
                />
                <span className="text-slate-300 font-medium">Forcer la fermeture des applications ouvertes (/f)</span>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={createActionMutation.isPending}
                  className="flex items-center space-x-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-xl shadow-lg shadow-amber-950/50 disabled:opacity-50"
                >
                  {createActionMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Lancer le redémarrage</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: SHUTDOWN MACHINE                                                 */}
      {/* ========================================================================= */}
      {activeModal === 'shutdown' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 text-rose-400">
                <div className="p-2.5 bg-rose-950/60 border border-rose-800/50 rounded-xl">
                  <Power className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Arrêter la machine</h3>
                  <p className="text-xs text-slate-400">{device.hostname}</p>
                </div>
              </div>
              <button onClick={() => setActiveModal(null)} className="text-slate-500 hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleShutdown} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">Délai avant arrêt (secondes)</label>
                <div className="grid grid-cols-4 gap-2">
                  {[0, 10, 30, 60].map((sec) => (
                    <button
                      type="button"
                      key={sec}
                      onClick={() => setPowerDelay(sec)}
                      className={`py-2 px-3 rounded-xl border font-mono font-semibold text-center transition ${
                        powerDelay === sec
                          ? 'bg-rose-500/20 border-rose-500/60 text-rose-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      {sec === 0 ? 'Immédiat' : `${sec}s`}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Message d'avertissement affiché à l'utilisateur
                </label>
                <input
                  type="text"
                  value={powerMessage}
                  onChange={(e) => setPowerMessage(e.target.value)}
                  placeholder="Ex: Arrêt du poste demandé par l'administration..."
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div
                onClick={() => setPowerForce(!powerForce)}
                className="flex items-center space-x-3 p-3 bg-slate-950 rounded-xl border border-slate-800 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={powerForce}
                  onChange={() => {}}
                  className="w-4 h-4 text-rose-500 rounded bg-slate-900 border-slate-700"
                />
                <span className="text-slate-300 font-medium">Forcer l'arrêt immédiat des applications (/f)</span>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={createActionMutation.isPending}
                  className="flex items-center space-x-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-xl shadow-lg shadow-rose-950/50 disabled:opacity-50"
                >
                  {createActionMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Lancer l'arrêt</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: RENAME COMPUTER (WINS / NETBIOS)                                  */}
      {/* ========================================================================= */}
      {activeModal === 'rename' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 text-blue-400">
                <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                  <Tag className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Renommer la machine (WINS / NetBIOS)</h3>
                  <p className="text-xs text-slate-400">Nom actuel : {device.hostname}</p>
                </div>
              </div>
              <button onClick={() => setActiveModal(null)} className="text-slate-500 hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRename} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Nouveau nom d'ordinateur (Max 15 caractères)
                </label>
                <input
                  type="text"
                  maxLength={15}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value.toUpperCase())}
                  placeholder="EXEMPLE: PC-COMPTA-01"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl font-mono text-sm uppercase text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Lettres majuscules, chiffres et tirets uniquement. Standard NetBIOS Windows.
                </span>
              </div>

              <div
                onClick={() => setRenameRestart(!renameRestart)}
                className="flex items-center space-x-3 p-3 bg-slate-950 rounded-xl border border-slate-800 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={renameRestart}
                  onChange={() => {}}
                  className="w-4 h-4 text-blue-500 rounded bg-slate-900 border-slate-700"
                />
                <div>
                  <span className="text-slate-200 font-medium block">
                    Redémarrer la machine immédiatement après le renommage
                  </span>
                  <span className="text-slate-500 text-[11px] block mt-0.5">
                    Recommandé : Windows nécessite un redémarrage pour appliquer le nouveau nom NetBIOS sur le réseau.
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={!newName.trim() || createActionMutation.isPending}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-950/50 disabled:opacity-50"
                >
                  {createActionMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Appliquer le renommage</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: SEND MESSAGE (MSG.EXE / NET SEND)                                */}
      {/* ========================================================================= */}
      {activeModal === 'message' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 text-emerald-400">
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                  <MessageSquare className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Envoyer un Message à l'utilisateur</h3>
                  <p className="text-xs text-slate-400">{device.hostname}</p>
                </div>
              </div>
              <button onClick={() => setActiveModal(null)} className="text-slate-500 hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSendMessage} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1.5">Destinataire</label>
                  <select
                    value={msgTarget}
                    onChange={(e: any) => setMsgTarget(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="*">Toutes les sessions (*)</option>
                    <option value="user">Session active ({inventory?.current_user || 'Utilisateur'})</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1.5">Durée d'affichage (secondes)</label>
                  <select
                    value={msgDuration}
                    onChange={(e: any) => setMsgDuration(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value={30}>30 secondes</option>
                    <option value={60}>1 minute (60s)</option>
                    <option value={120}>2 minutes (120s)</option>
                    <option value={300}>5 minutes (300s)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">Corps du message</label>
                <textarea
                  rows={4}
                  value={msgText}
                  onChange={(e) => setMsgText(e.target.value)}
                  placeholder="Saisissez le message qui s'affichera directement sur l'écran de l'utilisateur..."
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 flex items-start space-x-2 text-slate-400">
                <Info className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <span>
                  Ce message est transmis via la commande native <code className="text-emerald-300">msg.exe</code> et
                  apparaîtra dans une boîte de dialogue contextuelle sur le bureau Windows.
                </span>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={!msgText.trim() || createActionMutation.isPending}
                  className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl shadow-lg shadow-emerald-950/50 disabled:opacity-50"
                >
                  {createActionMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <Send className="w-3.5 h-3.5" />
                  <span>Envoyer instantanément</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: EXECUTE SCRIPT                                                   */}
      {/* ========================================================================= */}
      {activeModal === 'script' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 text-purple-400">
                <div className="p-2.5 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                  <Terminal className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Exécuter un Script</h3>
                  <p className="text-xs text-slate-400">Cible : {device.hostname}</p>
                </div>
              </div>
              <button onClick={() => setActiveModal(null)} className="text-slate-500 hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Script mode selector */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setScriptMode('catalog')}
                className={`flex-1 py-1.5 rounded-lg font-semibold transition ${
                  scriptMode === 'catalog'
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Bibliothèque de Scripts ({scripts.length})
              </button>
              <button
                type="button"
                onClick={() => setScriptMode('adhoc')}
                className={`flex-1 py-1.5 rounded-lg font-semibold transition ${
                  scriptMode === 'adhoc'
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Script Personnalisé (Ad-Hoc)
              </button>
            </div>

            <form onSubmit={handleExecuteScript} className="space-y-4 text-xs">
              {scriptMode === 'catalog' ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1.5">Choisir un script du catalogue</label>
                    <select
                      value={selectedScriptId}
                      onChange={(e) => setSelectedScriptId(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-purple-500"
                    >
                      {scripts.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.language}) - v{s.latest_version?.version || 1}
                        </option>
                      ))}
                    </select>
                  </div>

                  {(() => {
                    const selectedScript = scripts.find((s) => s.id === selectedScriptId);
                    if (!selectedScript) return null;
                    return (
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
                        <div className="flex items-center justify-between text-slate-400">
                          <span className="font-semibold text-slate-200">{selectedScript.name}</span>
                          <span className="font-mono text-purple-400 uppercase">{selectedScript.language}</span>
                        </div>
                        {selectedScript.description && (
                          <p className="text-slate-400 text-[11px]">{selectedScript.description}</p>
                        )}
                        {selectedScript.latest_version && (
                          <pre className="bg-slate-900 p-2.5 rounded-lg text-[11px] font-mono text-emerald-400 max-h-32 overflow-y-auto">
                            {selectedScript.latest_version.content}
                          </pre>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-slate-300 font-semibold mb-1.5">Interpréteur</label>
                      <select
                        value={adhocLanguage}
                        onChange={(e: any) => setAdhocLanguage(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-purple-500"
                      >
                        <option value="powershell">PowerShell (.ps1)</option>
                        <option value="vbscript">VBScript (.vbs)</option>
                        <option value="cmd">Invite de commande CMD / Batch</option>
                        <option value="python">Python</option>
                      </select>
                    </div>

                    <div className="w-32">
                      <label className="block text-slate-300 font-semibold mb-1.5">Timeout (s)</label>
                      <input
                        type="number"
                        min={10}
                        max={3600}
                        value={adhocTimeout}
                        onChange={(e) => setAdhocTimeout(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1.5">Code du script à exécuter</label>
                    <textarea
                      rows={6}
                      value={adhocScriptContent}
                      onChange={(e) => setAdhocScriptContent(e.target.value)}
                      placeholder={
                        adhocLanguage === 'powershell'
                          ? 'Get-Service | Where-Object Status -eq "Running"'
                          : adhocLanguage === 'vbscript'
                          ? 'WScript.Echo "Hello from VBScript"'
                          : 'echo "Hello from MAPT"'
                      }
                      required
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl font-mono text-emerald-400 placeholder-slate-600 focus:outline-none focus:border-purple-500 text-xs"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={createActionMutation.isPending}
                  className="flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl shadow-lg shadow-purple-950/50 disabled:opacity-50"
                >
                  {createActionMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Exécuter maintenant</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: DEPLOY PACKAGE                                                   */}
      {/* ========================================================================= */}
      {activeModal === 'package' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 text-teal-400">
                <div className="p-2.5 bg-teal-500/10 border border-teal-500/20 rounded-xl">
                  <PackageIcon className="w-5 h-5 text-teal-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Déployer un Package MSI/EXE</h3>
                  <p className="text-xs text-slate-400">Cible : {device.hostname}</p>
                </div>
              </div>
              <button onClick={() => setActiveModal(null)} className="text-slate-500 hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDeployPackage} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">Choisir le package à déployer</label>
                <select
                  value={selectedPackageId}
                  onChange={(e) => setSelectedPackageId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-teal-500"
                >
                  {packages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.name} ({pkg.package_type.toUpperCase()}) - v{pkg.latest_version?.version || '1.0'}
                    </option>
                  ))}
                </select>
              </div>

              {(() => {
                const selectedPkg = packages.find((p) => p.id === selectedPackageId);
                if (!selectedPkg) return null;
                const v = selectedPkg.latest_version;
                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="font-semibold text-slate-200">{selectedPkg.name}</span>
                      <span className="font-mono text-teal-400 uppercase text-[11px] px-2 py-0.5 rounded bg-teal-950 border border-teal-800">
                        {selectedPkg.package_type}
                      </span>
                    </div>
                    {selectedPkg.description && (
                      <p className="text-slate-400 text-[11px]">{selectedPkg.description}</p>
                    )}
                    {v && (
                      <div className="space-y-1 pt-2 border-t border-slate-800/80 text-[11px] font-mono text-slate-400">
                        <div>
                          <span className="text-slate-600">Fichier:</span> {v.filename}
                        </div>
                        {v.package_args && (
                          <div>
                            <span className="text-slate-600">Arguments:</span> {v.package_args}
                          </div>
                        )}
                        {v.install_command && (
                          <div>
                            <span className="text-slate-600">Commande:</span> {v.install_command}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={!selectedPackageId || createActionMutation.isPending}
                  className="flex items-center space-x-2 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-xl shadow-lg shadow-teal-950/50 disabled:opacity-50"
                >
                  {createActionMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Lancer l'installation</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 7: CONNECT USER (AUTOLOGON DOMAIN / LOCAL)                          */}
      {/* ========================================================================= */}
      {activeModal === 'logon' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 text-cyan-400">
                <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
                  <UserCheck className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Connecter un utilisateur à distance</h3>
                  <p className="text-xs text-slate-400">Cible : {device.hostname}</p>
                </div>
              </div>
              <button onClick={() => setActiveModal(null)} className="text-slate-500 hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleLogon} className="space-y-4 text-xs">
              {/* Type de compte */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">Type de compte</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setLogonAccountType('domain')}
                    className={`flex items-center justify-center space-x-2 py-2 px-3 rounded-xl border text-xs font-semibold transition ${
                      logonAccountType === 'domain'
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>Compte du Domaine (AD)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setLogonAccountType('local')}
                    className={`flex items-center justify-center space-x-2 py-2 px-3 rounded-xl border text-xs font-semibold transition ${
                      logonAccountType === 'local'
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <Monitor className="w-3.5 h-3.5" />
                    <span>Compte Local</span>
                  </button>
                </div>
              </div>

              {/* Domaine (si sélectionné) */}
              {logonAccountType === 'domain' && (() => {
                const detectedAd = getDetectedAdDomain(inventory?.current_user, device.hostname);
                return (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-slate-300 font-semibold">Nom du Domaine NetBIOS</label>
                      {detectedAd && (
                        <button
                          type="button"
                          onClick={() => setLogonDomain(detectedAd)}
                          className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1"
                        >
                          <Globe className="w-3 h-3" />
                          <span>Utiliser {detectedAd}</span>
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={logonDomain}
                      onChange={(e) => setLogonDomain(e.target.value.toUpperCase())}
                      placeholder="ex: PEDAGO"
                      required
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 uppercase placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>
                );
              })()}

              {/* Nom d'utilisateur */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">Identifiant utilisateur (Login)</label>
                <input
                  type="text"
                  value={logonUsername}
                  onChange={(e) => setLogonUsername(e.target.value)}
                  placeholder={logonAccountType === 'domain' ? "ex: eleve, prof, admin..." : "ex: Administrateur, user..."}
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
                />

                {/* Suggestions pour compte local */}
                {logonAccountType === 'local' && inventory?.local_users && inventory.local_users.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-slate-500">Utilisateurs détectés :</span>
                    {inventory.local_users
                      .filter((u) => u.enabled)
                      .slice(0, 6)
                      .map((u) => (
                        <button
                          key={u.name}
                          type="button"
                          onClick={() => setLogonUsername(u.name)}
                          className="px-2 py-0.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] font-mono text-cyan-300 transition"
                        >
                          {u.name}
                        </button>
                      ))}
                  </div>
                )}
              </div>

              {/* Mot de passe */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">Mot de passe du compte</label>
                <div className="relative">
                  <input
                    type={logonShowPassword ? 'text' : 'password'}
                    value={logonPassword}
                    onChange={(e) => setLogonPassword(e.target.value)}
                    placeholder="Saisissez le mot de passe (ou vide si aucun)"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setLogonShowPassword(!logonShowPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Le mot de passe est transmis chiffré et enregistré dans Winlogon (AutoLogon) sur la machine distante.
                </p>
              </div>

              {/* Option Usage Unique & Redémarrage */}
              <div className="pt-2 border-t border-slate-800/80 space-y-3">
                <label className="flex items-start space-x-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={logonOneTime}
                    onChange={(e) => setLogonOneTime(e.target.checked)}
                    className="mt-0.5 rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-0 focus:ring-offset-0"
                  />
                  <div>
                    <span className="font-semibold text-slate-200">Connexion à usage unique (Recommandé)</span>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      Ouvre la session automatiquement une seule fois. Dès que l'utilisateur se déconnecte, Windows retourne normalement à l'écran de verrouillage sans le reconnecter en boucle.
                    </p>
                  </div>
                </label>

                <label className="flex items-start space-x-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={logonRestartNow}
                    onChange={(e) => setLogonRestartNow(e.target.checked)}
                    className="mt-0.5 rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-0 focus:ring-offset-0"
                  />
                  <div>
                    <span className="font-semibold text-slate-200">Redémarrer immédiatement pour ouvrir la session</span>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      Déclenche un redémarrage instantané (2s) pour charger directement le profil et le bureau de l'utilisateur.
                    </p>
                  </div>
                </label>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
                <button
                  type="button"
                  onClick={handleResetLogon}
                  className="text-xs text-rose-400 hover:text-rose-300 font-medium hover:underline flex items-center gap-1.5"
                  title="Supprime la connexion automatique et purge les identifiants enregistrés sur cette machine"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Désactiver l'AutoLogon</span>
                </button>

                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={() => setActiveModal(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={createActionMutation.isPending || !logonUsername.trim()}
                    className="flex items-center space-x-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-xl shadow-lg shadow-cyan-950/50 disabled:opacity-50"
                  >
                    {createActionMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Connecter la session</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 8: CREATE LOCAL USER                                                */}
      {/* ========================================================================= */}
      {activeModal === 'create_user' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 text-emerald-400">
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                  <UserPlus className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Créer un Utilisateur Local</h3>
                  <p className="text-xs text-slate-400">Cible : {device.hostname}</p>
                </div>
              </div>
              <button onClick={() => setActiveModal(null)} className="text-slate-500 hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateLocalUser} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Nom d'utilisateur (Login) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={createUsername}
                  onChange={(e) => setCreateUsername(e.target.value)}
                  placeholder="ex: stagiaire, eleve, prof, adminlocal"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">Nom complet / Description</label>
                <input
                  type="text"
                  value={createFullName}
                  onChange={(e) => setCreateFullName(e.target.value)}
                  placeholder="ex: Compte Stagiaire Formation"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">Mot de passe</label>
                <div className="relative">
                  <input
                    type={createShowPassword ? 'text' : 'password'}
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    placeholder="Saisissez un mot de passe (ou vide si sans mot de passe)"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setCreateShowPassword(!createShowPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 space-y-3">
                <label className="flex items-start space-x-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={createIsAdmin}
                    onChange={(e) => setCreateIsAdmin(e.target.checked)}
                    className="mt-0.5 rounded bg-slate-950 border-slate-800 text-rose-500 focus:ring-0 focus:ring-offset-0"
                  />
                  <div>
                    <span className="font-semibold text-slate-200">Accorder les privilèges Administrateur Local</span>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      Ajoute l'utilisateur au groupe local "Administrateurs" de la machine.
                    </p>
                  </div>
                </label>

                <label className="flex items-start space-x-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={createPasswordNeverExpires}
                    onChange={(e) => setCreatePasswordNeverExpires(e.target.checked)}
                    className="mt-0.5 rounded bg-slate-950 border-slate-800 text-emerald-500 focus:ring-0 focus:ring-offset-0"
                  />
                  <div>
                    <span className="font-semibold text-slate-200">Le mot de passe n'expire jamais</span>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      Évite que Windows ne demande un changement de mot de passe à la première ouverture de session.
                    </p>
                  </div>
                </label>
              </div>

              {/* Section: Scripts Post-Création */}
              <div className="pt-3 border-t border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <FileCode className="w-4 h-4 text-emerald-400" />
                    <label className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                      Scripts Post-Création (Optionnel)
                    </label>
                  </div>
                  {createPostScriptIds.length > 0 && (
                    <span className="text-[10px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                      {createPostScriptIds.length} script{createPostScriptIds.length > 1 ? 's' : ''} ordonné{createPostScriptIds.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">
                  Sélectionnez un ou plusieurs scripts de l'<strong>Éditeur de Scripts</strong> à exécuter à la suite dans l'ordre indiqué.
                </p>

                {/* Liste ordonnée des scripts sélectionnés */}
                {createPostScriptIds.length > 0 && (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {createPostScriptIds.map((sId, index) => {
                      const scriptObj = scripts.find((s) => s.id === sId);
                      if (!scriptObj) return null;
                      const lang = (scriptObj.language || 'powershell').toLowerCase();
                      const langColor =
                        lang === 'powershell' || lang === 'ps1'
                          ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                          : lang === 'cmd' || lang === 'batch'
                          ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                          : lang === 'python'
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : 'bg-purple-500/15 text-purple-400 border-purple-500/30';

                      return (
                        <div
                          key={`${sId}-${index}`}
                          className="flex items-center justify-between p-2.5 bg-slate-950/90 border border-slate-800/90 rounded-xl text-xs group hover:border-slate-700 transition"
                        >
                          <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                            <span className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold flex items-center justify-center text-[10px] flex-shrink-0">
                              {index + 1}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase font-bold border ${langColor} flex-shrink-0`}>
                              {lang}
                            </span>
                            <span className="font-semibold text-slate-200 truncate" title={scriptObj.name}>
                              {scriptObj.name}
                            </span>
                          </div>

                          <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
                            <button
                              type="button"
                              onClick={() => {
                                setCreatePostScriptIds((prev) => {
                                  if (index === 0) return prev;
                                  const next = [...prev];
                                  const tmp = next[index];
                                  next[index] = next[index - 1];
                                  next[index - 1] = tmp;
                                  return next;
                                });
                              }}
                              disabled={index === 0}
                              className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-400 rounded hover:bg-slate-800"
                              title="Déplacer vers le haut"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setCreatePostScriptIds((prev) => {
                                  if (index === prev.length - 1) return prev;
                                  const next = [...prev];
                                  const tmp = next[index];
                                  next[index] = next[index + 1];
                                  next[index + 1] = tmp;
                                  return next;
                                });
                              }}
                              disabled={index === createPostScriptIds.length - 1}
                              className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-400 rounded hover:bg-slate-800"
                              title="Déplacer vers le bas"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setCreatePostScriptIds((prev) => prev.filter((_, i) => i !== index));
                              }}
                              className="p-1 text-rose-400 hover:text-rose-300 rounded hover:bg-rose-500/10 ml-1"
                              title="Retirer ce script"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Sélecteur et bouton d'ajout de script */}
                <div className="flex items-center space-x-2 pt-1">
                  <select
                    value={selectedPostScriptToAdd}
                    onChange={(e) => setSelectedPostScriptToAdd(e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-emerald-500 font-medium"
                  >
                    <option value="">-- Choisir un script de l'Éditeur --</option>
                    {scripts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.language})
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedPostScriptToAdd) return;
                      setCreatePostScriptIds((prev) => [...prev, selectedPostScriptToAdd]);
                      setSelectedPostScriptToAdd('');
                    }}
                    disabled={!selectedPostScriptToAdd}
                    className="flex items-center space-x-1.5 px-3 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-semibold rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap text-xs shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Ajouter script</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800/60">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={createActionMutation.isPending || !createUsername.trim()}
                  className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl shadow-lg shadow-emerald-950/50 disabled:opacity-50"
                >
                  {createActionMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Créer le compte</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 9: DELETE LOCAL USER & PROFILE                                      */}
      {/* ========================================================================= */}
      {activeModal === 'delete_user' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 text-rose-400">
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                  <UserX className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Supprimer un Profil / Compte Local</h3>
                  <p className="text-xs text-slate-400">Cible : {device.hostname}</p>
                </div>
              </div>
              <button onClick={() => setActiveModal(null)} className="text-slate-500 hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDeleteLocalUser} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Nom d'utilisateur ciblé <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={deleteUsername}
                  onChange={(e) => setDeleteUsername(e.target.value)}
                  placeholder="ex: stagiaire, jdupont, eleve..."
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-rose-500 font-mono"
                />

                {/* Suggestions for existing users */}
                {inventory?.local_users && inventory.local_users.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-slate-500">Choisir parmi les profils détectés :</span>
                    {inventory.local_users
                      .filter((u) => u.name?.toLowerCase() !== 'administrateur' && u.name?.toLowerCase() !== 'administrator' && u.name?.toLowerCase() !== 'defaultaccount')
                      .slice(0, 8)
                      .map((u) => (
                        <button
                          key={u.name}
                          type="button"
                          onClick={() => setDeleteUsername(u.name)}
                          className="px-2 py-0.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] font-mono text-rose-300 transition"
                        >
                          {u.name}
                        </button>
                      ))}
                  </div>
                )}
              </div>

              <div className="p-3.5 bg-rose-950/20 border border-rose-900/40 rounded-xl space-y-3">
                <label className="flex items-start space-x-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={deleteProfileFiles}
                    onChange={(e) => setDeleteProfileFiles(e.target.checked)}
                    className="mt-0.5 rounded bg-slate-950 border-slate-800 text-rose-500 focus:ring-0 focus:ring-offset-0"
                  />
                  <div>
                    <span className="font-semibold text-slate-200">Supprimer le profil Windows et ses fichiers (C:\Users\...)</span>
                    <p className="text-slate-400 text-[11px] mt-0.5">
                      Supprime la ruche WMI Win32_UserProfile, le dossier utilisateur et tous ses documents/téléchargements/AppData.
                    </p>
                  </div>
                </label>

                <label className="flex items-start space-x-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={deleteLocalAccount}
                    onChange={(e) => setDeleteLocalAccount(e.target.checked)}
                    className="mt-0.5 rounded bg-slate-950 border-slate-800 text-rose-500 focus:ring-0 focus:ring-offset-0"
                  />
                  <div>
                    <span className="font-semibold text-slate-200">Supprimer le compte local de la base SAM</span>
                    <p className="text-slate-400 text-[11px] mt-0.5">
                      Supprime définitivement le compte utilisateur local du système (Remove-LocalUser).
                    </p>
                  </div>
                </label>

                <label className="flex items-start space-x-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={deleteForceLogoff}
                    onChange={(e) => setDeleteForceLogoff(e.target.checked)}
                    className="mt-0.5 rounded bg-slate-950 border-slate-800 text-rose-500 focus:ring-0 focus:ring-offset-0"
                  />
                  <div>
                    <span className="font-semibold text-slate-200">Fermer la session si l'utilisateur est actuellement connecté</span>
                    <p className="text-slate-400 text-[11px] mt-0.5">
                      Déconnecte immédiatement la session active pour déverrouiller les fichiers du profil.
                    </p>
                  </div>
                </label>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800/60">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={createActionMutation.isPending || !deleteUsername.trim()}
                  className="flex items-center space-x-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-xl shadow-lg shadow-rose-950/50 disabled:opacity-50"
                >
                  {createActionMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Confirmer la suppression</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 7: ACTION LOGS INSPECTOR                                            */}
      {/* ========================================================================= */}
      {selectedActionForLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-cyan-950/60 border border-cyan-800/50 rounded-xl text-cyan-400">
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">{selectedActionForLogs.deployment_name}</h3>
                  <p className="text-xs text-slate-400">
                    Machine : {device.hostname} &bull; Statut : {selectedActionForLogs.status}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedActionForLogs(null)} className="text-slate-500 hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs max-h-80 overflow-y-auto space-y-1 text-slate-300">
              {loadingTargetLogs ? (
                <div className="flex items-center space-x-2 text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>Chargement des logs d'exécution de l'agent...</span>
                </div>
              ) : targetLogs.length > 0 ? (
                targetLogs.map((l, idx) => (
                  <div key={idx} className="flex items-start space-x-2 leading-relaxed">
                    <span className="text-slate-600 select-none text-[10px] whitespace-nowrap">
                      [{new Date(l.timestamp).toLocaleTimeString()}]
                    </span>
                    <span
                      className={`font-bold select-none text-[10px] ${
                        l.level === 'ERROR'
                          ? 'text-rose-400'
                          : l.level === 'WARNING'
                          ? 'text-amber-400'
                          : 'text-cyan-400'
                      }`}
                    >
                      [{l.level}]
                    </span>
                    <span className={l.level === 'ERROR' ? 'text-rose-300' : 'text-slate-200'}>{l.message}</span>
                  </div>
                ))
              ) : (
                <div className="text-slate-500 italic">
                  Aucun log disponible pour cette action (l'agent n'a pas encore retourné de sortie console).
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedActionForLogs(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 8: CLEAR ALL DEVICE ACTIONS                                         */}
      {/* ========================================================================= */}
      {showClearActionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="p-2.5 bg-rose-950/60 border border-rose-800/50 rounded-xl">
                <Trash2 className="w-5 h-5 text-rose-500" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">Nettoyer l'historique des actions</h3>
                <p className="text-xs text-slate-400">{device.hostname}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Voulez-vous supprimer les <span className="font-bold text-white font-mono">{actions.length}</span> entrées
              de l'historique ainsi que tous les journaux d'exécution associés pour cette machine ?
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowClearActionsModal(false)}
                disabled={clearActionsMutation.isPending}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => clearActionsMutation.mutate()}
                disabled={clearActionsMutation.isPending}
                className="flex items-center space-x-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl transition shadow-lg shadow-rose-900/30 disabled:opacity-50"
              >
                {clearActionsMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirmer le nettoyage</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 9: DELETE SINGLE DEVICE ACTION                                      */}
      {/* ========================================================================= */}
      {actionToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="p-2.5 bg-rose-950/60 border border-rose-800/50 rounded-xl">
                <Trash2 className="w-5 h-5 text-rose-500" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">Supprimer de l'historique</h3>
                <p className="text-xs text-slate-400">{actionToDelete.deployment_name}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300">
              Supprimer cette entrée d'action et ses journaux associés de l'historique de {device.hostname} ?
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setActionToDelete(null)}
                disabled={deleteActionMutation.isPending}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => deleteActionMutation.mutate(actionToDelete.id)}
                disabled={deleteActionMutation.isPending}
                className="flex items-center space-x-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl transition disabled:opacity-50"
              >
                {deleteActionMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Supprimer</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 10: UNINSTALL SOFTWARE CONFIRMATION                                 */}
      {/* ========================================================================= */}
      {activeModal === 'uninstall_software' && softwareToUninstall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 text-rose-400">
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                  <Trash2 className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Désinstaller une application</h3>
                  <p className="text-xs text-slate-400">Machine cible : <span className="font-semibold text-slate-200">{device.hostname}</span> ({device.ip_address || 'IP inconnue'})</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setActiveModal(null);
                  setSoftwareToUninstall(null);
                }}
                className="text-slate-500 hover:text-slate-300 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Application Details Card */}
            <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 space-y-3">
              <div className="flex items-start space-x-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                  <PackageIcon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-slate-100 truncate">{softwareToUninstall.name}</h4>
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-400">
                    {softwareToUninstall.version && (
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-emerald-400">
                        v{softwareToUninstall.version}
                      </span>
                    )}
                    {softwareToUninstall.publisher && (
                      <span className="text-slate-300">Éditeur : {softwareToUninstall.publisher}</span>
                    )}
                  </div>
                </div>
              </div>

              {(softwareToUninstall.uninstall_string || softwareToUninstall.quiet_uninstall_string || softwareToUninstall.pschildname) && (
                <div className="pt-2 border-t border-slate-850 text-[11px] font-mono text-slate-400 break-all space-y-1">
                  {softwareToUninstall.pschildname && softwareToUninstall.pschildname.startsWith('{') && (
                    <div><span className="text-slate-500">ProductCode MSI :</span> <span className="text-purple-300">{softwareToUninstall.pschildname}</span></div>
                  )}
                  {softwareToUninstall.uninstall_string && (
                    <div className="truncate"><span className="text-slate-500">UninstallString :</span> <span className="text-slate-300">{softwareToUninstall.uninstall_string}</span></div>
                  )}
                </div>
              )}
            </div>

            <form onSubmit={handleConfirmUninstallSoftware} className="space-y-4 text-xs">
              {/* Silent mode option */}
              <div
                onClick={() => {
                  const next = !uninstallSilentMode;
                  setUninstallSilentMode(next);
                  setCustomUninstallScript(generateUninstallScript(softwareToUninstall, next));
                }}
                className="flex items-start space-x-3 p-3.5 bg-slate-950 rounded-xl border border-slate-800 cursor-pointer hover:border-slate-700 transition"
              >
                <input
                  type="checkbox"
                  checked={uninstallSilentMode}
                  onChange={() => {}}
                  className="w-4 h-4 mt-0.5 text-rose-500 rounded bg-slate-900 border-slate-700 focus:ring-rose-500"
                />
                <div>
                  <span className="text-slate-200 font-semibold block">Désinstallation 100% silencieuse automatique</span>
                  <span className="text-slate-400 text-[11px] block mt-0.5">
                    Injecte automatiquement les commutateurs silencieux (<code className="text-rose-300 font-mono">/qn</code>, <code className="text-rose-300 font-mono">/VERYSILENT</code>, <code className="text-rose-300 font-mono">/S</code>, <code className="text-rose-300 font-mono">/norestart</code>) pour une exécution sans invite devant l'utilisateur.
                  </span>
                </div>
              </div>

              {/* Advanced Script Toggle */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvancedUninstallScript(!showAdvancedUninstallScript)}
                  className="flex items-center space-x-1.5 text-slate-400 hover:text-slate-200 text-xs font-semibold transition"
                >
                  <FileCode className="w-3.5 h-3.5" />
                  <span>{showAdvancedUninstallScript ? 'Masquer le script PowerShell' : 'Afficher / Personnaliser le script PowerShell de désinstallation'}</span>
                </button>

                {showAdvancedUninstallScript && (
                  <div className="mt-2 space-y-1.5 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Script PowerShell généré automatiquement :</span>
                      <button
                        type="button"
                        onClick={() => setCustomUninstallScript(generateUninstallScript(softwareToUninstall, uninstallSilentMode))}
                        className="text-emerald-400 hover:text-emerald-300 transition"
                      >
                        Réinitialiser le script
                      </button>
                    </div>
                    <textarea
                      rows={8}
                      value={customUninstallScript}
                      onChange={(e) => setCustomUninstallScript(e.target.value)}
                      className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-slate-200 focus:outline-none focus:border-rose-500/50"
                    />
                  </div>
                )}
              </div>

              {/* Warning note */}
              <div className="flex items-start space-x-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] leading-relaxed">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                <span>
                  L'ordre de désinstallation sera envoyé sous forme de tâche immédiate exécutée par l'agent MAPT sous privilèges <strong>SYSTEM / Administrateur</strong>. Le suivi en temps réel sera disponible dans l'onglet <strong>Actions & Télémaintenance</strong>.
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal(null);
                    setSoftwareToUninstall(null);
                  }}
                  disabled={createActionMutation.isPending}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={createActionMutation.isPending}
                  className="flex items-center space-x-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-xl shadow-lg shadow-rose-950/50 disabled:opacity-50 transition"
                >
                  {createActionMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <Trash2 className="w-4 h-4" />
                  <span>Confirmer la désinstallation</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
