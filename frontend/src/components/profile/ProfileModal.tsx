import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import {
  User as UserIcon,
  KeyRound,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Mail,
  Clock,
  Check,
  AlertTriangle,
  X,
  Eye,
  EyeOff,
  Lock,
  Sparkles
} from 'lucide-react';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
  const { user, updateUser } = useAuth();

  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('password');

  // Profile form
  const [email, setEmail] = useState(user?.email || '');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const showFeedbackMsg = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingProfile(true);
    try {
      const updated = await api.updateProfile({ email: email.trim() || undefined });
      updateUser(updated);
      showFeedbackMsg('success', 'Profil mis à jour avec succès !');
    } catch (err: any) {
      showFeedbackMsg('error', err.response?.data?.detail || 'Erreur lors de la mise à jour du profil.');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      showFeedbackMsg('error', 'Veuillez saisir votre mot de passe actuel.');
      return;
    }
    if (newPassword.length < 4) {
      showFeedbackMsg('error', 'Le nouveau mot de passe doit contenir au moins 4 caractères.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showFeedbackMsg('error', 'Les nouveaux mots de passe ne correspondent pas.');
      return;
    }

    setIsChangingPassword(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      showFeedbackMsg('success', 'Votre mot de passe a été modifié avec succès !');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      showFeedbackMsg('error', err.response?.data?.detail || 'Mot de passe actuel incorrect ou erreur.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const roleLabel = (role?: string) => {
    switch (role) {
      case 'super_admin':
        return { label: 'Super Administrateur', desc: 'Accès total à toutes les fonctionnalités et gestion des comptes utilisateurs' };
      case 'administrator':
        return { label: 'Administrateur', desc: 'Gestion du parc, déploiements, packages et scripts' };
      case 'operator':
        return { label: 'Opérateur', desc: 'Exécution des déploiements et actions rapides' };
      default:
        return { label: 'Lecteur', desc: 'Consultation en lecture seule' };
    }
  };

  const roleInfo = roleLabel(user?.role);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white font-extrabold text-xl shadow-lg shadow-emerald-500/20">
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-bold text-slate-100">{user?.username}</h2>
                <span className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize">
                  {user?.role?.replace('_', ' ')}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{user?.email || 'Compte MAPT'}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1.5 rounded-xl hover:bg-slate-800 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`p-3.5 rounded-2xl border text-xs font-medium flex items-center space-x-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                : 'bg-rose-950/80 text-rose-300 border-rose-500/40'
            }`}
          >
            {feedback.type === 'success' ? (
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center space-x-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('password')}
            className={`flex-1 flex items-center justify-center space-x-2 py-2 rounded-xl transition ${
              activeTab === 'password'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>Changer de mot de passe</span>
          </button>

          <button
            onClick={() => setActiveTab('profile')}
            className={`flex-1 flex items-center justify-center space-x-2 py-2 rounded-xl transition ${
              activeTab === 'profile'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserIcon className="w-4 h-4" />
            <span>Mon Profil</span>
          </button>
        </div>

        {/* TAB 1: PASSWORD CHANGE */}
        {activeTab === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Mot de passe actuel *
              </label>
              <div className="relative">
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Votre mot de passe actuel"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-3.5 pr-10 py-2.5 text-sm text-slate-200 focus:border-emerald-500 outline-none transition font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Nouveau mot de passe *
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Au moins 4 caractères"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-3.5 pr-10 py-2.5 text-sm text-slate-200 focus:border-emerald-500 outline-none transition font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Confirmer le nouveau mot de passe *
              </label>
              <input
                type={showNewPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Répétez le nouveau mot de passe"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:border-emerald-500 outline-none transition font-mono"
              />
            </div>

            <div className="pt-3 flex items-center justify-end space-x-3 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                Fermer
              </button>
              <button
                type="submit"
                disabled={isChangingPassword}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl text-xs transition shadow-lg shadow-emerald-500/20 disabled:opacity-50"
              >
                {isChangingPassword ? 'Modification...' : 'Changer mon mot de passe'}
              </button>
            </div>
          </form>
        )}

        {/* TAB 2: PROFILE DETAILS */}
        {activeTab === 'profile' && (
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                Identifiant
              </label>
              <div className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-300 font-mono">
                {user?.username}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                Adresse Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre.email@domaine.local"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:border-emerald-500 outline-none transition"
              />
            </div>

            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-2">
              <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span>Rôle et Droits</span>
              </div>
              <div className="text-sm font-semibold text-emerald-300">{roleInfo.label}</div>
              <p className="text-xs text-slate-400">{roleInfo.desc}</p>
            </div>

            <div className="pt-3 flex items-center justify-end space-x-3 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                Fermer
              </button>
              <button
                type="submit"
                disabled={isUpdatingProfile}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl text-xs transition shadow-lg shadow-emerald-500/20 disabled:opacity-50"
              >
                {isUpdatingProfile ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
