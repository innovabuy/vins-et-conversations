import { useState, useEffect } from 'react';
import { usersAPI, invitationsAPI, campaignsAPI } from '../../services/api';
import { Users, Shield, Mail, Copy, Check, Plus, Upload, Link, QrCode } from 'lucide-react';

const ROLES = [
  { value: 'super_admin', label: 'Super Admin', color: 'bg-red-100 text-red-700' },
  { value: 'commercial', label: 'Commercial', color: 'bg-blue-100 text-blue-700' },
  { value: 'comptable', label: 'Comptable', color: 'bg-green-100 text-green-700' },
  { value: 'enseignant', label: 'Enseignant', color: 'bg-purple-100 text-purple-700' },
  { value: 'etudiant', label: 'Étudiant', color: 'bg-amber-100 text-amber-700' },
  { value: 'cse', label: 'CSE', color: 'bg-teal-100 text-teal-700' },
  { value: 'ambassadeur', label: 'Ambassadeur', color: 'bg-orange-100 text-orange-700' },
  { value: 'lecture_seule', label: 'Lecture seule', color: 'bg-gray-100 text-gray-600' },
];

const MODULES = ['orders', 'delivery_notes', 'crm', 'stock', 'analytics', 'catalogue', 'notifications', 'payments', 'exports', 'finance', 'users'];

