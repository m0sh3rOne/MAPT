import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Shield, User as UserIcon, LogOut, Activity, Download, Terminal, Copy, Check, X, Laptop } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [copiedEnroll, setCopiedEnroll] = useState(false);
  const [copiedService, setCopiedService] = useState(false);

  // Détection et configuration dynamique de l'hôte serveur
  const defaultHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'localhost'
    : window.location.hostname;
  
  // En dev (port 5173), l'API tourne sur 8088 par défaut. En prod (80/443), c'est direct.
  const defaultPort = window.location.port === '5173' ? '8088' : (window.location.port ? window.location.port : '');
  const [customHost, setCustomHost] = useState(defaultHost);
  const [customPort, setCustomPort] = useState(defaultPort);

  const effectivePort = customPort ? `:${customPort}` : '';
  const serverUrl = `${window.location.protocol}//${customHost}${effectivePort}/api/v1`;

  const enrollCommand = `.\\mapt-agent.exe -server "${serverUrl}" -enroll-token "mapt-enroll-secret-token-2026"`;
  const serviceCommand = `.\\mapt-agent.exe -service install -server "${serverUrl}" -enroll-token "mapt-enroll-secret-token-2026"`;

  const copyToClipboard = (text: string, isService: boolean = false) => {
    navigator.clipboard.writeText(text);
    if (isService) {
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
            className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 hover:border-emerald-500/60 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition shadow-sm"
            title="Télécharger l'agent Windows et obtenir la clé d'enrôlement"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Télécharger l'Agent Windows</span>
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

      {/* Modal Téléchargement Agent Windows */}
      {showAgentModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl space-y-6 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Laptop className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-100">Agent Windows MAPT</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Binaire autonome Go pour l'administration et le déploiement</p>
                </div>
              </div>
              <button onClick={() => setShowAgentModal(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Étape 1 : Téléchargement */}
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Étape 1 • Télécharger le binaire
              </div>
              <a
                href="/api/v1/agent/download/windows"
                download="mapt-agent.exe"
                className="flex items-center justify-between bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-5 py-3 rounded-2xl shadow-lg shadow-emerald-600/20 transition"
              >
                <div className="flex items-center space-x-3">
                  <Download className="w-5 h-5" />
                  <div className="text-left">
                    <div className="text-sm">Télécharger mapt-agent.exe</div>
                    <div className="text-[11px] opacity-80 font-normal">Pour Windows x64 (10, 11, Server 2016+)</div>
                  </div>
                </div>
                <span className="text-xs bg-white/20 px-2.5 py-1 rounded-lg">~12 Mo</span>
              </a>
            </div>

            {/* Configuration IP du Serveur */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Adresse de connexion du Serveur MAPT
              </div>
              <p className="text-[11px] text-slate-400">
                Indiquez l'adresse IP de votre serveur ou VM (ex: <code className="text-emerald-400">192.168.1.50</code>) pour générer la commande exacte pour vos postes clients.
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

            {/* Étape 2 : Lancement / Enrôlement */}
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Étape 2 • Commande d'enrôlement (Mode Standalone / Test)
              </div>
              <div className="relative bg-slate-950 border border-slate-800 rounded-2xl p-4 font-mono text-xs text-emerald-300">
                <div className="overflow-x-auto pr-10">{enrollCommand}</div>
                <button
                  onClick={() => copyToClipboard(enrollCommand, false)}
                  className="absolute right-3 top-3 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  title="Copier la commande"
                >
                  {copiedEnroll ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Étape 3 : Installation Service */}
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Étape 3 • Installation en Service Windows d'arrière-plan (Production)
              </div>
              <div className="relative bg-slate-950 border border-slate-800 rounded-2xl p-4 font-mono text-xs text-slate-300">
                <div className="overflow-x-auto pr-10">{serviceCommand}</div>
                <button
                  onClick={() => copyToClipboard(serviceCommand, true)}
                  className="absolute right-3 top-3 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  title="Copier la commande de service"
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
