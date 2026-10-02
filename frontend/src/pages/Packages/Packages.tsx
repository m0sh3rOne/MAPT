import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import {
  Package as PackageIcon,
  Upload,
  Plus,
  Play,
  Trash2,
  HardDrive,
  Hash,
  Terminal,
  Loader2,
  X,
  Shield,
  Folder,
  Settings2,
  CheckCircle2,
  Monitor,
  CheckSquare,
  Square,
  Info,
  ChevronDown,
  ChevronUp,
  Sparkles,
  FileCode,
  Layers,
  Wrench,
  Check,
  Search
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { SchedulerSelector, ScheduleConfig } from '../../components/common/SchedulerSelector';

interface Preset {
  id: string;
  label: string;
  extension: string;
  icon: string;
  runWith: string;
  runWithArgs: string;
  packageArgs: string;
  runAsAdmin: boolean;
  destinationFolder: string;
  description: string;
}

const PRESETS: Preset[] = [
  {
    id: 'msi',
    label: 'MSI (msiexec)',
    extension: 'msi',
    icon: '📦',
    runWith: 'c:\\windows\\system32\\msiexec.exe',
    runWithArgs: '/i',
    packageArgs: '/qn /norestart',
    runAsAdmin: true,
    destinationFolder: '%ProgramData%\\MAPT\\packages',
    description: 'Windows Installer standard avec exécution silencieuse (/qn /norestart)'
  },
  {
    id: 'exe',
    label: 'EXE (Exécutable standard)',
    extension: 'exe',
    icon: '⚡',
    runWith: '',
    runWithArgs: '',
    packageArgs: '',
    runAsAdmin: true,
    destinationFolder: '%ProgramData%\\MAPT\\packages',
    description: 'Exécutable standard Windows lancé directement. Arguments silencieux optionnels (/S, /silent, /qn, /verysilent, /quiet, etc.).'
  },
  {
    id: 'vbs',
    label: 'VBScript (cscript)',
    extension: 'vbs',
    icon: '📜',
    runWith: 'c:\\windows\\system32\\cscript.exe',
    runWithArgs: '//nologo',
    packageArgs: '',
    runAsAdmin: true,
    destinationFolder: '%ProgramData%\\MAPT\\packages',
    description: 'Script VBS exécuté via l\'interpréteur CScript Windows'
  },
  {
    id: 'ps1',
    label: 'PowerShell (.ps1)',
    extension: 'ps1',
    icon: '🔷',
    runWith: 'powershell.exe',
    runWithArgs: '-ExecutionPolicy Bypass -NoProfile -File',
    packageArgs: '',
    runAsAdmin: true,
    destinationFolder: '%ProgramData%\\MAPT\\packages',
    description: 'Script PowerShell avec Bypass d\'ExecutionPolicy'
  },
  {
    id: 'bat',
    label: 'Batch CMD (.bat/.cmd)',
    extension: 'bat',
    icon: '⚙️',
    runWith: 'c:\\windows\\system32\\cmd.exe',
    runWithArgs: '/c',
    packageArgs: '',
    runAsAdmin: true,
    destinationFolder: '%ProgramData%\\MAPT\\packages',
    description: 'Fichier de commandes Batch/CMD exécuté via cmd.exe /c'
  },
  {
    id: 'zip',
    label: 'Archive (.zip)',
    extension: 'zip',
    icon: '🗜️',
    runWith: '',
    runWithArgs: '',
    packageArgs: '',
    runAsAdmin: true,
    destinationFolder: '%ProgramData%\\MAPT\\packages',
    description: 'Archive compressée déployée et copiée sur les postes clients'
  },
];

export const Packages: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'administrator';
  const isOperator = user?.role === 'operator';
  const isViewer = user?.role === 'viewer';

  const queryClient = useQueryClient();

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPackageForEdit, setSelectedPackageForEdit] = useState<any | null>(null);
  const [selectedPackageForUpload, setSelectedPackageForUpload] = useState<any | null>(null);
  const [packageToDeploy, setPackageToDeploy] = useState<any | null>(null);
  const [packageToDelete, setPackageToDelete] = useState<any | null>(null);

  // Form states - Create Modal
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [packageType, setPackageType] = useState('msi');
  const [version, setVersion] = useState('1.0.0');
  const [file, setFile] = useState<File | null>(null);
  const [detectedPresetBadge, setDetectedPresetBadge] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadBytesInfo, setUploadBytesInfo] = useState<{ loaded: number; total: number } | null>(null);

  // FOG-style Snapin parameters - Create Modal
  const [runWith, setRunWith] = useState('c:\\windows\\system32\\msiexec.exe');
  const [runWithArgs, setRunWithArgs] = useState('/i');
  const [packageArgs, setPackageArgs] = useState('/qn /norestart');
  const [runAsAdmin, setRunAsAdmin] = useState(true);
  const [isInteractive, setIsInteractive] = useState(false);
  const [destinationFolder, setDestinationFolder] = useState('%ProgramData%\\MAPT\\packages');
  const [installCommand, setInstallCommand] = useState('');

  // Form states - Edit Modal
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPackageType, setEditPackageType] = useState('msi');
  const [editRunWith, setEditRunWith] = useState('');
  const [editRunWithArgs, setEditRunWithArgs] = useState('');
  const [editPackageArgs, setEditPackageArgs] = useState('');
  const [editRunAsAdmin, setEditRunAsAdmin] = useState(true);
  const [editIsInteractive, setEditIsInteractive] = useState(false);
  const [editDestinationFolder, setEditDestinationFolder] = useState('%ProgramData%\\MAPT\\packages');
  const [editInstallCommand, setEditInstallCommand] = useState('');
  const [editShowAdvanced, setEditShowAdvanced] = useState(false);

  // Deployment Form states
  const [deployTargetType, setDeployTargetType] = useState<'all' | 'custom' | 'group'>('all');
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [deviceSearchQuery, setDeviceSearchQuery] = useState<string>('');
  const [deploySuccessMessage, setDeploySuccessMessage] = useState<string | null>(null);
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig>({
    is_recurring: false,
    schedule_type: 'immediate',
    scheduled_time: '08:00',
    scheduled_days_of_week: '1,2,3,4,5',
    interval_value: 1,
  });

  const [error, setError] = useState<string | null>(null);

  // Queries
  const { data: packages = [], isLoading } = useQuery({
    queryKey: ['packages'],
    queryFn: api.getPackages,
  });

  const { data: devices = [] } = useQuery({
    queryKey: ['devices'],
    queryFn: api.getDevices,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: api.getGroups,
  });

  // Apply preset to Create form
  const applyPreset = (presetId: string, customExt?: string) => {
    const p = PRESETS.find(pr => pr.id === presetId) || PRESETS[0];
    setPackageType(p.id);
    setRunWith(p.runWith);
    setRunWithArgs(p.runWithArgs);
    setPackageArgs(p.packageArgs);
    setRunAsAdmin(p.runAsAdmin);
    setDestinationFolder(p.destinationFolder);
    setDetectedPresetBadge(customExt ? `Type .${customExt.toUpperCase()} détecté &rarr; Préréglage ${p.label} appliqué !` : `Préréglage ${p.label} appliqué`);
  };

  // Apply preset to Edit form
  const applyPresetToEdit = (presetId: string) => {
    const p = PRESETS.find(pr => pr.id === presetId) || PRESETS[0];
    setEditPackageType(p.id);
    setEditRunWith(p.runWith);
    setEditRunWithArgs(p.runWithArgs);
    setEditPackageArgs(p.packageArgs);
    setEditRunAsAdmin(p.runAsAdmin);
    setEditDestinationFolder(p.destinationFolder);
  };

  // Automatically apply FOG presets when file is chosen
  const handleFileSelection = (selectedFile: File) => {
    setFile(selectedFile);
    const parts = selectedFile.name.split('.');
    if (parts.length > 1) {
      const ext = (parts.pop() || '').toLowerCase();
      let matchedId = 'zip';
      if (ext === 'msi') matchedId = 'msi';
      else if (ext === 'vbs' || ext === 'vb') matchedId = 'vbs';
      else if (ext === 'exe') matchedId = 'exe';
      else if (ext === 'ps1') matchedId = 'ps1';
      else if (ext === 'bat' || ext === 'cmd') matchedId = 'bat';
      
      applyPreset(matchedId, ext);

      const lowerName = selectedFile.name.toLowerCase();
      if (ext === 'exe' && (lowerName.includes('npp') || lowerName.includes('notepad') || lowerName.includes('setup') || lowerName.includes('installer'))) {
        setPackageArgs('/S');
      }
    }
    if (!name) {
      const baseName = selectedFile.name.replace(/\.[^/.]+$/, "");
      setName(baseName);
    }
  };

  const openEditModal = (pkg: any) => {
    setSelectedPackageForEdit(pkg);
    setEditName(pkg.name);
    setEditDescription(pkg.description || '');
    setEditPackageType(pkg.package_type || 'msi');

    const lv = pkg.latest_version;
    if (lv) {
      setEditRunWith(lv.run_with || '');
      setEditRunWithArgs(lv.run_with_args || '');
      setEditPackageArgs(lv.package_args || '');
      setEditRunAsAdmin(lv.run_as_admin ?? true);
      setEditIsInteractive(lv.is_interactive ?? false);
      setEditDestinationFolder(lv.destination_folder?.includes('APPDATA') ? '%ProgramData%\\MAPT\\packages' : (lv.destination_folder || '%ProgramData%\\MAPT\\packages'));
      setEditInstallCommand(lv.install_command || '');
    } else {
      const p = PRESETS.find(pr => pr.id === pkg.package_type) || PRESETS[0];
      setEditRunWith(p.runWith);
      setEditRunWithArgs(p.runWithArgs);
      setEditPackageArgs(p.packageArgs);
      setEditRunAsAdmin(p.runAsAdmin);
      setEditIsInteractive(false);
      setEditDestinationFolder(p.destinationFolder);
      setEditInstallCommand('');
    }
    setError(null);
    setEditShowAdvanced(false);
  };

  // Mutations
  const createPackageMutation = useMutation({
    mutationFn: async () => {
      setError(null);
      if (file) {
        setUploadProgress(0);
        setUploadBytesInfo({ loaded: 0, total: file.size });
        const formData = new FormData();
        formData.append('name', name);
        if (description) formData.append('description', description);
        formData.append('package_type', packageType);
        formData.append('version', version);
        formData.append('file', file);
        if (runWith) formData.append('run_with', runWith);
        if (runWithArgs) formData.append('run_with_args', runWithArgs);
        if (packageArgs) formData.append('package_args', packageArgs);
        formData.append('run_as_admin', String(runAsAdmin));
        formData.append('is_interactive', String(isInteractive));
        if (destinationFolder) formData.append('destination_folder', destinationFolder);
        if (installCommand) formData.append('install_command', installCommand);
        return api.createPackageWithFile(formData, (percent, loaded, total) => {
          setUploadProgress(percent);
          setUploadBytesInfo({ loaded, total });
        });
      } else {
        return api.createPackage({ name, description, package_type: packageType });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packages'] });
      setShowCreateModal(false);
      resetForms();
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || err.message || 'Erreur lors de la création du package');
    },
    onSettled: () => {
      setUploadProgress(null);
      setUploadBytesInfo(null);
    },
  });

  const updatePackageMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPackageForEdit) return;
      // 1. Update Package metadata
      await api.updatePackage(selectedPackageForEdit.id, {
        name: editName,
        description: editDescription,
        package_type: editPackageType,
      });

      // 2. Update latest version Snapin properties if present
      if (selectedPackageForEdit.latest_version) {
        await api.updatePackageVersion(selectedPackageForEdit.id, selectedPackageForEdit.latest_version.id, {
          run_with: editRunWith,
          run_with_args: editRunWithArgs,
          package_args: editPackageArgs,
          run_as_admin: editRunAsAdmin,
          is_interactive: editIsInteractive,
          destination_folder: editDestinationFolder,
          install_command: editInstallCommand,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packages'] });
      setSelectedPackageForEdit(null);
      setError(null);
    },
    onError: (err: any) => setError(err.response?.data?.detail || 'Erreur lors de la modification du package'),
  });

  const uploadVersionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPackageForUpload || !file) return;
      setError(null);
      setUploadProgress(0);
      setUploadBytesInfo({ loaded: 0, total: file.size });
      const formData = new FormData();
      formData.append('version', version);
      formData.append('file', file);
      if (runWith) formData.append('run_with', runWith);
      if (runWithArgs) formData.append('run_with_args', runWithArgs);
      if (packageArgs) formData.append('package_args', packageArgs);
      formData.append('run_as_admin', String(runAsAdmin));
      formData.append('is_interactive', String(isInteractive));
      if (destinationFolder) formData.append('destination_folder', destinationFolder);
      if (installCommand) formData.append('install_command', installCommand);
      return api.uploadPackageVersion(selectedPackageForUpload.id, formData, (percent, loaded, total) => {
        setUploadProgress(percent);
        setUploadBytesInfo({ loaded, total });
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packages'] });
      setSelectedPackageForUpload(null);
      resetForms();
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || err.message || 'Erreur lors de l’upload du package');
    },
    onSettled: () => {
      setUploadProgress(null);
      setUploadBytesInfo(null);
    },
  });

  const deletePackageMutation = useMutation({
    mutationFn: async (packageId: string) => {
      return api.deletePackage(packageId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packages'] });
      setPackageToDelete(null);
    },
    onError: (err: any) => setError(err.response?.data?.detail || 'Erreur lors de la suppression du package'),
  });

  const deployMutation = useMutation({
    mutationFn: async () => {
      if (!packageToDeploy || !packageToDeploy.latest_version) {
        throw new Error("Ce package ne possède aucun binaire uploadé.");
      }

      const payload: any = {
        name: `Déploiement Package: ${packageToDeploy.name} v${packageToDeploy.latest_version.version}`,
        deployment_type: 'package',
        package_version_id: packageToDeploy.latest_version.id,
        is_recurring: scheduleConfig.is_recurring,
        schedule_type: scheduleConfig.schedule_type,
        scheduled_at: scheduleConfig.scheduled_at ? new Date(scheduleConfig.scheduled_at).toISOString() : undefined,
        scheduled_time: scheduleConfig.scheduled_time,
        scheduled_days_of_week: scheduleConfig.scheduled_days_of_week,
        interval_value: scheduleConfig.interval_value,
        interval_unit: scheduleConfig.interval_unit,
        cron_expression: scheduleConfig.cron_expression,
        end_at: scheduleConfig.end_at ? new Date(scheduleConfig.end_at).toISOString() : undefined,
      };

      if (deployTargetType === 'all') {
        if (devices.length === 0) {
          throw new Error('Aucune machine enregistrée dans le parc.');
        }
        payload.target_all_devices = true;
        payload.target_device_ids = devices.map((d: any) => d.id);
      } else if (deployTargetType === 'group') {
        if (!selectedGroup) {
          throw new Error('Veuillez choisir un groupe de machines cible.');
        }
        payload.target_group_ids = [selectedGroup];
      } else if (deployTargetType === 'custom') {
        if (selectedDevices.length === 0) {
          throw new Error('Veuillez sélectionner au moins une machine cible.');
        }
        payload.target_device_ids = selectedDevices;
      } else {
        throw new Error('Veuillez sélectionner au moins une machine ou un groupe cible.');
      }

      return api.createDeployment(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      setDeploySuccessMessage(`Déploiement du package "${packageToDeploy?.name}" initié avec succès !`);
      setTimeout(() => {
        setDeploySuccessMessage(null);
        setPackageToDeploy(null);
      }, 2500);
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || err.message || 'Erreur lors de l’exécution du package');
    },
  });

  const resetForms = () => {
    setName('');
    setDescription('');
    setPackageType('msi');
    setVersion('1.0.0');
    setFile(null);
    setDetectedPresetBadge(null);
    setRunWith('c:\\windows\\system32\\msiexec.exe');
    setRunWithArgs('/i');
    setPackageArgs('/qn /norestart');
    setRunAsAdmin(true);
    setIsInteractive(false);
    setEditIsInteractive(false);
    setDestinationFolder('%ProgramData%\\MAPT\\packages');
    setInstallCommand('');
    setError(null);
    setShowAdvanced(false);
  };

  const toggleDeviceSelection = (deviceId: string) => {
    setSelectedDevices((prev) =>
      prev.includes(deviceId) ? prev.filter((id) => id !== deviceId) : [...prev, deviceId]
    );
  };

  const filteredDeployDevices = devices.filter((device: any) => {
    if (!deviceSearchQuery.trim()) return true;
    const q = deviceSearchQuery.toLowerCase().trim();
    const hostname = (device.hostname || '').toLowerCase();
    const ip = (device.ip_address || '').toLowerCase();
    const os = (device.os_name || '').toLowerCase();
    return hostname.includes(q) || ip.includes(q) || os.includes(q);
  });

  const selectAllDevices = () => {
    if (filteredDeployDevices.length === 0) return;
    const filteredIds = filteredDeployDevices.map((d: any) => d.id);
    const allFilteredSelected = filteredIds.every((id: string) => selectedDevices.includes(id));
    if (allFilteredSelected) {
      setSelectedDevices((prev) => prev.filter((id) => !filteredIds.includes(id)));
    } else {
      setSelectedDevices((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-black text-slate-100 tracking-tight">Dépôt des Packages & Snapins</h1>
            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs px-2.5 py-0.5 rounded-full font-medium">
              FOG-Style & Intégration Windows
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Gestion, distribution et exécution distante d'installateurs MSI, EXE, VBS avec contrôle des arguments et droits administrateur.
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => {
              resetForms();
              setShowCreateModal(true);
            }}
            className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-600/20 transition transform active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau Package</span>
          </button>
        )}
      </div>

      {/* Packages Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center p-12 text-slate-500 space-x-2">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
          <span>Chargement du dépôt des packages...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {packages.map((pkg: any) => {
            const hasVersion = !!pkg.latest_version;
            const lv = pkg.latest_version;

            return (
              <div
                key={pkg.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-6 flex flex-col justify-between space-y-4 shadow-xl transition relative group"
              >
                <div>
                  {/* Top bar with icon, type, edit gear and delete buttons */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                        <PackageIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="uppercase text-[10px] font-mono font-bold bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-emerald-400">
                          {pkg.package_type}
                        </span>
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center space-x-1">
                        {/* Roue Crantée / Gear Icon pour éditer la snapin existante */}
                        <button
                          onClick={() => openEditModal(pkg)}
                          title="Éditer les paramètres et la configuration Snapin"
                          className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition"
                        >
                          <Settings2 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => setPackageToDelete(pkg)}
                          title="Supprimer ce package"
                          className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  <h3 className="text-lg font-bold text-slate-100">{pkg.name}</h3>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                    {pkg.description || 'Aucune description fournie.'}
                  </p>

                  {/* Version & Snapin details */}
                  <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-2.5 text-xs">
                    {hasVersion ? (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Version actuelle :</span>
                          <span className="font-semibold text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/50">
                            v{lv.version}
                          </span>
                        </div>

                        <div className="flex items-center justify-between font-mono text-[11px]">
                          <span className="text-slate-500">Fichier :</span>
                          <span className="text-slate-200 font-medium truncate max-w-[160px]" title={lv.filename}>
                            {lv.filename}
                          </span>
                        </div>

                        <div className="flex items-center justify-between font-mono text-[11px]">
                          <span className="text-slate-500">Taille :</span>
                          <span className="text-slate-300">{(lv.size_bytes / (1024 * 1024)).toFixed(2)} Mo</span>
                        </div>

                        {/* Snapin summary badges */}
                        <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-2.5 mt-2 space-y-1 text-[11px] font-mono">
                          {lv.run_with && (
                            <div className="flex items-center justify-between text-slate-400">
                              <span className="text-slate-500 flex items-center gap-1">
                                <Terminal className="w-3 h-3 text-cyan-400" /> Run With :
                              </span>
                              <span className="text-cyan-300 truncate max-w-[130px]" title={lv.run_with}>
                                {lv.run_with.split('\\').pop()}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center justify-between text-slate-400">
                            <span className="text-slate-500 flex items-center gap-1">
                              <Shield className="w-3 h-3 text-amber-400" /> Admin :
                            </span>
                            <span className={lv.run_as_admin ? "text-emerald-400" : "text-slate-400"}>
                              {lv.run_as_admin ? "Requis" : "Standard"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-slate-400">
                            <span className="text-slate-500 flex items-center gap-1">
                              <Monitor className="w-3 h-3 text-purple-400" /> Mode :
                            </span>
                            <span className={lv.is_interactive ? "text-purple-400 font-semibold" : "text-emerald-400"}>
                              {lv.is_interactive ? "Interactif (GUI)" : "Silencieux"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-slate-400">
                            <span className="text-slate-500 flex items-center gap-1">
                              <Folder className="w-3 h-3 text-purple-400" /> Dossier :
                            </span>
                            <span className="text-slate-300 truncate max-w-[130px]" title={lv.destination_folder || "%ProgramData%\\MAPT\\packages"}>
                              {lv.destination_folder || "%ProgramData%\\MAPT\\packages"}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between font-mono text-[10px] text-slate-500 truncate pt-1">
                          <span className="flex items-center gap-1">
                            <Hash className="w-3 h-3" /> SHA256 :
                          </span>
                          <span className="truncate max-w-[140px] text-slate-400" title={lv.sha256}>
                            {lv.sha256}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center text-xs space-y-1">
                        <Info className="w-4 h-4 mx-auto" />
                        <p>Aucun installateur uploadé.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="pt-2 flex items-center gap-2">
                  {!isViewer && (
                    <button
                      disabled={!hasVersion}
                      onClick={() => {
                        setError(null);
                        setDeploySuccessMessage(null);
                        setPackageToDeploy(pkg);
                        setSelectedDevices([]);
                        setDeviceSearchQuery('');
                        setDeployTargetType('all');
                        setScheduleConfig({
                          is_recurring: false,
                          schedule_type: 'immediate',
                          scheduled_time: '08:00',
                          scheduled_days_of_week: '1,2,3,4,5',
                          interval_value: 1,
                        });
                      }}
                      className="flex-1 flex items-center justify-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white py-2.5 rounded-xl text-xs font-semibold transition shadow-md shadow-emerald-600/20"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Déployer</span>
                    </button>
                  )}

                  {isAdmin && (
                    <button
                      onClick={() => {
                        resetForms();
                        setSelectedPackageForUpload(pkg);
                        applyPreset(pkg.package_type);
                      }}
                      title="Uploader une nouvelle version ou binaire"
                      className="flex items-center justify-center space-x-1 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2.5 rounded-xl text-xs font-semibold transition border border-slate-700"
                    >
                      <Upload className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="hidden sm:inline">Version</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {packages.length === 0 && !isLoading && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center text-slate-500 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
            <PackageIcon className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-200">Aucun package enregistré</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Créez votre premier package pour déployer des applications (MSI, EXE, scripts VBS) sur l'ensemble de votre parc Windows.
            </p>
          </div>
          <button
            onClick={() => {
              resetForms();
              setShowCreateModal(true);
            }}
            className="inline-flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition"
          >
            <Plus className="w-4 h-4" />
            <span>Créer un package maintenant</span>
          </button>
        </div>
      )}

      {/* Modal: Édition Package & Snapin (Roue crantée) */}
      {selectedPackageForEdit && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Settings2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-100">Éditer le Package & Snapin</h2>
                  <p className="text-xs text-slate-400">
                    {selectedPackageForEdit.name} &bull; v{selectedPackageForEdit.latest_version?.version || '1.0.0'}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedPackageForEdit(null)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs flex items-center space-x-2">
                <Info className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                updatePackageMutation.mutate();
              }}
              className="space-y-4"
            >
              {/* Presets Selector Bar */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Préréglages d'Exécution Rapides (Snapin Presets)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {PRESETS.map((p) => {
                    const isSelected = editPackageType === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => applyPresetToEdit(p.id)}
                        className={`flex items-center space-x-2 p-2.5 rounded-xl border text-xs font-medium transition text-left ${
                          isSelected
                            ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 shadow-sm shadow-emerald-500/20'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                        }`}
                      >
                        <span className="text-base">{p.icon}</span>
                        <div className="truncate">
                          <p className="font-semibold text-slate-200 leading-none">{p.label}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5 truncate">{p.extension.toUpperCase()}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* General Package Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Nom du Package *</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Type de Package</label>
                  <select
                    value={editPackageType}
                    onChange={(e) => applyPresetToEdit(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500 uppercase"
                  >
                    <option value="msi">MSI (Windows Installer)</option>
                    <option value="exe">EXE (Binaire Windows)</option>
                    <option value="vbs">VBS (Script VBScript)</option>
                    <option value="ps1">PS1 (Script PowerShell)</option>
                    <option value="bat">BAT/CMD (Script de commandes)</option>
                    <option value="zip">ZIP (Archive de fichiers)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Description</label>
                <textarea
                  rows={2}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Détails du logiciel, cible de déploiement..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 outline-none focus:border-emerald-500"
                />
              </div>

              {/* Snapin Config Section */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Wrench className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      Configuration Snapin FOG & Exécution Distante
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditShowAdvanced(!editShowAdvanced)}
                    className="text-xs text-slate-400 hover:text-slate-200 flex items-center space-x-1"
                  >
                    <span>{editShowAdvanced ? "Options de base" : "Paramètres avancés"}</span>
                    {editShowAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-[11px] font-medium text-slate-400">
                      Snapin Run With <span className="text-slate-500 font-normal">(Interpréteur hôte)</span> :
                    </label>
                    <input
                      type="text"
                      value={editRunWith}
                      onChange={(e) => setEditRunWith(e.target.value)}
                      placeholder="ex: c:\windows\system32\msiexec.exe (Laisser vide pour un .EXE direct)"
                      className="w-full mt-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono placeholder:text-slate-600 focus:border-emerald-500 outline-none"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">Programme utilisé pour lancer le fichier (msiexec, cscript, powershell).</p>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-slate-400">
                      Snapin Run With Arguments :
                    </label>
                    <input
                      type="text"
                      value={editRunWithArgs}
                      onChange={(e) => setEditRunWithArgs(e.target.value)}
                      placeholder="ex: /i (MSI) ou //nologo (VBS)"
                      className="w-full mt-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono placeholder:text-slate-600 focus:border-emerald-500 outline-none"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">Arguments passés au programme hôte avant le fichier.</p>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-400">
                    Snapin Arguments <span className="text-slate-500 font-normal">(Arguments optionnels du logiciel)</span> :
                  </label>
                  <input
                    type="text"
                    value={editPackageArgs}
                    onChange={(e) => setEditPackageArgs(e.target.value)}
                    placeholder="Laisser vide pour une exécution sans argument, ou ex: /S, /silent, /qn /norestart"
                    className="w-full mt-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono placeholder:text-slate-600 focus:border-emerald-500 outline-none"
                  />
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="text-[10px] text-slate-500 font-medium">Suggestions :</span>
                    {[
                      { label: 'Aucun (Standard)', val: '' },
                      { label: '/S', val: '/S' },
                      { label: '/silent', val: '/silent' },
                      { label: '/verysilent', val: '/verysilent' },
                      { label: '/quiet', val: '/quiet' },
                      { label: '/qn /norestart', val: '/qn /norestart' },
                      { label: '/install /quiet', val: '/install /quiet' }
                    ].map((opt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setEditPackageArgs(opt.val)}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono border transition ${
                          editPackageArgs === opt.val
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-850'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mode d'exécution : Silencieux vs Graphique Interactif */}
                <div className="pt-1">
                  <label className="text-xs font-medium text-slate-300 block mb-1.5">
                    Mode d'exécution & visibilité :
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setEditIsInteractive(false)}
                      className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                        !editIsInteractive
                          ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-200">Silencieux (Arrière-plan)</span>
                        <Terminal className="w-3.5 h-3.5 opacity-70" />
                      </div>
                      <p className="text-[10px] text-slate-400 leading-snug">
                        Installation invisible en tâche de fond (Session 0).
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditIsInteractive(true)}
                      className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                        editIsInteractive
                          ? 'bg-blue-500/15 border-blue-500/50 text-blue-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-blue-300">Interactif (Graphique)</span>
                        <Monitor className="w-3.5 h-3.5 opacity-70 text-blue-400" />
                      </div>
                      <p className="text-[10px] text-slate-400 leading-snug">
                        Affiche l'assistant sur le bureau de l'utilisateur pour qu'il clique sur Suivant/Terminer.
                      </p>
                    </button>
                  </div>
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <input
                    type="checkbox"
                    id="edit-admin-check"
                    checked={editRunAsAdmin}
                    onChange={(e) => setEditRunAsAdmin(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 bg-slate-900 border-slate-700"
                  />
                  <label htmlFor="edit-admin-check" className="text-xs font-medium text-slate-300">
                    Exécuter en tant qu'administrateur (Privilèges élevés / Service système)
                  </label>
                </div>

                {editShowAdvanced && (
                  <div className="pt-2 border-t border-slate-800/80 space-y-3">
                    <div>
                      <label className="text-[11px] font-medium text-slate-400">Dossier de destination locale :</label>
                      <input
                        type="text"
                        value={editDestinationFolder}
                        onChange={(e) => setEditDestinationFolder(e.target.value)}
                        placeholder="%ProgramData%\MAPT\packages"
                        className="w-full mt-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:border-emerald-500 outline-none"
                      />
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Emplacement local où le binaire est copié avant son exécution.
                      </p>
                    </div>

                    <div>
                      <label className="text-[11px] font-medium text-slate-400">Commande personnalisée de désinstallation :</label>
                      <input
                        type="text"
                        value={editInstallCommand}
                        onChange={(e) => setEditInstallCommand(e.target.value)}
                        placeholder="Optionnelle — ex: msiexec /x {GUID} /qn"
                        className="w-full mt-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:border-emerald-500 outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedPackageForEdit(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={updatePackageMutation.isPending || !editName}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-sm font-semibold flex items-center space-x-2 shadow-lg shadow-emerald-600/20"
                >
                  {updatePackageMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Enregistrer les Modifications</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Nouveau Package (Avec Preset FOG Snapin automatique et détection d'extension) */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <PackageIcon className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-100">Créer un Nouveau Package (Snapin)</h2>
                  <p className="text-xs text-slate-400">Détection intelligente du format de fichier et préréglages FOG</p>
                </div>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs flex items-center space-x-2">
                <Info className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createPackageMutation.mutate();
              }}
              className="space-y-4"
            >
              {/* File Upload with Drag & Drop & auto preset */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                  1. Sélectionner le Fichier Installateur (.msi, .exe, .vbs, .ps1, .bat, .zip) *
                </label>
                <div className="border-2 border-dashed border-slate-800 hover:border-emerald-500/50 rounded-2xl p-5 bg-slate-950/70 text-center transition">
                  <input
                    type="file"
                    required
                    id="package-file-input"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileSelection(e.target.files[0]);
                      }
                    }}
                  />
                  <label htmlFor="package-file-input" className="cursor-pointer space-y-2 block">
                    <Upload className="w-8 h-8 text-emerald-400 mx-auto" />
                    {file ? (
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-emerald-400">{file.name}</p>
                        <p className="text-xs text-slate-400">{(file.size / (1024 * 1024)).toFixed(2)} Mo</p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs text-slate-300 font-medium">Cliquez pour sélectionner un binaire ou script</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">MSI, EXE, VBS, PS1, BAT, CMD, ZIP supportés</p>
                      </div>
                    )}
                  </label>
                </div>
              </div>

              {/* Detected Preset Pill Banner */}
              {detectedPresetBadge && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between text-xs text-emerald-300 animate-in fade-in duration-300">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span dangerouslySetInnerHTML={{ __html: detectedPresetBadge }} />
                  </div>
                  <span className="text-[10px] font-mono bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800 text-emerald-400">
                    AUTO
                  </span>
                </div>
              )}

              {/* Interactive Presets Selector */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                  2. Préréglages Snapin Disponibles
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {PRESETS.map((p) => {
                    const isSelected = packageType === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => applyPreset(p.id)}
                        className={`flex items-center space-x-2 p-2.5 rounded-xl border text-xs font-medium transition text-left ${
                          isSelected
                            ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 shadow-sm shadow-emerald-500/20'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                        }`}
                      >
                        <span className="text-base">{p.icon}</span>
                        <div className="truncate">
                          <p className="font-semibold text-slate-200 leading-none">{p.label}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5 truncate">{p.extension.toUpperCase()}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Package General Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Nom du Package *</label>
                  <input
                    type="text"
                    required
                    placeholder="ex: Google Chrome, 7-Zip, Agent"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Version Initiale *</label>
                  <input
                    type="text"
                    required
                    placeholder="ex: 1.0.0 ou 24.08"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Description (Optionnelle)</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Détails du logiciel, cible de déploiement..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 outline-none focus:border-emerald-500"
                />
              </div>

              {/* FOG Snapin Configuration Details */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Settings2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      Configuration d'Exécution & Snapin (FOG)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="text-xs text-slate-400 hover:text-slate-200 flex items-center space-x-1"
                  >
                    <span>{showAdvanced ? "Masquer avancés" : "Personnaliser"}</span>
                    {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-[11px] font-medium text-slate-400">
                      Snapin Run With <span className="text-slate-500 font-normal">(Interpréteur hôte)</span> :
                    </label>
                    <input
                      type="text"
                      value={runWith}
                      onChange={(e) => setRunWith(e.target.value)}
                      placeholder="ex: c:\windows\system32\msiexec.exe ou cscript.exe (Laisser vide pour un .exe)"
                      className="w-full mt-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono placeholder:text-slate-600 focus:border-emerald-500 outline-none"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">Laisser vide pour un .EXE direct. Requis pour .MSI, .VBS ou .PS1.</p>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-slate-400">
                      Snapin Run With Arguments :
                    </label>
                    <input
                      type="text"
                      value={runWithArgs}
                      onChange={(e) => setRunWithArgs(e.target.value)}
                      placeholder="ex: /i (MSI) ou //nologo (VBS) ou vide (.exe)"
                      className="w-full mt-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono placeholder:text-slate-600 focus:border-emerald-500 outline-none"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">Arguments passés au programme hôte avant le fichier.</p>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-400">
                    Snapin Arguments <span className="text-slate-500 font-normal">(Arguments optionnels du logiciel)</span> :
                  </label>
                  <input
                    type="text"
                    value={packageArgs}
                    onChange={(e) => setPackageArgs(e.target.value)}
                    placeholder="Laisser vide pour une exécution sans argument, ou ex: /S, /silent, /qn /norestart"
                    className="w-full mt-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono placeholder:text-slate-600 focus:border-emerald-500 outline-none"
                  />
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="text-[10px] text-slate-500 font-medium">Suggestions :</span>
                    {[
                      { label: 'Aucun (Standard)', val: '' },
                      { label: '/S', val: '/S' },
                      { label: '/silent', val: '/silent' },
                      { label: '/verysilent', val: '/verysilent' },
                      { label: '/quiet', val: '/quiet' },
                      { label: '/qn /norestart', val: '/qn /norestart' },
                      { label: '/install /quiet', val: '/install /quiet' }
                    ].map((opt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setPackageArgs(opt.val)}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono border transition ${
                          packageArgs === opt.val
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-850'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mode d'exécution : Silencieux vs Graphique Interactif */}
                <div className="pt-1">
                  <label className="text-xs font-medium text-slate-300 block mb-1.5">
                    Mode d'exécution & visibilité :
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setIsInteractive(false)}
                      className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                        !isInteractive
                          ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-200">Silencieux (Arrière-plan)</span>
                        <Terminal className="w-3.5 h-3.5 opacity-70" />
                      </div>
                      <p className="text-[10px] text-slate-400 leading-snug">
                        Installation invisible en tâche de fond (Session 0).
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsInteractive(true)}
                      className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                        isInteractive
                          ? 'bg-blue-500/15 border-blue-500/50 text-blue-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-blue-300">Interactif (Graphique)</span>
                        <Monitor className="w-3.5 h-3.5 opacity-70 text-blue-400" />
                      </div>
                      <p className="text-[10px] text-slate-400 leading-snug">
                        Affiche l'assistant sur le bureau de l'utilisateur pour qu'il clique sur Suivant/Terminer.
                      </p>
                    </button>
                  </div>
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <input
                    type="checkbox"
                    id="create-admin-check"
                    checked={runAsAdmin}
                    onChange={(e) => setRunAsAdmin(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 bg-slate-900 border-slate-700"
                  />
                  <label htmlFor="create-admin-check" className="text-xs font-medium text-slate-300">
                    Exécuter en tant qu'administrateur (Privilèges élevés / Service système)
                  </label>
                </div>

                {/* Advanced Options Toggle */}
                {showAdvanced && (
                  <div className="pt-2 border-t border-slate-800/80 space-y-3">
                    <div>
                      <label className="text-[11px] font-medium text-slate-400">Dossier de destination locale :</label>
                      <input
                        type="text"
                        value={destinationFolder}
                        onChange={(e) => setDestinationFolder(e.target.value)}
                        placeholder="%ProgramData%\MAPT\packages"
                        className="w-full mt-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:border-emerald-500 outline-none"
                      />
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Le fichier est copié localement dans ce répertoire avant exécution (stockage persistant).
                      </p>
                    </div>
                  </div>
                )}
                {/* Upload Progress Indicator */}
                {uploadProgress !== null && (
                  <div className="p-4 bg-slate-950/90 border border-emerald-500/40 rounded-2xl space-y-2.5 shadow-lg shadow-emerald-950/40 animate-in fade-in">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <div className="flex items-center space-x-2 text-emerald-400">
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                        <span>
                          {uploadProgress < 100
                            ? 'Téléversement en cours vers le serveur MAPT...'
                            : 'Enregistrement, calcul SHA-256 et stockage en cours...'}
                        </span>
                      </div>
                      <span className="font-mono text-emerald-300 font-bold text-sm">{uploadProgress}%</span>
                    </div>

                    {/* Progress Bar Track */}
                    <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden border border-slate-800 p-0.5">
                      <div
                        className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-300 ease-out shadow-sm shadow-emerald-500/50"
                        style={{ width: `${Math.max(5, uploadProgress)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                      <span>
                        {uploadBytesInfo && uploadBytesInfo.total > 0
                          ? `${(uploadBytesInfo.loaded / (1024 * 1024)).toFixed(2)} Mo / ${(uploadBytesInfo.total / (1024 * 1024)).toFixed(2)} Mo transférés`
                          : 'Initialisation du transfert...'}
                      </span>
                      <span className="text-slate-500">Ne fermez pas cette fenêtre</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  disabled={createPackageMutation.isPending}
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-xl text-sm font-medium"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={createPackageMutation.isPending || !file || !name}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-sm font-semibold flex items-center space-x-2 shadow-lg shadow-emerald-600/20"
                >
                  {createPackageMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>
                    {createPackageMutation.isPending
                      ? uploadProgress !== null && uploadProgress < 100
                        ? `Envoi en cours (${uploadProgress}%)`
                        : 'Traitement serveur...'
                      : 'Créer et Uploader le Package'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Uploader Nouvelle Version */}
      {selectedPackageForUpload && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <Upload className="w-4 h-4" />
                </div>
                <h2 className="text-lg font-bold text-slate-100">
                  Nouvelle Version — {selectedPackageForUpload.name}
                </h2>
              </div>
              <button onClick={() => setSelectedPackageForUpload(null)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs">
                {error}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                uploadVersionMutation.mutate();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Numéro de version *</label>
                <input
                  type="text"
                  required
                  placeholder="ex: 1.1.0 ou 2.0"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                  Fichier d'installation (.msi, .exe, .vbs) *
                </label>
                <input
                  type="file"
                  required
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileSelection(e.target.files[0]);
                    }
                  }}
                  className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-500 cursor-pointer bg-slate-950 border border-slate-800 rounded-xl p-2"
                />
              </div>

              {/* Snapin Config */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center space-x-2">
                  <Settings2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Paramètres Snapin FOG
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-slate-400">
                      Snapin Run With <span className="text-slate-500 font-normal">(Interpréteur)</span> :
                    </label>
                    <input
                      type="text"
                      value={runWith}
                      onChange={(e) => setRunWith(e.target.value)}
                      placeholder="ex: msiexec.exe ou cscript.exe (Laisser vide pour un .exe)"
                      className="w-full mt-1 bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono placeholder:text-slate-600 focus:border-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400">Snapin Run With Args :</label>
                    <input
                      type="text"
                      value={runWithArgs}
                      onChange={(e) => setRunWithArgs(e.target.value)}
                      placeholder="ex: /i ou //nologo"
                      className="w-full mt-1 bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono placeholder:text-slate-600 focus:border-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-slate-400">Snapin Arguments (Arguments optionnels) :</label>
                  <input
                    type="text"
                    value={packageArgs}
                    onChange={(e) => setPackageArgs(e.target.value)}
                    placeholder="Laisser vide pour une exécution sans argument, ou ex: /S, /silent, /qn /norestart"
                    className="w-full mt-1 bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono placeholder:text-slate-600 focus:border-emerald-500 outline-none"
                  />
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="text-[10px] text-slate-500 font-medium">Suggestions :</span>
                    {[
                      { label: 'Aucun (Standard)', val: '' },
                      { label: '/S', val: '/S' },
                      { label: '/silent', val: '/silent' },
                      { label: '/verysilent', val: '/verysilent' },
                      { label: '/quiet', val: '/quiet' },
                      { label: '/qn /norestart', val: '/qn /norestart' },
                      { label: '/install /quiet', val: '/install /quiet' }
                    ].map((opt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setPackageArgs(opt.val)}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono border transition ${
                          packageArgs === opt.val
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-850'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mode d'exécution : Silencieux vs Graphique Interactif */}
                <div className="pt-1">
                  <label className="text-xs font-medium text-slate-300 block mb-1.5">
                    Mode d'exécution & visibilité :
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setIsInteractive(false)}
                      className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                        !isInteractive
                          ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-200">Silencieux (Arrière-plan)</span>
                        <Terminal className="w-3.5 h-3.5 opacity-70" />
                      </div>
                      <p className="text-[10px] text-slate-400 leading-snug">
                        Installation invisible en tâche de fond (Session 0).
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsInteractive(true)}
                      className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                        isInteractive
                          ? 'bg-blue-500/15 border-blue-500/50 text-blue-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-blue-300">Interactif (Graphique)</span>
                        <Monitor className="w-3.5 h-3.5 opacity-70 text-blue-400" />
                      </div>
                      <p className="text-[10px] text-slate-400 leading-snug">
                        Affiche l'assistant sur le bureau de l'utilisateur pour qu'il clique sur Suivant/Terminer.
                      </p>
                    </button>
                  </div>
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <input
                    type="checkbox"
                    id="version-admin-check"
                    checked={runAsAdmin}
                    onChange={(e) => setRunAsAdmin(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 bg-slate-900 border-slate-700"
                  />
                  <label htmlFor="version-admin-check" className="text-xs font-medium text-slate-300">
                    Exécuter en tant qu'administrateur (Privilèges élevés / Service)
                  </label>
                </div>
                {/* Upload Progress Indicator */}
                {uploadProgress !== null && (
                  <div className="p-4 bg-slate-950/90 border border-emerald-500/40 rounded-2xl space-y-2.5 shadow-lg shadow-emerald-950/40 animate-in fade-in">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <div className="flex items-center space-x-2 text-emerald-400">
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                        <span>
                          {uploadProgress < 100
                            ? 'Téléversement en cours vers le serveur MAPT...'
                            : 'Enregistrement, calcul SHA-256 et stockage en cours...'}
                        </span>
                      </div>
                      <span className="font-mono text-emerald-300 font-bold text-sm">{uploadProgress}%</span>
                    </div>

                    {/* Progress Bar Track */}
                    <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden border border-slate-800 p-0.5">
                      <div
                        className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-300 ease-out shadow-sm shadow-emerald-500/50"
                        style={{ width: `${Math.max(5, uploadProgress)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                      <span>
                        {uploadBytesInfo && uploadBytesInfo.total > 0
                          ? `${(uploadBytesInfo.loaded / (1024 * 1024)).toFixed(2)} Mo / ${(uploadBytesInfo.total / (1024 * 1024)).toFixed(2)} Mo transférés`
                          : 'Initialisation du transfert...'}
                      </span>
                      <span className="text-slate-500">Ne fermez pas cette fenêtre</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  disabled={uploadVersionMutation.isPending}
                  onClick={() => setSelectedPackageForUpload(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-xl text-sm font-medium"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={uploadVersionMutation.isPending || !file}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-sm font-semibold flex items-center space-x-2 shadow-lg shadow-emerald-600/20"
                >
                  {uploadVersionMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>
                    {uploadVersionMutation.isPending
                      ? uploadProgress !== null && uploadProgress < 100
                        ? `Envoi en cours (${uploadProgress}%)`
                        : 'Traitement serveur...'
                      : 'Uploader la Version'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Déployer / Exécuter le Package sur le parc */}
      {packageToDeploy && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-xl w-full shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <Play className="w-4 h-4 fill-current" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-100">
                    Déployer : {packageToDeploy.name}
                  </h2>
                  <p className="text-xs text-slate-400">
                    Version v{packageToDeploy.latest_version?.version} ({packageToDeploy.latest_version?.filename})
                  </p>
                </div>
              </div>
              <button onClick={() => setPackageToDeploy(null)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            {deploySuccessMessage && (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl text-xs space-y-2">
                <div className="flex items-center space-x-2 font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{deploySuccessMessage}</span>
                </div>
                <div className="pt-2">
                  <Link
                    to="/deployments"
                    className="inline-flex items-center space-x-1.5 underline font-semibold text-emerald-300 hover:text-emerald-200"
                  >
                    <span>Voir l'avancement dans les Déploiements &rarr;</span>
                  </Link>
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs">
                {error}
              </div>
            )}

            {/* Target Mode Selector */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-400 uppercase">Cible du déploiement</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setDeployTargetType('all')}
                  className={`p-3 rounded-xl border text-xs font-semibold text-center transition ${
                    deployTargetType === 'all'
                      ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  Toutes les machines ({devices.length})
                </button>

                <button
                  type="button"
                  onClick={() => setDeployTargetType('custom')}
                  className={`p-3 rounded-xl border text-xs font-semibold text-center transition ${
                    deployTargetType === 'custom'
                      ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  Sélection manuelle ({selectedDevices.length})
                </button>

                <button
                  type="button"
                  onClick={() => setDeployTargetType('group')}
                  className={`p-3 rounded-xl border text-xs font-semibold text-center transition ${
                    deployTargetType === 'group'
                      ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  Par Groupe ({groups.length})
                </button>
              </div>
            </div>

            {/* Target Type: Group */}
            {deployTargetType === 'group' && (
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-400 uppercase">Choisir un groupe cible</label>
                <select
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500"
                >
                  <option value="">-- Sélectionnez un groupe --</option>
                  {groups.map((g: any) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.device_count || 0} machine{g.device_count > 1 ? 's' : ''})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Target Type: Custom Devices Selection */}
            {deployTargetType === 'custom' && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Machines disponibles
                    </label>
                    <span className="text-[11px] font-semibold text-slate-500 bg-slate-950 px-2 py-0.5 rounded-full border border-slate-800">
                      {filteredDeployDevices.length} / {devices.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={selectAllDevices}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-medium transition"
                  >
                    {filteredDeployDevices.length > 0 &&
                    filteredDeployDevices.every((d: any) => selectedDevices.includes(d.id))
                      ? 'Tout désélectionner'
                      : 'Tout sélectionner'}
                  </button>
                </div>

                {/* Champ de Recherche / Filtrage */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={deviceSearchQuery}
                    onChange={(e) => setDeviceSearchQuery(e.target.value)}
                    placeholder="Filtrer par nom de machine, IP, OS..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-emerald-500 transition"
                  />
                  {deviceSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setDeviceSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition"
                      title="Effacer le filtre"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Liste des machines filtrées */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-2 max-h-52 overflow-y-auto space-y-1">
                  {devices.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-4">Aucune machine enregistrée.</p>
                  ) : filteredDeployDevices.length === 0 ? (
                    <div className="text-center py-4 space-y-1">
                      <p className="text-xs text-slate-500">
                        Aucune machine ne correspond à « <span className="text-slate-300">{deviceSearchQuery}</span> »
                      </p>
                      <button
                        type="button"
                        onClick={() => setDeviceSearchQuery('')}
                        className="text-[11px] text-emerald-400 hover:underline"
                      >
                        Effacer la recherche
                      </button>
                    </div>
                  ) : (
                    filteredDeployDevices.map((device: any) => {
                      const isSelected = selectedDevices.includes(device.id);
                      return (
                        <div
                          key={device.id}
                          onClick={() => toggleDeviceSelection(device.id)}
                          className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition text-xs ${
                            isSelected
                              ? 'bg-emerald-950/30 border border-emerald-800/50 text-slate-200 shadow-sm shadow-emerald-950/40'
                              : 'hover:bg-slate-900 border border-transparent text-slate-400'
                          }`}
                        >
                          <div className="flex items-center space-x-2.5">
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-600 shrink-0" />
                            )}
                            <div>
                              <p className="font-semibold text-slate-200">{device.hostname}</p>
                              <p className="text-[10px] text-slate-500">
                                {device.ip_address || 'IP inconnue'} &bull; {device.os_name || 'Windows'}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`w-2 h-2 rounded-full ${
                              device.is_online ? 'bg-emerald-400 ring-4 ring-emerald-400/20' : 'bg-slate-600'
                            }`}
                            title={device.is_online ? 'En ligne' : 'Hors ligne'}
                          />
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Schedule & Recurrence Selector */}
            <SchedulerSelector value={scheduleConfig} onChange={setScheduleConfig} />

            {/* Execution summary */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3.5 space-y-2 text-xs text-slate-300 font-mono">
              <div className="flex items-center justify-between text-slate-400">
                <span>Exécution :</span>
                <span className="text-cyan-400">
                  {packageToDeploy.latest_version?.run_with || "Exécution directe"}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Arguments :</span>
                <span className="text-slate-300">
                  {packageToDeploy.latest_version?.package_args || "Aucun"}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Mode d'affichage :</span>
                <span className={packageToDeploy.latest_version?.is_interactive ? "text-blue-400 font-semibold" : "text-slate-300"}>
                  {packageToDeploy.latest_version?.is_interactive ? "Interactif (Écran Utilisateur)" : "Silencieux (Arrière-plan)"}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Droits :</span>
                <span className={packageToDeploy.latest_version?.run_as_admin ? "text-emerald-400" : "text-slate-400"}>
                  {packageToDeploy.latest_version?.run_as_admin ? "Administrateur (SYSTEM)" : "Utilisateur"}
                </span>
              </div>
            </div>

            {packageToDeploy.latest_version?.is_interactive ? (
              <div className="bg-blue-500/10 border border-blue-500/20 text-blue-300 p-3 rounded-2xl text-xs flex items-start space-x-2.5">
                <Monitor className="w-4 h-4 mt-0.5 shrink-0 text-blue-400" />
                <div className="space-y-1">
                  <div className="font-semibold text-blue-300">Mode Interactif (Interface Graphique)</div>
                  <div className="text-slate-300 leading-relaxed">
                    L'installateur s'affichera directement sur l'écran de la session active de l'utilisateur distant. Ce dernier pourra suivre les étapes graphiques (Suivant, Installer, etc.) et finaliser l'installation.
                  </div>
                </div>
              </div>
            ) : (
              (!packageToDeploy.latest_version?.package_args || packageToDeploy.latest_version?.package_args.trim() === '') && (packageToDeploy.latest_version?.filename?.toLowerCase().endsWith('.exe')) && (
                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 p-3 rounded-2xl text-xs flex items-start space-x-2.5">
                  <Info className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
                  <div className="space-y-1">
                    <div className="font-semibold text-amber-300">Mode silencieux requis (Session 0)</div>
                    <div className="text-slate-400 leading-relaxed">
                      L'agent MAPT tourne en service système sans interface graphique. L'argument silencieux (<code>/S</code>) est appliqué automatiquement pour éviter tout blocage.
                    </div>
                  </div>
                </div>
              )
            )}

            <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setPackageToDeploy(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={() => deployMutation.mutate()}
                disabled={deployMutation.isPending || !!deploySuccessMessage}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-sm font-semibold flex items-center space-x-2 shadow-lg shadow-emerald-600/20"
              >
                {deployMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                <Play className="w-4 h-4 fill-current" />
                <span>Lancer le Déploiement</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmation de suppression */}
      {packageToDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-slate-100">Supprimer le Package</h2>
            </div>

            <p className="text-sm text-slate-300">
              Êtes-vous certain de vouloir archiver et supprimer le package{' '}
              <strong className="text-white font-semibold">{packageToDelete.name}</strong> ?
            </p>

            <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl text-xs">
              Les déploiements passés resteront consultables dans l'historique d'audit.
            </div>

            <div className="flex justify-end space-x-3 pt-3">
              <button
                type="button"
                onClick={() => setPackageToDelete(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => deletePackageMutation.mutate(packageToDelete.id)}
                disabled={deletePackageMutation.isPending}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-semibold flex items-center space-x-2"
              >
                {deletePackageMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Supprimer</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
