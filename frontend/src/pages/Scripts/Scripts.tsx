import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { Link, useNavigate } from 'react-router-dom';
import {
  Code2,
  Plus,
  Edit3,
  Trash2,
  Play,
  Rocket,
  Clock,
  Terminal,
  FileCode,
  Loader2,
  X,
  History,
  Check,
  Search,
  Monitor,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';

import { SchedulerSelector, ScheduleConfig } from '../../components/common/SchedulerSelector';

const DEFAULT_TEMPLATES: Record<string, string> = {
  powershell: '# Script PowerShell (.ps1)\nWrite-Output "Test MAPT Agent"',
  vbscript: `' Script VBScript (.vbs)\nWScript.Echo "Test MAPT Agent"`,
  python: '# Script Python (.py)\nprint("Test MAPT Agent")',
  cmd: '@echo off\r\necho Test MAPT Agent',
};

export const Scripts: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedScriptForEdit, setSelectedScriptForEdit] = useState<any | null>(null);
  const [selectedScriptForExecute, setSelectedScriptForExecute] = useState<any | null>(null);

  // Script Create Form
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState('powershell');
  const [initialContent, setInitialContent] = useState(DEFAULT_TEMPLATES.powershell);
  const [timeoutSeconds, setTimeoutSeconds] = useState(300);

  // Script New Version Form
  const [versionContent, setVersionContent] = useState('');
  const [versionTimeout, setVersionTimeout] = useState(300);

  // Search
  const [scriptSearchTerm, setScriptSearchTerm] = useState('');

  // Script Execution & Scheduling Form
  const [deployName, setDeployName] = useState('');
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [deviceSearchTerm, setDeviceSearchTerm] = useState('');
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig>({
    is_recurring: false,
    schedule_type: 'immediate',
    scheduled_time: '08:00',
    scheduled_days_of_week: '1,2,3,4,5',
    interval_value: 1,
  });

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Queries
  const { data: scripts = [], isLoading } = useQuery({
    queryKey: ['scripts'],
    queryFn: api.getScripts,
  });

  const { data: devices = [] } = useQuery({
    queryKey: ['devices'],
    queryFn: api.getDevices,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: api.getGroups,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: api.createScript,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scripts'] });
      setShowCreateModal(false);
      setName('');
      setDescription('');
    },
    onError: (err: any) => setError(err.response?.data?.detail || 'Erreur lors de la création du script'),
  });

  const addVersionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedScriptForEdit) return;
      return api.addScriptVersion(selectedScriptForEdit.id, {
        content: versionContent,
        timeout_seconds: versionTimeout,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scripts'] });
      setSelectedScriptForEdit(null);
    },
    onError: (err: any) => setError(err.response?.data?.detail || 'Erreur lors de l’enregistrement de la version'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteScript(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scripts'] });
      setSuccessMessage('Script supprimé avec succès.');
      setTimeout(() => setSuccessMessage(null), 3000);
    },
    onError: (err: any) => setError(err.response?.data?.detail || 'Erreur lors de la suppression du script'),
  });

  const executeMutation = useMutation({
    mutationFn: api.createDeployment,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      setSelectedScriptForExecute(null);
      setSuccessMessage('Déploiement du script lancé avec succès !');
      setTimeout(() => {
        setSuccessMessage(null);
        navigate(`/deployments/${data.id}`);
      }, 1200);
    },
    onError: (err: any) => setError(err.response?.data?.detail || 'Erreur lors du lancement de l’exécution'),
  });

  const handleDelete = (script: any) => {
    if (confirm(`Confirmez-vous la suppression du script "${script.name}" ?`)) {
      setError(null);
      deleteMutation.mutate(script.id);
    }
  };

  const openExecuteModal = (script: any) => {
    setError(null);
    setSelectedScriptForExecute(script);
    setDeployName(`Exécution : ${script.name} (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`);
    setSelectedVersionId(script.latest_version?.id || '');
    setSelectedDeviceIds([]);
    setSelectedGroupIds([]);
    setDeviceSearchTerm('');
    setScheduleConfig({
      is_recurring: false,
      schedule_type: 'immediate',
      scheduled_time: '08:00',
      scheduled_days_of_week: '1,2,3,4,5',
      interval_value: 1,
    });
  };

  const handleExecuteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (selectedDeviceIds.length === 0 && selectedGroupIds.length === 0) {
      setError('Veuillez sélectionner au moins une machine ou un groupe cible pour exécuter le script.');
      return;
    }

    if (!selectedVersionId) {
      setError('Aucune version de code sélectionnée.');
      return;
    }

    executeMutation.mutate({
      name: deployName,
      description: `Lancement du script ${selectedScriptForExecute.name}`,
      deployment_type: 'script',
      script_version_id: selectedVersionId,
      target_device_ids: selectedDeviceIds,
      target_group_ids: selectedGroupIds,
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

  const filteredDevices = devices.filter((d) =>
    d.hostname.toLowerCase().includes(deviceSearchTerm.toLowerCase()) ||
    (d.ip_address && d.ip_address.includes(deviceSearchTerm))
  );

  const getLanguageBadge = (lang: string) => {
    switch (lang?.toLowerCase()) {
      case 'vbscript':
      case 'vbs':
        return {
          label: 'VBScript (.vbs)',
          badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
          iconClass: 'bg-amber-500/10 text-amber-400',
        };
      case 'python':
      case 'py':
        return {
          label: 'Python (.py)',
          badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          iconClass: 'bg-emerald-500/10 text-emerald-400',
        };
      case 'cmd':
      case 'batch':
      case 'bat':
        return {
          label: 'CMD / Batch (.bat)',
          badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
          iconClass: 'bg-slate-800 text-slate-300',
        };
      case 'powershell':
      case 'ps1':
      default:
        return {
          label: 'PowerShell (.ps1)',
          badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
          iconClass: 'bg-blue-500/10 text-blue-400',
        };
    }
  };

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang);
    // If the content is empty or matches one of the default templates, switch to the new default template
    if (!initialContent || Object.values(DEFAULT_TEMPLATES).includes(initialContent.trim())) {
      setInitialContent(DEFAULT_TEMPLATES[newLang] || '');
    }
  };

  const filteredScripts = scripts.filter(
    (sc) =>
      sc.name.toLowerCase().includes(scriptSearchTerm.toLowerCase()) ||
      (sc.description && sc.description.toLowerCase().includes(scriptSearchTerm.toLowerCase())) ||
      sc.language?.toLowerCase().includes(scriptSearchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {successMessage && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-2xl text-sm flex items-center space-x-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">Éditeur de Scripts</h1>
          <p className="text-sm text-slate-400 mt-1">Gestion, édition et exécution de scripts PowerShell, VBScript, Python et Batch</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Rechercher un script..."
              value={scriptSearchTerm}
              onChange={(e) => setScriptSearchTerm(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-emerald-500 outline-none w-56 transition"
            />
          </div>

          <button
            onClick={() => {
              setError(null);
              setName('');
              setDescription('');
              setLanguage('powershell');
              setInitialContent(DEFAULT_TEMPLATES.powershell);
              setShowCreateModal(true);
            }}
            className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-600/20 transition whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau Script</span>
          </button>
        </div>
      </div>

      {/* Scripts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredScripts.map((sc) => {
          const langMeta = getLanguageBadge(sc.language);
          return (
            <div
              key={sc.id}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-6 flex flex-col justify-between space-y-4 transition shadow-lg shadow-black/20"
            >
              <div>
                {/* Card Top: Type & Delete */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${langMeta.iconClass}`}>
                      <Code2 className="w-4 h-4" />
                    </div>
                    <span className={`uppercase text-xs font-mono font-bold border px-2.5 py-1 rounded-lg ${langMeta.badgeClass}`}>
                      {sc.language}
                    </span>
                  </div>

                  <button
                    onClick={() => handleDelete(sc)}
                    className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-rose-500/30 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                    title="Supprimer ce script"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <h3 className="text-lg font-bold text-slate-100">{sc.name}</h3>
                <p className="text-xs text-slate-400 mt-1 line-clamp-2">{sc.description || 'Aucune description.'}</p>

                {/* Code Preview */}
                <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-2 text-xs">
                  {sc.latest_version ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Version actuelle :</span>
                        <span className="font-semibold text-emerald-400">v{sc.latest_version.version}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Timeout d'exécution :</span>
                        <span className="font-mono text-slate-300">{sc.latest_version.timeout_seconds}s</span>
                      </div>
                      <div className="bg-slate-950 rounded-xl p-3 font-mono text-[11px] text-slate-400 max-h-24 overflow-y-auto border border-slate-800/60 mt-2">
                        <pre className="whitespace-pre-wrap">{sc.latest_version.content}</pre>
                      </div>
                    </>
                  ) : (
                    <div className="text-slate-500 italic text-center py-2">Aucune version de code enregistrée.</div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                <button
                  onClick={() => openExecuteModal(sc)}
                  disabled={!sc.latest_version}
                  className="w-full flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white py-2.5 rounded-xl text-xs font-semibold shadow-md shadow-emerald-600/20 transition"
                  title="Lancer l'exécution sur une ou plusieurs machines"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Exécuter le Script</span>
                </button>

                <button
                  onClick={() => {
                    setError(null);
                    setSelectedScriptForEdit(sc);
                    setVersionContent(sc.latest_version?.content || '');
                    setVersionTimeout(sc.latest_version?.timeout_seconds || 300);
                  }}
                  className="w-full flex items-center justify-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-xl text-xs font-semibold transition border border-slate-700/60"
                >
                  <Edit3 className="w-3.5 h-3.5 text-purple-400" />
                  <span>Modifier (Nouvelle Version)</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredScripts.length === 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500">
          {scriptSearchTerm
            ? `Aucun script ne correspond à la recherche "${scriptSearchTerm}".`
            : 'Aucun script créé. Cliquez sur "Nouveau Script" pour concevoir un script PowerShell, VBScript, Python ou Batch.'}
        </div>
      )}

      {/* Modal: Exécuter le Script sur une sélection de machines */}
      {selectedScriptForExecute && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Play className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-100">Exécuter le Script</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {selectedScriptForExecute.name} ({selectedScriptForExecute.language})
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedScriptForExecute(null)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs">{error}</div>}

            <form onSubmit={handleExecuteSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Nom du déploiement
                </label>
                <input
                  type="text"
                  required
                  value={deployName}
                  onChange={(e) => setDeployName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none"
                />
              </div>

              {/* Version Selector */}
              {selectedScriptForExecute.versions && selectedScriptForExecute.versions.length > 1 && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Version du script à exécuter
                  </label>
                  <select
                    value={selectedVersionId}
                    onChange={(e) => setSelectedVersionId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-emerald-500"
                  >
                    {selectedScriptForExecute.versions.map((v: any) => (
                      <option key={v.id} value={v.id}>
                        Version v{v.version} ({v.timeout_seconds}s timeout)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Machine Targets Selection */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Sélectionner les machines ({selectedDeviceIds.length} sélectionnée(s))
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedDeviceIds.length === devices.length) {
                        setSelectedDeviceIds([]);
                      } else {
                        setSelectedDeviceIds(devices.map((d) => d.id));
                      }
                    }}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold"
                  >
                    {selectedDeviceIds.length === devices.length ? 'Tout désélectionner' : 'Sélectionner tout le parc'}
                  </button>
                </div>

                {/* Filter search */}
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Filtrer par nom ou IP..."
                    value={deviceSearchTerm}
                    onChange={(e) => setDeviceSearchTerm(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="max-h-48 overflow-y-auto border border-slate-800 rounded-xl p-2 bg-slate-950 space-y-1">
                  {filteredDevices.map((dev) => (
                    <label
                      key={dev.id}
                      className="flex items-center space-x-3 p-2 rounded-lg hover:bg-slate-900 cursor-pointer text-sm transition"
                    >
                      <input
                        type="checkbox"
                        checked={selectedDeviceIds.includes(dev.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedDeviceIds([...selectedDeviceIds, dev.id]);
                          } else {
                            setSelectedDeviceIds(selectedDeviceIds.filter((id) => id !== dev.id));
                          }
                        }}
                        className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-800"
                      />
                      <Monitor className="w-4 h-4 text-slate-400" />
                      <span className="font-semibold text-slate-200">{dev.hostname}</span>
                      <span className="text-xs text-slate-500 font-mono">({dev.ip_address || '127.0.0.1'})</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ml-auto font-medium ${
                        dev.is_online ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-500'
                      }`}>
                        {dev.is_online ? 'En ligne' : 'Hors ligne'}
                      </span>
                    </label>
                  ))}

                  {filteredDevices.length === 0 && (
                    <div className="text-center py-4 text-xs text-slate-500">
                      Aucune machine disponible.
                    </div>
                  )}
                </div>
              </div>

              {/* Group Targets Selection */}
              {groups.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Ou cibler un Groupe entier
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

              {/* Planification & Récurrence */}
              <SchedulerSelector value={scheduleConfig} onChange={setScheduleConfig} />

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedScriptForExecute(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-sm font-semibold transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={executeMutation.isPending}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-lg shadow-emerald-600/20 flex items-center space-x-2 transition"
                >
                  {executeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                  <span>Lancer l'Exécution</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Nouveau Script */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-lg font-bold text-slate-100">Créer un Nouveau Script</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && <div className="p-3 bg-rose-500/10 text-rose-400 rounded-xl text-xs">{error}</div>}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate({
                  name,
                  description,
                  language,
                  initial_content: initialContent,
                  timeout_seconds: timeoutSeconds,
                });
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Nom du Script</label>
                  <input
                    type="text"
                    required
                    placeholder="ex: Collecte logs ou Nettoyage cache"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Langage</label>
                  <select
                    value={language}
                    onChange={(e) => handleLanguageChange(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500"
                  >
                    <option value="powershell">PowerShell (.ps1)</option>
                    <option value="vbscript">VBScript (.vbs)</option>
                    <option value="python">Python (.py)</option>
                    <option value="cmd">Windows CMD / Batch (.bat/.cmd)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Objectif du script..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                  Timeout d'exécution (secondes)
                </label>
                <div className="flex items-center space-x-3">
                  <input
                    type="number"
                    min={10}
                    max={86400}
                    required
                    value={timeoutSeconds}
                    onChange={(e) => setTimeoutSeconds(parseInt(e.target.value) || 300)}
                    className="w-36 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500 font-mono"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {[60, 300, 600, 900, 1200, 1800].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTimeoutSeconds(t)}
                        className={`text-[11px] px-2.5 py-1 rounded-lg border font-mono font-medium transition ${
                          timeoutSeconds === t
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        {t >= 60 ? `${t / 60}m` : `${t}s`}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Temps maximum alloué à l'agent client avant arrêt (par défaut : 300s / 5 min).
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Code Initial</label>
                <textarea
                  rows={8}
                  required
                  value={initialContent}
                  onChange={(e) => setInitialContent(e.target.value)}
                  className="w-full bg-slate-950 font-mono text-xs text-slate-200 border border-slate-800 rounded-xl p-3 outline-none focus:border-emerald-500 leading-relaxed"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold flex items-center space-x-2"
                >
                  {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Créer le Script</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Modifier Script (Créer version suivante) */}
      {selectedScriptForEdit && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-3xl w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-lg font-bold text-slate-100">
                  Nouvelle Version — {selectedScriptForEdit.name}
                </h2>
                <p className="text-xs text-slate-500">
                  Les versions déployées restent immuables. L'édition génère la version v{(selectedScriptForEdit.latest_version?.version || 0) + 1}.
                </p>
              </div>
              <button onClick={() => setSelectedScriptForEdit(null)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && <div className="p-3 bg-rose-500/10 text-rose-400 rounded-xl text-xs">{error}</div>}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                addVersionMutation.mutate();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                  Timeout d'exécution (secondes)
                </label>
                <div className="flex items-center space-x-3">
                  <input
                    type="number"
                    min={10}
                    max={86400}
                    required
                    value={versionTimeout}
                    onChange={(e) => setVersionTimeout(parseInt(e.target.value) || 300)}
                    className="w-36 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500 font-mono"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {[60, 300, 600, 900, 1200, 1800].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setVersionTimeout(t)}
                        className={`text-[11px] px-2.5 py-1 rounded-lg border font-mono font-medium transition ${
                          versionTimeout === t
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        {t >= 60 ? `${t / 60}m` : `${t}s`}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Temps maximum alloué à l'agent client pour cette version (ex: 900s / 15m ou 1200s / 20m pour les installations winget).
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Code du Script</label>
                <textarea
                  rows={12}
                  required
                  value={versionContent}
                  onChange={(e) => setVersionContent(e.target.value)}
                  className="w-full bg-slate-950 font-mono text-xs text-slate-200 border border-slate-800 rounded-xl p-3 outline-none focus:border-emerald-500 leading-relaxed"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedScriptForEdit(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={addVersionMutation.isPending}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold flex items-center space-x-2"
                >
                  {addVersionMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Enregistrer la Version v{(selectedScriptForEdit.latest_version?.version || 0) + 1}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
