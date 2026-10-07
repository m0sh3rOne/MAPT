import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Navigate } from 'react-router-dom';
import {
  Bot,
  Cpu,
  Power,
  Zap,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  RefreshCw,
  Terminal,
  Shield,
  Layers,
  Sparkles,
  ExternalLink,
  Settings,
  Activity,
  Code2,
  Radio,
  Search,
  Filter,
  CheckCheck,
  AlertTriangle,
  Loader2,
  Lock,
  ChevronDown,
  ChevronRight,
  Monitor,
  Rocket,
  Server
} from 'lucide-react';
import { McpToolInfo, McpStatus, McpTestConnectionResponse } from '../../types';

export const McpServer: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Restriction stricte Super Admin
  if (user?.role !== 'super_admin') {
    return <Navigate to="/" replace />;
  }

  const [activeConfigTab, setActiveConfigTab] = useState<'antigravity' | 'claude' | 'cursor' | 'cli'>('antigravity');
  const [toolSearch, setToolSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [expandedTool, setExpandedTool] = useState<string | null>('mapt_run_command');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Settings form state
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editPort, setEditPort] = useState<number>(8080);
  const [editHost, setEditHost] = useState<string>('');

  const { data: mcpStatus, isLoading, refetch, isFetching } = useQuery<McpStatus>({
    queryKey: ['mcp-status'],
    queryFn: api.getMcpStatus,
    refetchInterval: 15000,
  });

  const toggleMutation = useMutation({
    mutationFn: (newEnabled: boolean) => api.toggleMcpServer(newEnabled),
    onSuccess: (data) => {
      queryClient.setQueryData(['mcp-status'], data);
      queryClient.invalidateQueries({ queryKey: ['mcp-status'] });
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (settings: { port?: number; custom_host?: string }) => api.updateMcpSettings(settings),
    onSuccess: (data) => {
      queryClient.setQueryData(['mcp-status'], data);
      queryClient.invalidateQueries({ queryKey: ['mcp-status'] });
      setShowSettingsModal(false);
    },
  });

  const [testResult, setTestResult] = useState<McpTestConnectionResponse | null>(null);
  const testConnectionMutation = useMutation({
    mutationFn: () => api.testMcpConnection(),
    onSuccess: (res) => {
      setTestResult(res);
    },
  });

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 3000);
  };

  const handleOpenSettings = () => {
    if (mcpStatus) {
      setEditPort(mcpStatus.port);
      setEditHost(mcpStatus.host);
    }
    setShowSettingsModal(true);
  };

  const tools: McpToolInfo[] = mcpStatus?.tools || [];
  const categories = ['ALL', ...Array.from(new Set(tools.map((t) => t.category)))];

  const filteredTools = tools.filter((tool) => {
    const matchesCat = selectedCategory === 'ALL' || tool.category === selectedCategory;
    const matchesSearch =
      toolSearch === '' ||
      tool.name.toLowerCase().includes(toolSearch.toLowerCase()) ||
      tool.description.toLowerCase().includes(toolSearch.toLowerCase()) ||
      tool.parameters.some((p) => p.name.toLowerCase().includes(toolSearch.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  if (isLoading) {
    return (
      <div className="py-24 text-center space-y-4">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin mx-auto" />
        <p className="text-slate-400 text-sm">Chargement des paramètres du serveur MCP...</p>
      </div>
    );
  }

  const isEnabled = mcpStatus?.enabled ?? true;
  const defaultHost = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
  const serverUrl = mcpStatus?.server_url || `http://${defaultHost}:8080/sse`;
  const apiUrl = mcpStatus?.api_url || `http://${defaultHost}/api/v1`;

  const antigravityConfigStr = JSON.stringify(mcpStatus?.config_antigravity || {}, null, 2);
  const claudeConfigStr = JSON.stringify(mcpStatus?.config_claude_desktop || {}, null, 2);
  const cursorConfigStr = JSON.stringify(mcpStatus?.config_cursor || {}, null, 2);
  const pythonCliStr = mcpStatus?.config_python_cli || `python mcp/server.py --sse --port 8080`;

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* ========================================================================= */}
      {/* HEADER SECTION                                                            */}
      {/* ========================================================================= */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-800">
        <div className="flex items-start space-x-4">
          <div className="p-3.5 bg-gradient-to-tr from-purple-600 to-indigo-500 text-white rounded-2xl shadow-xl shadow-purple-950/50 border border-purple-400/30 shrink-0">
            <Bot className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-black text-slate-100 tracking-tight">
                Administration Serveur MCP (Model Context Protocol)
              </h1>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Super Admin Only
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl">
              Permet aux agents d'intelligence artificielle (Google Antigravity, Claude, Cursor, ChatGPT) de se connecter de façon sécurisée à l'API MAPT pour auditer le parc, exécuter des scripts distants et piloter les machines.
            </p>
          </div>
        </div>

        {/* Master Action Controls */}
        <div className="flex items-center space-x-3 shrink-0">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 transition"
            title="Rafraîchir le statut"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-purple-400' : ''}`} />
          </button>

          <button
            onClick={handleOpenSettings}
            className="flex items-center space-x-2 px-3.5 py-2.5 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
          >
            <Settings className="w-4 h-4 text-slate-400" />
            <span>Paramètres Réseau</span>
          </button>

          {/* Activation Toggle Button */}
          <button
            onClick={() => toggleMutation.mutate(!isEnabled)}
            disabled={toggleMutation.isPending}
            className={`flex items-center space-x-2.5 px-5 py-2.5 rounded-xl text-xs font-bold transition shadow-lg disabled:opacity-50 ${
              isEnabled
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-950/50 border border-emerald-400/30'
                : 'bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 shadow-rose-950/50'
            }`}
          >
            <Power className="w-4 h-4" />
            <span>{isEnabled ? 'Serveur MCP : ACTIF' : 'Serveur MCP : DÉSACTIVÉ'}</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* STATUS METRICS CARDS                                                      */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Statut du Serveur</span>
            <div className={`w-2.5 h-2.5 rounded-full ${isEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-xl font-black text-slate-100">{isEnabled ? 'Opérationnel' : 'Inactif'}</span>
            <span className="text-xs text-slate-500 font-mono">v1.0.0</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {isEnabled ? 'Prêt pour les requêtes des agents IA' : 'Les connexions MCP entrantes sont bloquées'}
          </p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Outils MCP Exposés</span>
            <Code2 className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-2xl font-black text-slate-100">{tools.length}</span>
            <span className="text-xs text-purple-400 font-medium">fonctions actives</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Inventaire, Exécution PowerShell, WoL, Arrêt/Reboot
          </p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Port Réseau SSE / HTTP</span>
            <Radio className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-2xl font-black font-mono text-cyan-400">:{mcpStatus?.port || 8080}</span>
            <span className="text-xs text-slate-500">TCP</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Endpoint SSE: <span className="font-mono text-slate-400">/sse</span>
          </p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Sécurité & Rôles</span>
            <Shield className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-lg font-black text-slate-100">JWT Bearer</span>
            <span className="text-xs text-emerald-400 font-medium">Auto-Refresh</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Isolation stricte et reprise automatique sur expiration
          </p>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SERVER ADDRESS & QUICK TEST HERO BANNER                                    */}
      {/* ========================================================================= */}
      <div className="p-6 bg-gradient-to-r from-purple-950/60 via-slate-900 to-indigo-950/60 border border-purple-500/30 rounded-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center space-x-2.5">
              <span className="px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-300 font-bold text-xs border border-purple-500/30 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5" />
                ADRESSE DU SERVEUR MCP
              </span>
              <span className="text-xs text-slate-400">Endpoint réseau pour assistants IA distants</span>
            </div>

            <div className="flex items-center space-x-3 pt-1">
              <div className="px-4 py-2.5 bg-slate-950/90 rounded-2xl border border-purple-500/40 font-mono text-sm sm:text-base font-bold text-purple-300 flex items-center space-x-3 shadow-inner">
                <span>{serverUrl}</span>
              </div>
              <button
                onClick={() => handleCopy(serverUrl, 'server-url')}
                className="p-3 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl transition shadow-lg shadow-purple-950/50 flex items-center space-x-2 font-semibold text-xs"
                title="Copier l'adresse du serveur MCP"
              >
                {copiedKey === 'server-url' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span className="hidden sm:inline">
                  {copiedKey === 'server-url' ? 'Copié !' : 'Copier l\'adresse'}
                </span>
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
            <button
              onClick={() => testConnectionMutation.mutate()}
              disabled={testConnectionMutation.isPending}
              className="px-5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 text-xs font-bold transition flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {testConnectionMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
              ) : (
                <Activity className="w-4 h-4 text-emerald-400" />
              )}
              <span>Tester la connexion API</span>
            </button>
          </div>
        </div>

        {/* Live Test Results Alert */}
        {testResult && (
          <div className="mt-4 p-4 rounded-2xl bg-slate-950/80 border border-purple-500/30 flex items-start justify-between gap-4 animate-in fade-in">
            <div className="flex items-start space-x-3">
              {testResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="text-xs font-bold text-slate-200">{testResult.message}</p>
                <div className="flex items-center space-x-4 text-[11px] text-slate-400 mt-1 font-mono">
                  <span>Machines détectées : <strong className="text-emerald-400">{testResult.devices_detected}</strong></span>
                  <span>Latence : <strong className="text-cyan-400">{testResult.latency_ms} ms</strong></span>
                  <span>Jeton JWT : <strong className="text-purple-400">{testResult.token_valid ? 'Valide' : 'Invalide'}</strong></span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setTestResult(null)}
              className="text-slate-500 hover:text-slate-300 text-xs"
            >
              Fermer
            </button>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* INTEGRATION ASSISTANT & CLIENT CONFIGURATIONS                            */}
      {/* ========================================================================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              <span>Intégration & Configuration des Assistants IA</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Sélectionnez votre environnement pour copier directement la configuration MCP dans votre assistant.
            </p>
          </div>
        </div>

        {/* Client Tabs */}
        <div className="flex border-b border-slate-800 space-x-3 text-xs font-bold">
          <button
            onClick={() => setActiveConfigTab('antigravity')}
            className={`pb-3 px-3 border-b-2 transition flex items-center space-x-2 ${
              activeConfigTab === 'antigravity'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>Google Antigravity IDE</span>
          </button>

          <button
            onClick={() => setActiveConfigTab('claude')}
            className={`pb-3 px-3 border-b-2 transition flex items-center space-x-2 ${
              activeConfigTab === 'claude'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>Claude Desktop</span>
          </button>

          <button
            onClick={() => setActiveConfigTab('cursor')}
            className={`pb-3 px-3 border-b-2 transition flex items-center space-x-2 ${
              activeConfigTab === 'cursor'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>Cursor / VS Code (SSE)</span>
          </button>

          <button
            onClick={() => setActiveConfigTab('cli')}
            className={`pb-3 px-3 border-b-2 transition flex items-center space-x-2 ${
              activeConfigTab === 'cli'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>Ligne de Commande Python</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="relative">
          {activeConfigTab === 'antigravity' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Fichier de configuration : <code className="text-purple-400 font-mono">mcp_config.json</code></span>
                <button
                  onClick={() => handleCopy(antigravityConfigStr, 'antigravity-cfg')}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition"
                >
                  {copiedKey === 'antigravity-cfg' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'antigravity-cfg' ? 'Copié !' : 'Copier JSON'}</span>
                </button>
              </div>
              <pre className="p-4 bg-slate-950 border border-slate-800 rounded-2xl font-mono text-xs text-purple-300 overflow-x-auto">
                {antigravityConfigStr}
              </pre>
            </div>
          )}

          {activeConfigTab === 'claude' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Fichier de configuration : <code className="text-purple-400 font-mono">%APPDATA%\Claude\claude_desktop_config.json</code></span>
                <button
                  onClick={() => handleCopy(claudeConfigStr, 'claude-cfg')}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition"
                >
                  {copiedKey === 'claude-cfg' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'claude-cfg' ? 'Copié !' : 'Copier JSON'}</span>
                </button>
              </div>
              <pre className="p-4 bg-slate-950 border border-slate-800 rounded-2xl font-mono text-xs text-purple-300 overflow-x-auto">
                {claudeConfigStr}
              </pre>
            </div>
          )}

          {activeConfigTab === 'cursor' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Configuration Cursor MCP (Type: <code className="text-purple-400 font-mono">sse</code>)</span>
                <button
                  onClick={() => handleCopy(cursorConfigStr, 'cursor-cfg')}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition"
                >
                  {copiedKey === 'cursor-cfg' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'cursor-cfg' ? 'Copié !' : 'Copier JSON'}</span>
                </button>
              </div>
              <pre className="p-4 bg-slate-950 border border-slate-800 rounded-2xl font-mono text-xs text-purple-300 overflow-x-auto">
                {cursorConfigStr}
              </pre>
            </div>
          )}

          {activeConfigTab === 'cli' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Démarrer le serveur MCP manuellement en mode SSE ou stdio :</span>
                <button
                  onClick={() => handleCopy(pythonCliStr, 'cli-cmd')}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition"
                >
                  {copiedKey === 'cli-cmd' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'cli-cmd' ? 'Copié !' : 'Copier Commande'}</span>
                </button>
              </div>
              <pre className="p-4 bg-slate-950 border border-slate-800 rounded-2xl font-mono text-xs text-emerald-400 overflow-x-auto">
                {pythonCliStr}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* INTERACTIVE MCP TOOLS EXPLORER                                            */}
      {/* ========================================================================= */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
              <Layers className="w-5 h-5 text-indigo-400" />
              <span>Catalogue des Outils MCP ({tools.length})</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Liste détaillée des fonctions d'administration exécutables par les modèles IA.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Filtrer un outil..."
                value={toolSearch}
                onChange={(e) => setToolSearch(e.target.value)}
                className="pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 w-56"
              />
            </div>
          </div>
        </div>

        {/* Category Pill Filters */}
        <div className="flex flex-wrap gap-2 pt-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                selectedCategory === cat
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-950/40'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {cat === 'ALL' ? 'Toutes les catégories' : cat}
            </button>
          ))}
        </div>

        {/* Tools List */}
        <div className="grid grid-cols-1 gap-3">
          {filteredTools.map((tool) => {
            const isExpanded = expandedTool === tool.name;
            return (
              <div
                key={tool.name}
                className={`bg-slate-900 border rounded-2xl transition overflow-hidden ${
                  isExpanded ? 'border-purple-500/50 shadow-lg shadow-purple-950/30' : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div
                  onClick={() => setExpandedTool(isExpanded ? null : tool.name)}
                  className="p-4 flex items-center justify-between cursor-pointer select-none"
                >
                  <div className="flex items-center space-x-3.5">
                    <div className="p-2 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20">
                      <Terminal className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-sm font-bold text-slate-100">{tool.name}</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                          {tool.category}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{tool.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <span className="text-xs text-slate-500 font-mono hidden sm:inline">
                      {tool.parameters.length} paramètre(s)
                    </span>
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-purple-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-500" />
                    )}
                  </div>
                </div>

                {/* Expanded Parameters Table */}
                {isExpanded && (
                  <div className="p-4 bg-slate-950/70 border-t border-slate-800/80 space-y-3 animate-in fade-in duration-150">
                    <h5 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Paramètres d'entrée (JSON Schema)
                    </h5>

                    {tool.parameters.length === 0 ? (
                      <p className="text-xs text-slate-500 italic">Aucun paramètre requis pour cet outil.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                              <th className="py-2 pr-4">Nom</th>
                              <th className="py-2 pr-4">Type</th>
                              <th className="py-2 pr-4">Requis</th>
                              <th className="py-2 pr-4">Description</th>
                              <th className="py-2">Défaut</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-900 font-mono">
                            {tool.parameters.map((p) => (
                              <tr key={p.name} className="text-slate-300">
                                <td className="py-2.5 pr-4 text-purple-400 font-bold">{p.name}</td>
                                <td className="py-2.5 pr-4 text-cyan-400">{p.type}</td>
                                <td className="py-2.5 pr-4">
                                  {p.required ? (
                                    <span className="text-rose-400 font-bold">Oui</span>
                                  ) : (
                                    <span className="text-slate-500">Non</span>
                                  )}
                                </td>
                                <td className="py-2.5 pr-4 text-slate-300 font-sans">{p.description}</td>
                                <td className="py-2.5 text-slate-500">
                                  {p.default !== undefined ? JSON.stringify(p.default) : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SETTINGS MODAL                                                            */}
      {/* ========================================================================= */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 text-purple-400">
                <div className="p-2.5 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                  <Settings className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Configuration Réseau du Serveur MCP</h3>
                  <p className="text-xs text-slate-400">Personnalisation du port SSE et du nom d'hôte</p>
                </div>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-slate-500 hover:text-slate-300"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateSettingsMutation.mutate({
                  port: editPort,
                  custom_host: editHost,
                });
              }}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Port d'écoute TCP (SSE / HTTP)
                </label>
                <input
                  type="number"
                  min={1024}
                  max={65535}
                  value={editPort}
                  onChange={(e) => setEditPort(parseInt(e.target.value) || 8080)}
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl font-mono text-slate-100 focus:outline-none focus:border-purple-500"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Port standard recommandé : 8080.
                </span>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Nom d'hôte ou IP publique / DNS (Optionnel)
                </label>
                <input
                  type="text"
                  value={editHost}
                  onChange={(e) => setEditHost(e.target.value)}
                  placeholder="ex: 192.168.1.100 ou mapt.entreprise.local"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl font-mono text-slate-100 focus:outline-none focus:border-purple-500"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Si vide, l'adresse de la requête HTTP est utilisée automatiquement.
                </span>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={updateSettingsMutation.isPending}
                  className="flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl shadow-lg shadow-purple-950/50 disabled:opacity-50"
                >
                  {updateSettingsMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Enregistrer les paramètres</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
