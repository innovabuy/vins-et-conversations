import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { paymentsAPI } from '../../services/api';
import { CreditCard, Banknote, Check, Filter, X, Mail, Clock, ExternalLink } from 'lucide-react';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);
const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const STATUS_LABELS = {
  reconciled: { label: 'Rapproché', color: 'bg-green-100 text-green-800' },
  partial: { label: 'Partiel', color: 'bg-orange-100 text-orange-800' },
  manual: { label: 'Manuel', color: 'bg-purple-100 text-purple-800' },
  unpaid: { label: 'Impayé', color: 'bg-red-100 text-red-800' },
  pending: { label: 'En attente', color: 'bg-yellow-100 text-yellow-800' },
};

const METHOD_LABELS = {
  CB: { label: 'CB', icon: CreditCard },
  Virement: { label: 'Virement', icon: Banknote },
  'Espèces': { label: 'Espèces', icon: Banknote },
  'Chèque': { label: 'Chèque', icon: Check },
};

const METHODS = ['CB', 'Virement', 'Espèces', 'Chèque'];
const STATUSES = ['reconciled', 'partial', 'manual', 'unpaid', 'pending'];

function CashDepositForm({ onSubmit, onCancel }) {
  const [form, setForm] = useState({ date: '', amount: '', depositor: '', reference: '', order_id: '' });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const errs = {};
    if (!form.date) errs.date = 'La date est requise';
    if (!form.amount || parseFloat(form.amount) <= 0) errs.amount = 'Le montant est requis';
    if (!form.depositor.trim()) errs.depositor = 'Le déposant est requis';
    if (!form.reference.trim()) errs.reference = 'La référence est requise';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      await onSubmit({
        ...form,
        amount: parseFloat(form.amount),
        order_id: form.order_id || undefined,
      });
      setForm({ date: '', amount: '', depositor: '', reference: '', order_id: '' });
      setErrors({});
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur lors de l’enregistrement');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold">Dépôt d’espèces</h2>
        <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X size={20} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Date *</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.date ? 'border-red-400' : ''}`}
            required
          />
          {errors.date && <p className="text-xs text-red-500 mt-1">{errors.date}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Montant *</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.amount ? 'border-red-400' : ''}`}
            placeholder="0,00 €"
            required
          />
          {errors.amount && <p className="text-xs text-red-500 mt-1">{errors.amount}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Déposant *</label>
          <input
            type="text"
            value={form.depositor}
            onChange={(e) => setForm((f) => ({ ...f, depositor: e.target.value }))}
            className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.depositor ? 'border-red-400' : ''}`}
            placeholder="Nom du déposant"
            required
          />
          {errors.depositor && <p className="text-xs text-red-500 mt-1">{errors.depositor}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Référence *</label>
          <input
            type="text"
            value={form.reference}
            onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
            className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.reference ? 'border-red-400' : ''}`}
            placeholder="Référence du dépôt"
            required
          />
          {errors.reference && <p className="text-xs text-red-500 mt-1">{errors.reference}</p>}
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">Commande associée (optionnel)</label>
          <input
            type="text"
            value={form.order_id}
            onChange={(e) => setForm((f) => ({ ...f, order_id: e.target.value }))}
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="ID ou référence de commande"
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
          Annuler
        </button>
        <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
          <Banknote size={16} />
          {saving ? 'Enregistrement...' : 'Enregistrer le dépôt'}
        </button>
      </div>
    </form>
  );
}

function daysOverdue(createdAt) {
  const created = new Date(createdAt);
  const now = new Date();
  const diff = Math.floor((now - created) / (1000 * 60 * 60 * 24));
  return diff;
}

