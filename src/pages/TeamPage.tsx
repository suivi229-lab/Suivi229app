import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Modal from '../components/Modal';
import {
  Plus, Users, Shield, Wrench, Eye, TrendingUp,
  Edit2, Trash2, RefreshCw, UserX, UserCheck, AlertTriangle,
} from 'lucide-react';

type UserRole = 'Admin' | 'Technicien' | 'Observateur' | 'Investisseur';

interface TeamMember {
  id: string;
  full_name: string | null;
  role: UserRole;
  email?: string | null;
  is_active?: boolean | null;
  updated_at?: string;
}

interface ConfirmDialog {
  title: string;
  message: string;
  confirmLabel: string;
  variant: 'danger' | 'warning';
  onConfirm: () => void;
}

const roleColors: Record<UserRole, string> = {
  Admin: 'text-brand-600 bg-brand-50 dark:bg-brand-900/20 dark:text-brand-400',
  Technicien: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400',
  Observateur: 'text-gray-600 bg-gray-100 dark:bg-gray-800 dark:text-gray-400',
  Investisseur: 'text-accent-600 bg-accent-50 dark:bg-accent-900/20 dark:text-accent-400',
};

const roleIcons: Record<UserRole, React.ElementType> = {
  Admin: Shield,
  Technicien: Wrench,
  Observateur: Eye,
  Investisseur: TrendingUp,
};

const ACCESS_LABELS: Record<UserRole, string> = {
  Admin: 'Accès complet',
  Technicien: 'Stock + Installation',
  Observateur: 'Lecture seule',
  Investisseur: 'Dashboard uniquement',
};

