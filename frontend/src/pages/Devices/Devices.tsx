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
  HardDrive
} from 'lucide-react';

export const Devices: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ONLINE' | 'OFFLINE'>('ALL');

  const { data: devices = [], isLoading, refetch } = useQuery({
    queryKey: ['devices'],
    queryFn: api.getDevices,
    refetchInterval: 10000,
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      if (enabled) {
        return api.disableDevice(id);
      } else {
        return api.enableDevice(id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteDevice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });

  const filteredDevices = devices.filter((device) => {
    const matchesSearch =
      device.hostname.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (device.ip_address && device.ip_address.includes(searchTerm)) ||
      (device.os_name && device.os_name.toLowerCase().includes(searchTerm.toLowerCase()));

    if (statusFilter === 'ONLINE') return matchesSearch && device.is_online;
    if (statusFilter === 'OFFLINE') return matchesSearch && !device.is_online;
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">Parc des Machines</h1>
          <p className="text-sm text-slate-400 mt-1">Inventaire des postes clients et état de communication en temps réel</p>
        </div>

        <div className="flex items-center space-x-3">
          <a
            href="/api/v1/agent/download/windows"
            download="mapt-agent.exe"
            className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-xl text-sm font-semibold transition shadow-lg shadow-emerald-600/20"
            title="Télécharger l'agent d'enrôlement Windows x64"
          >
            <Power className="w-4 h-4" />
            <span>Télécharger l'Agent (.exe)</span>
          </a>

          <button
            onClick={() => refetch()}
            className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 px-3.5 py-2 rounded-xl text-sm font-semibold transition"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Actualiser</span>
          </button>
        </div>
      </div>

      {/* Controls: Search & Filter */}
      <div className="flex flex-col sm:flex-row items-center gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Rechercher par nom d'hôte, adresse IP, OS..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-200 outline-none transition"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-500" />
          <select
            value={statusFilter}
            onChange={(e: any) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-300 text-sm rounded-xl px-3 py-2 outline-none focus:border-emerald-500"
          >
            <option value="ALL">Tous les statuts</option>
            <option value="ONLINE">En ligne uniquement</option>
            <option value="OFFLINE">Hors ligne uniquement</option>
          </select>
        </div>
      </div>

      {/* Devices Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/80 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-6 py-4">Machine</th>
                <th className="px-6 py-4">Système d'Exploitation</th>
                <th className="px-6 py-4">Version Agent</th>
                <th className="px-6 py-4">Dernier Heartbeat</th>
                <th className="px-6 py-4">Statut</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredDevices.map((device) => (
                <tr key={device.id} className="hover:bg-slate-850/50 transition">
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${device.is_online ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-slate-600'}`} />
                      <div>
                        <div className="font-semibold text-slate-100 flex items-center space-x-2">
                          <span>{device.hostname}</span>
                          {!device.enabled && (
                            <span className="text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20 px-1.5 py-0.5 rounded font-bold">
                              DÉSACTIVÉ
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 font-mono">{device.ip_address || '127.0.0.1'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-slate-200">{device.os_name} {device.os_version || ''}</div>
                    <div className="text-xs text-slate-500 font-mono">{device.os_build ? `Build ${device.os_build}` : 'Windows 64-bit'}</div>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-slate-400">
                    v{device.agent_version || '1.0.0'}
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-400">
                    {device.last_seen_at ? new Date(device.last_seen_at).toLocaleTimeString() : 'Jamais'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                      device.is_online
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}>
                      {device.is_online ? 'En ligne' : 'Hors ligne'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <Link
                        to={`/devices/${device.id}`}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                        title="Consulter l'inventaire et les détails"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => toggleStatusMutation.mutate({ id: device.id, enabled: device.enabled })}
                        className={`p-2 rounded-xl border transition ${
                          device.enabled
                            ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20'
                            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                        }`}
                        title={device.enabled ? 'Désactiver la machine' : 'Activer la machine'}
                      >
                        <Power className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Confirmez-vous la suppression de la machine ${device.hostname} ?`)) {
                            deleteMutation.mutate(device.id);
                          }
                        }}
                        className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition"
                        title="Supprimer la machine"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredDevices.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    Aucune machine trouvée pour ces critères.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
