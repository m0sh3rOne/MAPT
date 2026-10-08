import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Monitor,
  FolderKanban,
  Package,
  Code2,
  Rocket,
  ShieldAlert,
  Server,
  Users as UsersIcon,
  ShieldCheck,
  Bot,
  FolderArchive
} from 'lucide-react';

const navItems = [
  { to: '/', label: 'Tableau de bord', icon: LayoutDashboard },
  { to: '/devices', label: 'Parc Machines', icon: Monitor },
  { to: '/groups', label: 'Groupes', icon: FolderKanban },
  { to: '/deployments', label: 'Déploiements', icon: Rocket },
  { to: '/packages', label: 'Packages MSI/EXE', icon: Package },
  { to: '/scripts', label: 'Scripts PS/Python', icon: Code2 },
  { to: '/audit', label: 'Journal d’Audit', icon: ShieldAlert },
  { to: '/profiles', label: 'Profils Utilisateurs', icon: FolderArchive },
];

export const Sidebar: React.FC = () => {
  const { user } = useAuth();
  const isSuperAdminOrAdmin = user?.role === 'super_admin' || user?.role === 'administrator';
  const isSuperAdmin = user?.role === 'super_admin';
  const isAppStoreClient = user?.role === 'app_store_client';

  const visibleNavItems = navItems.filter((item) => {
    if (isAppStoreClient && (item.to === '/scripts' || item.to === '/profiles')) return false;
    if (item.to === '/audit' && !isSuperAdminOrAdmin) return false;
    if (item.to === '/profiles' && !isSuperAdminOrAdmin) return false;
    return true;
  });

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-screen sticky top-0">
      {/* Brand Header */}
      <div className="h-16 flex items-center px-6 border-b border-slate-800 space-x-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-white font-black text-xl">
          M
        </div>
        <div>
          <div className="font-extrabold text-lg text-slate-100 tracking-tight">MAPT</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Admin Parc</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider px-3 mb-2">
          Gestion du Parc
        </div>
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition duration-150 ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}

        {isSuperAdminOrAdmin && (
          <>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider px-3 pt-4 mb-2">
              Administration
            </div>
            <NavLink
              to="/users"
              className={({ isActive }) =>
                `flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition duration-150 ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`
              }
            >
              <UsersIcon className="w-4 h-4" />
              <span>Utilisateurs</span>
            </NavLink>

            {isSuperAdmin && (
              <NavLink
                to="/mcp-server"
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition duration-150 ${
                    isActive
                      ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30 shadow-sm'
                      : 'text-slate-400 hover:text-purple-300 hover:bg-slate-800/60'
                  }`
                }
              >
                <Bot className="w-4 h-4 text-purple-400" />
                <span className="flex-1">Serveur MCP</span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  IA
                </span>
              </NavLink>
            )}
          </>
        )}
      </nav>

      {/* Footer Info */}
      <div className="p-4 border-t border-slate-800 text-xs text-slate-500">
        <div className="flex items-center space-x-2">
          <Server className="w-3.5 h-3.5 text-slate-400" />
          <span>v1.0.0 — Modèle Pull</span>
        </div>
      </div>
    </aside>
  );
};
