import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ordersAPI, campaignsAPI, contactsAPI, productsAPI, deliveryNotesAPI, usersAPI, promoCodesAPI } from '../../services/api';
import {
  ShoppingCart, Search, Plus, Check, Eye, EyeOff, FileText, Printer, Mail, CreditCard,
  ChevronLeft, ChevronRight, X, Trash2, Save, Truck, ExternalLink, AlertTriangle, UserPlus
} from 'lucide-react';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);
const formatDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const STATUS_LABELS = {
  pending: { label: 'En attente caution', color: 'bg-amber-100 text-amber-800' },
  pending_payment: { label: 'Paiement en cours', color: 'bg-orange-100 text-orange-800' },
  pending_stock: { label: 'Stock insuffisant', color: 'bg-orange-100 text-orange-800' },
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
  student_order: { label: 'Commande étudiant', color: 'bg-sky-50 text-sky-700' },
  ambassador_order: { label: 'Commande ambassadeur', color: 'bg-green-50 text-green-700' },
  cse_order: { label: 'Commande CSE', color: 'bg-teal-50 text-teal-700' },
  student_referral: { label: 'Parrainage étudiant', color: 'bg-amber-50 text-amber-700' },
  ambassador_referral: { label: 'Parrainage ambassadeur', color: 'bg-green-50 text-green-700' },
  phone: { label: 'Téléphone', color: 'bg-gray-50 text-gray-700' },
  email: { label: 'Email', color: 'bg-sky-50 text-sky-700' },
};