export default function AdminUsers() {
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersRes, campaignsRes, invitationsRes] = await Promise.all([
        usersAPI.list(),
        campaignsAPI.list(),
        invitationsAPI.list(),
      ]);
      setUsers(usersRes.data.data || []);
      setCampaigns(campaignsRes.data.data || []);
      setInvitations(invitationsRes.data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (id) => {
    try {
      await usersAPI.toggleStatus(id);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const copyLink = (link, id) => {
    navigator.clipboard.writeText(link);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredUsers = users.filter((u) => {
    if (roleFilter && u.role !== roleFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    }
    return true;
  });

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Utilisateurs & Droits</h1>
          <p className="text-sm text-gray-500 mt-1">{users.length} utilisateurs</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {[
          { key: 'users', label: 'Utilisateurs', icon: Users },
          { key: 'rbac', label: 'Matrice RBAC', icon: Shield },
          { key: 'invitations', label: 'Invitations', icon: Mail },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1 px-4 py-2 text-sm font-medium border-b-2 ${
              tab === key ? 'border-wine-700 text-wine-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {/* Tab: Users */}
      {tab === 'users' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field flex-1"
            />
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="input-field w-40">
              <option value="">Tous les rôles</option>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <button onClick={() => setShowCreateModal(true)} className="btn-primary flex items-center gap-1 whitespace-nowrap">
              <Plus size={16} /> Créer
            </button>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 px-2">Nom</th>
                  <th className="py-2 px-2">Email</th>
                  <th className="py-2 px-2">Rôle</th>
                  <th className="py-2 px-2">Statut</th>
                  <th className="py-2 px-2">Dernière connexion</th>
                  <th className="py-2 px-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const role = ROLES.find((r) => r.value === u.role);
                  return (
                    <tr key={u.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-2 font-medium">{u.name}</td>
                      <td className="py-2 px-2 text-gray-600">{u.email}</td>
                      <td className="py-2 px-2">
                        <span className={`text-xs px-2 py-0.5 rounded ${role?.color || 'bg-gray-100 text-gray-600'}`}>
                          {role?.label || u.role}
                        </span>
                      </td>
                      <td className="py-2 px-2">
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          u.status === 'active' ? 'bg-green-100 text-green-700' :
                          u.status === 'disabled' ? 'bg-red-100 text-red-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>{u.status}</span>
                      </td>
                      <td className="py-2 px-2 text-gray-400 text-xs">
                        {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString('fr-FR') : '-'}
                      </td>
                      <td className="py-2 px-2">
                        <button
                          onClick={() => toggleStatus(u.id)}
                          className={`text-xs px-2 py-1 rounded ${
                            u.status === 'active' ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'
                          }`}
                        >
                          {u.status === 'active' ? 'Désactiver' : 'Activer'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Create User Modal */}
          {showCreateModal && <CreateUserModal onClose={() => setShowCreateModal(false)} onCreated={loadData} />}
        </div>
      )}

      {/* Tab: RBAC Matrix */}
      {tab === 'rbac' && (
        <div className="card overflow-x-auto">
          <h3 className="font-semibold mb-4">Matrice des permissions par rôle</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="py-2 px-2 text-left">Module</th>
                {ROLES.slice(0, 5).map((r) => (
                  <th key={r.value} className="py-2 px-1 text-center">{r.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((mod) => (
                <tr key={mod} className="border-b">
                  <td className="py-2 px-2 font-medium capitalize">{mod.replace('_', ' ')}</td>
                  {ROLES.slice(0, 5).map((r) => {
                    const hasAccess = r.value === 'super_admin' ||
                      (r.value === 'commercial' && !['users', 'exports', 'finance'].includes(mod)) ||
                      (r.value === 'comptable' && ['orders', 'payments', 'exports', 'finance'].includes(mod));
                    return (
                      <td key={r.value} className="py-2 px-1 text-center">
                        {hasAccess
                          ? <span className="text-green-600">&#10003;</span>
                          : <span className="text-gray-300">-</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Invitations */}
      {tab === 'invitations' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowInviteModal(true)} className="btn-primary flex items-center gap-1">
              <Plus size={16} /> Nouvelle invitation
            </button>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 px-2">Code</th>
                  <th className="py-2 px-2">Campagne</th>
                  <th className="py-2 px-2">Rôle</th>
                  <th className="py-2 px-2">Méthode</th>
                  <th className="py-2 px-2">Statut</th>
                  <th className="py-2 px-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => {
                  const link = `${window.location.origin}/invite/${inv.code}`;
                  const isUsed = !!inv.used_at;
                  const isExpired = inv.expires_at && new Date(inv.expires_at) < new Date();
                  return (
                    <tr key={inv.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-2 font-mono text-xs">{inv.code.substring(0, 12)}...</td>
                      <td className="py-2 px-2">{inv.campaign_name || '-'}</td>
                      <td className="py-2 px-2">
                        <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{inv.role}</span>
                      </td>
                      <td className="py-2 px-2">
                        {inv.method === 'link' && <Link size={14} className="text-blue-500" />}
                        {inv.method === 'qr' && <QrCode size={14} className="text-purple-500" />}
                        {inv.method === 'email' && <Mail size={14} className="text-green-500" />}
                        <span className="text-xs ml-1">{inv.method}</span>
                      </td>
                      <td className="py-2 px-2">
                        {isUsed ? (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Utilisée</span>
                        ) : isExpired ? (
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Expirée</span>
                        ) : (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Active</span>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        {!isUsed && !isExpired && (
                          <button
                            onClick={() => copyLink(link, inv.id)}
                            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                          >
                            {copiedId === inv.id ? <Check size={12} /> : <Copy size={12} />}
                            {copiedId === inv.id ? 'Copié' : 'Copier lien'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {invitations.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-gray-400">Aucune invitation</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {showInviteModal && (
            <CreateInvitationModal
              campaigns={campaigns}
              onClose={() => setShowInviteModal(false)}
              onCreated={loadData}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Create User Modal ─────────────────────────────
function CreateUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', email: '', role: 'etudiant', password: 'VinsConv2026!' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await usersAPI.create(form);
      onCreated();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de la création');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-lg mb-4">Créer un utilisateur</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input type="text" placeholder="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" required />
          <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input-field" required />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="input-field">
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <input type="password" placeholder="Mot de passe" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input-field" required />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="btn-secondary">Annuler</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Création...' : 'Créer'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Create Invitation Modal ─────────────────────────
function CreateInvitationModal({ campaigns, onClose, onCreated }) {
  const [form, setForm] = useState({ campaign_id: '', role: 'etudiant', method: 'link', count: 1 });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await invitationsAPI.create(form);
      onCreated();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-lg mb-4">Nouvelle invitation</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <select value={form.campaign_id} onChange={(e) => setForm({ ...form, campaign_id: e.target.value })} className="input-field" required>
            <option value="">Choisir une campagne</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="input-field">
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className="input-field">
            <option value="link">Lien</option>
            <option value="qr">QR Code</option>
            <option value="email">Email</option>
          </select>
          {form.method !== 'email' && (
            <input type="number" min="1" max="50" placeholder="Nombre" value={form.count} onChange={(e) => setForm({ ...form, count: parseInt(e.target.value, 10) || 1 })} className="input-field" />
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="btn-secondary">Annuler</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Création...' : 'Créer'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
