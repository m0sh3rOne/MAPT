import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Monitor,
  Play,
  Square,
  RefreshCw,
  Loader2,
  MousePointer,
  Eye,
  Maximize2,
  Minimize2,
  Camera,
  Keyboard,
  ExternalLink,
  Lock,
  Settings,
  XCircle,
  CheckCircle2,
  Activity,
  Terminal,
  Trash2,
} from 'lucide-react';
import { api } from '../services/api';
import { MirrorStatus } from '../types';

interface MirrorWindowItem {
  id: number;
  title: string;
  locked: boolean;
  is_virtual: boolean;
  is_desktop?: boolean;
  context: string;
}

interface AppMirrorTabProps {
  deviceId: string;
  hostname: string;
  isOnline: boolean;
  mirrorStatus?: MirrorStatus;
  loadingStatus: boolean;
  onRefetchStatus: () => void;
  onOpenStartModal: (defaultMode?: 'headless' | 'gui') => void;
  onQuickStart: (mode: 'headless' | 'gui') => void;
  onStopService: () => void;
  isStarting: boolean;
  isStopping: boolean;
}

const MOUSE_BTN_MAP: Record<number, 'left' | 'middle' | 'right'> = {
  0: 'left',
  1: 'middle',
  2: 'right',
};

const QUALITY_PRESETS = {
  high: { label: 'Haute (75% · 100%)', quality: 75, scale: 1.0 },
  medium: { label: 'Moyenne (60% · 75%)', quality: 60, scale: 0.75 },
  low: { label: 'Économie bande passante (45% · 50%)', quality: 45, scale: 0.5 },
};