function isActive(member: TeamMember) {
  return member.is_active !== false;
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState<TeamMember | null>(null);
  const [confirm, setConfirm] = useState<ConfirmDialog | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({ name: '', role: 'Technicien' as UserRole, email: '', password: '' });
  const [editRole, setEditRole] = useState<UserRole>('Technicien');
  const [editName, setEditName] = useState('');

  useEffect(() => { loadMembers(); }, []);

  async function loadMembers() {
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role, email, is_active, updated_at')
      .order('role');
    setMembers((data as TeamMember[]) || []);
    setLoading(false);
  }

  async function addMember() {
    if (!form.name.trim() || !form.password.trim()) {
      setError('Le nom et le mot de passe sont obligatoires.');
      return;
    }
    if (form.password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const userEmail = form.email.trim() ||
        `${form.name.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '')}.${Date.now()}@suivi229.local`;

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: userEmail,
        password: form.password,
        options: { data: { full_name: form.name.trim() } },
      });

      if (authError) {
        setError(`Erreur d'authentification : ${authError.message}`);
        return;
      }

      const newUser = authData?.user;
      if (!newUser) {
        setError('Impossible de lier le compte utilisateur.');
        return;
      }

      const { error: insertError } = await supabase.from('profiles').insert({
        id: newUser.id,
        full_name: form.name.trim(),
        role: form.role,
        email: userEmail,
        is_active: true,
      });

      if (insertError) {
        setError(`Erreur lors de la création du profil : ${insertError.message}`);
      } else {
        setSuccess(`✅ ${form.name} ajouté avec succès ! Email de connexion : ${userEmail}`);
        setForm({ name: '', role: 'Technicien', email: '', password: '' });
        setShowAdd(false);
        loadMembers();
      }
    } catch {
      setError('Erreur inattendue lors de la création du membre.');
    } finally {
      setSubmitting(false);
    }
  }

  async function updateMember() {
    if (!showEdit) return;
    await supabase
      .from('profiles')
      .update({ role: editRole, full_name: editName || showEdit.full_name })
      .eq('id', showEdit.id);
    setShowEdit(null);
    loadMembers();
  }

  async function toggleActive(member: TeamMember) {
    const nextActive = !isActive(member);
    const name = member.full_name || 'ce membre';

    if (!nextActive) {
      setConfirm({
        title: 'Désactiver le compte',
        message: `Le compte de "${name}" sera désactivé. Il ne pourra plus se connecter à l'application. Vous pourrez le réactiver à tout moment.`,
        confirmLabel: 'Désactiver',
        variant: 'warning',
        onConfirm: async () => {
          await supabase.from('profiles').update({ is_active: false }).eq('id', member.id);
          setConfirm(null);
          loadMembers();
        },
      });
    } else {
      await supabase.from('profiles').update({ is_active: true }).eq('id', member.id);
      loadMembers();
    }
  }

  async function deleteMember(member: TeamMember) {
    const name = member.full_name || 'ce membre';
    setConfirm({
      title: 'Supprimer le membre',
      message: `Supprimer définitivement "${name}" ? Le profil sera effacé. Cette action est irréversible.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
      onConfirm: async () => {
        await supabase.from('profiles').delete().eq('id', member.id);
        setConfirm(null);
        loadMembers();
      },
    });
  }

  const active = members.filter(isActive);
  const inactive = members.filter(m => !isActive(m));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  function MemberRow({ member }: { member: TeamMember }) {
    const RoleIcon = roleIcons[member.role] || Users;
    const active = isActive(member);
    return (
      <tr className={`border-b border-gray-100 dark:border-gray-800 transition-colors ${
        active ? 'hover:bg-gray-50 dark:hover:bg-gray-800/50' : 'opacity-60 bg-gray-50/50 dark:bg-gray-900/30'
      }`}>
        <td className="table-cell">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              active ? 'bg-gray-200 dark:bg-gray-700' : 'bg-gray-100 dark:bg-gray-800'
            }`}>
              <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                {(member.full_name || '?')[0].toUpperCase()}
              </span>
            </div>
            <div>
              <p className={`font-medium ${active ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>
                {member.full_name || '(Sans nom)'}
              </p>
              {member.email && (
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[180px]">{member.email}</p>
              )}
            </div>
          </div>
        </td>
        <td className="table-cell">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${roleColors[member.role]}`}>
            <RoleIcon className="w-3 h-3" />
            {member.role}
          </span>
        </td>
        <td className="table-cell text-xs text-gray-500 dark:text-gray-400">
          {ACCESS_LABELS[member.role]}
        </td>
        <td className="table-cell">
          {active ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Actif
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
              Désactivé
            </span>
          )}
        </td>
        <td className="table-cell no-print">
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setShowEdit(member); setEditRole(member.role); setEditName(member.full_name || ''); }}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-brand-600 transition-colors"
              title="Modifier"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => toggleActive(member)}
              className={`p-1.5 rounded-lg transition-colors ${
                active
                  ? 'hover:bg-amber-50 dark:hover:bg-amber-900/20 text-gray-500 hover:text-amber-600'
                  : 'hover:bg-green-50 dark:hover:bg-green-900/20 text-gray-500 hover:text-green-600'
              }`}
              title={active ? 'Désactiver le compte' : 'Réactiver le compte'}
            >
              {active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
            </button>
            <button
              onClick={() => deleteMember(member)}
              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-500 hover:text-red-600 transition-colors"
              title="Supprimer définitivement"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Gestion de l'équipe</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {active.length} actif{active.length > 1 ? 's' : ''}{inactive.length > 0 ? ` · ${inactive.length} désactivé${inactive.length > 1 ? 's' : ''}` : ''} — accès réservé aux administrateurs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadMembers} className="btn-outline" title="Actualiser">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => { setShowAdd(true); setError(''); setSuccess(''); }} className="btn-primary">
            <Plus className="w-4 h-4" /> Ajouter un membre
          </button>
        </div>
      </div>

      {success && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl text-sm text-green-700 dark:text-green-300 break-all">
          {success}
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="table-header">Nom / Email</th>
              <th className="table-header">Rôle</th>
              <th className="table-header">Accès</th>
              <th className="table-header">Statut</th>
              <th className="table-header no-print">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map(member => <MemberRow key={member.id} member={member} />)}
            {members.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-10 text-gray-400">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Aucun membre dans l'équipe
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Modal Ajouter ── */}
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setError(''); }} title="Ajouter un membre de l'équipe">
        <div className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
          <div>
            <label className="label">Nom / Pseudo *</label>
            <input className="input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Jean Dupont" />
          </div>
          <div>
            <label className="label">Rôle *</label>
            <select className="select" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value as UserRole }))}>
              <option value="Admin">Admin — Accès complet</option>
              <option value="Technicien">Technicien — Stock + Installation</option>
              <option value="Observateur">Observateur — Lecture seule</option>
              <option value="Investisseur">Investisseur — Dashboard uniquement</option>
            </select>
          </div>
          <div>
            <label className="label">Email <span className="text-gray-400 font-normal">(optionnel)</span></label>
            <input type="email" className="input" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="technicien@email.com" />
            <p className="text-xs text-gray-400 mt-1">Si vide, un email interne temporaire sera généré automatiquement.</p>
          </div>
          <div>
            <label className="label">Mot de passe *</label>
            <input type="password" className="input" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="Minimum 6 caractères" />
          </div>
          <button
            onClick={addMember}
            disabled={submitting || !form.name.trim() || !form.password.trim()}
            className="btn-primary w-full"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Création en cours...
              </span>
            ) : 'Créer le compte'}
          </button>
        </div>
      </Modal>

      {/* ── Modal Modifier ── */}
      <Modal open={!!showEdit} onClose={() => setShowEdit(null)} title="Modifier le membre">
        <div className="space-y-4">
          <div>
            <label className="label">Nom / Pseudo</label>
            <input className="input" value={editName} onChange={e => setEditName(e.target.value)} />
          </div>
          <div>
            <label className="label">Rôle</label>
            <select className="select" value={editRole} onChange={e => setEditRole(e.target.value as UserRole)}>
              <option value="Admin">Admin — Accès complet</option>
              <option value="Technicien">Technicien — Stock + Installation</option>
              <option value="Observateur">Observateur — Lecture seule</option>
              <option value="Investisseur">Investisseur — Dashboard uniquement</option>
            </select>
          </div>
          <button onClick={updateMember} className="btn-primary w-full">Enregistrer les modifications</button>
        </div>
      </Modal>

      {/* ── Modal Confirmation ── */}
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title ?? ''}>
        {confirm && (
          <div className="space-y-5">
            <div className={`flex items-start gap-3 p-4 rounded-xl ${
              confirm.variant === 'danger'
                ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
            }`}>
              <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                confirm.variant === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
              }`} />
              <p className={`text-sm ${
                confirm.variant === 'danger' ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'
              }`}>
                {confirm.message}
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirm(null)} className="btn-outline flex-1">Annuler</button>
              <button
                onClick={confirm.onConfirm}
                className={`flex-1 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors ${
                  confirm.variant === 'danger'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-amber-500 hover:bg-amber-600'
                }`}
              >
                {confirm.confirmLabel}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
