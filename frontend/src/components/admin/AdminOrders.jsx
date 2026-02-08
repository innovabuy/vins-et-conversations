import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ordersAPI, campaignsAPI, contactsAPI, productsAPI, deliveryNotesAPI } from '../../services/api';
import {
  ShoppingCart, Search, Plus, Check, Eye, EyeOff, FileText, Printer, Mail,
  ChevronLeft, ChevronRight, X, Trash2, Save, Truck, ExternalLink, AlertTriangle
} from 'lucide-react';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);
const formatDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const STATUS_LABELS = {
  pending_payment: { label: 'Paiement en cours', color: 'bg-orange-100 text-orange-800' },
  draft: { label: 'Brouillon', color: 'bg-gray-100 text-gray-700' },
  submitted: { label: 'En attente', color: 'bg-yellow-100 text-yellow-800' },
  validated: { label: 'Validée', color: 'bg-green-100 text-green-800' },
  preparing: { label: 'En préparation', color: 'bg-blue-100 text-blue-800' },
  shipped: { label: 'Expédiée', color: 'bg-purple-100 text-purple-800' },
  delivered: { label: 'Livrée', color: 'bg-gray-100 text-gray-800' },
  cancelled: { label: 'Annulée', color: 'bg-red-100 text-red-800' },
};

const SOURCE_LABELS = {
  campaign: { label: 'Campagne', color: 'bg-blue-50 text-blue-700' },
  boutique_web: { label: 'Boutique Web', color: 'bg-purple-50 text-purple-700' },
  ambassador_referral: { label: 'Ambassadeur', color: 'bg-green-50 text-green-700' },
  phone: { label: 'Téléphone', color: 'bg-gray-50 text-gray-700' },
  email: { label: 'Email', color: 'bg-sky-50 text-sky-700' },
};