export default function AdminPayments() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    method: searchParams.get('method') || '',
    status: searchParams.get('status') || '',
  });
  const [showCashForm, setShowCashForm] = useState(false);
  const [reconcilingId, setReconcilingId] = useState(null);
  const [reconcileRef, setReconcileRef] = useState('');

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.method) params.method = filters.method;
      if (filters.status) params.status = filters.status;
      const { data } = await paymentsAPI.list(params);
      setPayments(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const handleReconcile = async (id) => {
    if (!reconcileRef.trim()) {
      alert('Veuillez saisir une référence de rapprochement');
      return;
    }
    try {
      await paymentsAPI.reconcile(id, { reference: reconcileRef });
      setReconcilingId(null);
      setReconcileRef('');
      fetchPayments();
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur de rapprochement');
    }
  };

  const handleCashDeposit = async (payload) => {
    await paymentsAPI.cashDeposit(payload);
    setShowCashForm(false);
    fetchPayments();
  };

  if (showCashForm) {
    return (
      <div className="card">
        <CashDepositForm onSubmit={handleCashDeposit} onCancel={() => setShowCashForm(false)} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Paiements</h1>
        <button onClick={() => setShowCashForm(true)} className="btn-primary flex items-center gap-2">
          <Banknote size={16} />
          Dépôt espèces
        </button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Filter size={16} />
            <span>Filtres</span>
          </div>
          <div className="min-w-[150px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Méthode</label>
            <select
              value={filters.method}
              onChange={(e) => setFilters((f) => ({ ...f, method: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Toutes</option>
              {METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[150px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Statut</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Tous</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s].label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setFilters({ method: '', status: '' })}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2"
          >
            Effacer
          </button>
        </div>
      </div>

      {/* Payments Table */}
      <div className="card overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" />
          </div>
        ) : payments.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <CreditCard size={40} className="mx-auto mb-3" />
            <p>Aucun paiement trouvé</p>
          </div>
        ) : (
          <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {payments.map((p) => {
              const status = STATUS_LABELS[p.status] || { label: p.status, color: 'bg-gray-100 text-gray-700' };
              const methodInfo = METHOD_LABELS[p.method] || { label: p.method, icon: CreditCard };
              const MethodIcon = methodInfo.icon;
              return (
                <div key={p.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-sm"><MethodIcon size={14} className="text-gray-400" /><span>{methodInfo.label}</span></div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>{status.label}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{formatEur(p.amount)}</span>
                    <span className="font-mono text-xs text-gray-500">{p.order_ref || '—'}</span>
                  </div>
                  <p className="text-sm font-medium">{p.user_name}</p>
                  <p className="text-xs text-gray-500">{formatDate(p.created_at)}</p>
                  {p.method === 'Virement' && p.status !== 'reconciled' && (
                    <div className="pt-1">
                      {reconcilingId === p.id ? (
                        <div className="flex items-center gap-2">
                          <input type="text" value={reconcileRef} onChange={(e) => setReconcileRef(e.target.value)} placeholder="Réf. bancaire" className="border rounded-lg px-2 py-1 text-xs flex-1" autoFocus />
                          <button onClick={() => handleReconcile(p.id)} className="p-1.5 rounded-lg hover:bg-green-50 text-green-600"><Check size={16} /></button>
                          <button onClick={() => { setReconcilingId(null); setReconcileRef(''); }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
                        </div>
                      ) : (
                        <button onClick={() => setReconcilingId(p.id)} className="text-xs px-3 py-1.5 rounded-lg border border-wine-200 text-wine-700 hover:bg-wine-50">Rapprocher</button>
                      )}
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
                <th className="pb-3 font-medium">Réf. commande</th>
                <th className="pb-3 font-medium">Méthode</th>
                <th className="pb-3 font-medium">Montant</th>
                <th className="pb-3 font-medium">Statut</th>
                <th className="pb-3 font-medium">Utilisateur</th>
                <th className="pb-3 font-medium">Date</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {payments.map((p) => {
                const status = STATUS_LABELS[p.status] || { label: p.status, color: 'bg-gray-100 text-gray-700' };
                const methodInfo = METHOD_LABELS[p.method] || { label: p.method, icon: CreditCard };
                const MethodIcon = methodInfo.icon;
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="py-3 font-mono text-xs">{p.order_ref ? <button onClick={() => navigate(`/admin/orders?selected=${p.order_id}`)} className="text-wine-700 hover:underline inline-flex items-center gap-1">{p.order_ref} <ExternalLink size={10} /></button> : '—'}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-1.5">
                        <MethodIcon size={14} className="text-gray-400" />
                        <span>{methodInfo.label}</span>
                      </div>
                    </td>
                    <td className="py-3 font-semibold">{formatEur(p.amount)}</td>
                    <td className="py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
                        {status.label}
                      </span>
                      {p.status === 'unpaid' && (
                        <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-red-500 font-medium">
                          <Clock size={10} /> {daysOverdue(p.created_at)}j
                        </span>
                      )}
                    </td>
                    <td className="py-3">
                      <p className="font-medium">{p.user_name}</p>
                      {p.user_email && <p className="text-xs text-gray-400">{p.user_email}</p>}
                    </td>
                    <td className="py-3 text-gray-500 text-xs">{formatDate(p.created_at)}</td>
                    <td className="py-3 text-right">
                      {p.status === 'unpaid' && (
                        <button
                          onClick={() => { if (p.user_email) window.location.href = `mailto:${p.user_email}?subject=Relance paiement ${p.order_ref || ''}&body=Bonjour, nous vous contactons concernant un paiement en attente.`; else alert('Email du client non disponible'); }}
                          className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 mr-2 inline-flex items-center gap-1"
                        >
                          <Mail size={12} /> Relancer
                        </button>
                      )}
                      {p.method === 'Virement' && p.status !== 'reconciled' && (
                        <>
                          {reconcilingId === p.id ? (
                            <div className="flex items-center gap-2 justify-end">
                              <input
                                type="text"
                                value={reconcileRef}
                                onChange={(e) => setReconcileRef(e.target.value)}
                                placeholder="Réf. bancaire"
                                className="border rounded-lg px-2 py-1 text-xs w-32"
                                autoFocus
                              />
                              <button
                                onClick={() => handleReconcile(p.id)}
                                className="p-1.5 rounded-lg hover:bg-green-50 text-green-600"
                                title="Confirmer"
                              >
                                <Check size={16} />
                              </button>
                              <button
                                onClick={() => { setReconcilingId(null); setReconcileRef(''); }}
                                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
                                title="Annuler"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setReconcilingId(p.id)}
                              className="text-xs px-3 py-1.5 rounded-lg border border-wine-200 text-wine-700 hover:bg-wine-50"
                            >
                              Rapprocher
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </>
        )}
      </div>
    </div>
  );
}
