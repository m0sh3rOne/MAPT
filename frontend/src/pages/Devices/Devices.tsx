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
  Check
} from 'lucide-react';
import { WolResult } from '../../types';

export const Devices: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ONLINE' | 'OFFLINE'>('ALL');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);

  // WoL Custom Modal State
  const [showCustomWolModal, setShowCustomWolModal] = useState(false);
  const [customMac, setCustomMac] = useState('');
  const [customBroadcast, setCustomBroadcast] = useState('255.255.255.255');
  const [customPort, setCustomPort] = useState(9);

  // Toast / Notification State
  const [wolNotification, setWolNotification] = useState<{
    type: 'success' | 'error';
    message: string;
    details?: string[];
  } | null>(null);

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

  // WoL Single Device Mutation
  const wolSingleMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      return api.wakeDevice(deviceId);
    },
    onSuccess: (res: WolResult) => {
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

  // WoL Batch Devices Mutation
  const wolBatchMutation = useMutation({
    mutationFn: async (deviceIds: string[]) => {
      return api.wakeDevices(deviceIds);
    },
    onSuccess: (results: WolResult[]) => {
      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      if (successful.length > 0) {
        setWolNotification({
          type: 'success',
          message: `${successful.length} machine(s) réveillée(s) par Wake-on-LAN avec succès !`,
          details: failed.map((f) => `Échec ${f.mac_address || 'inconnue'} : ${f.message}`),
        });
      } else {
        setWolNotification({
          type: 'error',
          message: `Aucune machine n'a pu être réveillée (${failed.length} échecs).`,
          details: failed.map((f) => f.message),
        });
      }
      setTimeout(() => setWolNotification(null), 7000);
    },
    onError: (err: any) => {
      setWolNotification({
        type: 'error',
        message: err?.response?.data?.detail || 'Erreur lors du réveil groupé',
      });
      setTimeout(() => setWolNotification(null), 7000);
    },
  });

  // WoL Custom MAC Mutation
  const wolCustomMutation = useMutation({
    mutationFn: async () => {
      return api.sendCustomWol(customMac.trim(), customBroadcast.trim() || undefined, customPort);
    },
    onSuccess: (res: WolResult) => {
      if (res.success) {
        setWolNotification({
          type: 'success',
          message: `Paquet magique WoL envoyé à l'adresse MAC ${res.mac_address} (${res.broadcast_ip}:${res.port})`,
        });
        setShowCustomWolModal(false);
        setCustomMac('');
      } else {
        setWolNotification({
          type: 'error',
          message: `Erreur WoL : ${res.message}`,
        });
      }
      setTimeout(() => setWolNotification(null), 7000);
    },
    onError: (err: any) => {
      setWolNotification({
        type: 'error',
        message: err?.response?.data?.detail || "Échec de l'envoi personnalisé",
      });
      setTimeout(() => setWolNotification(null), 7000);
    },
  });

  const filteredDevices = devices.filter((device) => {
    const matchesSearch =
      device.hostname.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (device.ip_address && device.ip_address.includes(searchTerm)) ||
      (device.mac_address && device.mac_address.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (device.os_name && device.os_name.toLowerCase().includes(searchTerm.toLowerCase()));

    if (statusFilter === 'ONLINE') return matchesSearch && device.is_online;
    if (statusFilter === 'OFFLINE') return matchesSearch && !device.is_online;
    return matchesSearch;
  });

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedDeviceIds(filteredDevices.map((d) => d.id));
    } else {
      setSelectedDeviceIds([]);
    }
  };

  const handleSelectDevice = (id: string) => {
    setSelectedDeviceIds((prev) =>
      prev.includes(id) ? prev.filter((dId) => dId !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
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
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="text-sm font-semibold">{wolNotification.message}</p>
              {wolNotification.details && wolNotification.details.length > 0 && (
                <ul className="text-xs text-rose-400/80 list-disc list-inside mt-1">
                  {wolNotification.details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <button
            onClick={() => setWolNotification(null)}
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
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Inventaire des postes clients, état en temps réel et réveil à distance (Wake-on-LAN)
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

      {/* Controls: Search & Filter & Bulk Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
        <div className="flex flex-col sm:flex-row items-center gap-4 flex-1 w-full">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Rechercher par nom d'hôte, IP, adresse MAC, OS..."
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
              <option value="ALL">Tous les statuts ({devices.length})</option>
              <option value="ONLINE">En ligne ({devices.filter((d) => d.is_online).length})</option>
              <option value="OFFLINE">Hors ligne ({devices.filter((d) => !d.is_online).length})</option>
            </select>
          </div>
        </div>

        {/* Bulk Action Bar */}
        {selectedDeviceIds.length > 0 && (
          <div className="flex items-center space-x-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
            <span className="text-xs text-slate-400 font-semibold">
              {selectedDeviceIds.length} sélectionnée(s)
            </span>
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
              onClick={() => setSelectedDeviceIds([])}
              className="text-slate-500 hover:text-slate-300 p-1"
              title="Désélectionner tout"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

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
                      filteredDevices.length > 0 &&
                      selectedDeviceIds.length === filteredDevices.length
                    }
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-emerald-500"
                  />
                </th>
                <th className="px-6 py-4">Machine & Réseau</th>
                <th className="px-6 py-4">Système d'Exploitation</th>
                <th className="px-6 py-4">Version Agent</th>
                <th className="px-6 py-4">Dernier Heartbeat</th>
                <th className="px-6 py-4">Statut</th>
                <th className="px-6 py-4 text-right">Actions Rapides</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredDevices.map((device) => {
                const isSelected = selectedDeviceIds.includes(device.id);
                return (
                  <tr
                    key={device.id}
                    className={`hover:bg-slate-850/50 transition ${
                      isSelected ? 'bg-slate-850/40' : ''
                    }`}
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
                            device.is_online
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
                            {!device.enabled && (
                              <span className="text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20 px-1.5 py-0.5 rounded font-bold">
                                DÉSACTIVÉ
                              </span>
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
                        {device.os_name} {device.os_version || ''}
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        {device.os_build ? `Build ${device.os_build}` : 'Windows 64-bit'}
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
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                          device.is_online
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {device.is_online ? 'En ligne' : 'Hors ligne'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        {/* WoL Button */}
                        <button
                          onClick={() => wolSingleMutation.mutate(device.id)}
                          disabled={wolSingleMutation.isPending}
                          className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/40 transition disabled:opacity-50"
                          title="Envoyer un paquet magique Wake-on-LAN (Allumer à distance)"
                        >
                          <Zap className="w-4 h-4" />
                        </button>

                        {/* View details */}
                        <Link
                          to={`/devices/${device.id}`}
                          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                          title="Consulter l'inventaire complet et les actions"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>

                        {/* Enable / Disable */}
                        <button
                          onClick={() =>
                            toggleStatusMutation.mutate({ id: device.id, enabled: device.enabled })
                          }
                          className={`p-2 rounded-xl border transition ${
                            device.enabled
                              ? 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                              : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                          }`}
                          title={device.enabled ? 'Désactiver la machine' : 'Activer la machine'}
                        >
                          <Power className="w-4 h-4" />
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => {
                            if (confirm(`Confirmez-vous la suppression de la machine ${device.hostname} ?`)) {
                              deleteMutation.mutate(device.id);
                            }
                          }}
                          className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition"
                          title="Supprimer la machine de la base"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredDevices.length === 0 && (
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
                Le serveur MAPT émettra un datagramme UDP contenant le paquet magique (6x 0xFF suivis de 16x l'adresse MAC).
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCustomWolModal(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={wolCustomMutation.isPending || !customMac.trim()}
                  className="flex items-center space-x-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-sm shadow-lg shadow-amber-500/20 transition disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>{wolCustomMutation.isPending ? 'Envoi...' : 'Émettre le paquet WoL'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