export const AppMirrorTab: React.FC<AppMirrorTabProps> = ({
  deviceId,
  hostname,
  isOnline,
  mirrorStatus,
  loadingStatus,
  onRefetchStatus,
  onOpenStartModal,
  onQuickStart,
  onStopService,
  isStarting,
  isStopping,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerContainerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [wsState, setWsState] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [statusMessage, setStatusMessage] = useState<string>('En attente de connexion au flux vidéo...');
  const [windows, setWindows] = useState<MirrorWindowItem[]>([]);
  const [selectedWindowId, setSelectedWindowId] = useState<number | null>(null);
  const [nativeSize, setNativeSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // Control & stream options
  const [controlEnabled, setControlEnabled] = useState<boolean>(true);
  const [backgroundInput, setBackgroundInput] = useState<boolean>(false);
  const [keyboardLayout, setKeyboardLayout] = useState<'azerty_fr' | 'qwerty_us'>('azerty_fr');
  const [qualityPreset, setQualityPreset] = useState<'high' | 'medium' | 'low'>('high');
  const [showCursor, setShowCursor] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Auth / PIN prompts (if needed)
  const [authRequired, setAuthRequired] = useState<boolean>(false);
  const [authUsername, setAuthUsername] = useState<string>(mirrorStatus?.web_username || 'admin');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');

  const [pinPromptWinId, setPinPromptWinId] = useState<number | null>(null);
  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');

  const lastMoveSentRef = useRef<number>(0);
  const activePinRef = useRef<string | null>(null);

  const sendWs = useCallback((payload: Record<string, any>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  const selectWindow = useCallback(
    (winId: number, pin: string | null = null) => {
      const preset = QUALITY_PRESETS[qualityPreset];
      activePinRef.current = pin;
      setSelectedWindowId(winId);
      sendWs({
        type: 'select_window',
        id: winId,
        pin,
        quality: preset.quality,
        scale: preset.scale,
        show_cursor: showCursor,
      });
    },
    [qualityPreset, showCursor, sendWs]
  );

  // Draw incoming JPEG frame onto canvas
  const drawFrame = useCallback(async (buf: ArrayBuffer) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      const bmp = await createImageBitmap(new Blob([buf], { type: 'image/jpeg' }));
      if (canvas.width !== bmp.width || canvas.height !== bmp.height) {
        canvas.width = bmp.width;
        canvas.height = bmp.height;
        setNativeSize({ w: bmp.width, h: bmp.height });
      }
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
    } catch {
      // Ignore transient corrupt frames
    }
  }, []);

  const disconnectWs = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setWsState('disconnected');
  }, []);

  const connectWs = useCallback(() => {
    disconnectWs();
    const url = api.getMirrorWsUrl(deviceId);
    setWsState('connecting');
    setStatusMessage(`Connexion au flux AppMirror de ${hostname}...`);
    setAuthRequired(false);
    setAuthError('');

    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      setWsState('connected');
      setStatusMessage('Connecté — Récupération de la liste des écrans/fenêtres...');
      ws.send(JSON.stringify({ type: 'list_windows' }));
    };

    ws.onclose = () => {
      if (wsRef.current === ws) {
        wsRef.current = null;
        setWsState('disconnected');
        setStatusMessage('Flux déconnecté.');
      }
    };

    ws.onerror = () => {
      setWsState('error');
      setStatusMessage("Erreur de connexion WebSocket avec le service AppMirror.");
    };

    ws.onmessage = async (ev) => {
      if (typeof ev.data !== 'string') {
        await drawFrame(ev.data as ArrayBuffer);
        return;
      }

      try {
        const msg = JSON.parse(ev.data);
        switch (msg.type) {
          case 'auth_required':
            if (msg.required) {
              setAuthRequired(true);
              setAuthUsername(mirrorStatus?.web_username || 'admin');
              setStatusMessage('Authentification requise par le poste cible.');
            }
            break;

          case 'auth_result':
            if (msg.success) {
              setAuthRequired(false);
              setAuthError('');
              setStatusMessage('Authentifié — Chargement du flux...');
              ws.send(JSON.stringify({ type: 'list_windows' }));
            } else {
              setAuthRequired(true);
              setAuthError(msg.message || 'Identifiants refusés par AppMirror.');
            }
            break;

          case 'windows': {
            const items: MirrorWindowItem[] = msg.items || [];
            setWindows(items);
            if (items.length === 0) {
              setStatusMessage('Aucune fenêtre ou bureau détecté sur le poste (vérifiez la session Windows active).');
            } else {
              setSelectedWindowId((prev) => {
                if (prev !== null && items.some((w) => w.id === prev)) {
                  return prev;
                }
                const desktop = items.find((w) => w.is_desktop && !w.locked);
                const firstUnlocked = items.find((w) => !w.locked);
                const autoTarget = desktop || firstUnlocked;
                if (autoTarget) {
                  setTimeout(() => selectWindow(autoTarget.id, null), 50);
                  return autoTarget.id;
                }
                return null;
              });
            }
            break;
          }

          case 'selected':
            setPinPromptWinId(null);
            setPinError('');
            setBackgroundInput(Boolean(msg.background));
            setNativeSize({ w: msg.width || 0, h: msg.height || 0 });
            setStatusMessage(`Streaming actif (${msg.width}×${msg.height})`);
            break;

          case 'notice':
            setStatusMessage(msg.message || 'Notification AppMirror');
            break;

          case 'error':
            if (msg.message === 'PIN_REQUIRED') {
              setPinError('Code PIN incorrect ou requis pour cette fenêtre.');
            } else {
              setStatusMessage(`Erreur : ${msg.message}`);
            }
            break;
        }
      } catch {
        // Ignore unparseable messages
      }
    };
  }, [deviceId, hostname, mirrorStatus?.web_username, disconnectWs, drawFrame, selectWindow]);

  // Auto-connect / disconnect based on running state
  useEffect(() => {
    if (mirrorStatus?.running && !wsRef.current) {
      connectWs();
    } else if (mirrorStatus && !mirrorStatus.running && wsRef.current) {
      disconnectWs();
      setWindows([]);
      setSelectedWindowId(null);
    }
  }, [mirrorStatus?.running]);

  // Clean up WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  // Re-apply stream quality/cursor settings when changed while streaming
  useEffect(() => {
    if (wsState === 'connected' && selectedWindowId !== null) {
      selectWindow(selectedWindowId, activePinRef.current);
    }
  }, [qualityPreset, showCursor]);

  // Fullscreen listener
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toNativeCoords = (clientX: number, clientY: number): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas || nativeSize.w <= 0 || nativeSize.h <= 0) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    const nx = ((clientX - rect.left) / rect.width) * nativeSize.w;
    const ny = ((clientY - rect.top) / rect.height) * nativeSize.h;
    return {
      x: Math.round(Math.max(0, Math.min(nativeSize.w - 1, nx))),
      y: Math.round(Math.max(0, Math.min(nativeSize.h - 1, ny))),
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!controlEnabled || wsState !== 'connected' || selectedWindowId === null) return;
    const now = performance.now();
    if (now - lastMoveSentRef.current < 16) return;
    lastMoveSentRef.current = now;
    const { x, y } = toNativeCoords(e.clientX, e.clientY);
    sendWs({ type: 'mouse_move', x, y });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!controlEnabled || wsState !== 'connected' || selectedWindowId === null) return;
    canvasRef.current?.focus();
    const button = MOUSE_BTN_MAP[e.button];
    if (!button) return;
    const { x, y } = toNativeCoords(e.clientX, e.clientY);
    sendWs({ type: 'mouse_button', button, pressed: true, x, y });
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!controlEnabled || wsState !== 'connected' || selectedWindowId === null) return;
    const button = MOUSE_BTN_MAP[e.button];
    if (!button) return;
    const { x, y } = toNativeCoords(e.clientX, e.clientY);
    sendWs({ type: 'mouse_button', button, pressed: false, x, y });
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!controlEnabled || wsState !== 'connected' || selectedWindowId === null) return;
    e.preventDefault();
    const { x, y } = toNativeCoords(e.clientX, e.clientY);
    const delta = e.deltaY > 0 ? -1 : 1;
    sendWs({ type: 'wheel', delta, x, y });
  };

  const shouldUseSemanticText = (e: React.KeyboardEvent<HTMLCanvasElement>) =>
    keyboardLayout === 'azerty_fr' && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!controlEnabled || wsState !== 'connected' || selectedWindowId === null) return;
    e.preventDefault();
    if (e.repeat) return;
    if (shouldUseSemanticText(e)) {
      sendWs({ type: 'text_input', text: e.key });
      return;
    }
    sendWs({ type: 'key', code: e.code, pressed: true });
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!controlEnabled || wsState !== 'connected' || selectedWindowId === null) return;
    e.preventDefault();
    if (shouldUseSemanticText(e)) return;
    sendWs({ type: 'key', code: e.code, pressed: false });
  };

  const handleScreenshot = () => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0) return;
    const link = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.download = `appmirror_${hostname}_${ts}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      viewerContainerRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUsername.trim() || !authPassword) {
      setAuthError('Veuillez saisir identifiant et mot de passe.');
      return;
    }
    setAuthError('');
    sendWs({ type: 'authenticate', username: authUsername.trim(), password: authPassword });
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinPromptWinId === null || !pinInput.trim()) return;
    selectWindow(pinPromptWinId, pinInput.trim());
  };

  const isRunning = Boolean(mirrorStatus?.running);
  const lastStatusUpper = (mirrorStatus?.last_action_status || '').toUpperCase();
  const isJobPendingOrRunning = lastStatusUpper === 'PENDING' || lastStatusUpper === 'OFFERED' || lastStatusUpper === 'ACKED' || lastStatusUpper === 'RUNNING';

  return (
    <div className="space-y-5">
      {/* 1. Bandeau de Supervision et Contrôle du Service AppMirror */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
                isRunning
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : isJobPendingOrRunning
                  ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              <Monitor className="w-5 h-5" />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-base font-bold text-slate-100">
                  Supervision & Contrôle à distance AppMirror
                </h2>

                {isRunning ? (
                  <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>En cours d'exécution</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                    <span className="w-2 h-2 rounded-full bg-slate-500" />
                    <span>Service arrêté</span>
                  </span>
                )}

                {mirrorStatus?.mode && (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-mono uppercase bg-slate-950 border border-slate-800 text-cyan-300">
                    Mode : {mirrorStatus.mode === 'gui' ? 'GUI (Visible)' : 'Headless'}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 mt-1">
                <span>
                  Cible : <strong className="text-slate-200 font-mono">{mirrorStatus?.ip_address || 'IP inconnue'}</strong>:{mirrorStatus?.port || 8080}
                </span>
                <span>
                  Identifiant Admin : <strong className="text-emerald-300 font-mono">{mirrorStatus?.web_username || 'admin'}</strong>
                </span>
                <span className="text-slate-500">
                  Exécution à la demande uniquement (aucun lancement au boot)
                </span>
              </div>
            </div>
          </div>

          {/* Boutons d'Action Rapide du service AppMirror */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onQuickStart('headless')}
              disabled={!isOnline || isStarting || isStopping}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition shadow-lg shadow-emerald-950/40 disabled:opacity-50"
              title="Lancer AppMirror sur la cible en mode silencieux (--headless)"
            >
              {isStarting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span>Exécuter Headless</span>
            </button>

            <button
              type="button"
              onClick={() => onQuickStart('gui')}
              disabled={!isOnline || isStarting || isStopping}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-cyan-600/90 hover:bg-cyan-500 text-white text-xs font-semibold transition shadow-lg shadow-cyan-950/40 disabled:opacity-50"
              title="Lancer AppMirror avec la fenêtre appMirror Controller visible sur le poste"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Exécuter GUI</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenStartModal(mirrorStatus?.mode === 'gui' ? 'gui' : 'headless')}
              disabled={!isOnline}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition disabled:opacity-50"
              title="Configurer les identifiants admin et les options d'exposition AppMirror"
            >
              <Settings className="w-3.5 h-3.5 text-slate-400" />
              <span>Options / Identifiants</span>
            </button>

            <button
              type="button"
              onClick={onStopService}
              disabled={!isOnline || isStopping || isStarting}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40 text-xs font-semibold transition disabled:opacity-50"
              title="Arrêter immédiatement appmirror-backend.exe sur la machine cible"
            >
              {isStopping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5 fill-current" />}
              <span>Arrêter AppMirror</span>
            </button>

            <button
              type="button"
              onClick={onRefetchStatus}
              className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition"
              title="Actualiser l'état d'exécution"
            >
              <RefreshCw className={`w-4 h-4 ${loadingStatus ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Statut de la dernière tâche envoyée par l'agent */}
        {mirrorStatus?.last_action_name && (
          <div className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center space-x-2 text-slate-300">
              {isJobPendingOrRunning ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400 shrink-0" />
              ) : lastStatusUpper === 'SUCCEEDED' ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : lastStatusUpper === 'FAILED' || lastStatusUpper === 'TIMED_OUT' ? (
                <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              ) : (
                <Activity className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              )}
              <span className="text-slate-400">Dernière tâche AppMirror :</span>
              <span className="font-semibold text-slate-200">{mirrorStatus.last_action_name}</span>
              <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                {mirrorStatus.last_action_status}
              </span>
              {mirrorStatus.last_action_error && (
                <span className="text-rose-400 font-mono text-[11px]">({mirrorStatus.last_action_error})</span>
              )}
            </div>

            {isRunning && mirrorStatus.direct_url && (
              <a
                href={mirrorStatus.direct_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center space-x-1 text-cyan-400 hover:text-cyan-300 font-medium"
              >
                <span>Ouvrir l'interface native ({mirrorStatus.direct_url})</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}
      </div>

      {/* 2. Zone Visualiseur & Contrôle Écran */}
      <div
        ref={viewerContainerRef}
        className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
      >
        {/* Barre d'outils du visualiseur */}
        <div className="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Gauche : Sélecteur d'écran / fenêtre */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedWindowId ?? ''}
              onChange={(e) => {
                const winId = Number(e.target.value);
                if (!winId) return;
                const item = windows.find((w) => w.id === winId);
                if (item?.locked) {
                  setPinPromptWinId(winId);
                  setPinInput('');
                  setPinError('');
                } else {
                  selectWindow(winId, null);
                }
              }}
              disabled={wsState !== 'connected'}
              className="px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 text-xs max-w-xs focus:outline-none focus:border-emerald-500 disabled:opacity-50"
            >
              <option value="">-- Sélectionner un écran / une fenêtre --</option>
              {windows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.locked ? '🔒 ' : ''}
                  {w.is_desktop ? '🖥️ ' : w.is_virtual ? '[V] ' : ''}
                  {w.title}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => sendWs({ type: 'list_windows' })}
              disabled={wsState !== 'connected'}
              className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 transition disabled:opacity-40"
              title="Rafraîchir la liste des fenêtres ouvertes"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            {selectedWindowId !== null && !windows.find((w) => w.id === selectedWindowId)?.is_desktop && (
              <button
                type="button"
                onClick={() => {
                  if (confirm('Fermer cette fenêtre distante ?')) {
                    sendWs({ type: 'close_window', id: selectedWindowId });
                    setTimeout(() => sendWs({ type: 'list_windows' }), 400);
                  }
                }}
                className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-800/60 text-rose-300 transition"
                title="Fermer la fenêtre sélectionnée sur le poste"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Droite : Contrôles Souris / Clavier / Qualité / Plein écran */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setControlEnabled(!controlEnabled)}
              className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border font-semibold transition ${
                controlEnabled
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              }`}
              title="Basculer entre contrôle interactif et observation seule"
            >
              {controlEnabled ? <MousePointer className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{controlEnabled ? 'Contrôle Actif' : 'Vue Seule'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const next = !backgroundInput;
                setBackgroundInput(next);
                sendWs({ type: 'set_input_mode', background: next });
              }}
              disabled={wsState !== 'connected'}
              className={`px-2.5 py-1.5 rounded-lg border font-medium transition disabled:opacity-40 ${
                backgroundInput
                  ? 'bg-purple-500/15 border-purple-500/40 text-purple-300'
                  : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
              title="Premier plan (SendInput) ou Arrière-plan (PostMessage sans voler le focus)"
            >
              {backgroundInput ? 'Arrière-plan' : 'Premier plan'}
            </button>

            <div className="flex items-center space-x-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1">
              <Keyboard className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={keyboardLayout}
                onChange={(e) => setKeyboardLayout(e.target.value as 'azerty_fr' | 'qwerty_us')}
                className="bg-transparent text-slate-200 focus:outline-none text-xs"
                title="Disposition du clavier transmise"
              >
                <option value="azerty_fr" className="bg-slate-900">AZERTY (FR)</option>
                <option value="qwerty_us" className="bg-slate-900">QWERTY (US)</option>
              </select>
            </div>

            <select
              value={qualityPreset}
              onChange={(e) => setQualityPreset(e.target.value as 'high' | 'medium' | 'low')}
              className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none"
              title="Qualité & résolution du flux JPEG"
            >
              {Object.entries(QUALITY_PRESETS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>

            <label className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={showCursor}
                onChange={(e) => setShowCursor(e.target.checked)}
                className="rounded bg-slate-900 border-slate-700 text-emerald-500"
              />
              <span>Curseur</span>
            </label>

            <button
              type="button"
              onClick={() => sendWs({ type: 'focus_window' })}
              disabled={wsState !== 'connected' || selectedWindowId === null}
              className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 transition disabled:opacity-40"
              title="Mettre au premier plan la fenêtre distante"
            >
              Focus
            </button>

            <button
              type="button"
              onClick={handleScreenshot}
              disabled={nativeSize.w === 0}
              className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-cyan-400 transition disabled:opacity-40"
              title="Télécharger une capture PNG locale"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 transition"
              title={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Zone Canvas / État inactif */}
        <div className="relative min-h-[480px] flex items-center justify-center bg-[#090d14] p-3">
          {!isRunning ? (
            <div className="text-center max-w-md space-y-4 py-12 px-6">
              <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 text-slate-500 flex items-center justify-center mx-auto">
                <Monitor className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-200">
                  {isJobPendingOrRunning
                    ? 'Lancement d’AppMirror en cours sur le poste...'
                    : 'AppMirror n’est pas démarré sur cette machine'}
                </h3>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  Par sécurité et économie de ressources, AppMirror ne démarre pas au boot de Windows.
                  Lancez-le à la demande ci-dessus (en mode <strong>Headless</strong> silencieux ou <strong>GUI</strong> visible) pour prendre le contrôle de l'écran.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => onQuickStart('headless')}
                  disabled={!isOnline || isStarting}
                  className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition disabled:opacity-50"
                >
                  {isStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                  <span>Démarrer en Headless</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenStartModal('headless')}
                  disabled={!isOnline}
                  className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition disabled:opacity-50"
                >
                  <Settings className="w-4 h-4" />
                  <span>Configurer l'accès Admin</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              <canvas
                ref={canvasRef}
                tabIndex={0}
                onMouseMove={handleMouseMove}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onContextMenu={(e) => e.preventDefault()}
                onWheel={handleWheel}
                onKeyDown={handleKeyDown}
                onKeyUp={handleKeyUp}
                className={`max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl border border-slate-800/80 outline-none focus:ring-2 focus:ring-emerald-500/50 ${
                  controlEnabled ? 'cursor-crosshair' : 'cursor-default'
                } ${nativeSize.w === 0 ? 'hidden' : 'block'}`}
              />

              {nativeSize.w === 0 && (
                <div className="text-center space-y-3 py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-400 mx-auto" />
                  <p className="text-sm font-medium text-slate-300">{statusMessage}</p>
                  {wsState !== 'connected' && (
                    <button
                      type="button"
                      onClick={connectWs}
                      className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700"
                    >
                      Reconnecter le flux
                    </button>
                  )}
                </div>
              )}

              {/* Overlay Auth Web si demandé */}
              {authRequired && (
                <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-20">
                  <form
                    onSubmit={handleAuthSubmit}
                    className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl text-xs"
                  >
                    <div className="flex items-center space-x-2.5 text-emerald-400">
                      <Lock className="w-5 h-5" />
                      <h3 className="text-sm font-bold text-slate-100">Authentification AppMirror requise</h3>
                    </div>
                    <p className="text-slate-400">
                      Saisissez les identifiants de contrôle configurés sur {hostname}.
                    </p>
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Nom d'utilisateur</label>
                      <input
                        type="text"
                        value={authUsername}
                        onChange={(e) => setAuthUsername(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Mot de passe</label>
                      <input
                        type="password"
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500"
                        required
                      />
                    </div>
                    {authError && <div className="text-rose-400 font-medium">{authError}</div>}
                    <button
                      type="submit"
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition"
                    >
                      Se connecter à l'écran
                    </button>
                  </form>
                </div>
              )}

              {/* Overlay PIN si fenêtre verrouillée */}
              {pinPromptWinId !== null && (
                <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-20">
                  <form
                    onSubmit={handlePinSubmit}
                    className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-xs w-full space-y-4 shadow-2xl text-xs"
                  >
                    <div className="flex items-center space-x-2 text-amber-400">
                      <Lock className="w-5 h-5" />
                      <h3 className="text-sm font-bold text-slate-100">Fenêtre verrouillée (PIN)</h3>
                    </div>
                    <input
                      type="password"
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      placeholder="Code PIN (ex: 1234)"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-amber-500"
                      autoFocus
                    />
                    {pinError && <div className="text-rose-400">{pinError}</div>}
                    <div className="flex justify-end space-x-2">
                      <button
                        type="button"
                        onClick={() => setPinPromptWinId(null)}
                        className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-xl"
                      >
                        Annuler
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-xl"
                      >
                        Déverrouiller
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </>
          )}
        </div>

        {/* Barre de statut bas */}
        <div className="px-4 py-2 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-400">
          <div className="flex items-center space-x-2">
            <Terminal className="w-3.5 h-3.5 text-emerald-400" />
            <span>{statusMessage}</span>
          </div>
          {nativeSize.w > 0 && (
            <span>
              Résolution native : {nativeSize.w}×{nativeSize.h} · WebSocket :{' '}
              <span className={wsState === 'connected' ? 'text-emerald-400' : 'text-amber-400'}>
                {wsState}
              </span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

