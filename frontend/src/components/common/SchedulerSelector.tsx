import React from 'react';
import {
  Clock,
  Calendar,
  Repeat,
  Zap,
  Check,
  Sparkles,
  Info
} from 'lucide-react';

export interface ScheduleConfig {
  is_recurring: boolean;
  schedule_type: 'immediate' | 'once' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'cron';
  scheduled_at?: string; // YYYY-MM-DDTHH:MM
  scheduled_time?: string; // HH:MM
  scheduled_days_of_week?: string; // "1,2,3,4,5"
  interval_value?: number;
  interval_unit?: string;
  cron_expression?: string;
  end_at?: string;
}

interface SchedulerSelectorProps {
  value: ScheduleConfig;
  onChange: (config: ScheduleConfig) => void;
}

const DAYS_OF_WEEK = [
  { id: 1, label: 'Lun', full: 'Lundi' },
  { id: 2, label: 'Mar', full: 'Mardi' },
  { id: 3, label: 'Mer', full: 'Mercredi' },
  { id: 4, label: 'Jeu', full: 'Jeudi' },
  { id: 5, label: 'Ven', full: 'Vendredi' },
  { id: 6, label: 'Sam', full: 'Samedi' },
  { id: 7, label: 'Dim', full: 'Dimanche' },
];

