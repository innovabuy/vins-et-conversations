import { useState, useEffect, useCallback } from 'react';
import { deliveryNotesAPI, ordersAPI } from '../../services/api';
import { Truck, FileText, Check, Eye, X, ChevronRight } from 'lucide-react';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);
const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const STATUS_CONFIG = {
  draft:     { label: 'Brouillon',  color: 'bg-gray-100 text-gray-700',   icon: null },
  ready:     { label: 'Pret',       color: 'bg-blue-100 text-blue-700',   icon: null },
  shipped:   { label: 'Expedie',    color: 'bg-violet-100 text-violet-700', icon: null },
  delivered: { label: 'Livre',      color: 'bg-green-100 text-green-700', icon: null },
  signed:    { label: 'Signe',      color: 'bg-green-100 text-green-700', icon: Check },
};

const WORKFLOW_NEXT = {
  draft: 'ready',
  ready: 'shipped',
  shipped: 'delivered',
  delivered: 'signed',
};

const WORKFLOW_LABELS = {
  draft: 'Marquer pret',
  ready: 'Marquer expedie',
  shipped: 'Marquer livre',
  delivered: 'Marquer signe',
};

// ─── Generate BL Modal ─────────────────────────────────
function GenerateBLModal({ onClose, onCreated }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ recipient_name: '', delivery_address: '', planned_date: '' });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    ordersAPI.list({ status: 'validated' })
      .then((res) => setOrders(res.data.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = (order) => {
    setSelected(order);
    setForm({
      recipient_name: order.user_name || '',
      delivery_address: '',
      planned_date: '',
    });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!selected) return;
    setCreating(true);
    try {
      await deliveryNotesAPI.create({
        order_id: selected.id,
        recipient_name: form.recipient_name,
        delivery_address: form.delivery_address,
        planned_date: form.planned_date || null,
      });
      onCreated();
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur lors de la creation du BL');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-bold">Generer un bon de livraison</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-4 space-y-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" />
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <FileText size={32} className="mx-auto mb-2" />
              <p className="text-sm">Aucune commande validee disponible</p>
            </div>
          ) : !selected ? (
            <div className="space-y-2">
              <p className="text-sm text-gray-500 mb-3">Selectionnez une commande validee :</p>
              {orders.map((o) => (
                <button
                  key={o.id}
                  onClick={() => handleSelect(o)}
                  className="w-full text-left p-3 border rounded-lg hover:border-wine-300 hover:bg-wine-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{o.ref}</p>
                      <p className="text-xs text-gray-500">{o.user_name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{formatEur(o.total_ttc)}</span>
                      <ChevronRight size={16} className="text-gray-400" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <p className="font-medium">Commande : {selected.ref}</p>
                <p className="text-gray-500">{selected.user_name} - {formatEur(selected.total_ttc)}</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Destinataire *</label>
                <input
                  value={form.recipient_name}
                  onChange={(e) => setForm((f) => ({ ...f, recipient_name: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Adresse de livraison *</label>
                <textarea
                  value={form.delivery_address}
                  onChange={(e) => setForm((f) => ({ ...f, delivery_address: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  rows={2}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Date de livraison prevue</label>
                <input
                  type="date"
                  value={form.planned_date}
                  onChange={(e) => setForm((f) => ({ ...f, planned_date: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Retour
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="btn-primary flex items-center gap-2"
                >
                  <FileText size={16} />
                  {creating ? 'Creation...' : 'Creer le BL'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Delivery Note Detail ───────────────────────────────
function DeliveryNoteDetail({ noteId, onClose, onUpdated }) {
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const fetchNote = useCallback(async () => {
    setLoading(true);
    try {
      const res = await deliveryNotesAPI.get(noteId);
      setNote(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [noteId]);

  useEffect(() => {
    fetchNote();
  }, [fetchNote]);

  const handleAdvanceStatus = async () => {
    if (!note) return;
    const nextStatus = WORKFLOW_NEXT[note.status];
    if (!nextStatus) return;

    const label = WORKFLOW_LABELS[note.status];
    if (!confirm(`${label} ?`)) return;

    setUpdating(true);
    try {
      if (nextStatus === 'signed') {
        await deliveryNotesAPI.sign(note.id, { signature_url: 'manual-sign' });
      } else {
        await deliveryNotesAPI.update(note.id, { status: nextStatus });
      }
      await fetchNote();
      if (onUpdated) onUpdated();
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur lors de la mise a jour');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" />
      </div>
    );
  }

  if (!note) {
    return <p className="text-center text-gray-500 py-8">Bon de livraison introuvable</p>;
  }

  const status = STATUS_CONFIG[note.status] || { label: note.status, color: 'bg-gray-100 text-gray-700' };
  const StatusIcon = status.icon;
  const nextStatus = WORKFLOW_NEXT[note.status];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Truck size={20} className="text-wine-700" />
          BL {note.ref}
        </h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
      </div>

      {/* Status + workflow */}
      <div className="flex items-center gap-3">
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${status.color}`}>
          {StatusIcon && <StatusIcon size={12} />}
          {status.label}
        </span>
        {nextStatus && (
          <button
            onClick={handleAdvanceStatus}
            disabled={updating}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-wine-700 text-white hover:bg-wine-800 disabled:opacity-50 transition-colors"
          >
            <ChevronRight size={14} />
            {updating ? 'Mise a jour...' : WORKFLOW_LABELS[note.status]}
          </button>
        )}
      </div>

      {/* Workflow progress */}
      <div className="flex items-center gap-1 text-xs">
        {Object.keys(WORKFLOW_NEXT).concat(['signed']).map((step, i, arr) => {
          const stepCfg = STATUS_CONFIG[step];
          const isActive = step === note.status;
          const isPast = arr.indexOf(note.status) > i;
          return (
            <div key={step} className="flex items-center gap-1">
              {i > 0 && <div className={`w-6 h-0.5 ${isPast || isActive ? 'bg-wine-400' : 'bg-gray-200'}`} />}
              <span className={`px-2 py-0.5 rounded-full whitespace-nowrap ${isActive ? 'bg-wine-100 text-wine-800 font-semibold' : isPast ? 'text-wine-600' : 'text-gray-400'}`}>
                {stepCfg.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div><span className="text-gray-500">Commande :</span> {note.order_ref || '—'}</div>
        <div><span className="text-gray-500">Destinataire :</span> {note.recipient_name}</div>
        <div className="col-span-2"><span className="text-gray-500">Adresse :</span> {note.delivery_address || '—'}</div>
        <div><span className="text-gray-500">Date prevue :</span> {formatDate(note.planned_date)}</div>
        <div>
          <span className="text-gray-500">Total TTC :</span>{' '}
          <span className="font-semibold">{formatEur(note.total_ttc)}</span>
        </div>
      </div>

      {/* Items */}
      <h3 className="font-semibold text-sm mt-4">Articles</h3>
      {note.items && note.items.length > 0 ? (
        <div className="border rounded-lg divide-y">
          {note.items.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 text-sm">
              <div>
                <p className="font-medium">{item.product_name}</p>
                <p className="text-xs text-gray-500">{formatEur(item.unit_price_ttc)} x {item.qty}</p>
              </div>
              <span className="font-semibold">{formatEur(item.unit_price_ttc * item.qty)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400 py-4 text-center">Aucun article</p>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────
export default function AdminDeliveryNotes() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedNote, setSelectedNote] = useState(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const res = await deliveryNotesAPI.list(params);
      setNotes(res.data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleBLCreated = () => {
    setShowGenerateModal(false);
    fetchNotes();
  };

  // Detail view
  if (selectedNote) {
    return (
      <div className="card">
        <DeliveryNoteDetail
          noteId={selectedNote}
          onClose={() => setSelectedNote(null)}
          onUpdated={fetchNotes}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Bons de livraison</h1>
        <button
          onClick={() => setShowGenerateModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <FileText size={16} />
          Generer un BL
        </button>
      </div>

      {/* Status filter */}
      <div className="card">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="min-w-[180px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Statut</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Tous</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setStatusFilter('')}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2"
          >
            Effacer
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" />
          </div>
        ) : notes.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Truck size={40} className="mx-auto mb-3" />
            <p>Aucun bon de livraison</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-3 font-medium">Ref BL</th>
                <th className="pb-3 font-medium">Commande</th>
                <th className="pb-3 font-medium">Destinataire</th>
                <th className="pb-3 font-medium">Statut</th>
                <th className="pb-3 font-medium">Date prevue</th>
                <th className="pb-3 font-medium">Total TTC</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {notes.map((n) => {
                const st = STATUS_CONFIG[n.status] || { label: n.status, color: 'bg-gray-100 text-gray-700' };
                const StIcon = st.icon;
                return (
                  <tr key={n.id} className="hover:bg-gray-50">
                    <td className="py-3 font-mono text-xs">{n.ref}</td>
                    <td className="py-3 font-mono text-xs text-gray-500">{n.order_ref || '—'}</td>
                    <td className="py-3">
                      <p className="font-medium">{n.recipient_name || n.user_name}</p>
                    </td>
                    <td className="py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${st.color}`}>
                        {StIcon && <StIcon size={12} />}
                        {st.label}
                      </span>
                    </td>
                    <td className="py-3 text-gray-500 text-xs">{formatDate(n.planned_date)}</td>
                    <td className="py-3 font-semibold">{formatEur(n.total_ttc)}</td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => setSelectedNote(n.id)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                        title="Voir detail"
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Generate BL Modal */}
      {showGenerateModal && (
        <GenerateBLModal
          onClose={() => setShowGenerateModal(false)}
          onCreated={handleBLCreated}
        />
      )}
    </div>
  );
}
