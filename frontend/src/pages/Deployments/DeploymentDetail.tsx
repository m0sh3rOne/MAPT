import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import {
  Rocket,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCw,
  FileText,
  AlertTriangle,
  Loader2,
  Terminal,
  Ban,
  Trash2,
  X
} from 'lucide-react';

export const DeploymentDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [selectedTargetLogs, setSelectedTargetLogs] = useState<{ id: string; hostname: string } | null>(null);

  const { data: deployment, isLoading: loadingDep } = useQuery({
    queryKey: ['deployment', id],
    queryFn: () => api.getDeployment(id!),
    enabled: !!id,
    refetchInterval: 3000,
  });

  const { data: targets = [], isLoading: loadingTargets } = useQuery({
    queryKey: ['deployment-targets', id],
    queryFn: () => api.getDeploymentTargets(id!),
    enabled: !!id,
    refetchInterval: 3000,
  });

  const { data: logs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ['target-logs', id, selectedTargetLogs?.id],
    queryFn: () => api.getTargetLogs(id!, selectedTargetLogs!.id),
    enabled: !!selectedTargetLogs,
    refetchInterval: 2000,
  });

  const retryMutation = useMutation({
    mutationFn: (targetId: string) => api.retryDeploymentTarget(id!, targetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployment-targets', id] });
      queryClient.invalidateQueries({ queryKey: ['deployment', id] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.cancelDeployment(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployment-targets', id] });
      queryClient.invalidateQueries({ queryKey: ['deployment', id] });
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
    },
  });

  const cancelTargetMutation = useMutation({
    mutationFn: (targetId: string) => api.cancelDeploymentTarget(id!, targetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployment-targets', id] });
      queryClient.invalidateQueries({ queryKey: ['deployment', id] });
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
    },
  });

  if (loadingDep || !deployment) {
    return <div className="py-12 text-center text-slate-500">Chargement du déploiement...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link
            to="/deployments"
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-black text-slate-100 tracking-tight">{deployment.name}</h1>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                deployment.status === 'COMPLETED'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : deployment.status === 'RUNNING'
                  ? 'bg-purple-500/10 text-purple-400 border-purple-500/20 animate-pulse'
                  : deployment.status === 'CANCELLED'
                  ? 'bg-slate-800 text-slate-500 border-slate-700'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              }`}>
                {deployment.status}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Type : <span className="uppercase font-mono text-slate-300">{deployment.deployment_type}</span> • Créé le {new Date(deployment.created_at).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Global Cancel / Interrupt Action */}
        {deployment.status !== 'COMPLETED' && deployment.status !== 'CANCELLED' && (
          <button
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending}
            className="flex items-center space-x-2 px-4 py-2 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 hover:text-rose-200 rounded-xl text-xs font-bold transition shadow-lg shadow-rose-950/40"
            title="Interrompre et annuler toutes les cibles en attente ou en cours"
          >
            {cancelMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Ban className="w-4 h-4 text-rose-400" />
            )}
            <span>Interrompre / Annuler le Déploiement</span>
          </button>
        )}
      </div>

      {/* KPI Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="text-xs text-slate-500 uppercase font-bold">Total Cibles</div>
          <div className="text-2xl font-extrabold text-slate-100 mt-1">{targets.length}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="text-xs text-emerald-400 uppercase font-bold">Succès</div>
          <div className="text-2xl font-extrabold text-emerald-400 mt-1">
            {targets.filter((t) => t.status === 'SUCCEEDED').length}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="text-xs text-rose-400 uppercase font-bold">Échecs</div>
          <div className="text-2xl font-extrabold text-rose-400 mt-1">
            {targets.filter((t) => t.status === 'FAILED' || t.status === 'TIMED_OUT').length}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="text-xs text-purple-400 uppercase font-bold">En cours / Attente</div>
          <div className="text-2xl font-extrabold text-purple-400 mt-1">
            {targets.filter((t) => ['PENDING', 'OFFERED', 'ACKED', 'RUNNING'].includes(t.status)).length}
          </div>
        </div>
      </div>

      {/* Targets Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-100">Cibles Individuelles & État d'Exécution</h2>
          <span className="text-xs text-slate-500">Actualisation automatique</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/80 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-6 py-4">Machine Cible</th>
                <th className="px-6 py-4">Statut Machine à États</th>
                <th className="px-6 py-4">Tentatives</th>
                <th className="px-6 py-4">Code Retour</th>
                <th className="px-6 py-4">Message / Erreur</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {targets.map((target) => (
                <tr key={target.id} className="hover:bg-slate-850/50 transition">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-slate-100">{target.device_hostname || 'Machine Inconnue'}</div>
                    <div className="text-xs text-slate-500 font-mono">{target.device_ip || '127.0.0.1'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                      target.status === 'SUCCEEDED'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : target.status === 'FAILED'
                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        : target.status === 'RUNNING'
                        ? 'bg-purple-500/10 text-purple-400 border-purple-500/20 animate-pulse'
                        : target.status === 'ACKED' || target.status === 'OFFERED'
                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}>
                      {target.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-slate-400">
                    {target.retry_count} / {target.max_retries}
                  </td>
                  <td className="px-6 py-4 font-mono text-xs">
                    {target.exit_code !== null && target.exit_code !== undefined ? (
                      <span className={target.exit_code === 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                        {target.exit_code}
                      </span>
                    ) : (
                      <span className="text-slate-600">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-400 max-w-xs truncate">
                    {target.error_message || (target.status === 'SUCCEEDED' ? 'Exécuté avec succès' : '-')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => setSelectedTargetLogs({ id: target.id, hostname: target.device_hostname || 'Machine' })}
                        className="flex items-center space-x-1 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition text-xs font-semibold"
                        title="Consulter les logs du job"
                      >
                        <FileText className="w-4 h-4 text-emerald-400" />
                        <span>Logs</span>
                      </button>

                      {(target.status === 'FAILED' || target.status === 'TIMED_OUT') && (
                        <button
                          onClick={() => retryMutation.mutate(target.id)}
                          className="flex items-center space-x-1 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition text-xs font-semibold"
                          title="Relancer sur cette machine"
                        >
                          <RotateCw className="w-4 h-4" />
                          <span>Relancer</span>
                        </button>
                      )}

                      {['PENDING', 'OFFERED', 'ACKED', 'RUNNING'].includes(target.status) && (
                        <button
                          onClick={() => cancelTargetMutation.mutate(target.id)}
                          disabled={cancelTargetMutation.isPending}
                          className="flex items-center space-x-1 p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition text-xs font-semibold"
                          title="Interrompre cette cible"
                        >
                          <Ban className="w-4 h-4" />
                          <span>Interrompre</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Logs Modal / Drawer */}
      {selectedTargetLogs && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-3xl w-full shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <div className="flex items-center space-x-3">
                <Terminal className="w-5 h-5 text-emerald-400" />
                <h3 className="text-lg font-bold text-slate-100">
                  Logs d'exécution — {selectedTargetLogs.hostname}
                </h3>
              </div>
              <button
                onClick={() => setSelectedTargetLogs(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-950 rounded-2xl p-4 font-mono text-xs space-y-2 border border-slate-800">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start space-x-2">
                  <span className="text-slate-600 select-none">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={`font-bold px-1 rounded text-[10px] ${
                    log.level === 'ERROR'
                      ? 'bg-rose-500/20 text-rose-400'
                      : log.level === 'WARNING'
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-slate-800 text-slate-400'
                  }`}>
                    {log.level}
                  </span>
                  <span className="text-slate-300 flex-1 whitespace-pre-wrap">{log.message}</span>
                </div>
              ))}

              {logs.length === 0 && (
                <div className="text-slate-600 text-center py-6">
                  Aucun log remonté pour cette cible pour le moment.
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedTargetLogs(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-sm font-semibold"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
