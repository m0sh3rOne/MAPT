import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { Shield, User as UserIcon, LogOut, Activity, Download, Terminal, Copy, Check, X, Laptop, Zap, Sparkles } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [copiedAuto, setCopiedAuto] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [copiedEnroll, setCopiedEnroll] = useState(false);
  const [copiedService, setCopiedService] = useState(false);
  const [enrollToken, setEnrollToken] = useState('mapt-enroll-n044u01jvgtbwkbr');

  // Détection et configuration dynamique de l'hôte serveur
  const defaultHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'localhost'
    : window.location.hostname;
  
  // En dev (port 5173), l'API tourne sur 8088 par défaut. En prod (80/443), c'est direct.
  const defaultPort = window.location.port === '5173' ? '8088' : (window.location.port ? window.location.port : '');
  const [customHost, setCustomHost] = useState(defaultHost);
  const [customPort, setCustomPort] = useState(defaultPort);

  useEffect(() => {
    if (showAgentModal) {
      api.getEnrollmentToken()
        .then((data) => {
          if (data?.enrollment_token) {
            setEnrollToken(data.enrollment_token);
          }
        })
        .catch(() => {});
    }
  }, [showAgentModal]);

  const effectivePort = customPort ? `:${customPort}` : '';
  const serverUrl = `${window.location.protocol}//${customHost}${effectivePort}/api/v1`;
  const baseScriptUrl = `${window.location.protocol}//${customHost}${effectivePort}`;

  // Commande universelle PowerShell (PS 2.0 à 7+)
  const universalPs1Command = `Set-ExecutionPolicy Bypass -Scope Process -Force; try { [System.Net.ServicePointManager]::SecurityProtocol = 3072 -bor 768 -bor 192 } catch {}; (New-Object System.Net.WebClient).DownloadString('${baseScriptUrl}/scripts/install-agent.ps1') | iex`;

  // Commande Invite de commandes (cmd.exe / GPO / Snapin FOG)
  const universalCmdCommand = `powershell -Command "[System.Net.ServicePointManager]::SecurityProtocol = 3072; (New-Object System.Net.WebClient).DownloadString('${baseScriptUrl}/scripts/install-agent.ps1') | iex"`;

  // Commandes manuelles
  const enrollCommand = `.\\mapt-agent.exe -server "${serverUrl}" -enroll-token "${enrollToken}"`;
  const serviceCommand = `.\\mapt-agent.exe -service install -server "${serverUrl}" -enroll-token "${enrollToken}" && .\\mapt-agent.exe -service start`;

  const copyToClipboard = async (text: string, type: 'auto' | 'cmd' | 'enroll' | 'service') => {
    let success = false;
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        success = true;
      } catch (e) {
        // fallback
      }
    }
    if (!success) {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        textArea.setAttribute('readonly', '');
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        success = document.execCommand('copy');
        document.body.removeChild(textArea);
      } catch (e) {
        console.error('Copy failed:', e);
      }
    }

    if (type === 'auto') {
      setCopiedAuto(true);
      setTimeout(() => setCopiedAuto(false), 2500);
    } else if (type === 'cmd') {
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 2500);
    } else if (type === 'service') {
      setCopiedService(true);
      setTimeout(() => setCopiedService(false), 2500);
    } else {
      setCopiedEnroll(true);
      setTimeout(() => setCopiedEnroll(false), 2500);
    }
  };

  return (
    <>
      <header className="h-16 bg-slate-900/90 backdrop-blur border-b border-slate-800 flex items-center justify-between px-6 sticky top-0 z-30">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full text-xs font-semibold">
            <Activity className="w-3.5 h-3.5 animate-pulse text-emerald-400" />
            <span>Serveur Actif</span>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={() => setShowAgentModal(true)}
            className="flex items-center space-x-2 bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 border border-emerald-500/40 hover:border-emerald-500/70 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition shadow-sm"
            title="Télécharger l'agent Windows et obtenir les commandes d'installation"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Déployer l'Agent Windows</span>
          </button>

          <div className="flex items-center space-x-3 bg-slate-800/80 border border-slate-700/60 rounded-xl px-3 py-1.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm">
              {user?.username?.charAt(0).toUpperCase() || 'A'}
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold text-slate-200">{user?.username}</div>
              <div className="text-xs text-emerald-400 capitalize">{user?.role?.replace('_', ' ')}</div>
            </div>
          </div>

          <button
            onClick={logout}
            className="flex items-center space-x-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 px-3 py-2 rounded-xl transition text-sm font-medium"
            title="Déconnexion"
          >
            <LogOut className="w-4 h-4" />
            <span>Quitter</span>
          </button>
        </div>
      </header>

      {/* Modal Téléchargement & Déploiement Agent Windows */}
      {showAgentModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-3xl w-full shadow-2xl space-y-6 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Laptop className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-100">Déploiement de l'Agent Windows MAPT</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Binaire autonome Go avec gestion Service Windows automatique</p>
                </div>
              </div>
              <button onClick={() => setShowAgentModal(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Configuration IP du Serveur */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Adresse de connexion du Serveur MAPT
              </div>
              <p className="text-[11px] text-slate-400">
                Vérifiez l'adresse IP du serveur pour adapter automatiquement les scripts générés pour vos postes clients.
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="text-[10px] text-slate-500 uppercase font-bold">IP / Nom d'hôte du serveur</label>
                  <input
                    type="text"
                    value={customHost}
                    onChange={(e) => setCustomHost(e.target.value)}
                    placeholder="192.168.1.X ou localhost"
                    className="w-full mt-1 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 font-mono focus:border-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase font-bold">Port (Optionnel)</label>
                  <input
                    type="text"
                    value={customPort}
                    onChange={(e) => setCustomPort(e.target.value)}
                    placeholder="8088 ou vide"
                    className="w-full mt-1 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 font-mono focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* OPTION RECOMMANDÉE : 1-LIGNE POWERSHELL UNIVERSEL */}
            <div className="space-y-2 border border-emerald-500/40 bg-emerald-950/20 rounded-2xl p-4 shadow-lg shadow-emerald-950/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
                  <Zap className="w-4 h-4 text-emerald-400 fill-emerald-400" />
                  <span>Installation Automatisée 1-Ligne (PowerShell Administrateur)</span>
                </div>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold">
                  Universel PS 2.0 à 7+
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                Télécharge, configure, enregistre le Service Windows et enrôle la machine en une seule commande :
              </p>
              <div className="relative bg-slate-950 border border-emerald-500/30 rounded-xl p-3 font-mono text-xs text-emerald-300">
                <div className="overflow-x-auto pr-10 select-all whitespace-pre-wrap break-all">{universalPs1Command}</div>
                <button
                  onClick={() => copyToClipboard(universalPs1Command, 'auto')}
                  className="absolute right-2 top-2 p-2 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white transition shadow"
                  title="Copier la commande PowerShell universelle"
                >
                  {copiedAuto ? <Check className="w-4 h-4 text-emerald-200" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* OPTION CMD / BATCH / GPO */}
            <div className="space-y-2 bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Option B • En Invite de Commandes (`cmd.exe`) / GPO / Snapin FOG
              </div>
              <div className="relative bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-slate-300">
                <div className="overflow-x-auto pr-10 select-all whitespace-pre-wrap break-all">{universalCmdCommand}</div>
                <button
                  onClick={() => copyToClipboard(universalCmdCommand, 'cmd')}
                  className="absolute right-2 top-2 p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  title="Copier la commande CMD"
                >
                  {copiedCmd ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* ÉTAPE MANUELLE : Téléchargement & Service */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Téléchargement direct */}
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Téléchargement direct
                </div>
                <a
                  href="/api/v1/agent/download/windows"
                  download="mapt-agent.exe"
                  className="flex items-center justify-between bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-medium px-4 py-2.5 rounded-xl transition"
                >
                  <div className="flex items-center space-x-2.5">
                    <Download className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs">mapt-agent.exe</span>
                  </div>
                </a>
              </div>

              {/* Jeton Actif */}
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Jeton d'enrôlement configuré
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono text-xs text-amber-400 select-all truncate">
                  {enrollToken}
                </div>
              </div>
            </div>

            {/* Commandes Manuelles */}
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Commandes Manuelles (si exécutable téléchargé manuellement)
              </div>
              <div className="relative bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-slate-300">
                <div className="overflow-x-auto pr-10 select-all whitespace-pre-wrap">{serviceCommand}</div>
                <button
                  onClick={() => copyToClipboard(serviceCommand, 'service')}
                  className="absolute right-2 top-2 p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  title="Copier les commandes de service"
                >
                  {copiedService ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowAgentModal(false)}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

