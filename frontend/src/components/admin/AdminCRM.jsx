import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { contactsAPI, campaignsAPI } from '../../services/api';
import {
  Users, Plus, Search, Pencil, X, Phone, Mail, MapPin,
  ChevronLeft, ChevronRight, UserPlus, GraduationCap, Building2, Award,
  ShoppingCart, ExternalLink
} from 'lucide-react';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);
const formatDate = (d) => new Date(d).toLocaleDateString('fr-FR');

const TYPE_CONFIG = {
  particulier:    { label: 'Particulier',    color: 'bg-blue-100 text-blue-800',   icon: Users },
  etudiant:       { label: 'Étudiant',       color: 'bg-indigo-100 text-indigo-800', icon: GraduationCap },
  cse:            { label: 'CSE',            color: 'bg-green-100 text-green-800', icon: Building2 },
  ambassadeur:    { label: 'Ambassadeur',    color: 'bg-purple-100 text-purple-800', icon: Award },
  professionnel:  { label: 'Professionnel',  color: 'bg-orange-100 text-orange-800', icon: Building2 },
};

const CONTACT_TYPES = Object.keys(TYPE_CONFIG);

const SCHOOLS = [
  { value: 'Lycée Sacré-Cœur', label: 'Lycée Sacré-Cœur — Angers' },
  { value: 'ESPL Angers', label: 'ESPL Angers' },
];

const COMPANIES = [
  { value: 'Leroy Merlin', label: 'Leroy Merlin' },
];

const EMPTY_FORM = {
  name: '', email: '', phone: '', address: '', source: '',
  type: 'particulier', notes: {},
};

