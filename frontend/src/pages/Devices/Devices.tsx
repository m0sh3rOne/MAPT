import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { Link } from 'react-router-dom';
import {
  Monitor,
  Search,
  CheckCircle2,
  XCircle,
  Power,
  Trash2,
  Eye,
  Filter,
  RefreshCw,
  Cpu,
  HardDrive,
  Zap,
  Radio,
  Send,
  X,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Check,
  ShieldCheck,
  ShieldAlert,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Tag
} from 'lucide-react';
import { WolResult, Device } from '../../types';

export const Devices: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ONLINE' | 'OFFLINE' | 'UNAPPROVED'>('ALL');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);

  // Sorting State
  const [sortBy, setSortBy] = useState<'hostname' | 'last_seen_at' | 'status' | 'os'>('hostname');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Batch Delete Modal State
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false);
  const [batchUninstallAgent, setBatchUninstallAgent] = useState(true);

  // WoL Custom Modal State
  const [showCustomWolModal, setShowCustomWolModal] = useState(false);
  const [customMac, setCustomMac] = useState('');
  const [customBroadcast, setCustomBroadcast] = useState('255.255.255.255');
  const [customPort, setCustomPort] = useState(9);

  // Toast / Notification State
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
    details?: string[];
  } | null>(null);

  const { data: devices = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['devices'],
    queryFn: api.getDevices,
    refetchInterval: 10000,
  });

  // Enable / Disable Device
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      if (enabled) {
        return api.disableDevice(id);
      } else {
        return api.enableDevice(id);
      }
    },
    onSuccess: (res) => {
      setNotification({
        type: 'success',
        message: res.enabled
          ? `Machine ${res.hostname} activée avec succès.`
          : `Machine ${res.hostname} désactivée avec succès.`,
      });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      refetch();
      setTimeout(() => setNotification(null), 5000);
    },
    onError: (err: any) => {
      setNotification({
        type: 'error',
        message: err?.response?.data?.detail || "Erreur lors du changement de statut",
      });
      setTimeout(() => setNotification(null), 6000);
    },
  });

  // Approve Device Mutation
  const approveMutation = useMutation({
    mutationFn: async ({ id, hostname }: { id: string; hostname: string }) => {
      return api.approveDevice(id);
    },
    onSuccess: (_, variables) => {
      setNotification({
        type: 'success',
        message: `Machine ${variables.hostname} approuvée avec succès et intégrée au parc actif.`,
      });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
      refetch();
      setTimeout(() => setNotification(null), 5000);
    },
    onError: (err: any) => {
      setNotification({
        type: 'error',
        message: err?.response?.data?.detail || "Erreur lors de l'approbation de la machine",
      });
      setTimeout(() => setNotification(null), 6000);
    },
  });

  // Batch Approve Mutation
  const batchApproveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      return api.approveDevicesBatch(ids);
    },
    onSuccess: (data, ids) => {
      setNotification({
        type: 'success',
        message: `${ids.length} machine(s) approuvée(s) avec succès.`,
      });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
      setSelectedDeviceIds([]);
      refetch();
      setTimeout(() => setNotification(null), 5000);
    },
    onError: (err: any) => {
      setNotification({
        type: 'error',
        message: err?.response?.data?.detail || "Erreur lors de l'approbation groupée",
      });
      setTimeout(() => setNotification(null), 6000);
    },
  });

  // Delete Device with automatic Agent Uninstallation
  const deleteMutation = useMutation({
    mutationFn: async ({ id, hostname }: { id: string; hostname: string }) => {
      return api.deleteDevice(id, true);
    },
    onSuccess: (_, variables) => {
      setNotification({
        type: 'success',
        message: `Ordre de désinstallation de l'agent envoyé et machine ${variables.hostname} supprimée du parc.`,
      });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
      setSelectedDeviceIds((prev) => prev.filter((dId) => dId !== variables.id));
      refetch();
      setTimeout(() => setNotification(null), 7000);
    },
    onError: (err: any) => {
      setNotification({
        type: 'error',
        message: err?.response?.data?.detail || "Erreur lors de la suppression de la machine",
      });
      setTimeout(() => setNotification(null), 7000);
    },
  });

  // Batch Delete Mutation
  const batchDeleteMutation = useMutation({
    mutationFn: async ({ ids, uninstallAgent }: { ids: string[]; uninstallAgent: boolean }) => {
      return api.deleteDevicesBatch(ids, uninstallAgent);
    },
    onSuccess: (data, variables) => {
      setNotification({
        type: 'success',
        message: `${variables.ids.length} machine(s) supprimée(s) du parc et retirée(s) de leurs groupes avec succès.`,
      });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
      setSelectedDeviceIds([]);
      setShowBatchDeleteModal(false);
      refetch();
      setTimeout(() => setNotification(null), 7000);
    },
    onError: (err: any) => {
      setNotification({
        type: 'error',
        message: err?.response?.data?.detail || "Erreur lors de la suppression en lot des machines",
      });
      setTimeout(() => setNotification(null), 7000);
    },
  });

  // Remote Immediate Shutdown Mutation (shutdown.exe /s /t 0 /f)
  const powerShutdownMutation = useMutation({
    mutationFn: async ({ id, hostname }: { id: string; hostname: string }) => {
      return api.createDeployment({
        name: `⚡ Arrêt immédiat - ${hostname}`,
        description: `Extinction forcée rapide à distance`,
        deployment_type: 'command',
        custom_command: 'shutdown.exe /s /t 0 /f',
        target_all_devices: false,
        target_device_ids: [id],
        target_group_ids: [],
        schedule_type: 'immediate',
        is_recurring: false,
      });
    },
    onSuccess: (_, variables) => {
      setNotification({
        type: 'success',
        message: `Ordre d'extinction immédiate envoyé avec succès à ${variables.hostname}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      refetch();
      setTimeout(() => setNotification(null), 7000);
    },
    onError: (err: any) => {
      setNotification({
        type: 'error',
        message: err?.response?.data?.detail || "Erreur lors de l'envoi de l'ordre d'extinction",
      });
      setTimeout(() => setNotification(null), 7000);
    },
  });

  // Acknowledge Device Rename Mutation
  const acknowledgeRenameMutation = useMutation({
    mutationFn: async ({ id, deleteOld = true }: { id: string; deleteOld?: boolean }) => {
      return api.acknowledgeDeviceRename(id, deleteOld);
    },
    onSuccess: (res) => {
      setNotification({
        type: 'success',
        message: `Renommage de ${res.hostname} acquitté avec succès.`,
      });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
      refetch();
      setTimeout(() => setNotification(null), 5000);
    },
    onError: (err: any) => {
      setNotification({
        type: 'error',
        message: err?.response?.data?.detail || "Erreur lors de l'acquittement du renommage",
      });
      setTimeout(() => setNotification(null), 6000);
    },
  });

  // WoL Single Device Mutation
  const wolSingleMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      return api.wakeDevice(deviceId);
    },
    onSuccess: (res: WolResult) => {
      if (res.success) {
        setNotification({
          type: 'success',
          message: res.message || `Paquet magique Wake-on-LAN envoyé avec succès à ${res.mac_address || 'la machine'}`,
        });
      } else {
        setNotification({
          type: 'error',
          message: res.message || "Erreur lors de l'envoi du paquet Wake-on-LAN",
        });
      }
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      refetch();
      setTimeout(() => setNotification(null), 7000);
    },
    onError: (err: any) => {
      setNotification({
        type: 'error',
        message: err?.response?.data?.detail || "Échec de l'envoi du paquet Wake-on-LAN",
      });
      setTimeout(() => setNotification(null), 7000);
    },
  });

  // WoL Batch Devices Mutation
  const wolBatchMutation = useMutation({
    mutationFn: async (deviceIds: string[]) => {
      return api.wakeDevices(deviceIds);
    },
    onSuccess: (results: WolResult[]) => {
      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      if (successful.length > 0) {
        setNotification({
          type: 'success',
          message: `${successful.length} machine(s) réveillée(s) par Wake-on-LAN avec succès !`,
          details: failed.map((f) => `Échec ${f.mac_address || 'inconnue'} : ${f.message}`),
        });
      } else {
        setNotification({
          type: 'error',
          message: `Aucune machine n'a pu être réveillée (${failed.length} échecs).`,
          details: failed.map((f) => f.message),
        });
      }
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      refetch();
      setTimeout(() => setNotification(null), 7000);
    },
    onError: (err: any) => {
      setNotification({
        type: 'error',
        message: err?.response?.data?.detail || 'Erreur lors du réveil groupé',
      });
      setTimeout(() => setNotification(null), 7000);
    },
  });

  // Batch Shutdown Mutation
  const batchShutdownMutation = useMutation({
    mutationFn: async (deviceIds: string[]) => {
      return api.createDeployment({
        name: `⚡ Arrêt groupé (${deviceIds.length} machines)`,
        description: `Extinction forcée rapide à distance sur sélection de machines`,
        deployment_type: 'command',
        custom_command: 'shutdown.exe /s /t 0 /f',
        target_all_devices: false,
        target_device_ids: deviceIds,
        target_group_ids: [],
        schedule_type: 'immediate',
        is_recurring: false,
      });
    },
    onSuccess: (_, variables) => {
      setNotification({
        type: 'success',
        message: `Ordre d'extinction envoyé avec succès à ${variables.length} machine(s).`,
      });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      refetch();
      setTimeout(() => setNotification(null), 7000);
    },
    onError: (err: any) => {
      setNotification({
        type: 'error',
        message: err?.response?.data?.detail || "Erreur lors de l'arrêt groupé",
      });
      setTimeout(() => setNotification(null), 7000);
    },
  });

  // WoL Custom MAC Mutation
  const wolCustomMutation = useMutation({
    mutationFn: async () => {
      return api.sendCustomWol(customMac.trim(), customBroadcast.trim() || undefined, customPort);
    },
    onSuccess: (res: WolResult) => {
      if (res.success) {
        setNotification({
          type: 'success',
          message: `Paquet magique WoL envoyé à l'adresse MAC ${res.mac_address} (${res.broadcast_ip}:${res.port})`,
        });
        setShowCustomWolModal(false);
        setCustomMac('');
      } else {
        setNotification({
          type: 'error',
          message: `Erreur WoL : ${res.message}`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      refetch();
      setTimeout(() => setNotification(null), 7000);
    },
    onError: (err: any) => {
      setNotification({
        type: 'error',
        message: err?.response?.data?.detail || "Échec de l'envoi personnalisé",
      });
      setTimeout(() => setNotification(null), 7000);
    },
  });

  // Formatage précis du Système d'Exploitation (style winver)
  const formatOSDisplay = (device: Device) => {
    let name = (device.os_name || '').trim();
    let ver = (device.os_version || '').trim();
    let build = (device.os_build || '').trim();

    // Nettoyage des anciennes valeurs génériques
    if (name.toLowerCase() === 'windows' && ver.toLowerCase() === 'windows') {
      name = 'Windows 10 / 11';
      ver = '';
    }

    if (name.toLowerCase() === 'windows') {
      if (build.startsWith('22') || build.startsWith('26')) {
        name = 'Windows 11';
      } else if (build.startsWith('19') || build.startsWith('18')) {
        name = 'Windows 10';
      }
    }

    // Titre : ex: "Windows 11 Pro (23H2)" ou "Windows 10 Pro"
    let title = name || 'Windows';
    if (ver && ver.toLowerCase() !== 'windows' && ver.toLowerCase() !== 'unknown') {
      if (!title.toLowerCase().includes(ver.toLowerCase())) {
        title += ` (${ver})`;
      }
    }

    // Sous-titre : ex: "Build 22631.4387 • 64-bit"
    let subtitle = '';
    if (build && build !== 'amd64' && build !== 'x86_64' && build !== 'x64') {
      subtitle = `Build ${build} • 64-bit`;
    } else {
      subtitle = 'Architecture 64-bit (x64)';
    }

    return { title, subtitle };
  };

  // Compteurs par statut
  const onlineCount = devices.filter((d) => d.is_approved !== false && d.is_online).length;
  const offlineCount = devices.filter((d) => d.is_approved !== false && !d.is_online).length;
  const unapprovedCount = devices.filter((d) => d.is_approved === false).length;

  // Filtrage
  const filteredDevices = devices.filter((device) => {
    const isAppr = device.is_approved !== false;
    const term = searchTerm.trim().toLowerCase();

    // Filtre statut
    if (statusFilter === 'UNAPPROVED' && isAppr) return false;
    if (statusFilter === 'ONLINE' && (!isAppr || !device.is_online)) return false;
    if (statusFilter === 'OFFLINE' && (!isAppr || device.is_online)) return false;

    if (!term) return true;

    const termNoHyphen = term.replace(/-/g, '');
    const uuidClean = (device.device_uuid || '').toLowerCase().replace(/-/g, '');
    const idClean = (device.id || '').toLowerCase().replace(/-/g, '');

    return (
      device.hostname.toLowerCase().includes(term) ||
      (device.ip_address && device.ip_address.toLowerCase().includes(term)) ||
      (device.mac_address && device.mac_address.toLowerCase().includes(term)) ||
      (device.mac_addresses && device.mac_addresses.some((mac) => mac.toLowerCase().includes(term))) ||
      (device.device_uuid && device.device_uuid.toLowerCase().includes(term)) ||
      (device.id && device.id.toLowerCase().includes(term)) ||
      (uuidClean && termNoHyphen && uuidClean.includes(termNoHyphen)) ||
      (idClean && termNoHyphen && idClean.includes(termNoHyphen)) ||
      (device.os_name && device.os_name.toLowerCase().includes(term)) ||
      (device.os_version && device.os_version.toLowerCase().includes(term)) ||
      (device.os_build && device.os_build.toLowerCase().includes(term))
    );
  });

  // Tri dynamique (Nom, Heartbeat, Statut, OS)
  const sortedDevices = [...filteredDevices].sort((a, b) => {
    let comparison = 0;

    if (sortBy === 'hostname') {
      comparison = (a.hostname || '').localeCompare(b.hostname || '', undefined, { numeric: true, sensitivity: 'base' });
    } else if (sortBy === 'last_seen_at') {
      const timeA = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
      const timeB = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;
      comparison = timeA - timeB;
    } else if (sortBy === 'status') {
      // Priorité statut : Non approuvé (0) < En ligne (1) < Hors ligne (2) < Désactivé (3)
      const getStatusRank = (d: Device) => {
        if (d.is_approved === false) return 0;
        if (!d.enabled) return 3;
        return d.is_online ? 1 : 2;
      };
      comparison = getStatusRank(a) - getStatusRank(b);
      if (comparison === 0) {
        comparison = (a.hostname || '').localeCompare(b.hostname || '');
      }
    } else if (sortBy === 'os') {
      comparison = (a.os_name || '').localeCompare(b.os_name || '');
    }

    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const handleSort = (field: 'hostname' | 'last_seen_at' | 'status' | 'os') => {
    if (sortBy === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDirection(field === 'last_seen_at' ? 'desc' : 'asc');
    }
  };

  const getSortIcon = (field: 'hostname' | 'last_seen_at' | 'status' | 'os') => {
    if (sortBy !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 opacity-60" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-emerald-400" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-emerald-400" />
    );
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedDeviceIds(sortedDevices.map((d) => d.id));
    } else {
      setSelectedDeviceIds([]);
    }
  };

  const handleSelectDevice = (id: string) => {
    setSelectedDeviceIds((prev) =>
      prev.includes(id) ? prev.filter((dId) => dId !== id) : [...prev, id]
    );
  };

  // Liste des machines non approuvées parmi la sélection courante
  const selectedUnapprovedIds = selectedDeviceIds.filter((id) => {
    const d = devices.find((dev) => dev.id === id);
    return d && d.is_approved === false;
  });

  // Liste des machines renommées en attente d'acquittement
  const renamedDevices = devices.filter((d) => !!d.previous_hostname);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`p-4 rounded-2xl border flex items-start justify-between shadow-xl transition animate-in fade-in slide-in-from-top-2 duration-200 ${
            notification.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/30 text-emerald-300'
              : notification.type === 'info'
              ? 'bg-sky-950/80 border-sky-500/30 text-sky-300'
              : 'bg-rose-950/80 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-start space-x-3">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : notification.type === 'info' ? (
              <Zap className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
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
          <button
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-slate-200 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight flex items-center gap-2.5">
            <span>Parc des Machines</span>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
              {devices.length} machines
            </span>
            {unapprovedCount > 0 && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 animate-pulse">
                <ShieldAlert className="w-3.5 h-3.5" />
                {unapprovedCount} non approuvée{unapprovedCount > 1 ? 's' : ''}
              </span>
            )}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Inventaire des postes clients, état en temps réel, approbation administrative et réveil à distance (Wake-on-LAN)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setShowCustomWolModal(true)}
            className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-amber-400 border border-amber-500/30 hover:border-amber-500/60 px-3.5 py-2 rounded-xl text-sm font-semibold transition shadow-sm"
            title="Envoyer un paquet magique WoL à une adresse MAC personnalisée"
          >
            <Zap className="w-4 h-4" />
            <span>Wake-on-LAN Manuel</span>
          </button>

          <a
            href="/api/v1/agent/download/windows"
            className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-xl text-sm font-semibold transition shadow-sm"
          >
            <Power className="w-4 h-4" />
            <span>Télécharger l'Agent (.exe)</span>
          </a>

          <button
            onClick={() => {
              refetch();
              queryClient.invalidateQueries({ queryKey: ['devices'] });
            }}
            className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl text-sm font-medium transition"
            title="Actualiser la liste"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading || isFetching ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Actualiser</span>
          </button>
        </div>
      </div>

      {/* Filters, Search Bar and Sorting Controls */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
        <div className="flex flex-col sm:flex-row flex-1 items-center gap-3">
          <div className="relative flex-1 w-full max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Rechercher par nom d'hôte, IP, MAC, UUID, OS, build..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-slate-500 shrink-0" />
              <select
                value={statusFilter}
                onChange={(e: any) => setStatusFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-300 text-sm rounded-xl px-3 py-2 outline-none focus:border-emerald-500"
              >
                <option value="ALL">Tous les statuts ({devices.length})</option>
                <option value="ONLINE">En ligne ({onlineCount})</option>
                <option value="OFFLINE">Hors ligne ({offlineCount})</option>
                <option value="UNAPPROVED">Non approuvé ({unapprovedCount})</option>
              </select>
            </div>

            {/* Tri sélecteur rapide */}
            <div className="flex items-center space-x-2">
              <ArrowUpDown className="w-4 h-4 text-slate-500 shrink-0" />
              <select
                value={`${sortBy}_${sortDirection}`}
                onChange={(e) => {
                  const [field, dir] = e.target.value.split('_') as [any, any];
                  setSortBy(field);
                  setSortDirection(dir);
                }}
                className="bg-slate-950 border border-slate-800 text-slate-300 text-sm rounded-xl px-3 py-2 outline-none focus:border-emerald-500"
              >
                <option value="hostname_asc">Tri : Nom (A → Z)</option>
                <option value="hostname_desc">Tri : Nom (Z → A)</option>
                <option value="last_seen_at_desc">Tri : Dernier Heartbeat (Récent)</option>
                <option value="last_seen_at_asc">Tri : Dernier Heartbeat (Ancien)</option>
                <option value="status_asc">Tri : Statut (Non approuvé d'abord)</option>
                <option value="status_desc">Tri : Statut (En ligne d'abord)</option>
                <option value="os_asc">Tri : Système d'exploitation</option>
              </select>
            </div>
          </div>
        </div>

        {/* Bulk Action Bar */}
        {selectedDeviceIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 animate-in fade-in">
            <span className="text-xs text-slate-400 font-semibold">
              {selectedDeviceIds.length} sélectionnée(s)
            </span>

            {/* Bouton approbation par lot si des machines non approuvées sont sélectionnées */}
            {selectedUnapprovedIds.length > 0 && (
              <button
                onClick={() => batchApproveMutation.mutate(selectedUnapprovedIds)}
                disabled={batchApproveMutation.isPending}
                className="flex items-center space-x-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 text-xs px-2.5 py-1.5 rounded-lg font-bold transition disabled:opacity-50"
                title="Approuver les machines sélectionnées sur le serveur"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{batchApproveMutation.isPending ? 'Approbation...' : `Approuver (${selectedUnapprovedIds.length})`}</span>
              </button>
            )}

            <button
              onClick={() => wolBatchMutation.mutate(selectedDeviceIds)}
              disabled={wolBatchMutation.isPending}
              className="flex items-center space-x-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs px-2.5 py-1.5 rounded-lg font-bold transition disabled:opacity-50"
              title="Envoyer un paquet Wake-on-LAN à toutes les machines sélectionnées"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{wolBatchMutation.isPending ? 'Envoi...' : 'Réveiller (WoL)'}</span>
            </button>

            <button
              onClick={() => {
                if (confirm(`Confirmez-vous l'extinction immédiate de ${selectedDeviceIds.length} machine(s) sélectionnée(s) ?`)) {
                  batchShutdownMutation.mutate(selectedDeviceIds);
                }
              }}
              disabled={batchShutdownMutation.isPending}
              className="flex items-center space-x-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs px-2.5 py-1.5 rounded-lg font-bold transition disabled:opacity-50"
              title="Éteindre à distance les machines sélectionnées"
            >
              <Power className="w-3.5 h-3.5" />
              <span>{batchShutdownMutation.isPending ? 'Arrêt en cours...' : 'Éteindre'}</span>
            </button>

            <button
              onClick={() => setShowBatchDeleteModal(true)}
              disabled={batchDeleteMutation.isPending}
              className="flex items-center space-x-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/60 text-xs px-2.5 py-1.5 rounded-lg font-bold transition disabled:opacity-50"
              title="Supprimer les machines sélectionnées et les retirer des groupes"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Supprimer ({selectedDeviceIds.length})</span>
            </button>

            <button
              onClick={() => setSelectedDeviceIds([])}
              className="text-slate-500 hover:text-slate-300 p-1"
              title="Désélectionner tout"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Renamed Devices Notification Banner */}
      {renamedDevices.length > 0 && (
        <div className="p-4 bg-gradient-to-r from-blue-950/60 to-indigo-950/40 border border-blue-500/40 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl animate-in fade-in">
          <div className="flex items-center space-x-3.5">
            <div className="p-2.5 bg-blue-500/20 border border-blue-500/30 rounded-xl text-blue-400 shrink-0">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h4 className="text-sm font-bold text-slate-100">
                  {renamedDevices.length === 1 ? '1 machine a été renommée' : `${renamedDevices.length} machines ont été renommées`}
                </h4>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/30">
                  Resynchronisation auto
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                {renamedDevices.length === 1
                  ? `Le poste ${renamedDevices[0].hostname} (anciennement ${renamedDevices[0].previous_hostname}) a été mis à jour automatiquement.`
                  : 'Des postes ont changé de nom et se sont resynchronisés automatiquement.'}
              </p>
            </div>
          </div>
          {renamedDevices.length === 1 && (
            <div className="flex items-center space-x-2 shrink-0 w-full md:w-auto justify-end">
              <button
                onClick={() => acknowledgeRenameMutation.mutate({ id: renamedDevices[0].id, deleteOld: true })}
                disabled={acknowledgeRenameMutation.isPending}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-950/50 transition flex items-center space-x-1.5 disabled:opacity-50"
                title="Confirmer le nouveau nom et supprimer automatiquement les anciens doublons / fantômes"
              >
                {acknowledgeRenameMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Acquitter et purger l'ancien nom</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Devices Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/80 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-4 w-10">
                  <input
                    type="checkbox"
                    checked={
                      sortedDevices.length > 0 &&
                      selectedDeviceIds.length === sortedDevices.length
                    }
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-emerald-500"
                  />
                </th>

                {/* Tri par Nom */}
                <th
                  onClick={() => handleSort('hostname')}
                  className="px-6 py-4 cursor-pointer hover:bg-slate-900/80 transition select-none"
                  title="Cliquer pour trier par Nom d'hôte"
                >
                  <div className="flex items-center space-x-2">
                    <span>Machine & Réseau</span>
                    {getSortIcon('hostname')}
                  </div>
                </th>

                {/* Tri par Système d'Exploitation */}
                <th
                  onClick={() => handleSort('os')}
                  className="px-6 py-4 cursor-pointer hover:bg-slate-900/80 transition select-none"
                  title="Cliquer pour trier par Système d'Exploitation"
                >
                  <div className="flex items-center space-x-2">
                    <span>Système d'Exploitation</span>
                    {getSortIcon('os')}
                  </div>
                </th>

                <th className="px-6 py-4">Version Agent</th>

                {/* Tri par Dernier Heartbeat */}
                <th
                  onClick={() => handleSort('last_seen_at')}
                  className="px-6 py-4 cursor-pointer hover:bg-slate-900/80 transition select-none"
                  title="Cliquer pour trier par Dernier Heartbeat"
                >
                  <div className="flex items-center space-x-2">
                    <span>Dernier Heartbeat</span>
                    {getSortIcon('last_seen_at')}
                  </div>
                </th>

                {/* Tri par Statut */}
                <th
                  onClick={() => handleSort('status')}
                  className="px-6 py-4 cursor-pointer hover:bg-slate-900/80 transition select-none"
                  title="Cliquer pour trier par Statut"
                >
                  <div className="flex items-center space-x-2">
                    <span>Statut</span>
                    {getSortIcon('status')}
                  </div>
                </th>

                <th className="px-6 py-4 text-right">Actions Rapides</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {sortedDevices.map((device) => {
                const isSelected = selectedDeviceIds.includes(device.id);
                const isUnapproved = device.is_approved === false;
                const osInfo = formatOSDisplay(device);

                return (
                  <tr
                    key={device.id}
                    className={`hover:bg-slate-850/50 transition ${
                      isSelected ? 'bg-slate-850/40' : ''
                    } ${isUnapproved ? 'bg-amber-950/10' : ''}`}
                  >
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleSelectDevice(device.id)}
                        className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-emerald-500"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div
                          className={`w-3 h-3 rounded-full flex-shrink-0 ${
                            isUnapproved
                              ? 'bg-amber-400 ring-4 ring-amber-400/20'
                              : device.is_online
                              ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
                              : 'bg-slate-600'
                          }`}
                        />
                        <div>
                          <div className="font-semibold text-slate-100 flex items-center space-x-2">
                            <Link
                              to={`/devices/${device.id}`}
                              className="hover:text-emerald-400 transition underline-offset-2 hover:underline"
                            >
                              {device.hostname}
                            </Link>
                            {device.previous_hostname && (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] bg-blue-500/15 text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded font-mono font-medium"
                                title={`Ancien nom : ${device.previous_hostname}`}
                              >
                                <Tag className="w-2.5 h-2.5" />
                                <span>ex: {device.previous_hostname}</span>
                              </span>
                            )}
                            {!device.enabled ? (
                              <button
                                onClick={() =>
                                  toggleStatusMutation.mutate({ id: device.id, enabled: false })
                                }
                                title="Machine désactivée. Cliquez pour la réactiver."
                                className="text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20 px-1.5 py-0.5 rounded font-bold hover:bg-rose-500/20 transition cursor-pointer"
                              >
                                DÉSACTIVÉ
                              </button>
                            ) : (
                              <button
                                onClick={() =>
                                  toggleStatusMutation.mutate({ id: device.id, enabled: true })
                                }
                                title="Machine active. Cliquez pour la désactiver."
                                className="text-[10px] opacity-0 hover:opacity-100 text-slate-500 hover:text-rose-400 transition"
                              >
                                (Désactiver)
                              </button>
                            )}
                          </div>
                          <div className="flex items-center space-x-2 text-xs font-mono text-slate-400 mt-0.5">
                            <span>{device.ip_address || '127.0.0.1'}</span>
                            {device.mac_address && (
                              <>
                                <span className="text-slate-600">•</span>
                                <span className="text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-[11px]">
                                  {device.mac_address}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-200 font-medium">
                        {osInfo.title}
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        {osInfo.subtitle}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-400">
                      v{device.agent_version || '1.0.0'}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {device.last_seen_at
                        ? new Date(device.last_seen_at).toLocaleTimeString()
                        : 'Jamais'}
                    </td>
                    <td className="px-6 py-4">
                      {isUnapproved ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          <span>Non approuvé</span>
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${
                            device.is_online
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          {device.is_online ? (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              <span>En ligne</span>
                            </>
                          ) : (
                            'Hors ligne'
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        {/* Action Approbation Manuelle si non approuvée */}
                        {isUnapproved && (
                          <button
                            onClick={() =>
                              approveMutation.mutate({ id: device.id, hostname: device.hostname })
                            }
                            disabled={approveMutation.isPending}
                            className="p-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-bold transition flex items-center space-x-1.5 disabled:opacity-50"
                            title="Approuver la machine et l'intégrer au parc"
                          >
                            <ShieldCheck className="w-4 h-4 text-amber-300" />
                            <span className="text-xs font-semibold hidden xl:inline">Approuver</span>
                          </button>
                        )}

                        {/* Quick Rename Acknowledge Action */}
                        {device.previous_hostname && (
                          <button
                            onClick={() =>
                              acknowledgeRenameMutation.mutate({ id: device.id, deleteOld: true })
                            }
                            disabled={acknowledgeRenameMutation.isPending}
                            className="p-2 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-300 font-bold transition flex items-center space-x-1 disabled:opacity-50"
                            title={`Acquitter le renommage (ancien nom : ${device.previous_hostname}) et purger les anciens enregistrements`}
                          >
                            <Tag className="w-4 h-4 text-blue-400" />
                            <span className="text-xs font-semibold hidden 2xl:inline">Acquitter</span>
                          </button>
                        )}

                        {/* WoL Button (Allumage) */}
                        <button
                          onClick={() => wolSingleMutation.mutate(device.id)}
                          disabled={wolSingleMutation.isPending}
                          className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/40 transition disabled:opacity-50"
                          title="Allumer la machine à distance (Wake-on-LAN)"
                        >
                          <Zap className="w-4 h-4" />
                        </button>

                        {/* View details */}
                        <Link
                          to={`/devices/${device.id}`}
                          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:border-slate-600 transition"
                          title="Consulter l'inventaire complet et télémaintenance"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>

                        {/* Power Button (Extinction si en ligne / Allumage si hors ligne) */}
                        {device.is_online ? (
                          <button
                            onClick={() => {
                              if (confirm(`Éteindre immédiatement la machine ${device.hostname} à distance ?`)) {
                                powerShutdownMutation.mutate({ id: device.id, hostname: device.hostname });
                              }
                            }}
                            disabled={powerShutdownMutation.isPending}
                            className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 hover:border-rose-500/40 transition disabled:opacity-50"
                            title="Éteindre la machine à distance (Arrêt forcé immédiat)"
                          >
                            <Power className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => wolSingleMutation.mutate(device.id)}
                            disabled={wolSingleMutation.isPending}
                            className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/40 transition disabled:opacity-50"
                            title="Allumer la machine à distance (Wake-on-LAN)"
                          >
                            <Power className="w-4 h-4" />
                          </button>
                        )}

                        {/* Delete with Agent Uninstall */}
                        <button
                          onClick={() => {
                            if (
                              confirm(
                                `Supprimer la machine ${device.hostname} du parc ?\n\nUn script de désinstallation complète de l'agent MAPT sera automatiquement transmis à la machine.`
                              )
                            ) {
                              deleteMutation.mutate({ id: device.id, hostname: device.hostname });
                            }
                          }}
                          disabled={deleteMutation.isPending}
                          className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 hover:border-rose-500/40 transition disabled:opacity-50"
                          title="Désinstaller l'agent et supprimer la machine du parc"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {sortedDevices.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    Aucune machine trouvée pour ces critères.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual WoL Modal */}
      {showCustomWolModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-100">Wake-on-LAN Manuel</h3>
                  <p className="text-xs text-slate-400">
                    Diffuser un paquet magique vers une adresse MAC
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCustomWolModal(false)}
                className="text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                wolCustomMutation.mutate();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Adresse MAC Cible *
                </label>
                <input
                  type="text"
                  required
                  placeholder="00:11:22:33:44:55 ou 00-11-22-33-44-55"
                  value={customMac}
                  onChange={(e) => setCustomMac(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl px-4 py-2.5 text-sm text-slate-200 font-mono outline-none"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Format standard à 6 octets hexadécimaux.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    IP de Broadcast
                  </label>
                  <input
                    type="text"
                    value={customBroadcast}
                    onChange={(e) => setCustomBroadcast(e.target.value)}
                    placeholder="255.255.255.255"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-sm text-slate-200 font-mono outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Port UDP
                  </label>
                  <input
                    type="number"
                    value={customPort}
                    onChange={(e) => setCustomPort(parseInt(e.target.value) || 9)}
                    min={1}
                    max={65535}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-sm text-slate-200 font-mono outline-none"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl text-xs text-slate-400">
                <span className="font-semibold text-amber-400 block mb-1">⚡ Comment ça marche ?</span>
                Le serveur MAPT émettra un datagramme UDP contenant le paquet magique (6x 0xFF suivis de 16x l'adresse MAC) sur les sous-réseaux locaux.
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCustomWolModal(false)}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={wolCustomMutation.isPending}
                  className="flex items-center space-x-2 bg-amber-500 hover:bg-amber-400 text-slate-950 px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-amber-500/20 transition disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>{wolCustomMutation.isPending ? 'Émission...' : 'Diffuser le Paquet Magique'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Delete Confirmation Modal */}
      {showBatchDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-100">
                    Supprimer {selectedDeviceIds.length} machine{selectedDeviceIds.length > 1 ? 's' : ''}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Retrait de l'inventaire et désassignation des groupes
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBatchDeleteModal(false)}
                className="text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-sm text-slate-300">
              <p className="leading-relaxed">
                Êtes-vous sûr de vouloir supprimer les{' '}
                <span className="font-bold text-white font-mono bg-slate-800 px-2 py-0.5 rounded">
                  {selectedDeviceIds.length}
                </span>{' '}
                machines sélectionnées du parc ?
              </p>

              <div className="p-3.5 bg-rose-950/20 border border-rose-900/40 rounded-xl text-xs text-rose-300 space-y-1.5">
                <div className="font-bold flex items-center gap-1.5 text-rose-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Conséquences de la suppression en lot :</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-300 ml-1">
                  <li>Les machines seront masquées de l'inventaire actif de MAPT.</li>
                  <li>
                    Elles seront <strong>automatiquement retirées de tous les groupes</strong> auxquels elles appartiennent.
                  </li>
                  <li>Les historiques et journaux d'audit de cette action seront conservés.</li>
                </ul>
              </div>

              <div className="pt-2">
                <label className="flex items-start space-x-3 p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl cursor-pointer hover:border-slate-700 transition">
                  <input
                    type="checkbox"
                    checked={batchUninstallAgent}
                    onChange={(e) => setBatchUninstallAgent(e.target.checked)}
                    className="mt-0.5 rounded bg-slate-900 border-slate-700 text-rose-500 focus:ring-rose-500 focus:ring-offset-slate-900"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-200 block">
                      Désinstaller proprement l'Agent Windows
                    </span>
                    <span className="text-slate-400 block mt-0.5">
                      Transmet un ordre d'arrêt, de suppression du service Windows et de nettoyage des fichiers locaux sur les machines en ligne.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setShowBatchDeleteModal(false)}
                disabled={batchDeleteMutation.isPending}
                className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 font-medium transition"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => {
                  batchDeleteMutation.mutate({
                    ids: selectedDeviceIds,
                    uninstallAgent: batchUninstallAgent
                  });
                }}
                disabled={batchDeleteMutation.isPending}
                className="flex items-center space-x-2 bg-rose-600 hover:bg-rose-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-rose-600/20 transition disabled:opacity-50"
              >
                {batchDeleteMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Suppression en cours...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Confirmer la suppression ({selectedDeviceIds.length})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
