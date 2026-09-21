import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { Device, DeviceGroup } from '../../types';
import {
  FolderKanban,
  Plus,
  Trash2,
  Users,
  Monitor,
  Check,
  X,
  Loader2,
  Edit2,
  Search,
  CheckSquare,
  Square,
  AlertCircle,
  Zap
} from 'lucide-react';
import { WolResult } from '../../types';

export const Groups: React.FC = () => {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<DeviceGroup | null>(null);
  const [selectedGroupForMembers, setSelectedGroupForMembers] = useState<DeviceGroup | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<DeviceGroup | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [searchGroupQuery, setSearchGroupQuery] = useState('');
  const [deviceSearchQuery, setDeviceSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  // WoL toast notification
  const [wolNotification, setWolNotification] = useState<{
    type: 'success' | 'error';
    message: string;
    details?: string[];
  } | null>(null);

  const wakeGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      return api.wakeGroup(groupId);
    },
    onSuccess: (results: WolResult[]) => {
      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      if (successful.length > 0) {
        setWolNotification({
          type: 'success',
          message: `${successful.length} machine(s) du groupe réveillée(s) par Wake-on-LAN avec succès !`,
          details: failed.map((f) => `Échec ${f.mac_address || 'inconnue'} : ${f.message}`),
        });
      } else {
        setWolNotification({
          type: 'error',
          message: `Aucune machine n'a pu être réveillée (${failed.length} échecs ou pas d'adresse MAC).`,
          details: failed.map((f) => f.message),
        });
      }
      setTimeout(() => setWolNotification(null), 7000);
    },
    onError: (err: any) => {
      setWolNotification({
        type: 'error',
        message: err?.response?.data?.detail || 'Erreur lors du réveil du groupe',
      });
      setTimeout(() => setWolNotification(null), 7000);
    },
  });

  const { data: groups = [], isLoading: loadingGroups } = useQuery({
    queryKey: ['groups'],
    queryFn: api.getGroups,
  });

  const { data: devices = [], isLoading: loadingDevices } = useQuery({
    queryKey: ['devices'],
    queryFn: api.getDevices,
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) => api.createGroup(data.name, data.description),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setShowCreateModal(false);
      setName('');
      setDescription('');
      setError(null);
    },
    onError: (err: any) => setError(err.response?.data?.detail || 'Erreur lors de la création du groupe'),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; name: string; description?: string }) =>
      api.updateGroup(data.id, data.name, data.description),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setEditingGroup(null);
      setName('');
      setDescription('');
      setError(null);
    },
    onError: (err: any) => setError(err.response?.data?.detail || 'Erreur lors de la modification du groupe'),
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      setGroupToDelete(null);
    },
  });

  const saveMembersMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGroupForMembers) return;
      return api.setGroupDevices(selectedGroupForMembers.id, selectedDeviceIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      setSelectedGroupForMembers(null);
      setSelectedDeviceIds([]);
    },
  });

  const handleOpenMembers = (grp: DeviceGroup) => {
    setSelectedGroupForMembers(grp);
    setDeviceSearchQuery('');
    // Initialize selected device IDs from group.device_ids or device.group_ids
    const initialIds = grp.device_ids && grp.device_ids.length > 0
      ? [...grp.device_ids]
      : devices.filter(d => d.group_ids?.includes(grp.id)).map(d => d.id);
    setSelectedDeviceIds(initialIds);
  };

  const handleOpenEdit = (grp: DeviceGroup) => {
    setEditingGroup(grp);
    setName(grp.name);
    setDescription(grp.description || '');
    setError(null);
  };

  const filteredGroups = groups.filter(g =>
    g.name.toLowerCase().includes(searchGroupQuery.toLowerCase()) ||
    (g.description && g.description.toLowerCase().includes(searchGroupQuery.toLowerCase()))
  );

  const filteredDevices = devices.filter(d =>
    d.hostname.toLowerCase().includes(deviceSearchQuery.toLowerCase()) ||
    (d.ip_address && d.ip_address.toLowerCase().includes(deviceSearchQuery.toLowerCase())) ||
    (d.os_name && d.os_name.toLowerCase().includes(deviceSearchQuery.toLowerCase()))
  );

  const toggleAllFilteredDevices = () => {
    const filteredIds = filteredDevices.map(d => d.id);
    const allSelected = filteredIds.every(id => selectedDeviceIds.includes(id));
    if (allSelected) {
      setSelectedDeviceIds(selectedDeviceIds.filter(id => !filteredIds.includes(id)));
    } else {
      const merged = Array.from(new Set([...selectedDeviceIds, ...filteredIds]));
      setSelectedDeviceIds(merged);
    }
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
          <h1 className="text-2xl font-black text-slate-100 tracking-tight flex items-center gap-2">
            <FolderKanban className="w-7 h-7 text-emerald-400" />
            Groupes de Machines
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Organisation logique et dynamique du parc pour le ciblage massif des déploiements et des scripts
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Rechercher un groupe..."
              value={searchGroupQuery}
              onChange={(e) => setSearchGroupQuery(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-emerald-500 outline-none w-56 transition"
            />
          </div>

          <button
            onClick={() => {
              setError(null);
              setName('');
              setDescription('');
              setShowCreateModal(true);
            }}
            className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-600/20 transition whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau Groupe</span>
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loadingGroups ? (
        <div className="flex items-center justify-center p-16 text-slate-500 space-x-3">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
          <span>Chargement des groupes...</span>
        </div>
      ) : (
        /* Groups Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredGroups.map((grp) => (
            <div
              key={grp.id}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-6 flex flex-col justify-between space-y-4 transition shadow-lg relative overflow-hidden group"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none -mr-10 -mt-10" />
              
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
                    <FolderKanban className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-950 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
                    <Monitor className="w-3.5 h-3.5" />
                    {grp.device_count || 0} machine{(grp.device_count || 0) > 1 ? 's' : ''}
                  </span>
                </div>

                <h3 className="text-lg font-bold text-slate-100 group-hover:text-emerald-400 transition">{grp.name}</h3>
                <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                  {grp.description || 'Aucune description spécifiée.'}
                </p>
              </div>

              <div className="flex items-center space-x-2 pt-4 border-t border-slate-800/80">
                <button
                  onClick={() => handleOpenMembers(grp)}
                  className="flex-1 flex items-center justify-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-200 py-2 rounded-xl text-xs font-semibold transition border border-slate-700/50"
                  title="Gérer les machines membres"
                >
                  <Users className="w-4 h-4 text-emerald-400" />
                  <span>Membres ({grp.device_count || 0})</span>
                </button>
                <button
                  onClick={() => wakeGroupMutation.mutate(grp.id)}
                  disabled={wakeGroupMutation.isPending}
                  className="p-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 transition disabled:opacity-50"
                  title="Réveiller toutes les machines de ce groupe (Wake-on-LAN)"
                >
                  <Zap className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleOpenEdit(grp)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700/50 text-slate-300 hover:text-white transition"
                  title="Modifier le groupe"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setGroupToDelete(grp)}
                  className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition"
                  title="Supprimer le groupe"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loadingGroups && filteredGroups.length === 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 space-y-2">
          <FolderKanban className="w-10 h-10 mx-auto text-slate-600 mb-2" />
          <p className="text-base font-semibold text-slate-300">Aucun groupe trouvé</p>
          <p className="text-xs text-slate-500">
            {searchGroupQuery
              ? `Aucun résultat pour la recherche "${searchGroupQuery}".`
              : 'Cliquez sur "Nouveau Groupe" pour structurer votre parc.'}
          </p>
        </div>
      )}

      {/* Modal: Nouveau / Modifier Groupe */}
      {(showCreateModal || editingGroup) && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <FolderKanban className="w-5 h-5 text-emerald-400" />
                {editingGroup ? 'Modifier le Groupe' : 'Créer un Nouveau Groupe'}
              </h2>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingGroup(null);
                }}
                className="text-slate-400 hover:text-slate-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (editingGroup) {
                  updateMutation.mutate({ id: editingGroup.id, name, description });
                } else {
                  createMutation.mutate({ name, description });
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Nom du Groupe *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: Comptabilité, Serveurs DNS, Agence Lyon"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Rôle, site ou périmètre du groupe..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingGroup(null);
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold flex items-center space-x-2 transition shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  <span>{editingGroup ? 'Enregistrer les modifications' : 'Créer le Groupe'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Gérer Membres */}
      {selectedGroupForMembers && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <Users className="w-5 h-5 text-emerald-400" />
                  Gérer les Machines Membres
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Groupe : <strong className="text-emerald-400">{selectedGroupForMembers.name}</strong>
                </p>
              </div>
              <button
                onClick={() => setSelectedGroupForMembers(null)}
                className="text-slate-400 hover:text-slate-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter and Select All Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filtrer par nom, IP, OS..."
                  value={deviceSearchQuery}
                  onChange={(e) => setDeviceSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:border-emerald-500 outline-none transition"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleAllFilteredDevices}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  {filteredDevices.length > 0 &&
                  filteredDevices.every((d) => selectedDeviceIds.includes(d.id)) ? (
                    <>
                      <Square className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Tout désélectionner</span>
                    </>
                  ) : (
                    <>
                      <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Tout sélectionner ({filteredDevices.length})</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Devices Checklist */}
            <div className="max-h-80 overflow-y-auto border border-slate-800 rounded-xl p-2 bg-slate-950 space-y-1 divide-y divide-slate-800/40">
              {loadingDevices ? (
                <div className="p-8 text-center text-slate-500 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>Chargement des machines...</span>
                </div>
              ) : filteredDevices.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  Aucune machine trouvée.
                </div>
              ) : (
                filteredDevices.map((dev) => {
                  const isChecked = selectedDeviceIds.includes(dev.id);
                  return (
                    <label
                      key={dev.id}
                      className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer text-sm transition ${
                        isChecked ? 'bg-emerald-500/10 border border-emerald-500/20' : 'hover:bg-slate-900 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedDeviceIds([...selectedDeviceIds, dev.id]);
                            } else {
                              setSelectedDeviceIds(selectedDeviceIds.filter((id) => id !== dev.id));
                            }
                          }}
                          className="w-4 h-4 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-800 accent-emerald-500"
                        />
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-200 text-sm">{dev.hostname}</span>
                            <span
                              className={`w-2 h-2 rounded-full ${
                                dev.is_online ? 'bg-emerald-400 shadow-emerald-400/50 shadow-sm' : 'bg-slate-600'
                              }`}
                              title={dev.is_online ? 'En ligne' : 'Hors ligne'}
                            />
                          </div>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {dev.ip_address || '127.0.0.1'} {dev.os_name ? `• ${dev.os_name}` : ''}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        {isChecked && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            <Check className="w-3 h-3" /> Membre
                          </span>
                        )}
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            {/* Footer / Summary */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-800">
              <span className="text-xs text-slate-400">
                <strong className="text-emerald-400 font-bold">{selectedDeviceIds.length}</strong> machine(s) sélectionnée(s)
              </span>

              <div className="flex justify-end space-x-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setSelectedGroupForMembers(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => saveMembersMutation.mutate()}
                  disabled={saveMembersMutation.isPending}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold flex items-center space-x-2 transition shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                >
                  {saveMembersMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Enregistrer les membres ({selectedDeviceIds.length})</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Suppression de Groupe */}
      {groupToDelete && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center space-x-3 text-rose-400 border-b border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">Supprimer le Groupe</h3>
                <p className="text-xs text-slate-400">Action irréversible</p>
              </div>
            </div>

            <p className="text-sm text-slate-300">
              Êtes-vous certain de vouloir supprimer définitivement le groupe{' '}
              <strong className="text-slate-100">"{groupToDelete.name}"</strong> ? Les machines ne seront pas supprimées, mais perdront leur assignation à ce groupe.
            </p>

            <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setGroupToDelete(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(groupToDelete.id)}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-semibold flex items-center space-x-2 transition shadow-lg shadow-rose-600/20"
              >
                {deleteMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Confirmer la suppression</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
