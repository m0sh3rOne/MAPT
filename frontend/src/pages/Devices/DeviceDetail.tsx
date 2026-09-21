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
  Globe
} from 'lucide-react';
import { DeviceActionHistory, Package, Script, JobLog, LocalUser, InstalledSoftware, NetworkInterface } from '../../types';

export const DeviceDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'inventory' | 'software' | 'network' | 'general' | 'actions'>('inventory');

  // Software search & filter state
  const [softwareSearch, setSoftwareSearch] = useState('');
  const [softwareFilterPublisher, setSoftwareFilterPublisher] = useState<string>('all');

  // Users search & filter state
  const [userSearch, setUserSearch] = useState('');
  const [userFilterRole, setUserFilterRole] = useState<'all' | 'active' | 'admin' | 'standard'>('all');

  // Action Modals state
  const [activeModal, setActiveModal] = useState<
    'restart' | 'shutdown' | 'rename' | 'message' | 'script' | 'package' | null
  >(null);

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

  const { data: inventory } = useQuery({
    queryKey: ['device-inventory', id],
    queryFn: () => api.getDeviceInventory(id!),
    enabled: !!id,
    refetchInterval: 15000,
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
    enabled: activeTab === 'actions' || activeModal === 'script',
  });

  const { data: targetLogs = [], isLoading: loadingTargetLogs } = useQuery({
    queryKey: ['target-logs', selectedActionForLogs?.deployment_id, selectedActionForLogs?.id],
    queryFn: () => api.getTargetLogs(selectedActionForLogs!.deployment_id, selectedActionForLogs!.id),
    enabled: !!selectedActionForLogs,
    refetchInterval: 3000,
  });

  // Action mutation
  const createActionMutation = useMutation({
    mutationFn: (deploymentData: any) => api.createDeployment(deploymentData),
    onSuccess: () => {
      setActiveModal(null);
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

    const restartArg = renameRestart ? ' -Restart' : '';
    const psCmd = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Rename-Computer -NewName '${cleanName}' -Force${restartArg}"`;

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
        const encoded = btoa(unescape(encodeURIComponent(adhocScriptContent)));
        cmd = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`;
      } else if (adhocLanguage === 'vbscript') {
        const encoded = btoa(unescape(encodeURIComponent(adhocScriptContent)));
        cmd = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$f = [System.IO.Path]::Combine($env:TEMP, 'mapt_adhoc_' + (Get-Random) + '.vbs'); [System.IO.File]::WriteAllText($f, [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encoded}'))); cscript.exe //NoLogo $f; Remove-Item -Force $f"`;
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
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                  device.is_online
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {device.is_online ? 'En ligne' : 'Hors ligne'}
              </span>
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
      </div>

      {/* Tab 1: Hardware Inventory */}
      {activeTab === 'inventory' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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

          {/* Current User Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center">
                <User className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-400 uppercase font-bold">Utilisateur Connecté</div>
                <div className="text-base font-semibold text-slate-100">{inventory?.current_user || 'UBUNTU'}</div>
              </div>
            </div>
            <div className="text-xs text-slate-500">
              Dernière mise à jour : {inventory ? new Date(inventory.updated_at).toLocaleString() : 'En attente'}
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
              {filteredList.length > 0 ? (
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-950/80 sticky top-0 backdrop-blur z-10 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Application</th>
                        <th className="py-3 px-4">Version</th>
                        <th className="py-3 px-4">Éditeur / Fournisseur</th>
                        <th className="py-3 px-4 text-right">Date d'installation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-sm">
                      {filteredList.map((sw, idx) => (
                        <tr key={idx} className="hover:bg-slate-850/60 transition">
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
                          <td className="py-3 px-4 text-right font-mono text-xs text-slate-400">
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
        const interfaces = inventory?.network_interfaces || [];
        const connectedCount = interfaces.filter(
          (iface) =>
            iface.status?.toLowerCase() === 'connected' ||
            iface.status?.toLowerCase() === 'active' ||
            (iface.ip_addresses && iface.ip_addresses.length > 0)
        ).length;

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
                    <h2 className="text-base font-bold text-slate-100">
                      Configuration Réseau & Adaptateurs{' '}
                      <span className="font-mono text-xs text-slate-500 font-normal">(ipconfig /all)</span>
                    </h2>
                    <p className="text-xs text-slate-400">
                      Association directe des adresses MAC, adresses IP, passerelles et serveurs DNS
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                  <span className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300">
                    IP Principale :{' '}
                    <strong className="text-emerald-400">{device.ip_address || '127.0.0.1'}</strong>
                  </span>
                  <span className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300">
                    Adaptateurs : <strong className="text-slate-100">{interfaces.length}</strong>
                  </span>
                  <span className="px-3 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-800/60 text-emerald-300">
                    Connectés : <strong>{connectedCount}</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Adapters Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              {interfaces.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-950/80 sticky top-0 backdrop-blur z-10 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      <tr>
                        <th className="py-3.5 px-4">Interface / Carte réseau</th>
                        <th className="py-3.5 px-4">Adresse MAC (Physique)</th>
                        <th className="py-3.5 px-4">Adresse(s) IPv4 & Masque</th>
                        <th className="py-3.5 px-4">Passerelle & DNS</th>
                        <th className="py-3.5 px-4">DHCP</th>
                        <th className="py-3.5 px-4 text-right">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-sm">
                      {interfaces.map((iface, idx) => {
                        const isConnected =
                          iface.status?.toLowerCase() === 'connected' ||
                          iface.status?.toLowerCase() === 'active' ||
                          (iface.ip_addresses && iface.ip_addresses.length > 0);

                        const isWifi =
                          iface.name?.toLowerCase().includes('wi-fi') ||
                          iface.name?.toLowerCase().includes('wireless') ||
                          iface.description?.toLowerCase().includes('wi-fi') ||
                          iface.description?.toLowerCase().includes('wireless');

                        const gateways = Array.isArray(iface.default_gateways)
                          ? iface.default_gateways
                          : iface.default_gateways
                          ? [iface.default_gateways]
                          : [];

                        const dnsList = Array.isArray(iface.dns_servers) ? iface.dns_servers : [];

                        return (
                          <tr key={idx} className="hover:bg-slate-850/60 transition">
                            {/* Interface Name & Description */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-start space-x-3">
                                <div
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                                    isConnected
                                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                                  }`}
                                >
                                  {isWifi ? <Wifi className="w-4 h-4" /> : <Network className="w-4 h-4" />}
                                </div>
                                <div>
                                  <div className="flex items-center space-x-2">
                                    <span className="font-bold text-slate-100">{iface.name}</span>
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
                                  {iface.ip_addresses.map((ip, i) => (
                                    <div key={i} className="flex flex-col">
                                      <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-md inline-block w-fit">
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
                                <span className="text-slate-600 text-xs">Non configurée</span>
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
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Connecté</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center space-x-1.5 font-semibold text-xs px-2.5 py-1 rounded-full bg-slate-900 text-slate-400 border border-slate-800">
                                  <XCircle className="w-3.5 h-3.5" />
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
                /* Fallback if no network interfaces array */
                <div className="p-6 space-y-4">
                  <div className="flex items-center space-x-3 mb-4">
                    <Globe className="w-5 h-5 text-emerald-400" />
                    <span className="font-bold text-slate-200">Adresses Détectées</span>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                      Adresses MAC
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {inventory?.mac_addresses && inventory.mac_addresses.length > 0 ? (
                        inventory.mac_addresses.map((mac, idx) => (
                          <span
                            key={idx}
                            className="font-mono text-xs bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl text-slate-200"
                          >
                            {mac}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-500">Aucune adresse MAC physique rapportée.</span>
                      )}
                    </div>
                  </div>
                  <div className="pt-4 border-t border-slate-800">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                      Adresse IP Principale
                    </label>
                    <span className="font-mono text-sm bg-slate-950 border border-slate-800 px-3.5 py-1.5 rounded-xl text-emerald-400 font-semibold">
                      {device.ip_address || '127.0.0.1'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Tab 3: General Info & Local Users (NEW!) */}
      {activeTab === 'general' && (() => {
        const localUsers = inventory?.local_users || [];
        const totalUsers = localUsers.length;
        const activeUsersCount = localUsers.filter((u) => u.enabled).length;
        const adminUsersCount = localUsers.filter((u) => u.is_admin).length;

        const filteredUsers = localUsers.filter((u) => {
          const matchSearch =
            !userSearch.trim() ||
            u.name?.toLowerCase().includes(userSearch.toLowerCase()) ||
            u.full_name?.toLowerCase().includes(userSearch.toLowerCase()) ||
            u.description?.toLowerCase().includes(userSearch.toLowerCase());
          if (!matchSearch) return false;
          if (userFilterRole === 'active') return u.enabled;
          if (userFilterRole === 'admin') return u.is_admin;
          if (userFilterRole === 'standard') return !u.is_admin;
          return true;
        });

        const currentUsername = inventory?.current_user ? inventory.current_user.split('\\').pop() : '';

        return (
          <div className="space-y-6">
            {/* System Details */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-base font-bold text-slate-100 mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>Détails Système & Enrôlement</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
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
              </div>
            </div>

            {/* Local Users Table (net user) */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-100">
                      Comptes Utilisateurs du Poste{' '}
                      <span className="font-mono text-xs text-slate-500 font-normal">(net user)</span>
                    </h2>
                    <p className="text-xs text-slate-400">
                      État d'activation, niveau de privilège (Admin / Standard) et dernière connexion
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                  <span className="px-3 py-1 rounded-xl bg-slate-950 border border-slate-800 text-slate-300">
                    Total : <strong className="text-slate-100">{totalUsers}</strong>
                  </span>
                  <span className="px-3 py-1 rounded-xl bg-emerald-950/60 border border-emerald-800/60 text-emerald-300">
                    Actifs : <strong>{activeUsersCount}</strong>
                  </span>
                  <span className="px-3 py-1 rounded-xl bg-rose-950/60 border border-rose-800/60 text-rose-300">
                    Admins : <strong>{adminUsersCount}</strong>
                  </span>
                </div>
              </div>

              {/* User search & filter */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Filtrer un compte utilisateur..."
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

                <div className="flex items-center gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold">
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
                  <button
                    onClick={() => setUserFilterRole('active')}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      userFilterRole === 'active'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Actifs ({activeUsersCount})
                  </button>
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
                {filteredUsers.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-900/90 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        <tr>
                          <th className="py-3 px-4">Nom de compte</th>
                          <th className="py-3 px-4">Nom complet & Description</th>
                          <th className="py-3 px-4">Statut</th>
                          <th className="py-3 px-4">Niveau de Privilège</th>
                          <th className="py-3 px-4 text-right">Dernière connexion</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-sm">
                        {filteredUsers.map((u, idx) => {
                          const isCurrent =
                            currentUsername && u.name.toLowerCase() === currentUsername.toLowerCase();
                          return (
                            <tr key={idx} className="hover:bg-slate-900/50 transition">
                              <td className="py-3.5 px-4">
                                <div className="flex items-center space-x-3">
                                  <div
                                    className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                                      u.is_admin
                                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                        : 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                                    }`}
                                  >
                                    <User className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <div className="flex items-center space-x-2">
                                      <span className="font-bold text-slate-100">{u.name}</span>
                                      {isCurrent && (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-950/80 text-teal-300 border border-teal-800/60">
                                          Session active
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>

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

                              <td className="py-3.5 px-4">
                                {u.enabled ? (
                                  <span className="inline-flex items-center space-x-1.5 font-semibold text-xs px-2.5 py-1 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Actif</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center space-x-1.5 font-semibold text-xs px-2.5 py-1 rounded-full bg-slate-900 text-slate-400 border border-slate-800">
                                    <XCircle className="w-3.5 h-3.5" />
                                    <span>Désactivé</span>
                                  </span>
                                )}
                              </td>

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

                              <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-400">
                                {u.last_logon ? (
                                  new Date(u.last_logon).toLocaleString()
                                ) : (
                                  <span className="text-slate-600">Jamais / Non enregistrée</span>
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
                    <Users className="w-10 h-10 mx-auto mb-2 text-slate-700 stroke-1" />
                    <p className="text-sm font-medium text-slate-400">
                      {totalUsers === 0
                        ? "Aucun compte utilisateur local n'a encore été rapporté par l'agent."
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
                    <th className="px-5 py-3.5">Horodatage</th>
                    <th className="px-5 py-3.5">Action / Déploiement</th>
                    <th className="px-5 py-3.5">Type</th>
                    <th className="px-5 py-3.5">Statut</th>
                    <th className="px-5 py-3.5">Code retour</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
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
                        <span className="font-mono text-[11px] uppercase px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                          {act.deployment_type}
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
    </div>
  );
};