// ─── New Order Form ──────────────────────────────────
function NewOrderForm({ onClose, onCreated }) {
  const [campaigns, setCampaigns] = useState([]);
  const [products, setProducts] = useState([]);
  const [contactSearch, setContactSearch] = useState('');
  const [contacts, setContacts] = useState([]);
  const [form, setForm] = useState({ campaign_id: '', customer_id: null, items: [], notes: '' });
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    campaignsAPI.list().then(res => setCampaigns(res.data.data || [])).catch(console.error);
    productsAPI.list().then(res => setProducts(res.data.data || res.data || [])).catch(console.error);
  }, []);

  const searchContacts = (q) => {
    setContactSearch(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim() || q.length < 2) { setContacts([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await contactsAPI.search(q);
        setContacts(res.data.data || []);
      } catch (e) { console.error(e); }
    }, 300);
  };

  const addItem = (product) => {
    setForm(f => {
      const existing = f.items.find(i => i.productId === product.id);
      if (existing) return { ...f, items: f.items.map(i => i.productId === product.id ? { ...i, qty: i.qty + 1 } : i) };
      return { ...f, items: [...f.items, { productId: product.id, name: product.name, price_ttc: product.price_ttc, qty: 1 }] };
    });
  };

  const updateQty = (productId, qty) => {
    if (qty < 1) return removeItem(productId);
    setForm(f => ({ ...f, items: f.items.map(i => i.productId === productId ? { ...i, qty } : i) }));
  };

  const removeItem = (productId) => {
    setForm(f => ({ ...f, items: f.items.filter(i => i.productId !== productId) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.campaign_id || form.items.length === 0) { alert('Sélectionnez une campagne et au moins un produit'); return; }
    setSaving(true);
    try {
      await ordersAPI.adminCreate({
        campaign_id: form.campaign_id,
        customer_id: form.customer_id,
        items: form.items.map(i => ({ productId: i.productId, qty: i.qty })),
        notes: form.notes,
      });
      onCreated();
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur lors de la création');
    } finally {
      setSaving(false);
    }
  };

  const total = form.items.reduce((s, i) => s + parseFloat(i.price_ttc || 0) * i.qty, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto sm:mx-4">
        <div className="flex items-center justify-between border-b px-4 sm:px-6 py-4">
          <h2 className="text-lg font-bold">Nouvelle commande</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Campagne *</label>
              <select value={form.campaign_id} onChange={e => setForm(f => ({ ...f, campaign_id: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" required>
                <option value="">Sélectionner...</option>
                {campaigns.filter(c => c.status === 'active').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Client (contact CRM)</label>
              <div className="relative">
                <input type="text" value={contactSearch} onChange={e => searchContacts(e.target.value)} placeholder="Rechercher un contact..." className="w-full border rounded-lg px-3 py-2 text-sm" />
                {contacts.length > 0 && (
                  <div className="absolute z-10 w-full bg-white border rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                    {contacts.map(c => (
                      <button key={c.id} type="button" onClick={() => { setForm(f => ({ ...f, customer_id: c.id })); setContactSearch(c.name); setContacts([]); }} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-gray-400">{c.email || c.phone || ''}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Produits</label>
            <div className="border rounded-lg p-3 max-h-40 overflow-y-auto space-y-1">
              {products.map(p => (
                <button key={p.id} type="button" onClick={() => addItem(p)} className="w-full text-left flex items-center justify-between px-2 py-1 hover:bg-gray-50 rounded text-sm">
                  <span>{p.name}</span>
                  <span className="text-xs text-gray-500">{formatEur(p.price_ttc)}</span>
                </button>
              ))}
            </div>
          </div>

          {form.items.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Articles sélectionnés</label>
              <div className="border rounded-lg divide-y">
                {form.items.map(item => (
                  <div key={item.productId} className="flex items-center justify-between p-2 text-sm">
                    <span className="font-medium flex-1">{item.name}</span>
                    <div className="flex items-center gap-2">
                      <input type="number" min="1" value={item.qty} onChange={e => updateQty(item.productId, parseInt(e.target.value) || 1)} className="w-16 border rounded px-2 py-1 text-sm text-center" />
                      <span className="text-gray-500 w-20 text-right">{formatEur(parseFloat(item.price_ttc) * item.qty)}</span>
                      <button type="button" onClick={() => removeItem(item.productId)} className="p-1 text-red-400 hover:text-red-600"><X size={14} /></button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-end p-2 font-semibold text-sm">Total : {formatEur(total)}</div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Annuler</button>
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
              <Save size={16} />{saving ? 'Création...' : 'Créer la commande'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Order Detail ─────────────────────────────────────
function OrderDetail({ orderId, onClose, onUpdated }) {
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creatingBL, setCreatingBL] = useState(false);

  useEffect(() => {
    ordersAPI.get(orderId)
      .then((res) => setOrder(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [orderId]);

  const handleCreateBL = async () => {
    setCreatingBL(true);
    try {
      await deliveryNotesAPI.create({
        order_id: orderId,
        recipient_name: order.user_name || '',
      });
      alert('Bon de livraison créé !');
      navigate('/admin/delivery');
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur lors de la création du BL');
    } finally {
      setCreatingBL(false);
    }
  };

  const handleValidate = async () => {
    if (!confirm('Valider cette commande ?')) return;
    try { await ordersAPI.validate(orderId); onUpdated(); } catch (err) { alert(err.response?.data?.message || 'Erreur'); }
  };

  const handleCancel = async () => {
    if (!confirm('Annuler cette commande ? Cette action créera un événement financier de correction.')) return;
    try { await ordersAPI.cancel(orderId); onUpdated(); } catch (err) { alert(err.response?.data?.message || 'Erreur'); }
  };

  const handlePrint = () => {
    const token = localStorage.getItem('accessToken');
    const url = ordersAPI.pdf(orderId);
    window.open(`${url}?token=${token}`, '_blank');
  };

  const handleEmail = async () => {
    if (!confirm('Préparer l\'envoi de cette commande par email ?')) return;
    try {
      const res = await ordersAPI.sendEmail(orderId);
      alert(`Email préparé pour ${res.data.to}`);
    } catch (err) { alert(err.response?.data?.message || 'Erreur'); }
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" /></div>;
  if (!order) return <p className="text-center text-gray-500 py-8">Commande introuvable</p>;

  const status = STATUS_LABELS[order.status] || { label: order.status, color: 'bg-gray-100 text-gray-700' };
  const canEdit = ['draft', 'submitted'].includes(order.status);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Commande {order.ref}</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <div><span className="text-gray-500">Client :</span> <button onClick={() => navigate('/admin/crm')} className="text-wine-700 hover:underline font-medium">{order.user_name}</button></div>
        <div><span className="text-gray-500">Statut :</span> <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>{status.label}</span></div>
        <div><span className="text-gray-500">Date :</span> {formatDate(order.created_at)}</div>
        <div><span className="text-gray-500">Total TTC :</span> <span className="font-semibold">{formatEur(order.total_ttc)}</span></div>
        <div><span className="text-gray-500">Total HT :</span> {formatEur(order.total_ht)}</div>
        <div><span className="text-gray-500">Articles :</span> {order.total_items}</div>
        {order.campaign_id && <div><span className="text-gray-500">Campagne :</span> <Link to={`/admin/campaigns/${order.campaign_id}`} className="text-wine-700 hover:underline font-medium inline-flex items-center gap-1">{order.campaign_name || 'Voir'} <ExternalLink size={12} /></Link></div>}
      </div>
      {order.notes && <div className="text-sm"><span className="text-gray-500">Notes :</span> {order.notes}</div>}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {order.status === 'submitted' && (
          <button onClick={handleValidate} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700">
            <Check size={14} /> Valider
          </button>
        )}
        {order.status === 'validated' && (
          <button onClick={handleCreateBL} disabled={creatingBL} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50">
            <Truck size={14} /> {creatingBL ? 'Création...' : 'Générer BL'}
          </button>
        )}
        {canEdit && (
          <button onClick={handleCancel} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700">
            <Trash2 size={14} /> Annuler
          </button>
        )}
        <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">
          <Printer size={14} /> Imprimer PDF
        </button>
        <button onClick={handleEmail} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">
          <Mail size={14} /> Envoyer par email
        </button>
      </div>

      <h3 className="font-semibold text-sm mt-4">Lignes de commande</h3>
      <div className="border rounded-lg divide-y">
        {order.order_items?.map((item) => (
          <div key={item.id} className="flex items-center justify-between p-3 text-sm">
            <div>
              <p className="font-medium">{item.product_name}</p>
              <p className="text-xs text-gray-500">{formatEur(item.unit_price_ttc)} x {item.qty}</p>
            </div>
            <span className="font-semibold">{formatEur(item.unit_price_ttc * item.qty)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────
export default function AdminOrders() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    campaign_id: searchParams.get('campaign_id') || '',
    status: searchParams.get('status') || '',
    user_id: searchParams.get('user_id') || '',
    source: searchParams.get('source') || '',
    page: 1,
  });
  const [hideDelivered, setHideDelivered] = useState(false);
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(searchParams.get('selected') || null);
  const [showNewForm, setShowNewForm] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.campaign_id) params.campaign_id = filters.campaign_id;
      if (filters.status) params.status = filters.status;
      if (filters.user_id) params.user_id = filters.user_id;
      if (filters.source) params.source = filters.source;
      params.page = filters.page;
      params.limit = 20;
      const { data } = await ordersAPI.list(params);
      setOrders(data.data);
      setPagination(data.pagination);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  useEffect(() => { campaignsAPI.list().then(res => setCampaigns(res.data.data || [])).catch(console.error); }, []);

  const handleValidate = async (id) => {
    if (!confirm('Valider cette commande ?')) return;
    try { await ordersAPI.validate(id); fetchOrders(); } catch (err) { alert(err.response?.data?.message || 'Erreur'); }
  };

  const handleCreated = () => { setShowNewForm(false); fetchOrders(); };

  const hasFlagged = (o) => o.flags && Array.isArray(o.flags) && o.flags.length > 0;
  let displayOrders = hideDelivered ? orders.filter(o => o.status !== 'delivered') : orders;
  if (showFlaggedOnly) displayOrders = displayOrders.filter(hasFlagged);

  if (selectedOrder) {
    return (
      <div className="card">
        <OrderDetail orderId={selectedOrder} onClose={() => setSelectedOrder(null)} onUpdated={() => { setSelectedOrder(null); fetchOrders(); }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Commandes</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{pagination.total} commande(s)</span>
          <button onClick={() => setShowNewForm(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Nouvelle commande
          </button>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Campagne</label>
            <select value={filters.campaign_id} onChange={e => setFilters(f => ({ ...f, campaign_id: e.target.value, page: 1 }))} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Toutes</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="min-w-[150px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Statut</label>
            <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value, page: 1 }))} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Tous</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div className="min-w-[150px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
            <select value={filters.source} onChange={e => setFilters(f => ({ ...f, source: e.target.value, page: 1 }))} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Toutes</option>
              {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <button onClick={() => setHideDelivered(h => !h)} className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border ${hideDelivered ? 'bg-wine-50 border-wine-200 text-wine-700' : 'border-gray-200 text-gray-500'}`} title={hideDelivered ? 'Afficher les livrées' : 'Masquer les livrées'}>
            {hideDelivered ? <EyeOff size={14} /> : <Eye size={14} />}
            {hideDelivered ? 'Livrées masquées' : 'Masquer livrées'}
          </button>
          <button onClick={() => setShowFlaggedOnly(f => !f)} className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border ${showFlaggedOnly ? 'bg-orange-50 border-orange-200 text-orange-700' : 'border-gray-200 text-gray-500'}`} title="Commandes à vérifier">
            <AlertTriangle size={14} />
            À vérifier
          </button>
          <button onClick={() => { setFilters({ campaign_id: '', status: '', user_id: '', source: '', page: 1 }); setShowFlaggedOnly(false); }} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">Effacer</button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" /></div>
        ) : displayOrders.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <ShoppingCart size={40} className="mx-auto mb-3" />
            <p>Aucune commande trouvée</p>
          </div>
        ) : (
          <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {displayOrders.map(o => {
              const status = STATUS_LABELS[o.status] || { label: o.status, color: 'bg-gray-100 text-gray-700' };
              return (
                <div key={o.id} onClick={() => setSelectedOrder(o.id)} className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-gray-500">{o.ref}</span>
                    <div className="flex items-center gap-1">
                      {hasFlagged(o) && <span className="text-orange-500" title="À vérifier"><AlertTriangle size={14} /></span>}
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>{status.label}</span>
                    </div>
                  </div>
                  <p className="font-medium text-sm">{o.user_name}</p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">{formatEur(o.total_ttc)}</span>
                    <span className="text-gray-500 text-xs">{o.total_items} art. · {formatDate(o.created_at)}</span>
                  </div>
                  {o.status === 'submitted' && (
                    <div className="pt-1" onClick={e => e.stopPropagation()}>
                      <button onClick={() => handleValidate(o.id)} className="text-xs px-3 py-1 rounded-lg bg-green-600 text-white hover:bg-green-700">Valider</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {/* Desktop table */}
          <table className="hidden md:table w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-3 font-medium">Ref</th>
                <th className="pb-3 font-medium">Client</th>
                <th className="pb-3 font-medium">Montant</th>
                <th className="pb-3 font-medium">Date</th>
                <th className="pb-3 font-medium">Articles</th>
                <th className="pb-3 font-medium">Source</th>
                <th className="pb-3 font-medium">Statut</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayOrders.map(o => {
                const status = STATUS_LABELS[o.status] || { label: o.status, color: 'bg-gray-100 text-gray-700' };
                return (
                  <tr key={o.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedOrder(o.id)}>
                    <td className="py-3 font-mono text-xs">{o.ref}</td>
                    <td className="py-3">
                      <p className="font-medium">{o.user_name}</p>
                      <p className="text-xs text-gray-400">{o.user_email}</p>
                    </td>
                    <td className="py-3 font-semibold">{formatEur(o.total_ttc)}</td>
                    <td className="py-3 text-gray-500 text-xs">{formatDate(o.created_at)}</td>
                    <td className="py-3">{o.total_items}</td>
                    <td className="py-3">
                      {(() => { const src = SOURCE_LABELS[o.source] || SOURCE_LABELS.campaign; return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${src.color}`}>{src.label}</span>; })()}
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>{status.label}</span>
                      {hasFlagged(o) && <span className="ml-1 text-orange-500" title="À vérifier"><AlertTriangle size={14} className="inline" /></span>}
                    </td>
                    <td className="py-3 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setSelectedOrder(o.id)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Voir détail"><Eye size={16} /></button>
                        {o.status === 'submitted' && (
                          <button onClick={() => handleValidate(o.id)} className="p-1.5 rounded-lg hover:bg-green-50 text-green-600" title="Valider"><Check size={16} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </>
        )}
      </div>

      {pagination.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Page {pagination.page} sur {pagination.pages}</p>
          <div className="flex gap-2">
            <button onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))} disabled={pagination.page <= 1} className="p-2 rounded-lg border hover:bg-gray-50 disabled:opacity-30"><ChevronLeft size={16} /></button>
            <button onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))} disabled={pagination.page >= pagination.pages} className="p-2 rounded-lg border hover:bg-gray-50 disabled:opacity-30"><ChevronRight size={16} /></button>
          </div>
        </div>
      )}

      {showNewForm && <NewOrderForm onClose={() => setShowNewForm(false)} onCreated={handleCreated} />}
    </div>
  );
}
