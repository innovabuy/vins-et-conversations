import { useState, useEffect, useCallback, useRef } from 'react';
import { contactsAPI } from '../../services/api';
import {
  Users, Plus, Search, Pencil, X, Phone, Mail, MapPin,
  ChevronLeft, ChevronRight
} from 'lucide-react';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);
const formatDate = (d) => new Date(d).toLocaleDateString('fr-FR');

const TYPE_BADGES = {
  Particulier:    { label: 'Particulier',    color: 'bg-blue-100 text-blue-800' },
  CSE:            { label: 'CSE',            color: 'bg-green-100 text-green-800' },
  Ambassadeur:    { label: 'Ambassadeur',    color: 'bg-purple-100 text-purple-800' },
  Professionnel:  { label: 'Professionnel',  color: 'bg-orange-100 text-orange-800' },
};

const CONTACT_TYPES = ['Particulier', 'CSE', 'Ambassadeur', 'Professionnel'];

const EMPTY_FORM = { name: '', email: '', phone: '', address: '', source: '', type: 'Particulier' };

// ─── Order History Panel ────────────────────────────────
function OrderHistoryPanel({ contact, onClose }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    contactsAPI.history(contact.id)
      .then((res) => setOrders(res.data.data || res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [contact.id]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{contact.name}</h2>
            <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
              {contact.email && (
                <span className="flex items-center gap-1"><Mail size={14} /> {contact.email}</span>
              )}
              {contact.phone && (
                <span className="flex items-center gap-1"><Phone size={14} /> {contact.phone}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {contact.address && (
            <div className="flex items-start gap-2 text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
              <MapPin size={16} className="mt-0.5 shrink-0" />
              <span>{contact.address}</span>
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

          <h3 className="font-semibold text-sm pt-2">Historique des commandes</h3>

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" />
            </div>
          ) : orders.length === 0 ? (
            <p className="text-center text-gray-400 py-8">Aucune commande</p>
          ) : (
            <div className="border rounded-lg divide-y">
              {orders.map((order) => (
                <div key={order.id} className="flex items-center justify-between p-3 text-sm">
                  <div>
                    <p className="font-medium">{order.ref || `#${order.id}`}</p>
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

// ─── Contact Form Modal ─────────────────────────────────
function ContactFormModal({ contact, onClose, onSaved }) {
  const isEdit = !!contact;
  const [form, setForm] = useState(isEdit ? {
    name: contact.name || '',
    email: contact.email || '',
    phone: contact.phone || '',
    address: contact.address || '',
    source: contact.source || '',
    type: contact.type || 'Particulier',
  } : { ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Le nom est obligatoire.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await contactsAPI.update(contact.id, form);
      } else {
        await contactsAPI.create(form);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900">
            {isEdit ? 'Modifier le contact' : 'Nouveau contact'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nom *</label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-wine-700 focus:border-wine-700 outline-none"
              placeholder="Nom complet"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-wine-700 focus:border-wine-700 outline-none"
                placeholder="email@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Téléphone</label>
              <input
                type="tel"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-wine-700 focus:border-wine-700 outline-none"
                placeholder="06 12 34 56 78"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Adresse</label>
            <input
              type="text"
              name="address"
              value={form.address}
              onChange={handleChange}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-wine-700 focus:border-wine-700 outline-none"
              placeholder="Adresse postale"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
              <input
                type="text"
                name="source"
                value={form.source}
                onChange={handleChange}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-wine-700 focus:border-wine-700 outline-none"
                placeholder="Ex: salon, parrainage..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
              <select
                name="type"
                value={form.type}
                onChange={handleChange}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-wine-700 focus:border-wine-700 outline-none"
              >
                {CONTACT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-wine-700 rounded-lg hover:bg-wine-800 disabled:opacity-50"
            >
              {saving ? 'Enregistrement...' : isEdit ? 'Mettre à jour' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main CRM Component ─────────────────────────────────
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

  // ── Fetch contacts (list or search) ──
  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: filters.page, limit: 20 };
      if (filters.type) params.type = filters.type;
      if (filters.source) params.source = filters.source;
      const res = await contactsAPI.list(params);
      setContacts(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    if (!isSearching) {
      fetchContacts();
    }
  }, [fetchContacts, isSearching]);

  // ── Debounced search ──
  const handleSearchChange = (e) => {
    const q = e.target.value;
    setSearchQuery(q);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!q.trim()) {
      setIsSearching(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      setLoading(true);
      try {
        const res = await contactsAPI.search(q);
        setContacts(res.data.data || res.data);
        setPagination({ page: 1, pages: 1, total: (res.data.data || res.data).length });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setIsSearching(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
  };

  // ── Form handlers ──
  const openCreate = () => {
    setEditContact(null);
    setShowForm(true);
  };

  const openEdit = (contact, e) => {
    e.stopPropagation();
    setEditContact(contact);
    setShowForm(true);
  };

  const handleFormSaved = () => {
    setShowForm(false);
    setEditContact(null);
    if (isSearching && searchQuery.trim()) {
      // Re-run the search
      setLoading(true);
      contactsAPI.search(searchQuery)
        .then((res) => {
          setContacts(res.data.data || res.data);
          setPagination({ page: 1, pages: 1, total: (res.data.data || res.data).length });
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      fetchContacts();
    }
  };

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">CRM Contacts</h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-wine-700 rounded-lg hover:bg-wine-800 transition-colors"
        >
          <Plus size={16} />
          Nouveau contact
        </button>
      </div>

      {/* Search + Filters */}
      <div className="card">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Recherche</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder="Nom, email, téléphone..."
                className="w-full border rounded-lg pl-9 pr-8 py-2 text-sm focus:ring-2 focus:ring-wine-700 focus:border-wine-700 outline-none"
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
          <div className="min-w-[150px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
            <select
              value={filters.type}
              onChange={(e) => {
                clearSearch();
                setFilters((f) => ({ ...f, type: e.target.value, page: 1 }));
              }}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Tous</option>
              {CONTACT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[150px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
            <input
              type="text"
              value={filters.source}
              onChange={(e) => {
                clearSearch();
                setFilters((f) => ({ ...f, source: e.target.value, page: 1 }));
              }}
              placeholder="Filtrer par source"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={() => {
              clearSearch();
              setFilters({ type: '', source: '', page: 1 });
            }}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2"
          >
            Effacer
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Users size={16} />
        <span>{pagination.total} contact(s)</span>
        {isSearching && searchQuery && (
          <span className="text-wine-700 font-medium ml-2">
            Recherche : &laquo; {searchQuery} &raquo;
          </span>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Users size={40} className="mx-auto mb-3" />
            <p>Aucun contact trouvé</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-3 font-medium">Nom</th>
                <th className="pb-3 font-medium">Email</th>
                <th className="pb-3 font-medium">Téléphone</th>
                <th className="pb-3 font-medium text-center">Commandes</th>
                <th className="pb-3 font-medium text-right">CA Total</th>
                <th className="pb-3 font-medium">Dernière cmd</th>
                <th className="pb-3 font-medium">Source</th>
                <th className="pb-3 font-medium">Type</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {contacts.map((c) => {
                const badge = TYPE_BADGES[c.type] || { label: c.type, color: 'bg-gray-100 text-gray-700' };
                return (
                  <tr
                    key={c.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedContact(c)}
                  >
                    <td className="py-3">
                      <span className="font-medium text-gray-900">{c.name}</span>
                    </td>
                    <td className="py-3 text-gray-500">{c.email || '—'}</td>
                    <td className="py-3 text-gray-500">{c.phone || '—'}</td>
                    <td className="py-3 text-center">{c.orders_count ?? 0}</td>
                    <td className="py-3 text-right font-semibold">{formatEur(c.total_ca ?? 0)}</td>
                    <td className="py-3 text-gray-500 text-xs">
                      {c.last_order_at ? formatDate(c.last_order_at) : '—'}
                    </td>
                    <td className="py-3 text-gray-500 text-xs">{c.source || '—'}</td>
                    <td className="py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.color}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={(e) => openEdit(c, e)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                        title="Modifier"
                      >
                        <Pencil size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!isSearching && pagination.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {pagination.page} sur {pagination.pages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
              disabled={pagination.page <= 1}
              className="p-2 rounded-lg border hover:bg-gray-50 disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
              disabled={pagination.page >= pagination.pages}
              className="p-2 rounded-lg border hover:bg-gray-50 disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Contact Form Modal */}
      {showForm && (
        <ContactFormModal
          contact={editContact}
          onClose={() => { setShowForm(false); setEditContact(null); }}
          onSaved={handleFormSaved}
        />
      )}

      {/* Order History Side Panel */}
      {selectedContact && (
        <OrderHistoryPanel
          contact={selectedContact}
          onClose={() => setSelectedContact(null)}
        />
      )}
    </div>
  );
}