// ─── New Order Form ──────────────────────────────────
function NewOrderForm({ onClose, onCreated }) {
  const [campaigns, setCampaigns] = useState([]);
  const [products, setProducts] = useState([]);
  const [contactSearch, setContactSearch] = useState('');
  const [contacts, setContacts] = useState([]);
  const [form, setForm] = useState({ campaign_id: '', customer_id: null, target_user_id: null, items: [], notes: '' });
  const [saving, setSaving] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const userDebounceRef = useRef(null);
  const [promoInput, setPromoInput] = useState('');
  const [promoResult, setPromoResult] = useState(null);
  const [promoError, setPromoError] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const debounceRef = useRef(null);

  const API_ERROR_MESSAGES = {
    INVALID_PRODUCTS: "Produit(s) non disponible(s) dans cette campagne",
    INVALID_CAMPAIGN: "Campagne introuvable ou inactive",
    MISSING_FIELDS: "Veuillez remplir tous les champs obligatoires",
    MAX_UNPAID_ORDERS: "Ce client a trop de commandes impayées en attente",
  };

  const validate = () => {
    const newErrors = {};
    if (!form.campaign_id) newErrors.campaign_id = "Sélectionnez une campagne";
    if (!form.items.length) newErrors.items = "Ajoutez au moins un produit";
    else if (form.items.some(i => !i.qty || i.qty <= 0)) newErrors.items = "La quantité doit être supérieure à 0";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  useEffect(() => {
    campaignsAPI.list().then(res => setCampaigns(res.data.data || [])).catch(console.error);
  }, []);

  useEffect(() => {
    if (!form.campaign_id) { setProducts([]); return; }
    productsAPI.byCampaign(form.campaign_id)
      .then(res => setProducts(res.data.data || res.data || []))
      .catch(() => setProducts([]));
  }, [form.campaign_id]);

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
    setErrors(prev => { const { items, ...rest } = prev; return rest; });
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

  const handleApplyPromo = async () => {
    if (!promoInput.trim()) return;
    setPromoLoading(true);
    setPromoError('');
    setPromoResult(null);
    try {
      const res = await promoCodesAPI.validate({ code: promoInput.trim(), order_total_ttc: total });
      if (res.data.valid) {
        setPromoResult(res.data);
      } else {
        setPromoError(res.data.message || 'Code invalide ou expiré');
      }
    } catch {
      setPromoError('Erreur de validation du code');
    } finally {
      setPromoLoading(false);
    }
  };

  const handleRemovePromo = () => {
    setPromoResult(null);
    setPromoError('');
    setPromoInput('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');
    if (!validate()) return;
    setSaving(true);
    try {
      await ordersAPI.adminCreate({
        campaign_id: form.campaign_id,
        customer_id: form.customer_id,
        target_user_id: form.target_user_id || undefined,
        items: form.items.map(i => ({ productId: i.productId, qty: i.qty })),
        notes: form.notes,
        promo_code: promoResult ? promoInput.trim() : undefined,
      });
      onCreated();
    } catch (err) {
      const code = err.response?.data?.error;
      const status = err.response?.status;
      if (API_ERROR_MESSAGES[code]) {
        setApiError(API_ERROR_MESSAGES[code]);
      } else if (status === 403) {
        setApiError("Vous n'avez pas les droits pour cette action");
      } else if (status >= 500) {
        setApiError("Erreur serveur — réessayez ou contactez le support");
      } else {
        setApiError(err.response?.data?.message || 'Erreur lors de la création');
      }
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
              <select value={form.campaign_id} onChange={e => { setForm(f => ({ ...f, campaign_id: e.target.value, items: [] })); setErrors(prev => { const { campaign_id, ...rest } = prev; return rest; }); setApiError(''); }} onBlur={() => { if (!form.campaign_id) setErrors(prev => ({ ...prev, campaign_id: "Sélectionnez une campagne" })); }} className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.campaign_id ? 'border-red-400' : ''}`} required>
                <option value="">Sélectionner...</option>
                {campaigns.filter(c => c.status === 'active').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {errors.campaign_id && <p className="text-red-500 text-sm mt-1">{errors.campaign_id}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Pour le compte de (optionnel)</label>
              <div className="relative">
                <input type="text" value={userSearch} onChange={(e) => {
                  setUserSearch(e.target.value);
                  if (userDebounceRef.current) clearTimeout(userDebounceRef.current);
                  if (e.target.value.length < 3) { setUserResults([]); return; }
                  userDebounceRef.current = setTimeout(async () => {
                    try {
                      const res = await usersAPI.list({ search: e.target.value, limit: 5 });
                      setUserResults(res.data.data || []);
                    } catch (_) {}
                  }, 300);
                }} placeholder={selectedUser ? `${selectedUser.name} (${selectedUser.email})` : 'Rechercher un utilisateur...'} className="w-full border rounded-lg px-3 py-2 text-sm" />
                {userResults.length > 0 && (
                  <div className="absolute z-10 top-full left-0 right-0 bg-white border rounded-lg mt-1 shadow-lg max-h-32 overflow-y-auto">
                    {userResults.map((u) => (
                      <button key={u.id} type="button" onClick={() => {
                        setForm((f) => ({ ...f, target_user_id: u.id }));
                        setSelectedUser(u);
                        setUserSearch('');
                        setUserResults([]);
                      }} className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50">{u.name} <span className="text-gray-400">({u.email})</span></button>
                    ))}
                  </div>
                )}
                {selectedUser && (
                  <button type="button" onClick={() => { setSelectedUser(null); setForm((f) => ({ ...f, target_user_id: null })); }} className="absolute right-2 top-2 text-gray-400 hover:text-red-500"><X size={14} /></button>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <div className={`border rounded-lg p-3 max-h-40 overflow-y-auto space-y-1 ${errors.items ? 'border-red-400' : ''}`}>
              {products.map(p => (
                <button key={p.id} type="button" onClick={() => addItem(p)} className="w-full text-left flex items-center justify-between px-2 py-1 hover:bg-gray-50 rounded text-sm">
                  <span>{p.name}</span>
                  <span className="text-xs text-gray-500">{formatEur(p.price_ttc)}</span>
                </button>
              ))}
            </div>
            {errors.items && <p className="text-red-500 text-sm mt-1">{errors.items}</p>}
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
                <div className="flex justify-end p-2 font-semibold text-sm">
                  {promoResult ? (
                    <span>Total : <span className="line-through text-gray-400 mr-2">{formatEur(total)}</span>{formatEur(total - promoResult.discount_amount)}</span>
                  ) : (
                    <span>Total : {formatEur(total)}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Code promo (optionnel)</label>
            {promoResult ? (
              <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg text-sm">
                <Check size={16} className="text-green-600 shrink-0" />
                <span className="text-green-800 font-medium">{promoInput.toUpperCase()}</span>
                <span className="text-green-600">-{formatEur(promoResult.discount_amount)}</span>
                <button type="button" onClick={handleRemovePromo} className="ml-auto text-gray-400 hover:text-red-500"><X size={14} /></button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={promoInput}
                  onChange={e => { setPromoInput(e.target.value); setPromoError(''); }}
                  placeholder="Entrez un code promo"
                  className="flex-1 border rounded-lg px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={handleApplyPromo}
                  disabled={promoLoading || !promoInput.trim() || form.items.length === 0}
                  className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50"
                >
                  {promoLoading ? '...' : 'Appliquer'}
                </button>
              </div>
            )}
            {promoError && <p className="text-xs text-red-500 mt-1">{promoError}</p>}
          </div>

          {apiError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertTriangle size={16} className="shrink-0" />
              <span>{apiError}</span>
              <button type="button" onClick={() => setApiError('')} className="ml-auto text-red-400 hover:text-red-600"><X size={14} /></button>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Annuler</button>
            <button type="submit" disabled={saving || Object.keys(errors).length > 0} className="btn-primary flex items-center gap-2">
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
  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const [markPaidMethod, setMarkPaidMethod] = useState('card');
  const [markPaidNotes, setMarkPaidNotes] = useState('');
  const [detailError, setDetailError] = useState('');
  const [detailSuccess, setDetailSuccess] = useState('');

  useEffect(() => {
    ordersAPI.get(orderId)
      .then((res) => setOrder(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [orderId]);

  const handleCreateBL = async () => {
    setCreatingBL(true);
    setDetailError('');
    try {
      await deliveryNotesAPI.create({
        order_id: orderId,
        recipient_name: order.user_name || '',
      });
      navigate('/admin/delivery');
    } catch (err) {
      setDetailError(err.response?.data?.message || 'Erreur lors de la création du BL');
    } finally {
      setCreatingBL(false);
    }
  };

  const handleValidate = async () => {
    if (!confirm('Valider cette commande ?')) return;
    setDetailError('');
    try { await ordersAPI.validate(orderId); onUpdated(); } catch (err) { setDetailError(err.response?.data?.message || 'Erreur'); }
  };

  const handleCancel = async () => {
    if (!confirm('Annuler cette commande ? Cette action créera un événement financier de correction.')) return;
    setDetailError('');
    try { await ordersAPI.cancel(orderId); onUpdated(); } catch (err) { setDetailError(err.response?.data?.message || 'Erreur'); }
  };

  const handlePrint = () => {
    const token = localStorage.getItem('accessToken');
    const url = ordersAPI.pdf(orderId);
    window.open(`${url}?token=${token}`, '_blank');
  };

  const handleEmail = async () => {
    if (!confirm('Préparer l\'envoi de cette commande par email ?')) return;
    setDetailError(''); setDetailSuccess('');
    try {
      const res = await ordersAPI.sendEmail(orderId);
      setDetailSuccess(`Email préparé pour ${res.data.to}`);
    } catch (err) { setDetailError(err.response?.data?.message || 'Erreur'); }
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" /></div>;
  if (!order) return <p className="text-center text-gray-500 py-8">Commande introuvable</p>;

  const status = STATUS_LABELS[order.status] || { label: order.status, color: 'bg-gray-100 text-gray-700' };
  const canEdit = ['draft', 'submitted', 'pending_stock'].includes(order.status);

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
        {order.referrer_name && <div><span className="text-gray-500">Parrain :</span> <span className="font-medium">{order.referrer_name}</span></div>}
      </div>
      {order.notes && <div className="text-sm"><span className="text-gray-500">Notes :</span> {order.notes}</div>}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {(order.status === 'submitted' || order.status === 'pending_stock') && (
          <button onClick={handleValidate} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700">
            <Check size={14} /> {order.status === 'pending_stock' ? 'Marquer disponible' : 'Valider'}
          </button>
        )}
        {order.status === 'pending_payment' && (
          <button onClick={() => setShowMarkPaid(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">
            <CreditCard size={14} /> Marquer comme paye
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

      {detailError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle size={16} className="shrink-0" />
          <span>{detailError}</span>
          <button onClick={() => setDetailError('')} className="ml-auto text-red-400 hover:text-red-600"><X size={14} /></button>
        </div>
      )}
      {detailSuccess && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          <Check size={16} className="shrink-0" />
          <span>{detailSuccess}</span>
          <button onClick={() => setDetailSuccess('')} className="ml-auto text-green-400 hover:text-green-600"><X size={14} /></button>
        </div>
      )}

      {/* Mark-paid modal */}
      {showMarkPaid && (
        <div className="border border-emerald-200 rounded-lg p-4 bg-emerald-50 space-y-3">
          <h4 className="text-sm font-semibold text-emerald-800">Marquer comme paye</h4>
          <div>
            <label className="text-xs text-gray-600">Mode de paiement</label>
            <select value={markPaidMethod} onChange={(e) => setMarkPaidMethod(e.target.value)} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm">
              <option value="card">Carte</option>
              <option value="transfer">Virement</option>
              <option value="check">Cheque</option>
              <option value="cash">Especes</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-600">Notes (optionnel)</label>
            <input value={markPaidNotes} onChange={(e) => setMarkPaidNotes(e.target.value)} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm" placeholder="Reference paiement..." />
          </div>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                try {
                  await ordersAPI.markPaid(orderId, { payment_method: markPaidMethod, notes: markPaidNotes || undefined });
                  setShowMarkPaid(false);
                  onUpdated();
                } catch (e) { setDetailError(e.response?.data?.message || 'Erreur'); }
              }}
              className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
            >Confirmer</button>
            <button onClick={() => setShowMarkPaid(false)} className="px-3 py-1.5 text-sm rounded-lg border hover:bg-gray-50">Annuler</button>
          </div>
        </div>
      )}

      <h3 className="font-semibold text-sm mt-4">Lignes de commande</h3>
      <div className="border rounded-lg divide-y">
        {order.order_items?.map((item) => {
          const DEFERRED_LABELS = { pending: 'En attente', validated: 'Valide', refused: 'Refuse' };
          const DEFERRED_COLORS = { pending: 'bg-amber-100 text-amber-800', validated: 'bg-green-100 text-green-800', refused: 'bg-red-100 text-red-800' };
          return (
            <div key={item.id} className="flex items-center justify-between p-3 text-sm">
              <div>
                <p className="font-medium">{item.product_name}</p>
                <p className="text-xs text-gray-500">{formatEur(item.unit_price_ttc)} x {item.qty}</p>
                {item.is_deferred && (
                  <span className={`mt-1 inline-block px-2 py-0.5 rounded-full text-xs font-medium ${DEFERRED_COLORS[item.deferred_status] || 'bg-gray-100 text-gray-700'}`}>
                    Differe : {DEFERRED_LABELS[item.deferred_status] || item.deferred_status}
                  </span>
                )}
              </div>
              <span className="font-semibold">{formatEur(item.unit_price_ttc * item.qty)}</span>
            </div>
          );
        })}
      </div>

      {/* Deferred items management — Nicolas validate/refuse */}
      {order.requires_caution_review && order.order_items?.some((i) => i.is_deferred && i.deferred_status === 'pending') && (
        <div className="mt-4 border border-amber-200 rounded-lg p-4 bg-amber-50">
          <h3 className="font-semibold text-sm mb-2 text-amber-800">Lignes en paiement differe a valider</h3>
          <div className="space-y-2 mb-3">
            {order.order_items.filter((i) => i.is_deferred && i.deferred_status === 'pending').map((item) => (
              <div key={item.id} className="flex items-center justify-between text-sm bg-white rounded-lg p-2 border">
                <span>{item.product_name} x{item.qty} — {formatEur(item.unit_price_ttc * item.qty)}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                const ids = order.order_items.filter((i) => i.is_deferred && i.deferred_status === 'pending').map((i) => i.id);
                try { await ordersAPI.deferredItems(orderId, { action: 'validate', item_ids: ids }); onUpdated(); } catch (e) { setDetailError(e.response?.data?.message || 'Erreur'); }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700"
            >
              <Check size={14} /> Valider tout
            </button>
            <button
              onClick={async () => {
                if (!confirm('Refuser les lignes differees ? Un email sera envoye au client.')) return;
                const ids = order.order_items.filter((i) => i.is_deferred && i.deferred_status === 'pending').map((i) => i.id);
                try { await ordersAPI.deferredItems(orderId, { action: 'refuse', item_ids: ids }); onUpdated(); } catch (e) { setDetailError(e.response?.data?.message || 'Erreur'); }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700"
            >
              <X size={14} /> Refuser tout
            </button>
          </div>
        </div>
      )}

      {/* Caution check indicator for deferred-eligible products */}
      {order.caution_info?.has_deferred_products && (
        <div className="mt-4">
          <h3 className="font-semibold text-sm mb-2">Paiement differe / Caution</h3>
          <div className={`border rounded-lg p-3 text-sm ${
            order.caution_info.caution_check?.status === 'held'
              ? 'bg-green-50 border-green-200'
              : order.caution_info.caution_check
                ? 'bg-amber-50 border-amber-200'
                : 'bg-red-50 border-red-200'
          }`}>
            <p className="text-xs text-gray-500 mb-1">
              Produits eligibles : {order.caution_info.deferred_products.join(', ')}
            </p>
            {order.caution_info.caution_check ? (
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${
                  order.caution_info.caution_check.status === 'held' ? 'text-green-700' : 'text-amber-700'
                }`}>
                  {order.caution_info.caution_check.status === 'held' && 'Cheque de caution enregistre'}
                  {order.caution_info.caution_check.status === 'cashed' && `Cheque encaisse le ${formatDate(order.caution_info.caution_check.returned_date || order.caution_info.caution_check.received_at)}`}
                  {order.caution_info.caution_check.status === 'returned' && `Cheque restitue le ${formatDate(order.caution_info.caution_check.returned_date || order.caution_info.caution_check.received_at)}`}
                </span>
                <span className="text-xs text-gray-500">({formatEur(order.caution_info.caution_check.amount)})</span>
              </div>
            ) : (
              <p className="text-sm font-medium text-red-700">Aucun cheque de caution enregistre pour ce client</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Assign Modal ──────────────────────────────────
function AssignModal({ orderId, orderRef, onClose, onAssigned }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState('');
  const debounceRef = useRef(null);

  const handleSearch = (q) => {
    setQuery(q);
    setSelected(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await usersAPI.list({ search: q, role: 'etudiant', limit: 10 });
        const students = (data.data || data || []).filter(u => u.role === 'etudiant');
        // Also search ambassadors
        const { data: ambData } = await usersAPI.list({ search: q, role: 'ambassadeur', limit: 10 });
        const ambassadors = (ambData.data || ambData || []).filter(u => u.role === 'ambassadeur');
        setResults([...students, ...ambassadors]);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
  };

  const handleAssign = async () => {
    if (!selected) return;
    setAssigning(true);
    try {
      await ordersAPI.assign(orderId, { user_id: selected.id });
      onAssigned();
    } catch (err) {
      setAssignError(err.response?.data?.message || 'Erreur lors du rattachement');
    } finally { setAssigning(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">Rattacher {orderRef}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text" value={query} onChange={e => handleSearch(e.target.value)}
            placeholder="Rechercher un étudiant ou ambassadeur..."
            className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-wine-500 focus:border-wine-500"
            autoFocus
          />
        </div>
        {searching && <p className="text-sm text-gray-400 text-center">Recherche...</p>}
        {results.length > 0 && (
          <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
            {results.map(u => (
              <button key={u.id} onClick={() => setSelected(u)}
                className={`w-full text-left p-3 text-sm hover:bg-gray-50 ${selected?.id === u.id ? 'bg-wine-50 border-l-2 border-wine-600' : ''}`}>
                <p className="font-medium">{u.name}</p>
                <p className="text-xs text-gray-500">{u.email} · {u.role === 'etudiant' ? 'Étudiant' : 'Ambassadeur'}</p>
              </button>
            ))}
          </div>
        )}
        {query.length >= 2 && !searching && results.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-2">Aucun résultat</p>
        )}
        {selected && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
            <p className="font-medium text-green-800">Rattacher à : {selected.name}</p>
            <p className="text-xs text-green-600">{selected.email}</p>
          </div>
        )}
        {assignError && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertTriangle size={16} className="shrink-0" />
            <span>{assignError}</span>
            <button onClick={() => setAssignError('')} className="ml-auto text-red-400 hover:text-red-600"><X size={14} /></button>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">Annuler</button>
          <button onClick={handleAssign} disabled={!selected || assigning}
            className="px-4 py-2 text-sm rounded-lg bg-wine-600 text-white hover:bg-wine-700 disabled:opacity-40">
            {assigning ? 'Rattachement...' : 'Confirmer'}
          </button>
        </div>
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
  const [assignOrder, setAssignOrder] = useState(null);
  const [listError, setListError] = useState('');

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
    setListError('');
    try { await ordersAPI.validate(id); fetchOrders(); } catch (err) { setListError(err.response?.data?.message || 'Erreur'); }
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

      {listError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle size={16} className="shrink-0" />
          <span>{listError}</span>
          <button onClick={() => setListError('')} className="ml-auto text-red-400 hover:text-red-600"><X size={14} /></button>
        </div>
      )}

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
                      {o.requires_caution_review && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">Caution requise</span>}
                    </div>
                  </div>
                  <p className="font-medium text-sm">{o.user_name}</p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">{formatEur(o.total_ttc)}</span>
                    <span className="text-gray-500 text-xs">{o.total_items} art. · {formatDate(o.created_at)}</span>
                  </div>
                  {(o.status === 'submitted' || o.status === 'pending_stock') && (
                    <div className="pt-1" onClick={e => e.stopPropagation()}>
                      <button onClick={() => handleValidate(o.id)} className="text-xs px-3 py-1 rounded-lg bg-green-600 text-white hover:bg-green-700">{o.status === 'pending_stock' ? 'Disponible' : 'Valider'}</button>
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
                      {o.referrer_name && (
                        <div className="text-xs text-gray-500 mt-0.5">{o.referrer_name}</div>
                      )}
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>{status.label}</span>
                      {hasFlagged(o) && <span className="ml-1 text-orange-500" title="À vérifier"><AlertTriangle size={14} className="inline" /></span>}
                      {o.requires_caution_review && <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">Caution requise</span>}
                    </td>
                    <td className="py-3 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setSelectedOrder(o.id)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Voir détail"><Eye size={16} /></button>
                        {o.source === 'boutique_web' && !o.referred_by && (
                          <button onClick={() => setAssignOrder(o)} className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600" title="Rattacher à un étudiant"><UserPlus size={16} /></button>
                        )}
                        {(o.status === 'submitted' || o.status === 'pending_stock') && (
                          <button onClick={() => handleValidate(o.id)} className="p-1.5 rounded-lg hover:bg-green-50 text-green-600" title={o.status === 'pending_stock' ? 'Marquer disponible' : 'Valider'}><Check size={16} /></button>
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
      {assignOrder && <AssignModal orderId={assignOrder.id} orderRef={assignOrder.ref} onClose={() => setAssignOrder(null)} onAssigned={() => { setAssignOrder(null); fetchOrders(); }} />}
    </div>
  );
}
