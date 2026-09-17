import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import { Link } from 'react-router-dom';
import {
  Monitor,
  CheckCircle2,
  XCircle,
  Rocket,
  Plus,
  Package,
  Code2,
  ArrowRight,
  Activity,
  Layers
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { data: devices = [], isLoading: loadingDevices } = useQuery({
    queryKey: ['devices'],
    queryFn: api.getDevices,
    refetchInterval: 10000,
  });

  const { data: deployments = [], isLoading: loadingDeployments } = useQuery({
    queryKey: ['deployments'],
    queryFn: api.getDeployments,
    refetchInterval: 10000,
  });

  const totalDevices = devices.length;
  const onlineDevices = devices.filter((d) => d.is_online).length;
  const offlineDevices = totalDevices - onlineDevices;

  const activeDeployments = deployments.filter((d) => d.status === 'RUNNING' || d.status === 'PENDING').length;
  const totalCompleted = deployments.filter((d) => d.status === 'COMPLETED').length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">Tableau de Bord</h1>
          <p className="text-sm text-slate-400 mt-1">Supervision globale du parc informatique et état des déploiements</p>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            to="/deployments"
            className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-600/20 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau Déploiement</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Total Machines */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Parc Total</span>
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <Monitor className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-slate-100">{totalDevices}</span>
            <span className="text-xs text-slate-400">machines</span>
          </div>
          <div className="mt-3 text-xs text-slate-500 flex items-center space-x-1.5">
            <span>Enregistrées dans le système</span>
          </div>
        </div>

        {/* Online Machines */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Machines En Ligne</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-emerald-400">{onlineDevices}</span>
            <span className="text-xs text-slate-400">actives</span>
          </div>
          <div className="mt-3 text-xs text-emerald-500 flex items-center space-x-1.5 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
            <span>Heartbeat reçu &lt; 90s</span>
          </div>
        </div>

        {/* Offline Machines */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Hors Ligne</span>
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
              <XCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-rose-400">{offlineDevices}</span>
            <span className="text-xs text-slate-400">inactives</span>
          </div>
          <div className="mt-3 text-xs text-slate-500 flex items-center space-x-1.5">
            <span>En attente de connexion</span>
          </div>
        </div>

        {/* Active Deployments */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Déploiements Actifs</span>
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <Rocket className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-purple-400">{activeDeployments}</span>
            <span className="text-xs text-slate-400">en cours</span>
          </div>
          <div className="mt-3 text-xs text-slate-500 flex items-center space-x-1.5">
            <span>{totalCompleted} terminés</span>
          </div>
        </div>
      </div>

      {/* Grid: Recent Devices & Recent Deployments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Devices */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center space-x-2.5">
              <Monitor className="w-5 h-5 text-emerald-400" />
              <h2 className="text-base font-bold text-slate-100">Machines du Parc</h2>
            </div>
            <Link to="/devices" className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center space-x-1">
              <span>Voir tout</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-3">
            {devices.slice(0, 5).map((device) => (
              <Link
                key={device.id}
                to={`/devices/${device.id}`}
                className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/60 hover:bg-slate-800/60 border border-slate-800/80 transition"
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-3 rounded-full ${device.is_online ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-slate-600'}`} />
                  <div>
                    <div className="text-sm font-semibold text-slate-200">{device.hostname}</div>
                    <div className="text-xs text-slate-500 font-mono">{device.ip_address || '127.0.0.1'} • {device.os_name}</div>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                    device.is_online
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}>
                    {device.is_online ? 'En ligne' : 'Hors ligne'}
                  </span>
                </div>
              </Link>
            ))}

            {devices.length === 0 && (
              <div className="py-8 text-center text-sm text-slate-500">
                Aucune machine enregistrée. Lancez l'agent Windows pour l'enrôler automatiquement.
              </div>
            )}
          </div>
        </div>

        {/* Recent Deployments */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center space-x-2.5">
              <Rocket className="w-5 h-5 text-purple-400" />
              <h2 className="text-base font-bold text-slate-100">Derniers Déploiements</h2>
            </div>
            <Link to="/deployments" className="text-xs font-semibold text-purple-400 hover:text-purple-300 flex items-center space-x-1">
              <span>Voir tout</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-3">
            {deployments.slice(0, 5).map((dep) => (
              <Link
                key={dep.id}
                to={`/deployments/${dep.id}`}
                className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/60 hover:bg-slate-800/60 border border-slate-800/80 transition"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-200">{dep.name}</div>
                  <div className="text-xs text-slate-500 flex items-center space-x-2 mt-0.5">
                    <span className="uppercase font-mono text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">
                      {dep.deployment_type}
                    </span>
                    <span>• {dep.total_targets} cible(s)</span>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                    dep.status === 'COMPLETED'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : dep.status === 'RUNNING'
                      ? 'bg-purple-500/10 text-purple-400 border-purple-500/20 animate-pulse'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}>
                    {dep.status}
                  </span>
                </div>
              </Link>
            ))}

            {deployments.length === 0 && (
              <div className="py-8 text-center text-sm text-slate-500">
                Aucun déploiement n'a encore été créé.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
