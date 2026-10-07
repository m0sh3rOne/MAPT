import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { User } from '../../types';
import {
  Users as UsersIcon,
  UserPlus,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
  KeyRound,
  Edit2,
  Trash2,
  Search,
  Check,
  X,
  Eye,
  EyeOff,
  Clock,
  Mail,
  AlertTriangle,
  Lock,
  Sparkles,
  Package,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';

const roleBadge = (role: string) => {
  switch (role) {
    case 'super_admin':
      return {
        label: 'Super Admin',
        color: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
        icon: ShieldAlert,
      };
    case 'administrator':
      return {
        label: 'Administrateur',
        color: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        icon: ShieldCheck,
      };
    case 'operator':
      return {
        label: 'Opérateur',
        color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        icon: Shield,
      };
    case 'app_store_client':
      return {
        label: 'Client App Store',
        color: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
        icon: Package,
      };
    default:
      return {
        label: 'Lecteur',
        color: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
        icon: UsersIcon,
      };
  }
};

export const Users: React.FC = () => {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Sorting state
  const [sortBy, setSortBy] = useState<'username' | 'email' | 'role' | 'is_active' | 'last_login_at'>('username');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [passwordResetUser, setPasswordResetUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);

  // Forms state
  const [createForm, setCreateForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'operator',
  });
  const [showCreatePassword, setShowCreatePassword] = useState(false);

  const [editForm, setEditForm] = useState({
    email: '',
    role: 'operator',
    is_active: true,
  });

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);

  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setFeedbackMsg({ type, text });
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  // Queries
  const { data: users = [], isLoading, refetch } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: api.getUsers,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: api.createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsCreateOpen(false);
      setCreateForm({ username: '', email: '', password: '', role: 'operator' });
      showFeedback('success', 'Utilisateur créé avec succès !');
    },
    onError: (err: any) => {
      showFeedback('error', err.response?.data?.detail || 'Erreur lors de la création.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditingUser(null);
      showFeedback('success', 'Utilisateur mis à jour avec succès.');
    },
    onError: (err: any) => {
      showFeedback('error', err.response?.data?.detail || 'Erreur lors de la mise à jour.');
    },
  });

  const passwordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api.updateUser(id, { password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setPasswordResetUser(null);
      setNewPassword('');
      setConfirmPassword('');
      showFeedback('success', 'Mot de passe réinitialisé avec succès.');
    },
    onError: (err: any) => {
      showFeedback('error', err.response?.data?.detail || 'Erreur lors de la modification.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setDeletingUser(null);
      showFeedback('success', 'Utilisateur supprimé.');
    },
    onError: (err: any) => {
      showFeedback('error', err.response?.data?.detail || 'Erreur lors de la suppression.');
    },
  });

  // Handlers
  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.username.trim() || !createForm.password.trim()) {
      showFeedback('error', 'L’identifiant et le mot de passe sont obligatoires.');
      return;
    }
    createMutation.mutate({
      username: createForm.username.trim(),
      email: createForm.email.trim() || undefined,
      password: createForm.password,
      role: createForm.role,
    });
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    updateMutation.mutate({
      id: editingUser.id,
      data: {
        email: editForm.email.trim() || undefined,
        role: editForm.role,
        is_active: editForm.is_active,
      },
    });
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordResetUser) return;
    if (newPassword.length < 4) {
      showFeedback('error', 'Le mot de passe doit contenir au moins 4 caractères.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showFeedback('error', 'Les deux mots de passe ne correspondent pas.');
      return;
    }
    passwordMutation.mutate({
      id: passwordResetUser.id,
      password: newPassword,
    });
  };

  const openEditModal = (u: User) => {
    setEditingUser(u);
    setEditForm({
      email: u.email || '',
      role: u.role || 'operator',
      is_active: u.is_active,
    });
  };

  // Filtered users
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.email && u.email.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  // Sorted users
  const sortedUsers = [...filteredUsers].sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'username') {
      comparison = (a.username || '').localeCompare(b.username || '', undefined, { sensitivity: 'base' });
    } else if (sortBy === 'email') {
      comparison = (a.email || '').localeCompare(b.email || '', undefined, { sensitivity: 'base' });
    } else if (sortBy === 'role') {
      const rolePriority: { [k: string]: number } = {
        super_admin: 1,
        administrator: 2,
        operator: 3,
        app_store_client: 4,
        viewer: 5,
      };
      comparison = (rolePriority[a.role] || 99) - (rolePriority[b.role] || 99);
      if (comparison === 0) {
        comparison = (a.username || '').localeCompare(b.username || '');
      }
    } else if (sortBy === 'is_active') {
      comparison = (a.is_active === b.is_active ? 0 : a.is_active ? -1 : 1);
    } else if (sortBy === 'last_login_at') {
      const timeA = a.last_login_at ? new Date(a.last_login_at).getTime() : 0;
      const timeB = b.last_login_at ? new Date(b.last_login_at).getTime() : 0;
      comparison = timeA - timeB;
    }
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const handleSort = (field: 'username' | 'email' | 'role' | 'is_active' | 'last_login_at') => {
    if (sortBy === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDirection(field === 'last_login_at' ? 'desc' : 'asc');
    }
  };

  const getSortIcon = (field: 'username' | 'email' | 'role' | 'is_active' | 'last_login_at') => {
    if (sortBy !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 opacity-60" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-emerald-400" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-emerald-400" />
    );
  };

  const superAdminCount = users.filter((u) => u.role === 'super_admin').length;
  const activeCount = users.filter((u) => u.is_active).length;

  return (
    <div className="space-y-6">
      {/* Feedback Toast */}
      {feedbackMsg && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl border text-sm font-medium shadow-2xl flex items-center space-x-2 animate-slide-up backdrop-blur-md ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/40'
              : 'bg-rose-950/90 text-rose-300 border-rose-500/40'
          }`}
        >
          {feedbackMsg.type === 'success' ? (
            <Check className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          )}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <UsersIcon className="w-5 h-5" />
            </div>
            <span>Gestion des Utilisateurs</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Création, rôles et administration des comptes d'accès à la plateforme MAPT.
          </p>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center space-x-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold px-4 py-2.5 rounded-xl transition shadow-lg shadow-emerald-500/20 text-sm shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          <span>Nouvel Utilisateur</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center space-x-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <UsersIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-semibold uppercase">Total Utilisateurs</div>
            <div className="text-2xl font-extrabold text-slate-100 mt-0.5">{users.length}</div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center space-x-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-semibold uppercase">Super Administrateurs</div>
            <div className="text-2xl font-extrabold text-slate-100 mt-0.5">{superAdminCount}</div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center space-x-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-semibold uppercase">Comptes Actifs</div>
            <div className="text-2xl font-extrabold text-slate-100 mt-0.5">{activeCount}</div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par identifiant, email..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-emerald-500 outline-none transition"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Tri sélecteur rapide */}
          <div className="flex items-center space-x-2">
            <ArrowUpDown className="w-4 h-4 text-slate-500 shrink-0" />
            <select
              value={`${sortBy}_${sortDirection}`}
              onChange={(e) => {
                const [field, dir] = e.target.value.split('_') as [any, any];
                setSortBy(field);
                setSortDirection(dir);
              }}
              className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-xl px-3 py-2 outline-none focus:border-emerald-500"
            >
              <option value="username_asc">Tri : Identifiant (A → Z)</option>
              <option value="username_desc">Tri : Identifiant (Z → A)</option>
              <option value="role_asc">Tri : Rôle hiérarchique</option>
              <option value="is_active_asc">Tri : Statut (Actifs d'abord)</option>
              <option value="last_login_at_desc">Tri : Dernière connexion (Récent)</option>
              <option value="email_asc">Tri : Email</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-400 font-medium">Rôle :</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-emerald-500 outline-none transition"
            >
              <option value="all">Tous les rôles</option>
              <option value="super_admin">Super Admin</option>
              <option value="administrator">Administrateur</option>
              <option value="operator">Opérateur</option>
              <option value="app_store_client">Client App Store</option>
              <option value="viewer">Lecteur</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <tr>
                {/* Tri par Utilisateur */}
                <th
                  onClick={() => handleSort('username')}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-900/80 transition select-none"
                  title="Cliquer pour trier par Identifiant"
                >
                  <div className="flex items-center space-x-1.5">
                    <span>Utilisateur</span>
                    {getSortIcon('username')}
                  </div>
                </th>

                {/* Tri par Email */}
                <th
                  onClick={() => handleSort('email')}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-900/80 transition select-none"
                  title="Cliquer pour trier par Email"
                >
                  <div className="flex items-center space-x-1.5">
                    <span>Email</span>
                    {getSortIcon('email')}
                  </div>
                </th>

                {/* Tri par Rôle */}
                <th
                  onClick={() => handleSort('role')}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-900/80 transition select-none"
                  title="Cliquer pour trier par Rôle"
                >
                  <div className="flex items-center space-x-1.5">
                    <span>Rôle</span>
                    {getSortIcon('role')}
                  </div>
                </th>

                {/* Tri par Statut */}
                <th
                  onClick={() => handleSort('is_active')}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-900/80 transition select-none"
                  title="Cliquer pour trier par Statut"
                >
                  <div className="flex items-center space-x-1.5">
                    <span>Statut</span>
                    {getSortIcon('is_active')}
                  </div>
                </th>

                {/* Tri par Dernière Connexion */}
                <th
                  onClick={() => handleSort('last_login_at')}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-900/80 transition select-none"
                  title="Cliquer pour trier par Dernière Connexion"
                >
                  <div className="flex items-center space-x-1.5">
                    <span>Dernière Connexion</span>
                    {getSortIcon('last_login_at')}
                  </div>
                </th>

                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-sm">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Chargement des utilisateurs...
                  </td>
                </tr>
              ) : sortedUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Aucun utilisateur trouvé.
                  </td>
                </tr>
              ) : (
                sortedUsers.map((u) => {
                  const badge = roleBadge(u.role);
                  const Icon = badge.icon;
                  const isCurrent = currentUser?.id === u.id;

                  return (
                    <tr key={u.id} className="hover:bg-slate-850/60 transition">
                      {/* User Info */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-800 to-slate-950 border border-slate-700 flex items-center justify-center font-bold text-slate-200 text-sm shrink-0 shadow-inner">
                            {u.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-slate-100">{u.username}</span>
                              {isCurrent && (
                                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                                  Vous
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-500 font-mono">ID: {u.id.slice(0, 8)}...</span>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="py-3.5 px-4">
                        <span className="text-slate-300 text-xs font-mono">{u.email || '—'}</span>
                      </td>

                      {/* Role */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${badge.color}`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          <span>{badge.label}</span>
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {u.is_active ? (
                          <span className="inline-flex items-center space-x-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            <span>Actif</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1.5 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-0.5 rounded-full font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                            <span>Désactivé</span>
                          </span>
                        )}
                      </td>

                      {/* Last Login */}
                      <td className="py-3.5 px-4 text-xs text-slate-400">
                        {u.last_login_at ? (
                          <div className="flex items-center space-x-1.5 font-mono">
                            <Clock className="w-3.5 h-3.5 text-slate-500" />
                            <span>{new Date(u.last_login_at).toLocaleString('fr-FR')}</span>
                          </div>
                        ) : (
                          <span className="text-slate-600 italic">Jamais connecté</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => setPasswordResetUser(u)}
                            className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition"
                            title="Modifier le mot de passe"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => openEditModal(u)}
                            className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition"
                            title="Modifier le compte"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          {!isCurrent && (
                            <button
                              onClick={() => setDeletingUser(u)}
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                              title="Supprimer l'utilisateur"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ================= MODAL: CRÉATION UTILISATEUR ================= */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-100">Créer un Utilisateur</h2>
                  <p className="text-xs text-slate-400">Ajout d'un compte d'accès pour MAPT</p>
                </div>
              </div>
              <button onClick={() => setIsCreateOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              {/* Username */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Identifiant *
                </label>
                <input
                  type="text"
                  required
                  value={createForm.username}
                  onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                  placeholder="ex: jdupont ou operateur1"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:border-emerald-500 outline-none transition"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Adresse Email <span className="text-slate-500 font-normal">(Optionnel)</span>
                </label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  placeholder="ex: jdupont@domaine.local"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:border-emerald-500 outline-none transition"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Si laissé vide, une adresse par défaut <code>{createForm.username || 'identifiant'}@mapt.local</code> sera générée.
                </p>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Mot de passe *
                </label>
                <div className="relative">
                  <input
                    type={showCreatePassword ? 'text' : 'password'}
                    required
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    placeholder="Au moins 4 caractères"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-3.5 pr-10 py-2.5 text-sm text-slate-200 focus:border-emerald-500 outline-none transition font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreatePassword(!showCreatePassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showCreatePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Rôle & Permissions
                </label>
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:border-emerald-500 outline-none transition"
                >
                  <option value="operator">Opérateur (Déploiements, scripts & actions)</option>
                  <option value="app_store_client">Client App Store (Packages MSI/EXE sur groupes assignés)</option>
                  <option value="administrator">Administrateur (Gestion complète hors Super Admin)</option>
                  <option value="super_admin">Super Administrateur (Tous les droits)</option>
                  <option value="viewer">Lecteur (Lecture seule)</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl text-sm transition shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Création...' : 'Créer l’utilisateur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: MODIFICATION UTILISATEUR ================= */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-100">Modifier l'Utilisateur</h2>
                  <p className="text-xs text-slate-400 font-mono">{editingUser.username}</p>
                </div>
              </div>
              <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Adresse Email
                </label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  placeholder="adresse@domaine.local"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:border-emerald-500 outline-none transition"
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Rôle & Permissions
                </label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:border-emerald-500 outline-none transition"
                >
                  <option value="super_admin">Super Administrateur</option>
                  <option value="administrator">Administrateur</option>
                  <option value="operator">Opérateur</option>
                  <option value="app_store_client">Client App Store</option>
                  <option value="viewer">Lecteur</option>
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Statut du Compte
                </label>
                <div className="flex items-center space-x-4 pt-1">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="status"
                      checked={editForm.is_active === true}
                      onChange={() => setEditForm({ ...editForm, is_active: true })}
                      className="text-emerald-500 focus:ring-emerald-500"
                    />
                    <span className="text-sm text-emerald-400 font-medium">Actif</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="status"
                      checked={editForm.is_active === false}
                      onChange={() => setEditForm({ ...editForm, is_active: false })}
                      className="text-rose-500 focus:ring-rose-500"
                    />
                    <span className="text-sm text-rose-400 font-medium">Désactivé</span>
                  </label>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl text-sm transition shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                >
                  {updateMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: MODIFIER MOT DE PASSE (ADMIN RESET) ================= */}
      {passwordResetUser && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-100">Changer le Mot de Passe</h2>
                  <p className="text-xs text-slate-400">
                    Utilisateur : <span className="font-bold text-slate-200">{passwordResetUser.username}</span>
                  </p>
                </div>
              </div>
              <button onClick={() => setPasswordResetUser(null)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Nouveau mot de passe *
                </label>
                <div className="relative">
                  <input
                    type={showResetPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Au moins 4 caractères"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-3.5 pr-10 py-2.5 text-sm text-slate-200 focus:border-amber-500 outline-none transition font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPassword(!showResetPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Confirmer le mot de passe *
                </label>
                <input
                  type={showResetPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Répétez le nouveau mot de passe"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:border-amber-500 outline-none transition font-mono"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setPasswordResetUser(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={passwordMutation.isPending}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-sm transition shadow-lg shadow-amber-500/20 disabled:opacity-50"
                >
                  {passwordMutation.isPending ? 'Modification...' : 'Modifier le mot de passe'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: CONFIRMATION SUPPRESSION ================= */}
      {deletingUser && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-slate-100">Confirmer la suppression</h2>
            </div>

            <p className="text-sm text-slate-300">
              Êtes-vous sûr de vouloir supprimer définitivement le compte utilisateur{' '}
              <span className="font-bold text-rose-400">{deletingUser.username}</span> ({deletingUser.email}) ?
            </p>

            <div className="pt-2 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(deletingUser.id)}
                disabled={deleteMutation.isPending}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-sm transition shadow-lg shadow-rose-600/20 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
