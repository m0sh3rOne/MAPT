import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { Link } from 'react-router-dom';
import {
  Rocket,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  ArrowRight,
  Package,
  Code2,
  Terminal,
  Loader2,
  X,
  Repeat,
  Calendar,
  CalendarClock,
  Filter,
  Layers,
  Trash2,
  CheckSquare,
  Square,
  AlertTriangle,
  Sparkles,
  Zap,
  Monitor
} from 'lucide-react';
import { SchedulerSelector, ScheduleConfig } from '../../components/common/SchedulerSelector';

export const Deployments: React.FC = () => {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'active' | 'recurring' | 'completed'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Multi-selection and Deletion states
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deploymentToDelete, setDeploymentToDelete] = useState<any | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Form state for creating deployment
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [deploymentType, setDeploymentType] = useState<'package' | 'script' | 'command'>('script');
  const [packageVersionId, setPackageVersionId] = useState('');
  const [scriptVersionId, setScriptVersionId] = useState('');
  const [customCommand, setCustomCommand] = useState('');
  const [commandShell, setCommandShell] = useState<'cmd' | 'powershell'>('cmd');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [wakeOnLan, setWakeOnLan] = useState(false);
  const [maxConcurrency, setMaxConcurrency] = useState<number>(8);
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig>({
    is_recurring: false,
    schedule_type: 'immediate',
    scheduled_time: '08:00',
    scheduled_days_of_week: '1,2,3,4,5',
    interval_value: 1,
  });
  const [deviceSearch, setDeviceSearch] = useState('');
  const [deviceFilterOnline, setDeviceFilterOnline] = useState<'all' | 'online' | 'offline'>('all');
  const [error, setError] = useState<string | null>(null);

  const { data: deployments = [], isLoading } = useQuery({
    queryKey: ['deployments'],
    queryFn: api.getDeployments,
    refetchInterval: 5000,
  });

  const { data: devices = [] } = useQuery({
    queryKey: ['devices'],
    queryFn: api.getDevices,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: api.getGroups,
  });

  const { data: packages = [] } = useQuery({
    queryKey: ['packages'],
    queryFn: api.getPackages,
  });

  const { data: scripts = [] } = useQuery({
    queryKey: ['scripts'],
    queryFn: api.getScripts,
  });

  const createMutation = useMutation({
    mutationFn: api.createDeployment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      setShowModal(false);
      resetForm();
      setSuccessToast('Nouveau déploiement créé avec succès.');
      setTimeout(() => setSuccessToast(null), 3000);
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || 'Erreur lors de la création du déploiement.');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: api.cancelDeployment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      setSuccessToast('Déploiement annulé.');
      setTimeout(() => setSuccessToast(null), 3000);
    },
  });

  const deleteSingleMutation = useMutation({
    mutationFn: (id: string) => api.deleteDeployment(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      setSelectedIds((prev) => prev.filter((id) => id !== deploymentToDelete?.id));
      setDeploymentToDelete(null);
      setSuccessToast(data.message || 'Déploiement supprimé.');
      setTimeout(() => setSuccessToast(null), 3000);
    },
    onError: (err: any) => setError(err.response?.data?.detail || 'Erreur lors de la suppression.'),
  });

  const clearFinishedMutation = useMutation({
    mutationFn: api.clearFinishedDeployments,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      setSelectedIds([]);
      setShowClearConfirm(false);
      setSuccessToast(data.message || 'Historique nettoyé avec succès.');
      setTimeout(() => setSuccessToast(null), 3000);
    },
    onError: (err: any) => setError(err.response?.data?.detail || 'Erreur lors du nettoyage de l’historique.'),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => api.bulkDeleteDeployments(ids),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      setSelectedIds([]);
      setShowBulkDeleteConfirm(false);
      setSuccessToast(data.message || 'Jobs sélectionnés supprimés.');
      setTimeout(() => setSuccessToast(null), 3000);
    },
    onError: (err: any) => setError(err.response?.data?.detail || 'Erreur lors de la suppression groupée.'),
  });

  const getScheduleSummary = (dep: any) => {
    if (dep.is_recurring) {
      if (dep.schedule_type === 'hourly') return `Toutes les ${dep.interval_value || 1}h`;
      if (dep.schedule_type === 'daily') return `Tous les ${dep.interval_value || 1}j à ${dep.scheduled_time || '08:00'}`;
      if (dep.schedule_type === 'weekly') {
        const daysMap: { [k: string]: string } = { '1': 'Lun', '2': 'Mar', '3': 'Mer', '4': 'Jeu', '5': 'Ven', '6': 'Sam', '7': 'Dim' };
        const daysStr = (dep.scheduled_days_of_week || '').split(',').map((d: string) => daysMap[d.trim()] || d).join(', ');
        return `Hebdo (${daysStr || 'ouvrés'}) à ${dep.scheduled_time || '08:00'}`;
      }
      if (dep.schedule_type === 'monthly') return `Mensuel à ${dep.scheduled_time || '08:00'}`;
      if (dep.schedule_type === 'yearly') return `Annuel à ${dep.scheduled_time || '08:00'}`;
      if (dep.schedule_type === 'cron') return `Cron: ${dep.cron_expression}`;
      return 'Récurrent';
    }
    if (dep.scheduled_at) {
      return `Prévu le ${new Date(dep.scheduled_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} à ${new Date(dep.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return null;
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setDeploymentType('script');
    setPackageVersionId('');
    setScriptVersionId('');
    setCustomCommand('');
    setCommandShell('cmd');
    setSelectedDeviceIds([]);
    setSelectedGroupIds([]);
    setWakeOnLan(false);
    setMaxConcurrency(8);
    setScheduleConfig({
      is_recurring: false,
      schedule_type: 'immediate',
      scheduled_time: '08:00',
      scheduled_days_of_week: '1,2,3,4,5',
      interval_value: 1,
    });
    setDeviceSearch('');
    setDeviceFilterOnline('all');
    setError(null);
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

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (selectedDeviceIds.length === 0 && selectedGroupIds.length === 0) {
      setError('Veuillez sélectionner au moins une machine ou un groupe cible.');
      return;
    }

    let finalCommand = customCommand;
    if (deploymentType === 'command' && customCommand) {
      if (commandShell === 'powershell') {
        const encoded = encodePowerShellUtf16Base64(customCommand);
        finalCommand = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`;
      }
    }

    createMutation.mutate({
      name,
      description,
      deployment_type: deploymentType,
      package_version_id: deploymentType === 'package' ? packageVersionId || null : null,
      script_version_id: deploymentType === 'script' ? scriptVersionId || null : null,
      custom_command: deploymentType === 'command' ? finalCommand || null : null,
      target_device_ids: selectedDeviceIds,
      target_group_ids: selectedGroupIds,
      wake_on_lan: wakeOnLan,
      max_concurrency: maxConcurrency,
      is_recurring: scheduleConfig.is_recurring,
      schedule_type: scheduleConfig.schedule_type,
      scheduled_at: scheduleConfig.scheduled_at ? new Date(scheduleConfig.scheduled_at).toISOString() : undefined,
      scheduled_time: scheduleConfig.scheduled_time,
      scheduled_days_of_week: scheduleConfig.scheduled_days_of_week,
      interval_value: scheduleConfig.interval_value,
      interval_unit: scheduleConfig.interval_unit,
      cron_expression: scheduleConfig.cron_expression,
      end_at: scheduleConfig.end_at ? new Date(scheduleConfig.end_at).toISOString() : undefined,
    });
  };

  const filteredDeployments = deployments.filter((dep: any) => {
    const matchesSearch =
      dep.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (dep.description && dep.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
      dep.deployment_type.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (filterType === 'active') {
      return dep.status === 'RUNNING' || dep.status === 'PENDING';
    }
    if (filterType === 'recurring') {
      return dep.is_recurring || !!dep.scheduled_at;
    }
    if (filterType === 'completed') {
      return dep.status === 'COMPLETED' || dep.status === 'FAILED' || dep.status === 'CANCELLED';
    }
    return true;
  });

  const finishedDeploymentsCount = deployments.filter(
    (d: any) => d.status === 'COMPLETED' || d.status === 'CANCELLED'
  ).length;

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredDeployments.length && filteredDeployments.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredDeployments.map((d: any) => d.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {successToast && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl text-xs flex items-center justify-between shadow-lg">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold">{successToast}</span>
          </div>
          <button onClick={() => setSuccessToast(null)} className="text-emerald-400/80 hover:text-emerald-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">Déploiements & Jobs</h1>
          <p className="text-sm text-slate-400 mt-1">Supervision et gestion du cycle de vie des exécutions immédiates, programmées et récurrentes</p>
        </div>

        <div className="flex items-center space-x-2.5">
          {/* Global Clear Finished Button */}
          <button
            disabled={finishedDeploymentsCount === 0 || clearFinishedMutation.isPending}
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center space-x-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-slate-900 disabled:cursor-not-allowed text-rose-300 border border-slate-800 hover:border-rose-500/40 text-xs font-semibold px-3.5 py-2.5 rounded-xl transition shadow"
            title="Supprimer définitivement tous les jobs terminés et annulés de l'historique"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>Purger terminés ({finishedDeploymentsCount})</span>
          </button>

          <button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-600/20 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Créer un Déploiement</span>
          </button>
        </div>
      </div>

      {/* Bulk Action Toolbar */}
      {selectedIds.length > 0 && (
        <div className="bg-rose-500/10 border border-rose-500/25 rounded-2xl p-3 px-4 flex items-center justify-between shadow-lg animate-fadeIn">
          <div className="flex items-center space-x-2.5 text-xs text-rose-300 font-semibold">
            <CheckSquare className="w-4 h-4 text-rose-400" />
            <span>{selectedIds.length} job(s) sélectionné(s) pour suppression</span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setSelectedIds([])}
              className="px-3 py-1.5 rounded-xl text-xs bg-slate-850 border border-slate-700 hover:bg-slate-800 text-slate-300 font-medium transition"
            >
              Tout désélectionner
            </button>
            <button
              onClick={() => setShowBulkDeleteConfirm(true)}
              className="px-3.5 py-1.5 rounded-xl text-xs bg-rose-600 hover:bg-rose-500 text-white font-semibold flex items-center space-x-1.5 shadow-md shadow-rose-600/20 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Supprimer la sélection ({selectedIds.length})</span>
            </button>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 w-full sm:w-auto">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filterType === 'all'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Tous ({deployments.length})
          </button>
          <button
            onClick={() => setFilterType('active')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filterType === 'active'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            En cours / En attente
          </button>
          <button
            onClick={() => setFilterType('recurring')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition ${
              filterType === 'recurring'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Repeat className="w-3 h-3" />
            <span>Récurrents & Programmés</span>
          </button>
          <button
            onClick={() => setFilterType('completed')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filterType === 'completed'
                ? 'bg-slate-800 text-slate-200 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Terminés ({finishedDeploymentsCount})
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Rechercher un job..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 outline-none focus:border-emerald-500 placeholder:text-slate-600"
          />
        </div>
      </div>

      {/* Deployments List Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/80 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="w-12 px-4 py-4 text-center">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="text-slate-400 hover:text-slate-200 transition"
                    title="Tout sélectionner / désélectionner"
                  >
                    {filteredDeployments.length > 0 && selectedIds.length === filteredDeployments.length ? (
                      <CheckSquare className="w-4 h-4 text-emerald-400" />
                    ) : selectedIds.length > 0 ? (
                      <div className="w-4 h-4 bg-emerald-500/30 border border-emerald-400 rounded flex items-center justify-center">
                        <div className="w-2 h-0.5 bg-emerald-400" />
                      </div>
                    ) : (
                      <Square className="w-4 h-4 text-slate-600" />
                    )}
                  </button>
                </th>
                <th className="px-5 py-4">Nom & Planification</th>
                <th className="px-5 py-4">Type</th>
                <th className="px-5 py-4">Progression des Cibles</th>
                <th className="px-5 py-4">Date / Prochaine Exéc.</th>
                <th className="px-5 py-4">Statut Global</th>
                <th className="px-5 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredDeployments.map((dep: any) => {
                const total = dep.total_targets || 1;
                const percent = Math.round(((dep.succeeded_targets + dep.failed_targets) / total) * 100);
                const scheduleSummary = getScheduleSummary(dep);
                const isSelected = selectedIds.includes(dep.id);

                return (
                  <tr
                    key={dep.id}
                    className={`transition ${
                      isSelected ? 'bg-emerald-950/20 hover:bg-emerald-950/30' : 'hover:bg-slate-850/50'
                    }`}
                  >
                    <td className="w-12 px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => toggleSelectOne(dep.id)}
                        className="text-slate-400 hover:text-slate-200 transition"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-600" />
                        )}
                      </button>
                    </td>

                    <td className="px-5 py-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-slate-100">{dep.name}</span>
                          {dep.wake_on_lan && (
                            <span className="inline-flex items-center space-x-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-semibold px-2 py-0.5 rounded-md" title="Wake-on-LAN activé">
                              <Zap className="w-2.5 h-2.5 text-amber-400" />
                              <span>WoL</span>
                            </span>
                          )}
                          {dep.is_recurring && (
                            <span className="inline-flex items-center space-x-1 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-semibold px-2 py-0.5 rounded-md">
                              <Repeat className="w-2.5 h-2.5 animate-spin-slow" />
                              <span>{scheduleSummary}</span>
                            </span>
                          )}
                          {!dep.is_recurring && dep.scheduled_at && (
                            <span className="inline-flex items-center space-x-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-semibold px-2 py-0.5 rounded-md">
                              <CalendarClock className="w-2.5 h-2.5" />
                              <span>{scheduleSummary}</span>
                            </span>
                          )}
                          {dep.max_concurrency !== undefined && dep.max_concurrency > 0 && (
                            <span className="inline-flex items-center space-x-1 bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[10px] font-semibold px-2 py-0.5 rounded-md" title={`Déploiement régulé : max ${dep.max_concurrency} machines simultanées`}>
                              <Layers className="w-2.5 h-2.5 text-purple-400" />
                              <span>{dep.max_concurrency}/vague</span>
                            </span>
                          )}
                        </div>
                        {dep.description && <div className="text-xs text-slate-500 line-clamp-1">{dep.description}</div>}
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <span className="uppercase font-mono text-xs px-2.5 py-1 rounded bg-slate-950 text-slate-300 border border-slate-800">
                        {dep.deployment_type}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <div className="w-48 space-y-1.5">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-emerald-400">{dep.succeeded_targets} réussi(s)</span>
                          {dep.failed_targets > 0 && <span className="text-rose-400">{dep.failed_targets} échec(s)</span>}
                          <span className="text-slate-500">{dep.total_targets} total</span>
                        </div>
                        <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden flex">
                          <div
                            className="bg-emerald-500 h-full transition-all"
                            style={{ width: `${(dep.succeeded_targets / total) * 100}%` }}
                          />
                          <div
                            className="bg-rose-500 h-full transition-all"
                            style={{ width: `${(dep.failed_targets / total) * 100}%` }}
                          />
                          <div
                            className="bg-purple-500 h-full transition-all"
                            style={{ width: `${(dep.running_targets / total) * 100}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4 text-xs font-mono">
                      <div className="space-y-0.5">
                        <div className="text-slate-400">Créé : {new Date(dep.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })} {new Date(dep.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        {dep.next_run_at && (
                          <div className="text-cyan-400 font-semibold flex items-center space-x-1">
                            <Clock className="w-3 h-3" />
                            <span>Prochaine : {new Date(dep.next_run_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} {new Date(dep.next_run_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                        dep.status === 'COMPLETED'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : dep.status === 'RUNNING'
                          ? 'bg-purple-500/10 text-purple-400 border-purple-500/20 animate-pulse'
                          : dep.status === 'CANCELLED'
                          ? 'bg-slate-800 text-slate-500 border-slate-700'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      }`}>
                        {dep.status}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        <Link
                          to={`/deployments/${dep.id}`}
                          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                          title="Détail des cibles et logs"
                        >
                          <ArrowRight className="w-4 h-4" />
                        </Link>

                        {dep.status !== 'COMPLETED' && dep.status !== 'CANCELLED' && (
                          <button
                            onClick={() => cancelMutation.mutate(dep.id)}
                            className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition"
                            title="Annuler le déploiement"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        )}

                        <button
                          onClick={() => setDeploymentToDelete(dep)}
                          className="p-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-rose-500/30 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                          title="Supprimer ce job de l'historique"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredDeployments.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    Aucun déploiement trouvé pour ce filtre.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Nouveau Déploiement */}
      {showModal && (() => {
        const filteredDevices = devices.filter((dev) => {
          const q = deviceSearch.toLowerCase().trim();
          const matchText =
            !q ||
            dev.hostname.toLowerCase().includes(q) ||
            (dev.ip_address && dev.ip_address.toLowerCase().includes(q));
          const matchOnline =
            deviceFilterOnline === 'all' ||
            (deviceFilterOnline === 'online' ? dev.is_online : !dev.is_online);
          return matchText && matchOnline;
        });

        return (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-150">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
              {/* Modal Header - Fixed */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0 bg-slate-900">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <Rocket className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-100">Nouveau Déploiement</h2>
                    <p className="text-xs text-slate-400">Distribution de scripts, packages et commandes sur le parc</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreate} className="flex flex-col flex-1 min-h-0 overflow-hidden">
                {/* Modal Body - Scrollable */}
                <div className="overflow-y-auto p-6 space-y-5 flex-1 custom-scrollbar">
                  {error && (
                    <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3.5 rounded-xl text-sm flex items-center space-x-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Nom du déploiement
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="ex: Installation 7-Zip v24 ou Exécution Script Audit"
                      className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none"
                    />
                  </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Type d'action
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setDeploymentType('script')}
                    className={`py-2.5 px-3 rounded-xl border text-sm font-semibold flex items-center justify-center space-x-2 ${
                      deploymentType === 'script'
                        ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <Code2 className="w-4 h-4" />
                    <span>Script PS/Python</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeploymentType('package')}
                    className={`py-2.5 px-3 rounded-xl border text-sm font-semibold flex items-center justify-center space-x-2 ${
                      deploymentType === 'package'
                        ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <Package className="w-4 h-4" />
                    <span>Package MSI/EXE</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeploymentType('command')}
                    className={`py-2.5 px-3 rounded-xl border text-sm font-semibold flex items-center justify-center space-x-2 ${
                      deploymentType === 'command'
                        ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <Terminal className="w-4 h-4" />
                    <span>Commande Directe</span>
                  </button>
                </div>
              </div>

              {/* Package Selection */}
              {deploymentType === 'package' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Sélectionner la version de package
                    </label>
                    <select
                      required
                      value={packageVersionId}
                      onChange={(e) => setPackageVersionId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-emerald-500"
                    >
                      <option value="">-- Choisir un package --</option>
                      {packages.map((pkg) => (
                        <optgroup key={pkg.id} label={`${pkg.name} (${pkg.package_type})`}>
                          {pkg.latest_version && (
                            <option value={pkg.latest_version.id}>
                              {pkg.name} — Version {pkg.latest_version.version} ({pkg.latest_version.filename})
                            </option>
                          )}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  {(() => {
                    const selPkg = packages.find(p => p.latest_version?.id === packageVersionId);
                    if (!selPkg || !selPkg.latest_version) return null;
                    const lv = selPkg.latest_version;
                    const isExe = lv.filename?.toLowerCase().endsWith('.exe');
                    const hasArgs = !!lv.package_args && lv.package_args.trim() !== '';

                    return (
                      <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-xs space-y-1.5">
                        <div className="flex justify-between text-slate-400">
                          <span>Fichier cible :</span>
                          <span className="text-cyan-400 font-mono">{lv.filename}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Arguments d'installation :</span>
                          <span className="text-slate-200 font-mono">{hasArgs ? lv.package_args : '(Aucun)'}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Mode d'exécution :</span>
                          <span className={lv.is_interactive ? "text-blue-400 font-semibold flex items-center gap-1" : "text-slate-300 font-medium"}>
                            {lv.is_interactive ? (
                              <>
                                <Monitor className="w-3 h-3 text-blue-400 inline" />
                                <span>Interactif (Interface Graphique)</span>
                              </>
                            ) : (
                              "Silencieux (Arrière-plan)"
                            )}
                          </span>
                        </div>
                        {lv.is_interactive ? (
                          <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-start space-x-2 text-blue-300">
                            <Monitor className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
                            <span>
                              <strong>Mode graphique interactif :</strong> L'assistant d'installation s'affichera sur l'écran de l'utilisateur connecté sur chaque machine ciblée afin qu'il suive les étapes à l'écran.
                            </span>
                          </div>
                        ) : (
                          isExe && !hasArgs && (
                            <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-start space-x-2 text-amber-300">
                              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                              <span>
                                <strong>Mode silencieux automatique :</strong> En Session 0 (service d'arrière-plan sans interface utilisateur), l'agent appliquera <code>/S</code> automatiquement pour éviter tout blocage.
                              </span>
                            </div>
                          )
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Script Selection */}
              {deploymentType === 'script' && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Sélectionner le script
                  </label>
                  <select
                    required
                    value={scriptVersionId}
                    onChange={(e) => setScriptVersionId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-emerald-500"
                  >
                    <option value="">-- Choisir un script --</option>
                    {scripts.map((sc) => (
                      <optgroup key={sc.id} label={`${sc.name} (${sc.language})`}>
                        {sc.latest_version && (
                          <option value={sc.latest_version.id}>
                            {sc.name} — Version v{sc.latest_version.version}
                          </option>
                        )}
                      </optgroup>
                    ))}
                  </select>
                </div>
              )}

              {/* Custom Command with Shell Selector */}
              {deploymentType === 'command' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Terminal & Commande d'exécution
                    </label>
                    <div className="flex rounded-xl bg-slate-950 border border-slate-800 p-0.5 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setCommandShell('cmd')}
                        className={`px-3 py-1 rounded-lg transition flex items-center space-x-1.5 ${
                          commandShell === 'cmd'
                            ? 'bg-slate-800 text-cyan-400 shadow-sm border border-slate-700/50'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Terminal className="w-3.5 h-3.5" />
                        <span>CMD (Invite Windows)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCommandShell('powershell')}
                        className={`px-3 py-1 rounded-lg transition flex items-center space-x-1.5 ${
                          commandShell === 'powershell'
                            ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-sm'
                            : 'text-slate-400 hover:text-blue-400'
                        }`}
                      >
                        <Code2 className="w-3.5 h-3.5" />
                        <span>PowerShell</span>
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <div className="absolute left-3.5 top-3 text-slate-500 font-mono text-xs select-none">
                      {commandShell === 'powershell' ? 'PS >' : 'C:\\>'}
                    </div>
                    <input
                      type="text"
                      required
                      value={customCommand}
                      onChange={(e) => setCustomCommand(e.target.value)}
                      placeholder={
                        commandShell === 'powershell'
                          ? "ex: Test-Connection -ComputerName 8.8.8.8 -Count 4 ou Restart-Service Spooler"
                          : "ex: ping 8.8.8.8 -n 4 ou ipconfig /flushdns"
                      }
                      className={`w-full bg-slate-950 border border-slate-800 font-mono text-sm text-slate-200 rounded-xl pl-12 pr-4 py-2.5 outline-none transition ${
                        commandShell === 'powershell'
                          ? 'focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50'
                          : 'focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50'
                      }`}
                    />
                  </div>

                  <p className="text-[11px] text-slate-500">
                    {commandShell === 'powershell'
                      ? "Exécuté nativement dans l'environnement Windows PowerShell sous privilèges Administrateur (SYSTEM)."
                      : "Exécuté dans l'interpréteur de commandes Windows classique (cmd.exe) sous privilèges Administrateur (SYSTEM)."}
                  </p>
                </div>
              )}

              {/* Targets: Devices selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Machines Cibles ({selectedDeviceIds.length} sélectionnée(s) / {devices.length} total)
                  </label>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => {
                        const filteredIds = filteredDevices.map((d) => d.id);
                        const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedDeviceIds.includes(id));
                        if (allSelected) {
                          setSelectedDeviceIds(selectedDeviceIds.filter((id) => !filteredIds.includes(id)));
                        } else {
                          const newIds = Array.from(new Set([...selectedDeviceIds, ...filteredIds]));
                          setSelectedDeviceIds(newIds);
                        }
                      }}
                      className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold transition"
                    >
                      {filteredDevices.length > 0 && filteredDevices.every((d) => selectedDeviceIds.includes(d.id))
                        ? 'Désélectionner filtrées'
                        : `Sélectionner filtrées (${filteredDevices.length})`}
                    </button>
                    {selectedDeviceIds.length > 0 && (
                      <>
                        <span className="text-slate-600">•</span>
                        <button
                          type="button"
                          onClick={() => setSelectedDeviceIds([])}
                          className="text-xs text-slate-400 hover:text-rose-400 transition"
                        >
                          Tout effacer
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Filter & Search Bar for Target Machines */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Filtrer les machines par nom, IP..."
                      value={deviceSearch}
                      onChange={(e) => setDeviceSearch(e.target.value)}
                      className="w-full pl-9 pr-8 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                    />
                    {deviceSearch && (
                      <button
                        type="button"
                        onClick={() => setDeviceSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex rounded-xl bg-slate-950 border border-slate-800 p-0.5 text-[11px] font-semibold shrink-0">
                    <button
                      type="button"
                      onClick={() => setDeviceFilterOnline('all')}
                      className={`px-2 py-1 rounded-lg transition ${
                        deviceFilterOnline === 'all'
                          ? 'bg-slate-800 text-slate-100'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Tous ({devices.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeviceFilterOnline('online')}
                      className={`px-2 py-1 rounded-lg transition flex items-center space-x-1 ${
                        deviceFilterOnline === 'online'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'text-slate-400 hover:text-emerald-400'
                      }`}
                    >
                      <span>En ligne</span>
                      <span className="font-mono text-[10px]">({devices.filter((d) => d.is_online).length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeviceFilterOnline('offline')}
                      className={`px-2 py-1 rounded-lg transition ${
                        deviceFilterOnline === 'offline'
                          ? 'bg-slate-800 text-slate-300'
                          : 'text-slate-400 hover:text-slate-300'
                      }`}
                    >
                      Hors ligne ({devices.filter((d) => !d.is_online).length})
                    </button>
                  </div>
                </div>

                {/* Machine Checkbox List */}
                <div className="max-h-48 overflow-y-auto border border-slate-800 rounded-xl p-2 bg-slate-950 space-y-1">
                  {filteredDevices.length > 0 ? (
                    filteredDevices.map((dev) => {
                      const isSelected = selectedDeviceIds.includes(dev.id);
                      return (
                        <label
                          key={dev.id}
                          className={`flex items-center space-x-3 p-2 rounded-lg cursor-pointer text-sm transition ${
                            isSelected ? 'bg-slate-900 border border-emerald-500/20' : 'hover:bg-slate-900/60 border border-transparent'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedDeviceIds([...selectedDeviceIds, dev.id]);
                              } else {
                                setSelectedDeviceIds(selectedDeviceIds.filter((id) => id !== dev.id));
                              }
                            }}
                            className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-800"
                          />
                          <div className="flex items-center space-x-2 min-w-0 flex-1">
                            <span className="font-semibold text-slate-200 truncate">{dev.hostname}</span>
                            <span className="text-xs text-slate-500 font-mono shrink-0">({dev.ip_address || '127.0.0.1'})</span>
                          </div>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 font-medium ${
                              dev.is_online ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-500'
                            }`}
                          >
                            {dev.is_online ? 'En ligne' : 'Hors ligne'}
                          </span>
                        </label>
                      );
                    })
                  ) : (
                    <div className="py-6 text-center text-slate-500 text-xs">
                      Aucune machine ne correspond à votre recherche.
                    </div>
                  )}
                </div>
              </div>

              {/* Targets: Groups selection */}
              {groups.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Ou cibler des Groupes entiers
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {groups.map((grp) => (
                      <button
                        key={grp.id}
                        type="button"
                        onClick={() => {
                          if (selectedGroupIds.includes(grp.id)) {
                            setSelectedGroupIds(selectedGroupIds.filter((id) => id !== grp.id));
                          } else {
                            setSelectedGroupIds([...selectedGroupIds, grp.id]);
                          }
                        }}
                        className={`text-xs px-3 py-1.5 rounded-xl border font-semibold transition ${
                          selectedGroupIds.includes(grp.id)
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        {grp.name} ({grp.device_count} machines)
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Wake-on-LAN Option */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center shrink-0">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <span>Réveiller les machines cibles (Wake-on-LAN)</span>
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">UDP Magique</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Émet un paquet magique WoL à chaque machine ciblée avant de distribuer le déploiement.
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wakeOnLan}
                    onChange={(e) => setWakeOnLan(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>

              {/* Concurrency Limit (Vagues de déploiement) */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center shrink-0">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-100 flex items-center gap-2">
                        <span>Régulation de Concurrence (Déploiement par vagues)</span>
                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
                          {maxConcurrency === 0 ? 'Illimité' : `Max ${maxConcurrency} simultanés`}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Limite le nombre de machines téléchargeant et exécutant en même temps afin d'éviter de saturer le serveur et le réseau.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {[
                    { label: '2 machines', value: 2 },
                    { label: '4 machines', value: 4 },
                    { label: '8 (Recommandé)', value: 8 },
                    { label: '16 machines', value: 16 },
                    { label: 'Illimité', value: 0 },
                  ].map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setMaxConcurrency(preset.value)}
                      className={`text-xs px-3 py-1.5 rounded-xl border font-semibold transition ${
                        maxConcurrency === preset.value
                          ? 'bg-purple-600 text-white border-purple-500 shadow-sm shadow-purple-900/40'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                  <div className="flex items-center space-x-1.5 ml-auto">
                    <span className="text-xs text-slate-500">Personnalisé :</span>
                    <input
                      type="number"
                      min={0}
                      max={500}
                      value={maxConcurrency}
                      onChange={(e) => setMaxConcurrency(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-16 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-200 text-center font-mono focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              </div>

              {/* Schedule and Recurrence Selector */}
              <SchedulerSelector value={scheduleConfig} onChange={setScheduleConfig} />

                </div>

                {/* Modal Footer - Fixed */}
                <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-slate-800 shrink-0 bg-slate-950/90">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-sm font-semibold transition"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-lg shadow-emerald-950/50 flex items-center space-x-2 transition disabled:opacity-50"
                  >
                    {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    <Rocket className="w-4 h-4" />
                    <span>Lancer le Déploiement</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
      {/* Modal: Confirmation de suppression individuelle */}
      {deploymentToDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-100">Supprimer le Déploiement</h2>
                <p className="text-xs text-slate-400">Cette action est irréversible</p>
              </div>
            </div>

            <p className="text-sm text-slate-300">
              Confirmez-vous la suppression du job{' '}
              <strong className="text-white font-semibold">"{deploymentToDelete.name}"</strong> et de l'ensemble de ses cibles et logs associés ?
            </p>

            <div className="flex justify-end space-x-3 pt-3">
              <button
                type="button"
                onClick={() => setDeploymentToDelete(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => deleteSingleMutation.mutate(deploymentToDelete.id)}
                disabled={deleteSingleMutation.isPending}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 shadow-lg shadow-rose-600/20"
              >
                {deleteSingleMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Supprimer</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmation de la purge globale des terminés */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-center space-x-3 text-amber-400">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-100">Purger l'Historique</h2>
                <p className="text-xs text-slate-400">Nettoyage des jobs inactifs</p>
              </div>
            </div>

            <p className="text-sm text-slate-300">
              Vous êtes sur le point de supprimer l'ensemble des{' '}
              <strong className="text-white font-bold">{finishedDeploymentsCount} job(s)</strong> actuellement au statut{' '}
              <span className="text-emerald-400 font-semibold">COMPLETED</span> ou{' '}
              <span className="text-slate-400 font-semibold">CANCELLED</span>.
            </p>

            <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-xl text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>Les jobs récurrents actifs ou les déploiements en cours ne seront pas affectés.</span>
            </div>

            <div className="flex justify-end space-x-3 pt-3">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => clearFinishedMutation.mutate()}
                disabled={clearFinishedMutation.isPending}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 shadow-lg shadow-rose-600/20"
              >
                {clearFinishedMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirmer la purge</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmation de la suppression groupée */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-100">Suppression Groupée</h2>
                <p className="text-xs text-slate-400">{selectedIds.length} éléments sélectionnés</p>
              </div>
            </div>

            <p className="text-sm text-slate-300">
              Confirmez-vous la suppression définitive des{' '}
              <strong className="text-white font-bold">{selectedIds.length} job(s)</strong> sélectionnés ?
            </p>

            <div className="flex justify-end space-x-3 pt-3">
              <button
                type="button"
                onClick={() => setShowBulkDeleteConfirm(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => bulkDeleteMutation.mutate(selectedIds)}
                disabled={bulkDeleteMutation.isPending}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 shadow-lg shadow-rose-600/20"
              >
                {bulkDeleteMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Supprimer la sélection</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