// ─── Order History + Campaign Panel ─────────────────
function ContactPanel({ contact, onClose }) {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [allCampaigns, setAllCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState('');

  useEffect(() => {
    Promise.all([
      contactsAPI.history(contact.id).then(res => {
        const data = res.data.data || res.data || [];
        setOrders(data);
        // Extract unique campaign IDs from orders
        const campIds = [...new Set(data.map(o => o.campaign_id).filter(Boolean))];
        setCampaigns(campIds);
      }),
      campaignsAPI.list().then(res => setAllCampaigns(res.data.data || []))
    ]).catch(console.error).finally(() => setLoading(false));
  }, [contact.id]);

  const handleInvite = async () => {
    if (!selectedCampaign) return;
    alert(`Invitation préparée pour ${contact.name} à la campagne sélectionnée. (Fonctionnalité d'envoi à configurer)`);
    setInviting(false);
    setSelectedCampaign('');
  };

  const badge = TYPE_CONFIG[contact.type] || TYPE_CONFIG.particulier;
  const BadgeIcon = badge.icon;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-gray-900">{contact.name}</h2>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
                <BadgeIcon size={12} /> {badge.label}
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
              {contact.email && <span className="flex items-center gap-1"><Mail size={14} /> {contact.email}</span>}
              {contact.phone && <span className="flex items-center gap-1"><Phone size={14} /> {contact.phone}</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-4">
          {contact.address && (
            <div className="flex items-start gap-2 text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
              <MapPin size={16} className="mt-0.5 shrink-0" />
              <span>{contact.address}</span>
            </div>
          )}

          {/* Conditional fields display */}
          {contact.type === 'etudiant' && contact.notes?.school && (
            <div className="text-sm bg-indigo-50 rounded-lg p-3">
              <span className="text-indigo-600 font-medium">École :</span> {contact.notes.school}
            </div>
          )}
          {contact.type === 'cse' && contact.notes?.company && (
            <div className="text-sm bg-green-50 rounded-lg p-3">
              <span className="text-green-600 font-medium">Entreprise :</span> {contact.notes.company}
            </div>
          )}
          {contact.type === 'ambassadeur' && contact.notes?.network && (
            <div className="text-sm bg-purple-50 rounded-lg p-3">
              <span className="text-purple-600 font-medium">Réseau :</span> {contact.notes.network}
            </div>
          )}
          {contact.type === 'professionnel' && (
            <div className="text-sm bg-orange-50 rounded-lg p-3 space-y-1">
              {contact.notes?.company && <div><span className="text-orange-600 font-medium">Entreprise :</span> {contact.notes.company}</div>}
              {contact.notes?.siret && <div><span className="text-orange-600 font-medium">SIRET :</span> {contact.notes.siret}</div>}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-wine-50 rounded-lg p-3">
              <p className="text-xl font-bold text-wine-700">{contact.orders_count ?? 0}</p>
              <p className="text-xs text-gray-500">Commandes</p>
            </div>
            <div className="bg-wine-50 rounded-lg p-3">
              <p className="text-xl font-bold text-wine-700">{formatEur(contact.total_ca ?? 0)}</p>
              <p className="text-xs text-gray-500">CA Total</p>
            </div>
            <div className="bg-wine-50 rounded-lg p-3">
              <p className="text-sm font-semibold text-wine-700">{contact.last_order_at ? formatDate(contact.last_order_at) : '—'}</p>
              <p className="text-xs text-gray-500">Dernière cmd</p>
            </div>
          </div>

          {/* Campaigns section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm">Campagnes</h3>
              <button onClick={() => setInviting(!inviting)} className="flex items-center gap-1 text-xs text-wine-700 hover:text-wine-800">
                <UserPlus size={14} /> Inviter à une campagne
              </button>
            </div>
            {inviting && (
              <div className="flex items-center gap-2 mb-3 p-3 bg-gray-50 rounded-lg">
                <select value={selectedCampaign} onChange={e => setSelectedCampaign(e.target.value)} className="flex-1 border rounded-lg px-3 py-1.5 text-sm">
                  <option value="">Sélectionner une campagne...</option>
                  {allCampaigns.filter(c => c.status === 'active').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button onClick={handleInvite} disabled={!selectedCampaign} className="px-3 py-1.5 text-xs bg-wine-700 text-white rounded-lg hover:bg-wine-800 disabled:opacity-50">Inviter</button>
              </div>
            )}
            {orders.length > 0 ? (
              <div className="text-xs text-gray-500">Commandes dans {new Set(orders.map(o => o.campaign_id)).size} campagne(s)</div>
            ) : (
              <div className="text-xs text-gray-400">Aucune campagne</div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            <h3 className="font-semibold text-sm">Historique des commandes</h3>
            <button onClick={() => { onClose(); navigate('/admin/orders'); }} className="flex items-center gap-1 text-xs text-wine-700 hover:text-wine-800">
              <ShoppingCart size={14} /> Nouvelle commande
            </button>
          </div>
          {loading ? (
            <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" /></div>
          ) : orders.length === 0 ? (
            <p className="text-center text-gray-400 py-8">Aucune commande</p>
          ) : (
            <div className="border rounded-lg divide-y">
              {orders.map(order => (
                <div key={order.id} onClick={() => { onClose(); navigate(`/admin/orders?selected=${order.id}`); }} className="flex items-center justify-between p-3 text-sm cursor-pointer hover:bg-gray-50 transition-colors">
                  <div>
                    <p className="font-medium text-wine-700 inline-flex items-center gap-1">{order.ref || `#${order.id}`} <ExternalLink size={10} /></p>
                    <p className="text-xs text-gray-500">{formatDate(order.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatEur(order.total_ttc)}</p>
                    <p className="text-xs text-gray-400">{order.total_items ?? 0} article(s)</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Contact Form Modal ─────────────────────────────
function ContactFormModal({ contact, onClose, onSaved }) {
  const isEdit = !!contact;
  const contactNotes = typeof contact?.notes === 'string' ? JSON.parse(contact.notes || '{}') : (contact?.notes || {});
  const [form, setForm] = useState(isEdit ? {
    name: contact.name || '',
    email: contact.email || '',
    phone: contact.phone || '',
    address: contact.address || '',
    source: contact.source || '',
    type: contact.type || 'particulier',
    notes: contactNotes,
  } : { ...EMPTY_FORM, notes: {} });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  const handleNotesChange = (key, value) => setForm(f => ({ ...f, notes: { ...f.notes, [key]: value } }));

  const handleTypeChange = (e) => {
    const newType = e.target.value;
    setForm(f => ({ ...f, type: newType, notes: {} }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Le nom est obligatoire.'); return; }
    setSaving(true); setError('');
    try {
      if (isEdit) await contactsAPI.update(contact.id, form);
      else await contactsAPI.create(form);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de la sauvegarde.');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-bold">{isEdit ? 'Modifier le contact' : 'Nouveau contact'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>}

          {/* Type FIRST */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Type *</label>
            <select name="type" value={form.type} onChange={handleTypeChange} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-wine-700 outline-none">
              {CONTACT_TYPES.map(t => <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nom *</label>
            <input type="text" name="name" value={form.name} onChange={handleChange} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-wine-700 outline-none" placeholder="Nom complet" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
              <input type="email" name="email" value={form.email} onChange={handleChange} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-wine-700 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Téléphone</label>
              <input type="tel" name="phone" value={form.phone} onChange={handleChange} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-wine-700 outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Adresse</label>
            <input type="text" name="address" value={form.address} onChange={handleChange} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-wine-700 outline-none" />
          </div>

          {/* Conditional fields based on type */}
          {form.type === 'etudiant' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">École</label>
              <select value={form.notes.school || ''} onChange={e => handleNotesChange('school', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-wine-700 outline-none">
                <option value="">Sélectionner une école...</option>
                {SCHOOLS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          )}

          {form.type === 'cse' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Entreprise</label>
              <select value={form.notes.company || ''} onChange={e => handleNotesChange('company', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-wine-700 outline-none">
                <option value="">Sélectionner une entreprise...</option>
                {COMPANIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          )}

          {form.type === 'ambassadeur' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Réseau</label>
              <input type="text" value={form.notes.network || ''} onChange={e => handleNotesChange('network', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-wine-700 outline-none" placeholder="Ex: Réseau Ambassadeurs Loire" />
            </div>
          )}

          {form.type === 'professionnel' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Entreprise</label>
                <input type="text" value={form.notes.company || ''} onChange={e => handleNotesChange('company', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-wine-700 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">SIRET</label>
                <input type="text" value={form.notes.siret || ''} onChange={e => handleNotesChange('siret', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-wine-700 outline-none" placeholder="000 000 000 00000" />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
            <input type="text" name="source" value={form.source} onChange={handleChange} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-wine-700 outline-none" placeholder="Ex: salon, parrainage..." />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuler</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-wine-700 rounded-lg hover:bg-wine-800 disabled:opacity-50">
              {saving ? 'Enregistrement...' : isEdit ? 'Mettre à jour' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main CRM Component ─────────────────────────────
export default function AdminCRM() {
  const [contacts, setContacts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ type: '', source: '', page: 1 });
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editContact, setEditContact] = useState(null);
  const [selectedContact, setSelectedContact] = useState(null);
  const debounceRef = useRef(null);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: filters.page, limit: 20 };
      if (filters.type) params.type = filters.type;
      if (filters.source) params.source = filters.source;
      const res = await contactsAPI.list(params);
      setContacts(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { if (!isSearching) fetchContacts(); }, [fetchContacts, isSearching]);

  const handleSearchChange = (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setIsSearching(false); return; }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true); setLoading(true);
      try {
        const res = await contactsAPI.search(q);
        setContacts(res.data.data || res.data);
        setPagination({ page: 1, pages: 1, total: (res.data.data || res.data).length });
      } catch (err) { console.error(err); } finally { setLoading(false); }
    }, 300);
  };

  const clearSearch = () => { setSearchQuery(''); setIsSearching(false); if (debounceRef.current) clearTimeout(debounceRef.current); };
  const openCreate = () => { setEditContact(null); setShowForm(true); };
  const openEdit = (contact, e) => { e.stopPropagation(); setEditContact(contact); setShowForm(true); };
  const handleFormSaved = () => {
    setShowForm(false); setEditContact(null);
    if (isSearching && searchQuery.trim()) {
      setLoading(true);
      contactsAPI.search(searchQuery).then(res => { setContacts(res.data.data || res.data); setPagination({ page: 1, pages: 1, total: (res.data.data || res.data).length }); }).catch(console.error).finally(() => setLoading(false));
    } else fetchContacts();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">CRM Contacts</h1>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-wine-700 rounded-lg hover:bg-wine-800"><Plus size={16} /> Nouveau contact</button>
      </div>

      <div className="card">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Recherche</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={searchQuery} onChange={handleSearchChange} placeholder="Nom, email, téléphone..." className="w-full border rounded-lg pl-9 pr-8 py-2 text-sm focus:ring-2 focus:ring-wine-700 outline-none" />
              {searchQuery && <button onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={16} /></button>}
            </div>
          </div>
          <div className="min-w-[150px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
            <select value={filters.type} onChange={e => { clearSearch(); setFilters(f => ({ ...f, type: e.target.value, page: 1 })); }} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Tous</option>
              {CONTACT_TYPES.map(t => <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>)}
            </select>
          </div>
          <div className="min-w-[150px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
            <input type="text" value={filters.source} onChange={e => { clearSearch(); setFilters(f => ({ ...f, source: e.target.value, page: 1 })); }} placeholder="Filtrer par source" className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <button onClick={() => { clearSearch(); setFilters({ type: '', source: '', page: 1 }); }} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">Effacer</button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Users size={16} />
        <span>{pagination.total} contact(s)</span>
        {isSearching && searchQuery && <span className="text-wine-700 font-medium ml-2">Recherche : &laquo; {searchQuery} &raquo;</span>}
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" /></div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-12 text-gray-400"><Users size={40} className="mx-auto mb-3" /><p>Aucun contact trouvé</p></div>
        ) : (
          <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {contacts.map(c => {
              const badge = TYPE_CONFIG[c.type] || TYPE_CONFIG.particulier;
              const BadgeIcon = badge.icon;
              return (
                <div key={c.id} onClick={() => setSelectedContact(c)} className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm text-gray-900">{c.name}</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}><BadgeIcon size={12} /> {badge.label}</span>
                  </div>
                  <div className="text-xs text-gray-500 space-y-0.5">
                    {c.email && <p>{c.email}</p>}
                    {c.phone && <p>{c.phone}</p>}
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">{formatEur(c.total_ca ?? 0)}</span>
                    <span className="text-gray-500 text-xs">{c.orders_count ?? 0} cmd</span>
                  </div>
                  <div className="flex items-center justify-between" onClick={e => e.stopPropagation()}>
                    <span className="text-xs text-gray-400">{c.last_order_at ? formatDate(c.last_order_at) : '—'}</span>
                    <button onClick={e => openEdit(c, e)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"><Pencil size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Desktop table */}
          <table className="hidden md:table w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-3 font-medium">Nom</th>
                <th className="pb-3 font-medium">Email</th>
                <th className="pb-3 font-medium">Téléphone</th>
                <th className="pb-3 font-medium text-center">Commandes</th>
                <th className="pb-3 font-medium text-right">CA Total</th>
                <th className="pb-3 font-medium">Dernière cmd</th>
                <th className="pb-3 font-medium">Type</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {contacts.map(c => {
                const badge = TYPE_CONFIG[c.type] || TYPE_CONFIG.particulier;
                const BadgeIcon = badge.icon;
                return (
                  <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedContact(c)}>
                    <td className="py-3"><span className="font-medium text-gray-900">{c.name}</span></td>
                    <td className="py-3 text-gray-500">{c.email || '—'}</td>
                    <td className="py-3 text-gray-500">{c.phone || '—'}</td>
                    <td className="py-3 text-center">{c.orders_count ?? 0}</td>
                    <td className="py-3 text-right font-semibold">{formatEur(c.total_ca ?? 0)}</td>
                    <td className="py-3 text-gray-500 text-xs">{c.last_order_at ? formatDate(c.last_order_at) : '—'}</td>
                    <td className="py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${badge.color}`}>
                        <BadgeIcon size={12} /> {badge.label}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <button onClick={e => openEdit(c, e)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Modifier"><Pencil size={16} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </>
        )}
      </div>

      {!isSearching && pagination.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Page {pagination.page} sur {pagination.pages}</p>
          <div className="flex gap-2">
            <button onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))} disabled={pagination.page <= 1} className="p-2 rounded-lg border hover:bg-gray-50 disabled:opacity-30"><ChevronLeft size={16} /></button>
            <button onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))} disabled={pagination.page >= pagination.pages} className="p-2 rounded-lg border hover:bg-gray-50 disabled:opacity-30"><ChevronRight size={16} /></button>
          </div>
        </div>
      )}

      {showForm && <ContactFormModal contact={editContact} onClose={() => { setShowForm(false); setEditContact(null); }} onSaved={handleFormSaved} />}
      {selectedContact && <ContactPanel contact={selectedContact} onClose={() => setSelectedContact(null)} />}
    </div>
  );
}
