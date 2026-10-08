import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { UserProfileBackup, Device } from '../../types';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import {
  FolderArchive,
  Search,
  RefreshCw,
  Plus,
  Download,
  Trash2,
  HardDrive,
  Monitor,
  User,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Share2,
  ArrowRight,
  ShieldAlert,
  Server,
  Filter,
  Layers,
  FileArchive,
  Info,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';

export const Profiles: React.FC = () => {
  const queryClient = useQueryClient();

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Sorting state
  const [sortKey, setSortKey] = useState<keyof UserProfileBackup>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Modals state
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [selectedBackupForRestore, setSelectedBackupForRestore] = useState<UserProfileBackup | null>(null);
  const [backupToDelete, setBackupToDelete] = useState<UserProfileBackup | null>(null);

  // Backup form state
  const [backupSourceDeviceId, setBackupSourceDeviceId] = useState('');
  const [backupProfileName, setBackupProfileName] = useState('');
  const [backupNotes, setBackupNotes] = useState('');
  const [backupError, setBackupError] = useState<string | null>(null);

  // Restore form state
  const [restoreTargetDeviceId, setRestoreTargetDeviceId] = useState('');
  const [restoreTargetUsername, setRestoreTargetUsername] = useState('');
  const [restoreCreateAccount, setRestoreCreateAccount] = useState(true);
  const [restoreOverwrite, setRestoreOverwrite] = useState(true);
  const [restoreNotes, setRestoreNotes] = useState('');
  const [restoreError, setRestoreError] = useState<string | null>(null);

  // Queries
  const {
    data: backups = [],
    isLoading: loadingBackups,
    refetch: refetchBackups,
    isFetching: fetchingBackups
  } = useQuery({
    queryKey: ['profiles-backups'],
    queryFn: () => api.getProfiles(),
    refetchInterval: 5000,
  });

  const { data: summary } = useQuery({
    queryKey: ['profiles-summary'],
    queryFn: () => api.getProfilesSummary(),
    refetchInterval: 5000,
  });

  const { data: devices = [] } = useQuery({
    queryKey: ['devices-for-profiles'],
    queryFn: api.getDevices,
    staleTime: 30000,
  });

  // Selected device inventory for profile auto-suggestions
  const { data: selectedDeviceInventory } = useQuery({
    queryKey: ['device-inventory-for-backup', backupSourceDeviceId],
    queryFn: () => api.getDeviceInventory(backupSourceDeviceId),
    enabled: !!backupSourceDeviceId,
  });

  // Mutations
  const backupMutation = useMutation({
    mutationFn: api.triggerProfileBackup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles-backups'] });
      queryClient.invalidateQueries({ queryKey: ['profiles-summary'] });
      setShowBackupModal(false);
      setBackupSourceDeviceId('');
      setBackupProfileName('');
      setBackupNotes('');
      setBackupError(null);
    },
    onError: (err: any) => {
      setBackupError(err.response?.data?.detail || 'Erreur lors du lancement de la sauvegarde.');
    },
  });

  const restoreMutation = useMutation({
    mutationFn: ({ backupId, data }: { backupId: string; data: any }) =>
      api.triggerProfileRestore(backupId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles-backups'] });
      queryClient.invalidateQueries({ queryKey: ['profiles-summary'] });
      setShowRestoreModal(false);
      setSelectedBackupForRestore(null);
      setRestoreTargetDeviceId('');
      setRestoreTargetUsername('');
      setRestoreError(null);
    },
    onError: (err: any) => {
      setRestoreError(err.response?.data?.detail || 'Erreur lors du lancement de la restauration.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteProfileBackup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles-backups'] });
      queryClient.invalidateQueries({ queryKey: ['profiles-summary'] });
      setBackupToDelete(null);
    },
  });

  // Format bytes helper
  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 Mo';
    const k = 1024;
    const sizes = ['Octets', 'Ko', 'Mo', 'Go', 'To'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Sorting helper
  const handleSort = (key: keyof UserProfileBackup) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  // Filtered & Sorted backups
  const sortedBackups = useMemo(() => {
    const filtered = backups.filter((b) => {
      const matchSearch =
        b.profile_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.source_hostname.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (b.user_sid && b.user_sid.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (b.notes && b.notes.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'ready'
          ? b.status === 'READY'
          : statusFilter === 'in_progress'
          ? b.status === 'PENDING' || b.status === 'BACKING_UP' || b.status === 'RESTORING'
          : statusFilter === 'failed'
          ? b.status === 'FAILED'
          : true;

      return matchSearch && matchStatus;
    });

    return [...filtered].sort((a, b) => {
      let aVal: any = a[sortKey];
      let bVal: any = b[sortKey];

      if (aVal === undefined || aVal === null) aVal = '';
      if (bVal === undefined || bVal === null) bVal = '';

      if (typeof aVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [backups, searchTerm, statusFilter, sortKey, sortDirection]);

  // Resizable columns hook
  const defaultColWidths = useMemo(
    () => ({
      profile: 260,
      source: 240,
      size: 140,
      date: 180,
      status: 160,
      actions: 200,
    }),
    []
  );

  const { getColStyle, ResizeHandle } = useResizableColumns<
    'profile' | 'source' | 'size' | 'date' | 'status' | 'actions'
  >('profiles_table', defaultColWidths);

  const handleOpenRestore = (backup: UserProfileBackup) => {
    setSelectedBackupForRestore(backup);
    setRestoreTargetUsername(backup.profile_name);
    setRestoreTargetDeviceId('');
    setRestoreCreateAccount(true);
    setRestoreOverwrite(true);
    setRestoreNotes('');
    setRestoreError(null);
    setShowRestoreModal(true);
  };

  const handleConfirmRestore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBackupForRestore || !restoreTargetDeviceId) {
      setRestoreError('Veuillez sélectionner un poste cible.');
      return;
    }
    restoreMutation.mutate({
      backupId: selectedBackupForRestore.id,
      data: {
        target_device_id: restoreTargetDeviceId,
        target_username: restoreTargetUsername || selectedBackupForRestore.profile_name,
        create_local_account: restoreCreateAccount,
        overwrite_existing: restoreOverwrite,
        notes: restoreNotes,
      },
    });
  };

  const handleConfirmBackup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!backupSourceDeviceId) {
      setBackupError('Veuillez sélectionner un poste source.');
      return;
    }
    if (!backupProfileName.trim()) {
      setBackupError('Veuillez renseigner le nom du profil à sauvegarder.');
      return;
    }
    backupMutation.mutate({
      device_id: backupSourceDeviceId,
      profile_name: backupProfileName.trim(),
      notes: backupNotes,
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ========================================================================= */}
      {/* HEADER SECTION                                                            */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
              <FolderArchive className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-100 tracking-tight flex items-center gap-2">
                Sauvegarde & Migration de Profils
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Capture des dossiers utilisateurs, registre NTUSER.DAT et migration instantanée vers d'autres postes.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <button
            onClick={() => refetchBackups()}
            disabled={fetchingBackups}
            className="p-2.5 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-slate-100 rounded-xl transition duration-150 disabled:opacity-50"
            title="Actualiser la liste"
          >
            <RefreshCw className={`w-4 h-4 ${fetchingBackups ? 'animate-spin text-emerald-400' : ''}`} />
          </button>

          <button
            onClick={() => {
              setBackupError(null);
              setShowBackupModal(true);
            }}
            className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-emerald-600/25 transition duration-150"
          >
            <Plus className="w-4 h-4" />
            <span>Sauvegarder un Profil</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* STATS OVERVIEW CARDS                                                      */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Profils</div>
            <div className="text-2xl font-black text-slate-100 mt-1">
              {summary?.total_profiles ?? backups.length}
            </div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Espace Stockage</div>
            <div className="text-2xl font-black text-slate-100 mt-1">
              {formatBytes(summary?.total_size_bytes || 0)}
            </div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <HardDrive className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Profils Prêts</div>
            <div className="text-2xl font-black text-emerald-400 mt-1">
              {summary?.ready_count ?? backups.filter((b) => b.status === 'READY').length}
            </div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">En Cours / Échecs</div>
            <div className="text-2xl font-black text-amber-400 mt-1">
              {summary?.in_progress_count ?? 0}
              <span className="text-xs font-medium text-slate-500 ml-1.5">
                ({summary?.failed_count ?? 0} err)
              </span>
            </div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* FILTER & SEARCH BAR                                                       */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Rechercher par profil, machine source, SID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition duration-150"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-500 hidden sm:block" />
          <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-xl w-full sm:w-auto">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                statusFilter === 'all'
                  ? 'bg-slate-800 text-slate-100 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Tous ({backups.length})
            </button>
            <button
              onClick={() => setStatusFilter('ready')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                statusFilter === 'ready'
                  ? 'bg-emerald-500/20 text-emerald-300 shadow-sm border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Prêts
            </button>
            <button
              onClick={() => setStatusFilter('in_progress')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                statusFilter === 'in_progress'
                  ? 'bg-amber-500/20 text-amber-300 shadow-sm border border-amber-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              En cours
            </button>
            <button
              onClick={() => setStatusFilter('failed')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                statusFilter === 'failed'
                  ? 'bg-red-500/20 text-red-300 shadow-sm border border-red-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Erreurs
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* PROFILES TABLE                                                            */}
      {/* ========================================================================= */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/70 border-b border-slate-800 text-xs font-bold text-slate-400 uppercase tracking-wider select-none">
              <tr>
                {/* Profile Name */}
                <th
                  style={getColStyle('profile')}
                  className="px-5 py-3.5 relative group cursor-pointer"
                  onClick={() => handleSort('profile_name')}
                >
                  <div className="flex items-center space-x-1.5">
                    <span>Profil Utilisateur</span>
                    {sortKey === 'profile_name' && (
                      <span className="text-emerald-400">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                  <ResizeHandle colKey="profile" />
                </th>

                {/* Source Machine */}
                <th
                  style={getColStyle('source')}
                  className="px-5 py-3.5 relative group cursor-pointer"
                  onClick={() => handleSort('source_hostname')}
                >
                  <div className="flex items-center space-x-1.5">
                    <span>Poste Source</span>
                    {sortKey === 'source_hostname' && (
                      <span className="text-emerald-400">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                  <ResizeHandle colKey="source" />
                </th>

                {/* Size */}
                <th
                  style={getColStyle('size')}
                  className="px-5 py-3.5 relative group cursor-pointer"
                  onClick={() => handleSort('size_bytes')}
                >
                  <div className="flex items-center space-x-1.5">
                    <span>Taille</span>
                    {sortKey === 'size_bytes' && (
                      <span className="text-emerald-400">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                  <ResizeHandle colKey="size" />
                </th>

                {/* Date */}
                <th
                  style={getColStyle('date')}
                  className="px-5 py-3.5 relative group cursor-pointer"
                  onClick={() => handleSort('created_at')}
                >
                  <div className="flex items-center space-x-1.5">
                    <span>Date Sauvegarde</span>
                    {sortKey === 'created_at' && (
                      <span className="text-emerald-400">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                  <ResizeHandle colKey="date" />
                </th>

                {/* Status */}
                <th
                  style={getColStyle('status')}
                  className="px-5 py-3.5 relative group cursor-pointer"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center space-x-1.5">
                    <span>Statut</span>
                    {sortKey === 'status' && (
                      <span className="text-emerald-400">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                  <ResizeHandle colKey="status" />
                </th>

                {/* Actions */}
                <th style={getColStyle('actions')} className="px-5 py-3.5 text-right">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/60">
              {loadingBackups ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mx-auto mb-2" />
                    Chargement des profils sauvegardés...
                  </td>
                </tr>
              ) : sortedBackups.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <FileArchive className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                    <div className="text-base font-medium text-slate-300">Aucun profil trouvé</div>
                    <p className="text-xs text-slate-500 mt-1">
                      {searchTerm || statusFilter !== 'all'
                        ? 'Aucun résultat ne correspond à vos filtres.'
                        : 'Commencez par sauvegarder un profil utilisateur depuis un poste Windows.'}
                    </p>
                  </td>
                </tr>
              ) : (
                sortedBackups.map((backup) => {
                  const isReady = backup.status === 'READY';
                  const isInProgress = backup.status === 'BACKING_UP' || backup.status === 'RESTORING' || backup.status === 'PENDING';
                  const isFailed = backup.status === 'FAILED';

                  return (
                    <tr
                      key={backup.id}
                      className="hover:bg-slate-800/40 transition duration-150 group"
                    >
                      {/* Profile Name & SID */}
                      <td className="px-5 py-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white font-bold text-sm shadow-sm flex-shrink-0">
                            {backup.profile_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-100 truncate flex items-center gap-1.5">
                              <span>{backup.profile_name}</span>
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono truncate">
                              {backup.user_sid || 'SID non spécifié'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Source Hostname & OS */}
                      <td className="px-5 py-4">
                        <div className="flex items-center space-x-2">
                          <Monitor className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-200 truncate">
                              {backup.source_hostname}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {backup.source_os || 'Windows'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Size */}
                      <td className="px-5 py-4">
                        <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-300">
                          <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                          <span>{formatBytes(backup.size_bytes)}</span>
                        </div>
                      </td>

                      {/* Date */}
                      <td className="px-5 py-4">
                        <div className="text-xs text-slate-300 font-medium">
                          {new Date(backup.created_at).toLocaleDateString('fr-FR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {new Date(backup.created_at).toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        {isReady && (
                          <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Prêt</span>
                          </span>
                        )}
                        {isInProgress && (
                          <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>
                              {backup.status === 'BACKING_UP'
                                ? 'Sauvegarde...'
                                : backup.status === 'RESTORING'
                                ? 'Restauration...'
                                : 'En attente...'}
                            </span>
                          </span>
                        )}
                        {isFailed && (
                          <span
                            className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20"
                            title={backup.error_message || 'Échec'}
                          >
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>Échec</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleOpenRestore(backup)}
                            disabled={!isReady}
                            className="inline-flex items-center space-x-1 px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-lg shadow-sm transition duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Restaurer ou migrer ce profil vers une autre machine"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                            <span>Restaurer</span>
                          </button>

                          {isReady && (
                            <a
                              href={api.getProfileDownloadUrl(backup.id)}
                              download
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-slate-100 rounded-lg transition"
                              title="Télécharger l'archive ZIP du profil"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          )}

                          <button
                            onClick={() => setBackupToDelete(backup)}
                            className="p-1.5 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg transition"
                            title="Supprimer la sauvegarde"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL : SAUVEGARDER UN PROFIL                                             */}
      {/* ========================================================================= */}
      {showBackupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
              <div className="flex items-center space-x-2.5">
                <FolderArchive className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-slate-100">Sauvegarder un Profil Windows</h3>
              </div>
              <button
                onClick={() => setShowBackupModal(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmBackup} className="p-6 space-y-4">
              {backupError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{backupError}</span>
                </div>
              )}

              {/* Source Device */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  1. Poste Windows Source *
                </label>
                <select
                  value={backupSourceDeviceId}
                  onChange={(e) => {
                    setBackupSourceDeviceId(e.target.value);
                    setBackupProfileName('');
                  }}
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Sélectionner une machine du parc...</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.hostname} ({d.ip_address || 'IP inconnue'}) — {d.is_online ? '🟢 En ligne' : '⚪ Hors ligne'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Profile Name & Auto-suggestions */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  2. Nom du Profil / Utilisateur Windows *
                </label>
                <input
                  type="text"
                  placeholder="ex: jdupont, prof01 ou Administrateur"
                  value={backupProfileName}
                  onChange={(e) => setBackupProfileName(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                />

                {/* Suggestions from inventory */}
                {selectedDeviceInventory?.local_users && selectedDeviceInventory.local_users.length > 0 && (
                  <div className="mt-2">
                    <div className="text-[11px] text-slate-500 mb-1 font-medium">Comptes détectés sur ce poste :</div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedDeviceInventory.local_users.map((u: any) => (
                        <button
                          type="button"
                          key={u.name}
                          onClick={() => setBackupProfileName(u.name)}
                          className={`px-2 py-0.5 rounded text-xs font-mono transition ${
                            backupProfileName === u.name
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {u.name} {u.is_admin ? '🛡️' : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  3. Notes / Description (Optionnel)
                </label>
                <textarea
                  rows={2}
                  placeholder="ex: Sauvegarde avant formatage salle 102..."
                  value={backupNotes}
                  onChange={(e) => setBackupNotes(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl text-xs text-slate-400 space-y-1">
                <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-blue-400" />
                  <span>Dossiers et paramètres inclus :</span>
                </div>
                <p>
                  Documents, Bureau, Téléchargements, Images, AppData/Roaming, registre NTUSER.DAT (HKCU). Les caches et fichiers temporaires sont automatiquement purgés.
                </p>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowBackupModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold rounded-xl transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={backupMutation.isPending}
                  className="flex items-center space-x-2 px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-emerald-600/25 transition disabled:opacity-50"
                >
                  {backupMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Envoi de l'ordre...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Lancer la Sauvegarde</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL : RESTAURER / MIGRER UN PROFIL                                      */}
      {/* ========================================================================= */}
      {showRestoreModal && selectedBackupForRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
              <div className="flex items-center space-x-2.5">
                <Share2 className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-slate-100">Restaurer / Migrer le Profil</h3>
              </div>
              <button
                onClick={() => setShowRestoreModal(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmRestore} className="p-6 space-y-4">
              {restoreError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{restoreError}</span>
                </div>
              )}

              {/* Selected Profile Summary Box */}
              <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
                    {selectedBackupForRestore.profile_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold text-blue-200 text-sm">{selectedBackupForRestore.profile_name}</div>
                    <div className="text-[11px] text-blue-400">
                      Origine : {selectedBackupForRestore.source_hostname} • {formatBytes(selectedBackupForRestore.size_bytes)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Target Device */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  1. Poste Windows Cible *
                </label>
                <select
                  value={restoreTargetDeviceId}
                  onChange={(e) => setRestoreTargetDeviceId(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="">Sélectionner la machine de destination...</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.hostname} ({d.ip_address || 'IP inconnue'}) — {d.is_online ? '🟢 En ligne' : '⚪ Hors ligne'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Target Username */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  2. Nom du compte sur la machine cible
                </label>
                <input
                  type="text"
                  placeholder="ex: jdupont"
                  value={restoreTargetUsername}
                  onChange={(e) => setRestoreTargetUsername(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Le profil sera injecté dans <code className="text-slate-300 font-mono">C:\Users\{restoreTargetUsername || selectedBackupForRestore.profile_name}</code>.
                </span>
              </div>

              {/* Options */}
              <div className="space-y-2.5 pt-2">
                <label className="flex items-center space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={restoreCreateAccount}
                    onChange={(e) => setRestoreCreateAccount(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 bg-slate-950 border-slate-800 focus:ring-0 focus:ring-offset-0"
                  />
                  <span className="text-xs text-slate-300 font-medium">
                    Créer le compte local Windows automatiquement s'il n'existe pas encore
                  </span>
                </label>

                <label className="flex items-center space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={restoreOverwrite}
                    onChange={(e) => setRestoreOverwrite(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 bg-slate-950 border-slate-800 focus:ring-0 focus:ring-offset-0"
                  />
                  <span className="text-xs text-slate-300 font-medium">
                    Écraser les fichiers existants et réattribuer les permissions NTFS (icacls)
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRestoreModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold rounded-xl transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={restoreMutation.isPending}
                  className="flex items-center space-x-2 px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-blue-600/25 transition disabled:opacity-50"
                >
                  {restoreMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Déploiement en cours...</span>
                    </>
                  ) : (
                    <>
                      <ArrowRight className="w-4 h-4" />
                      <span>Lancer la Migration</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL : CONFIRMATION SUPPRESSION                                          */}
      {/* ========================================================================= */}
      {backupToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-slate-100">Supprimer la sauvegarde ?</h3>
              <p className="text-xs text-slate-400 mt-1">
                Êtes-vous sûr de vouloir supprimer définitivement la sauvegarde du profil{' '}
                <strong className="text-slate-200">"{backupToDelete.profile_name}"</strong> ({backupToDelete.source_hostname}) ?
                Cette action est irréversible.
              </p>
            </div>

            <div className="flex items-center justify-center space-x-3 pt-2">
              <button
                onClick={() => setBackupToDelete(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold rounded-xl transition"
              >
                Annuler
              </button>
              <button
                onClick={() => deleteMutation.mutate(backupToDelete.id)}
                disabled={deleteMutation.isPending}
                className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-red-600/25 transition disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Suppression...' : 'Supprimer Définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