export const SchedulerSelector: React.FC<SchedulerSelectorProps> = ({ value, onChange }) => {
  const currentMode = value.schedule_type === 'immediate'
    ? 'immediate'
    : value.schedule_type === 'once'
      ? 'once'
      : 'recurring';

  const setMode = (mode: 'immediate' | 'once' | 'recurring') => {
    if (mode === 'immediate') {
      onChange({
        ...value,
        is_recurring: false,
        schedule_type: 'immediate',
      });
    } else if (mode === 'once') {
      const nowPlus1Hour = new Date(Date.now() + 3600 * 1000);
      const iso = nowPlus1Hour.toISOString().slice(0, 16);
      onChange({
        ...value,
        is_recurring: false,
        schedule_type: 'once',
        scheduled_at: value.scheduled_at || iso,
      });
    } else {
      onChange({
        ...value,
        is_recurring: true,
        schedule_type: value.schedule_type === 'once' || value.schedule_type === 'immediate' ? 'daily' : value.schedule_type,
        scheduled_time: value.scheduled_time || '08:00',
        interval_value: value.interval_value || 1,
        scheduled_days_of_week: value.scheduled_days_of_week || '1,2,3,4,5',
      });
    }
  };

  const toggleDayOfWeek = (dayId: number) => {
    const active = (value.scheduled_days_of_week || '1,2,3,4,5')
      .split(',')
      .map((d) => parseInt(d.trim(), 10))
      .filter((n) => !isNaN(n));

    let updated: number[];
    if (active.includes(dayId)) {
      updated = active.filter((d) => d !== dayId);
    } else {
      updated = [...active, dayId].sort((a, b) => a - b);
    }

    if (updated.length === 0) {
      updated = [dayId];
    }

    onChange({
      ...value,
      scheduled_days_of_week: updated.join(','),
    });
  };

  // Human-readable summary generator
  const getScheduleSummary = () => {
    if (value.schedule_type === 'immediate') {
      return "Exécution immédiate dès le lancement.";
    }
    if (value.schedule_type === 'once') {
      if (!value.scheduled_at) return "Exécution programmée à une date définie.";
      const d = new Date(value.scheduled_at);
      return `Exécution unique programmée pour le ${d.toLocaleDateString('fr-FR')} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.`;
    }
    if (value.schedule_type === 'hourly') {
      const h = value.interval_value || 1;
      return `Exécution récurrente toutes les ${h} heure${h > 1 ? 's' : ''}.`;
    }
    if (value.schedule_type === 'daily') {
      const d = value.interval_value || 1;
      const time = value.scheduled_time || '08:00';
      return d === 1
        ? `Exécution récurrente tous les jours à ${time}.`
        : `Exécution récurrente tous les ${d} jours à ${time}.`;
    }
    if (value.schedule_type === 'weekly') {
      const days = (value.scheduled_days_of_week || '1,2,3,4,5')
        .split(',')
        .map((d) => DAYS_OF_WEEK.find((item) => item.id === parseInt(d, 10))?.full)
        .filter(Boolean);
      const time = value.scheduled_time || '08:00';
      return `Exécution récurrente chaque semaine les ${days.join(', ')} à ${time}.`;
    }
    if (value.schedule_type === 'monthly') {
      const time = value.scheduled_time || '08:00';
      return `Exécution récurrente chaque mois à ${time}.`;
    }
    if (value.schedule_type === 'yearly') {
      const time = value.scheduled_time || '08:00';
      return `Exécution récurrente chaque année à ${time}.`;
    }
    if (value.schedule_type === 'cron') {
      return `Exécution récurrente selon l'expression Cron : "${value.cron_expression || '* * * * *'}".`;
    }
    return "Planification configurée.";
  };

  return (
    <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center space-x-2">
          <Clock className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Planification & Récurrence d'Exécution
          </span>
        </div>
        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-2 py-0.5 rounded">
          {currentMode.toUpperCase()}
        </span>
      </div>

      {/* Main Mode Selector (3 Pill buttons) */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => setMode('immediate')}
          className={`flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl border text-xs font-semibold transition ${
            currentMode === 'immediate'
              ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 shadow-sm shadow-emerald-500/20'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Immédiat</span>
        </button>

        <button
          type="button"
          onClick={() => setMode('once')}
          className={`flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl border text-xs font-semibold transition ${
            currentMode === 'once'
              ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 shadow-sm shadow-emerald-500/20'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Programmé (1x)</span>
        </button>

        <button
          type="button"
          onClick={() => setMode('recurring')}
          className={`flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl border text-xs font-semibold transition ${
            currentMode === 'recurring'
              ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 shadow-sm shadow-emerald-500/20'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
          }`}
        >
          <Repeat className="w-3.5 h-3.5" />
          <span>Récurrent 🔁</span>
        </button>
      </div>

      {/* Mode Specific Configurations */}

      {/* 1. ONCE Mode (Date & Time Picker) */}
      {currentMode === 'once' && (
        <div className="space-y-2 pt-1 animate-in fade-in duration-200">
          <label className="block text-xs font-medium text-slate-300">
            Date et heure d'exécution souhaitée :
          </label>
          <input
            type="datetime-local"
            value={value.scheduled_at || ''}
            onChange={(e) =>
              onChange({
                ...value,
                scheduled_at: e.target.value,
              })
            }
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:border-emerald-500 outline-none font-mono"
          />
          <p className="text-[11px] text-slate-500">
            L'agent recevra et exécutera ce job automatiquement dès que l'horaire sélectionné sera atteint.
          </p>
        </div>
      )}

      {/* 2. RECURRING Mode */}
      {currentMode === 'recurring' && (
        <div className="space-y-3.5 pt-1 animate-in fade-in duration-200">
          {/* Recurrence Type Selector */}
          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1.5">
              Type de Récurrence
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-xs">
              {[
                { id: 'hourly', label: 'Heures' },
                { id: 'daily', label: 'Jours' },
                { id: 'weekly', label: 'Semaine' },
                { id: 'monthly', label: 'Mois' },
                { id: 'yearly', label: 'Année' },
                { id: 'cron', label: 'Cron' },
              ].map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...value,
                      schedule_type: sub.id as any,
                    })
                  }
                  className={`py-1.5 px-2 rounded-lg border text-[11px] font-semibold text-center transition ${
                    value.schedule_type === sub.id
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {sub.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sub-config: Hourly */}
          {value.schedule_type === 'hourly' && (
            <div className="flex items-center space-x-3 text-xs">
              <span className="text-slate-300">Répéter toutes les :</span>
              <input
                type="number"
                min={1}
                max={168}
                value={value.interval_value || 1}
                onChange={(e) =>
                  onChange({
                    ...value,
                    interval_value: parseInt(e.target.value, 10) || 1,
                  })
                }
                className="w-20 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-center text-slate-200 font-mono focus:border-emerald-500 outline-none"
              />
              <span className="text-slate-400 font-medium">heure(s)</span>
            </div>
          )}

          {/* Sub-config: Daily */}
          {value.schedule_type === 'daily' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Répéter tous les :</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={value.interval_value || 1}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        interval_value: parseInt(e.target.value, 10) || 1,
                      })
                    }
                    className="w-16 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-center text-slate-200 font-mono focus:border-emerald-500 outline-none"
                  />
                  <span className="text-slate-300">jour(s)</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">À l'heure fixe :</label>
                <input
                  type="time"
                  value={value.scheduled_time || '08:00'}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      scheduled_time: e.target.value,
                    })
                  }
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 font-mono focus:border-emerald-500 outline-none"
                />
              </div>
            </div>
          )}

          {/* Sub-config: Weekly */}
          {value.schedule_type === 'weekly' && (
            <div className="space-y-2.5 text-xs">
              <div>
                <label className="block text-slate-400 mb-1.5">Jours de la semaine cibles :</label>
                <div className="flex flex-wrap gap-1.5">
                  {DAYS_OF_WEEK.map((d) => {
                    const active = (value.scheduled_days_of_week || '1,2,3,4,5')
                      .split(',')
                      .map((num) => parseInt(num.trim(), 10));
                    const isSelected = active.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => toggleDayOfWeek(d.id)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                          isSelected
                            ? 'bg-emerald-500 border-emerald-400 text-slate-950 font-bold'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">À l'heure fixe :</label>
                <input
                  type="time"
                  value={value.scheduled_time || '08:00'}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      scheduled_time: e.target.value,
                    })
                  }
                  className="w-full max-w-[180px] bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 font-mono focus:border-emerald-500 outline-none"
                />
              </div>
            </div>
          )}

          {/* Sub-config: Monthly / Yearly */}
          {(value.schedule_type === 'monthly' || value.schedule_type === 'yearly') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">
                  {value.schedule_type === 'monthly' ? 'Fréquence (Mois) :' : 'Fréquence (Années) :'}
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={value.interval_value || 1}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        interval_value: parseInt(e.target.value, 10) || 1,
                      })
                    }
                    className="w-16 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-center text-slate-200 font-mono focus:border-emerald-500 outline-none"
                  />
                  <span className="text-slate-300">
                    {value.schedule_type === 'monthly' ? 'mois' : 'an(s)'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">À l'heure :</label>
                <input
                  type="time"
                  value={value.scheduled_time || '08:00'}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      scheduled_time: e.target.value,
                    })
                  }
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 font-mono focus:border-emerald-500 outline-none"
                />
              </div>
            </div>
          )}

          {/* Sub-config: Cron */}
          {value.schedule_type === 'cron' && (
            <div className="space-y-2 text-xs">
              <label className="block text-slate-400">Expression Cron standard (5 segments) :</label>
              <input
                type="text"
                placeholder="0 4 * * 1-5 (ex: Du Lun au Ven à 04h00)"
                value={value.cron_expression || ''}
                onChange={(e) =>
                  onChange({
                    ...value,
                    cron_expression: e.target.value,
                  })
                }
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono focus:border-emerald-500 outline-none text-xs"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  { label: 'Tous les jours à 04h00', cron: '0 4 * * *' },
                  { label: 'Jours ouvrés à 08h30', cron: '30 8 * * 1-5' },
                  { label: 'Toutes les 30 min', cron: '*/30 * * * *' },
                  { label: 'Tous les dimanches minuit', cron: '0 0 * * 0' },
                ].map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() =>
                      onChange({
                        ...value,
                        cron_expression: item.cron,
                      })
                    }
                    className="text-[10px] bg-slate-900 hover:bg-slate-800 border border-slate-800 text-cyan-400 px-2 py-1 rounded"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Optional End Date */}
          <div className="pt-2 border-t border-slate-800/80">
            <label className="block text-[11px] text-slate-400 mb-1">
              Date de fin de récurrence (Optionnelle) :
            </label>
            <input
              type="date"
              value={value.end_at || ''}
              onChange={(e) =>
                onChange({
                  ...value,
                  end_at: e.target.value,
                })
              }
              className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 font-mono focus:border-emerald-500 outline-none"
            />
          </div>
        </div>
      )}

      {/* Live French Summary Banner */}
      <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center space-x-2.5 text-xs text-emerald-300">
        <Sparkles className="w-4 h-4 text-emerald-400 flex-shrink-0" />
        <span className="font-medium">{getScheduleSummary()}</span>
      </div>
    </div>
  );
};
