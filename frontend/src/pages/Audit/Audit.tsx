import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import {
  Download,
  Trash2,
  RefreshCw,
  Search,
  CheckSquare,
  Square,
  AlertTriangle,
  FileText,
  Loader2,
  CheckCircle2,
  X,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { AuditLog } from '../../types';
import { useResizableColumns } from '../../hooks/useResizableColumns';

export const Audit: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const { getColStyle, ResizeHandle } = useResizableColumns<
    'created_at' | 'action' | 'user_username' | 'entity_type' | 'details' | 'ip_address' | 'actions'
  >('audit_logs', {
    created_at: 160,
    action: 180,
    user_username: 180,
    entity_type: 180,
    details: 260,
    ip_address: 140,
    actions: 100,
  });

  // Sorting state
  const [sortBy, setSortBy] = useState<'created_at' | 'action' | 'user_username' | 'entity_type' | 'ip_address'>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Modals state
  const [showClearModal, setShowClearModal] = useState(false);
  const [autoExportOnClear, setAutoExportOnClear] = useState(true);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [autoExportOnBulkDelete, setAutoExportOnBulkDelete] = useState(true);
  const [logToDelete, setLogToDelete] = useState<AuditLog | null>(null);

  const { data: logs = [], isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: api.getAuditLogs,
    refetchInterval: 15000,
  });

  // Filtered logs
  const filteredLogs = useMemo(() => {
    if (!searchTerm.trim()) return logs;
    const term = searchTerm.toLowerCase();
    return logs.filter((log) => {
      const matchAction = log.action?.toLowerCase().includes(term);
      const matchUser = log.user_username?.toLowerCase().includes(term);
      const matchEntity = log.entity_type?.toLowerCase().includes(term) || log.entity_id?.toLowerCase().includes(term);
      const matchIp = log.ip_address?.toLowerCase().includes(term);
      const matchDetails = log.details ? JSON.stringify(log.details).toLowerCase().includes(term) : false;
      return matchAction || matchUser || matchEntity || matchIp || matchDetails;
    });
  }, [logs, searchTerm]);

  // Sorted logs
  const sortedLogs = useMemo(() => {
    const list = [...filteredLogs];
    return list.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'created_at') {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        comparison = timeA - timeB;
      } else if (sortBy === 'action') {
        comparison = (a.action || '').localeCompare(b.action || '', undefined, { sensitivity: 'base' });
      } else if (sortBy === 'user_username') {
        const uA = a.user_username || 'Système / Agent';
        const uB = b.user_username || 'Système / Agent';
        comparison = uA.localeCompare(uB, undefined, { sensitivity: 'base' });
      } else if (sortBy === 'entity_type') {
        const eA = `${a.entity_type || ''} ${a.entity_id || ''}`;
        const eB = `${b.entity_type || ''} ${b.entity_id || ''}`;
        comparison = eA.localeCompare(eB, undefined, { sensitivity: 'base' });
      } else if (sortBy === 'ip_address') {
        comparison = (a.ip_address || '').localeCompare(b.ip_address || '', undefined, { numeric: true });
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredLogs, sortBy, sortDirection]);

  const handleSort = (field: 'created_at' | 'action' | 'user_username' | 'entity_type' | 'ip_address') => {
    if (sortBy === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDirection(field === 'created_at' ? 'desc' : 'asc');
    }
  };

  const getSortIcon = (field: 'created_at' | 'action' | 'user_username' | 'entity_type' | 'ip_address') => {
    if (sortBy !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 opacity-60" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-cyan-400" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-cyan-400" />
    );
  };

  // Export full audit log
  const handleExportFull = async () => {
    try {
      const blob = await api.exportAuditLogs();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      a.download = `mapt_audit_logs_${timestamp}.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Erreur lors de l'export du journal d'audit:", err);
      alert("Erreur lors du téléchargement de l'export d'audit.");
    }
  };

  // Export selected audit logs
  const handleExportSelection = (selectedLogs: AuditLog[]) => {
    if (selectedLogs.length === 0) return;
    const lines: string[] = [];
    lines.push('='.repeat(100));
    lines.push(' MAPT - JOURNAL D\'AUDIT (EXTRAIT SÉLECTIONNÉ)');
    lines.push(` Exporté le : ${new Date().toISOString()} UTC`);
    lines.push(` Nombre d'événements exportés : ${selectedLogs.length}`);
    lines.push('='.repeat(100));
    lines.push('');

    for (const log of selectedLogs) {
      const userDisplay = log.user_username || 'SYSTÈME/AGENT';
      const dateStr = log.created_at || 'DATE_INCONNUE';
      const ipStr = log.ip_address || '127.0.0.1';
      const detailsStr = log.details ? JSON.stringify(log.details, null, 2) : '-';
      lines.push(`[${dateStr}] [IP: ${ipStr.padEnd(15)}] [UTILISATEUR: ${userDisplay.padEnd(15)}] [ACTION: ${log.action.padEnd(25)}] [ENTITÉ: ${log.entity_type} ${log.entity_id || ''}]`);
      if (log.details) {
        lines.push(`   ↳ DÉTAILS : ${detailsStr}`);
      }
      lines.push('-'.repeat(100));
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.download = `mapt_audit_selection_${timestamp}.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  // Single delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteAuditLog(id),
    onSuccess: () => {
      setLogToDelete(null);
      setSelectedIds((prev) => prev.filter((id) => id !== logToDelete?.id));
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async ({ ids, autoExport }: { ids: string[]; autoExport: boolean }) => {
      if (autoExport) {
        const selectedLogs = logs.filter((l) => ids.includes(l.id));
        handleExportSelection(selectedLogs);
      }
      return api.bulkDeleteAuditLogs(ids);
    },
    onSuccess: () => {
      setSelectedIds([]);
      setShowBulkDeleteModal(false);
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });

  // Clear all mutation
  const clearAllMutation = useMutation({
    mutationFn: async (autoExport: boolean) => {
      if (autoExport) {
        await handleExportFull();
      }
      return api.clearAuditLogs();
    },
    onSuccess: () => {
      setSelectedIds([]);
      setShowClearModal(false);
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });

  // Selection toggle handlers
  const handleSelectAll = () => {
    if (selectedIds.length === filteredLogs.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredLogs.map((l) => l.id));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const isAllSelected = filteredLogs.length > 0 && selectedIds.length === filteredLogs.length;
  const isIndeterminate = selectedIds.length > 0 && selectedIds.length < filteredLogs.length;

  const getActionBadgeColor = (action: string) => {
    const act = action.toUpperCase();
    if (act.includes('DELETE') || act.includes('REMOVE') || act.includes('CANCEL')) {
      return 'bg-rose-950/80 text-rose-400 border-rose-800/60';
    }
    if (act.includes('WOL') || act.includes('WAKE')) {
      return 'bg-amber-950/80 text-amber-400 border-amber-700/60';
    }
    if (act.includes('CREATE') || act.includes('ADD') || act.includes('ENROLL')) {
      return 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60';
    }
    if (act.includes('UPDATE') || act.includes('EDIT') || act.includes('MODIFY')) {
      return 'bg-amber-950/80 text-amber-400 border-amber-800/60';
    }
    if (act.includes('AUTH') || act.includes('LOGIN')) {
      return 'bg-indigo-950/80 text-indigo-400 border-indigo-800/60';
    }
    if (act.includes('DEPLOY')) {
      return 'bg-cyan-950/80 text-cyan-400 border-cyan-800/60';
    }
    return 'bg-slate-950 text-slate-300 border-slate-800';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight flex items-center gap-3">
            <span>Journal d’Audit</span>
            <span className="text-xs font-mono font-medium px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400">
              {logs.length} entrée{logs.length > 1 ? 's' : ''}
            </span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Traçabilité immuable de toutes les actions administratives, scripts et déploiements
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Refresh button */}
          <button
            onClick={() => refetch()}
            disabled={isLoading || isRefetching}
            className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 px-3.5 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-50"
            title="Actualiser les événements"
          >
            <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin text-cyan-400' : ''}`} />
            <span>Actualiser</span>
          </button>

          {/* Export button */}
          <button
            onClick={handleExportFull}
            disabled={logs.length === 0}
            className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-cyan-400 border border-cyan-500/30 hover:border-cyan-500/50 px-3.5 py-2 rounded-xl text-sm font-semibold transition shadow-sm disabled:opacity-40 disabled:hover:border-cyan-500/30"
          >
            <Download className="w-4 h-4" />
            <span>Exporter (.txt)</span>
          </button>

          {/* Purge / Clear all button */}
          <button
            onClick={() => setShowClearModal(true)}
            disabled={logs.length === 0}
            className="flex items-center space-x-2 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/50 hover:border-rose-600 px-3.5 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-40"
          >
            <Trash2 className="w-4 h-4" />
            <span>Purger le journal</span>
          </button>
        </div>
      </div>

      {/* Filter / Search Bar & Quick Sort */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrer par action, utilisateur, entité, IP, détails..."
            className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Tri sélecteur rapide */}
          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <ArrowUpDown className="w-4 h-4 text-slate-500 shrink-0" />
            <select
              value={`${sortBy}_${sortDirection}`}
              onChange={(e) => {
                const [field, dir] = e.target.value.split('_') as [any, any];
                setSortBy(field);
                setSortDirection(dir);
              }}
              className="bg-slate-900 border border-slate-800 text-slate-300 text-xs rounded-xl px-3 py-2 outline-none focus:border-cyan-500 w-full sm:w-auto"
            >
              <option value="created_at_desc">Tri : Horodatage (Plus récent)</option>
              <option value="created_at_asc">Tri : Horodatage (Plus ancien)</option>
              <option value="action_asc">Tri : Action (A → Z)</option>
              <option value="action_desc">Tri : Action (Z → A)</option>
              <option value="user_username_asc">Tri : Utilisateur (A → Z)</option>
              <option value="user_username_desc">Tri : Utilisateur (Z → A)</option>
              <option value="entity_type_asc">Tri : Cible / Entité</option>
              <option value="ip_address_asc">Tri : Adresse IP</option>
            </select>
          </div>

          {searchTerm && (
            <div className="text-xs text-slate-400 whitespace-nowrap">
              {filteredLogs.length} résultat{filteredLogs.length > 1 ? 's' : ''} sur {logs.length}
            </div>
          )}
        </div>
      </div>

      {/* Bulk selection toolbar */}
      {selectedIds.length > 0 && (
        <div className="bg-cyan-950/40 border border-cyan-500/40 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-3 text-sm text-cyan-200 font-medium">
            <span className="bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-md font-mono text-xs font-bold border border-cyan-500/30">
              {selectedIds.length}
            </span>
            <span>événement{selectedIds.length > 1 ? 's' : ''} sélectionné{selectedIds.length > 1 ? 's' : ''}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const selected = logs.filter((l) => selectedIds.includes(l.id));
                handleExportSelection(selected);
              }}
              className="flex items-center space-x-1.5 bg-cyan-900/40 hover:bg-cyan-900/70 text-cyan-300 border border-cyan-700/50 px-3 py-1.5 rounded-lg text-xs font-semibold transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exporter sélection</span>
            </button>

            <button
              onClick={() => setShowBulkDeleteModal(true)}
              className="flex items-center space-x-1.5 bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-700/60 px-3 py-1.5 rounded-lg text-xs font-semibold transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Supprimer sélection</span>
            </button>

            <button
              onClick={() => setSelectedIds([])}
              className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1.5 ml-1 transition"
            >
              Désélectionner
            </button>
          </div>
        </div>
      )}

      {/* Audit Logs Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/90 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="w-10 px-4 py-4 text-center">
                  <button
                    onClick={handleSelectAll}
                    className="text-slate-400 hover:text-slate-200 transition focus:outline-none"
                    title={isAllSelected ? "Tout désélectionner" : "Tout sélectionner"}
                  >
                    {isAllSelected ? (
                      <CheckSquare className="w-4 h-4 text-cyan-400" />
                    ) : isIndeterminate ? (
                      <div className="w-4 h-4 border-2 border-cyan-400 bg-cyan-950/50 rounded flex items-center justify-center">
                        <div className="w-2 h-0.5 bg-cyan-400" />
                      </div>
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>

                {/* Tri par Horodatage */}
                <th
                  onClick={() => handleSort('created_at')}
                  style={getColStyle('created_at')}
                  className="px-5 py-4 cursor-pointer hover:bg-slate-900/80 transition select-none relative group/th"
                  title="Cliquer pour trier par Horodatage"
                >
                  <div className="flex items-center space-x-2 pr-2">
                    <span>Horodatage</span>
                    {getSortIcon('created_at')}
                  </div>
                  <ResizeHandle colKey="created_at" />
                </th>

                {/* Tri par Action */}
                <th
                  onClick={() => handleSort('action')}
                  style={getColStyle('action')}
                  className="px-5 py-4 cursor-pointer hover:bg-slate-900/80 transition select-none relative group/th"
                  title="Cliquer pour trier par Action"
                >
                  <div className="flex items-center space-x-2 pr-2">
                    <span>Action</span>
                    {getSortIcon('action')}
                  </div>
                  <ResizeHandle colKey="action" />
                </th>

                {/* Tri par Utilisateur */}
                <th
                  onClick={() => handleSort('user_username')}
                  style={getColStyle('user_username')}
                  className="px-5 py-4 cursor-pointer hover:bg-slate-900/80 transition select-none relative group/th"
                  title="Cliquer pour trier par Utilisateur / Initiateur"
                >
                  <div className="flex items-center space-x-2 pr-2">
                    <span>Utilisateur / Initiateur</span>
                    {getSortIcon('user_username')}
                  </div>
                  <ResizeHandle colKey="user_username" />
                </th>

                {/* Tri par Cible / Entité */}
                <th
                  onClick={() => handleSort('entity_type')}
                  style={getColStyle('entity_type')}
                  className="px-5 py-4 cursor-pointer hover:bg-slate-900/80 transition select-none relative group/th"
                  title="Cliquer pour trier par Cible / Entité"
                >
                  <div className="flex items-center space-x-2 pr-2">
                    <span>Cible / Entité</span>
                    {getSortIcon('entity_type')}
                  </div>
                  <ResizeHandle colKey="entity_type" />
                </th>

                <th style={getColStyle('details')} className="px-5 py-4 relative group/th">
                  <span>Détails</span>
                  <ResizeHandle colKey="details" />
                </th>

                {/* Tri par Adresse IP */}
                <th
                  onClick={() => handleSort('ip_address')}
                  style={getColStyle('ip_address')}
                  className="px-5 py-4 cursor-pointer hover:bg-slate-900/80 transition select-none relative group/th"
                  title="Cliquer pour trier par Adresse IP"
                >
                  <div className="flex items-center space-x-2 pr-2">
                    <span>Adresse IP</span>
                    {getSortIcon('ip_address')}
                  </div>
                  <ResizeHandle colKey="ip_address" />
                </th>

                <th style={getColStyle('actions')} className="px-4 py-4 text-right relative group/th">
                  <span>Actions</span>
                  <ResizeHandle colKey="actions" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {sortedLogs.map((log) => {
                const isSelected = selectedIds.includes(log.id);
                const isExpanded = expandedLogId === log.id;

                return (
                  <React.Fragment key={log.id}>
                    <tr
                      className={`transition ${
                        isSelected
                          ? 'bg-cyan-950/20 hover:bg-cyan-950/30'
                          : 'hover:bg-slate-850/50'
                      }`}
                    >
                      {/* Select checkbox */}
                      <td className="px-4 py-4 text-center">
                        <button
                          onClick={() => handleToggleSelect(log.id)}
                          className="text-slate-500 hover:text-slate-300 transition focus:outline-none"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-cyan-400" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* Timestamp */}
                      <td className="px-5 py-4 text-xs font-mono text-slate-400 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('fr-FR', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>

                      {/* Action */}
                      <td className="px-5 py-4">
                        <span
                          className={`inline-block font-mono text-xs font-bold px-2 py-0.5 rounded border ${getActionBadgeColor(
                            log.action
                          )}`}
                        >
                          {log.action}
                        </span>
                      </td>

                      {/* User */}
                      <td className="px-5 py-4 text-xs">
                        <div className="flex items-center space-x-2">
                          <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 text-[10px] font-bold">
                            {log.user_username ? log.user_username.charAt(0).toUpperCase() : 'S'}
                          </div>
                          <span className="font-semibold text-slate-200">
                            {log.user_username || 'Système / Agent'}
                          </span>
                        </div>
                      </td>

                      {/* Entity */}
                      <td className="px-5 py-4 text-xs">
                        <div className="font-mono text-slate-300 uppercase font-semibold">
                          {log.entity_type}
                        </div>
                        {log.entity_id && (
                          <div className="text-[10px] text-slate-500 font-mono truncate max-w-[120px]" title={log.entity_id}>
                            {log.entity_id}
                          </div>
                        )}
                      </td>

                      {/* Details */}
                      <td className="px-5 py-4 text-xs">
                        {log.details ? (
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400 font-mono truncate max-w-[220px] block">
                              {JSON.stringify(log.details)}
                            </span>
                            <button
                              onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                              className="text-cyan-400 hover:text-cyan-300 p-1 rounded hover:bg-slate-800 transition"
                              title={isExpanded ? "Masquer les détails" : "Voir les détails complets"}
                            >
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      {/* IP */}
                      <td className="px-5 py-4 text-xs font-mono text-slate-500">
                        {log.ip_address || '127.0.0.1'}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleExportSelection([log])}
                            className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded-lg transition"
                            title="Exporter cet événement (.txt)"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setLogToDelete(log)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition"
                            title="Supprimer cet événement"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded details row */}
                    {isExpanded && log.details && (
                      <tr className="bg-slate-950/60 border-y border-slate-800">
                        <td colSpan={8} className="px-8 py-3">
                          <div className="text-xs">
                            <div className="text-slate-400 font-bold mb-1 flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-cyan-400" />
                              <span>Contenu détaillé du journal :</span>
                            </div>
                            <pre className="bg-slate-900 border border-slate-800 p-3 rounded-xl text-emerald-400 font-mono text-[11px] overflow-x-auto max-h-48">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {filteredLogs.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                    {searchTerm
                      ? `Aucun événement d'audit ne correspond à la recherche "${searchTerm}".`
                      : "Aucun événement d'audit enregistré."}
                  </td>
                </tr>
              )}

              {isLoading && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex items-center justify-center space-x-2">
                      <Loader2 className="w-5 h-5 animate-spin text-cyan-500" />
                      <span>Chargement du journal d'audit...</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal: Clear All Audit Logs */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="p-3 bg-rose-950/60 border border-rose-800/50 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-rose-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-100">Purger tout le journal d'audit</h3>
                <p className="text-xs text-rose-400/90 font-medium">Action irréversible</p>
              </div>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              Êtes-vous certain de vouloir supprimer l'intégralité des <span className="font-bold text-white font-mono">{logs.length}</span> entrées du journal d'audit ?
            </p>

            {/* Auto-export checkbox option */}
            <div
              onClick={() => setAutoExportOnClear(!autoExportOnClear)}
              className="flex items-start space-x-3 p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl cursor-pointer hover:border-cyan-500/40 transition"
            >
              <div className="pt-0.5">
                {autoExportOnClear ? (
                  <CheckSquare className="w-4 h-4 text-cyan-400" />
                ) : (
                  <Square className="w-4 h-4 text-slate-500" />
                )}
              </div>
              <div className="text-xs">
                <span className="font-semibold text-slate-200 block">
                  Télécharger un fichier de sauvegarde (.txt) avant la suppression
                </span>
                <span className="text-slate-400 text-[11px] block mt-0.5">
                  Conserve une copie complète et datée de tous les journaux sur votre ordinateur.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowClearModal(false)}
                disabled={clearAllMutation.isPending}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => clearAllMutation.mutate(autoExportOnClear)}
                disabled={clearAllMutation.isPending}
                className="flex items-center space-x-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl transition shadow-lg shadow-rose-900/30 disabled:opacity-50"
              >
                {clearAllMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Purger définitivement</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Bulk Delete Selection */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="p-3 bg-rose-950/60 border border-rose-800/50 rounded-xl">
                <Trash2 className="w-6 h-6 text-rose-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-100">Supprimer la sélection</h3>
                <p className="text-xs text-rose-400/90 font-medium">
                  {selectedIds.length} événement{selectedIds.length > 1 ? 's' : ''} sélectionné{selectedIds.length > 1 ? 's' : ''}
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              Voulez-vous supprimer les <span className="font-bold text-white font-mono">{selectedIds.length}</span> entrées sélectionnées du journal d'audit ?
            </p>

            {/* Auto-export checkbox option */}
            <div
              onClick={() => setAutoExportOnBulkDelete(!autoExportOnBulkDelete)}
              className="flex items-start space-x-3 p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl cursor-pointer hover:border-cyan-500/40 transition"
            >
              <div className="pt-0.5">
                {autoExportOnBulkDelete ? (
                  <CheckSquare className="w-4 h-4 text-cyan-400" />
                ) : (
                  <Square className="w-4 h-4 text-slate-500" />
                )}
              </div>
              <div className="text-xs">
                <span className="font-semibold text-slate-200 block">
                  Télécharger une copie .txt de cette sélection avant suppression
                </span>
                <span className="text-slate-400 text-[11px] block mt-0.5">
                  Génère un export texte structuré contenant ces {selectedIds.length} événements.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowBulkDeleteModal(false)}
                disabled={bulkDeleteMutation.isPending}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() =>
                  bulkDeleteMutation.mutate({
                    ids: selectedIds,
                    autoExport: autoExportOnBulkDelete,
                  })
                }
                disabled={bulkDeleteMutation.isPending}
                className="flex items-center space-x-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl transition shadow-lg shadow-rose-900/30 disabled:opacity-50"
              >
                {bulkDeleteMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Supprimer la sélection</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Delete Single Log */}
      {logToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="p-2.5 bg-rose-950/60 border border-rose-800/50 rounded-xl">
                <Trash2 className="w-5 h-5 text-rose-500" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">Supprimer cet événement</h3>
                <p className="text-xs font-mono text-slate-400">{logToDelete.action}</p>
              </div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl text-xs space-y-1.5 text-slate-300">
              <div><span className="text-slate-500">Date:</span> {new Date(logToDelete.created_at).toLocaleString()}</div>
              <div><span className="text-slate-500">Utilisateur:</span> {logToDelete.user_username || 'Système'}</div>
              <div><span className="text-slate-500">Entité:</span> {logToDelete.entity_type} {logToDelete.entity_id || ''}</div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setLogToDelete(null)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(logToDelete.id)}
                disabled={deleteMutation.isPending}
                className="flex items-center space-x-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl transition disabled:opacity-50"
              >
                {deleteMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Supprimer</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
