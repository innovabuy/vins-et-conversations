import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { deliveryNotesAPI, ordersAPI } from '../../services/api';
import { Truck, FileText, Check, Eye, EyeOff, X, ChevronRight, Printer, Mail, Trash2, Pencil, Save, ExternalLink, PenTool } from 'lucide-react';
import SignaturePad from '../shared/SignaturePad';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);
const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const STATUS_CONFIG = {
  draft:     { label: 'Brouillon',  color: 'bg-gray-100 text-gray-700' },
  ready:     { label: 'Prêt',       color: 'bg-blue-100 text-blue-700' },
  shipped:   { label: 'Expédié',    color: 'bg-violet-100 text-violet-700' },
  delivered: { label: 'Livré',      color: 'bg-green-100 text-green-700' },
  signed:    { label: 'Signé',      color: 'bg-green-100 text-green-700', icon: Check },
};

const WORKFLOW_NEXT = { draft: 'ready', ready: 'shipped', shipped: 'delivered', delivered: 'signed' };
const WORKFLOW_LABELS = { draft: 'Marquer prêt', ready: 'Marquer expédié', shipped: 'Marquer livré', delivered: 'Marquer signé' };

function GenerateBLModal({ onClose, onCreated }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ recipient_name: '', delivery_address: '', planned_date: '' });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    ordersAPI.list({ status: 'validated' })
      .then(res => setOrders(res.data.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = (order) => {
    setSelected(order);
    setForm({ recipient_name: order.user_name || '', delivery_address: '', planned_date: '' });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!selected) return;
    setCreating(true);
    try {
      await deliveryNotesAPI.create({ order_id: selected.id, ...form, planned_date: form.planned_date || null });
      onCreated();
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur lors de la création du BL');
    } finally { setCreating(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-bold">Générer un bon de livraison</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-4 space-y-4">
          {loading ? (
            <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" /></div>
          ) : orders.length === 0 ? (
            <div className="text-center py-8 text-gray-400"><FileText size={32} className="mx-auto mb-2" /><p className="text-sm">Aucune commande validée disponible</p></div>
          ) : !selected ? (
            <div className="space-y-2">
              <p className="text-sm text-gray-500 mb-3">Sélectionnez une commande validée :</p>
              {orders.map(o => (
                <button key={o.id} onClick={() => handleSelect(o)} className="w-full text-left p-3 border rounded-lg hover:border-wine-300 hover:bg-wine-50">
                  <div className="flex items-center justify-between">
                    <div><p className="font-medium text-sm">{o.ref}</p><p className="text-xs text-gray-500">{o.user_name}</p></div>
                    <div className="flex items-center gap-2"><span className="text-sm font-semibold">{formatEur(o.total_ttc)}</span><ChevronRight size={16} className="text-gray-400" /></div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm"><p className="font-medium">Commande : {selected.ref}</p><p className="text-gray-500">{selected.user_name} - {formatEur(selected.total_ttc)}</p></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Destinataire *</label><input value={form.recipient_name} onChange={e => setForm(f => ({ ...f, recipient_name: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" required /></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Adresse de livraison *</label><textarea value={form.delivery_address} onChange={e => setForm(f => ({ ...f, delivery_address: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} required /></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Date prévue</label><input type="date" value={form.planned_date} onChange={e => setForm(f => ({ ...f, planned_date: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setSelected(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Retour</button>
                <button type="submit" disabled={creating} className="btn-primary flex items-center gap-2"><FileText size={16} />{creating ? 'Création...' : 'Créer le BL'}</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function DeliveryNoteDetail({ noteId, onClose, onUpdated }) {
  const navigate = useNavigate();
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [showSignaturePad, setShowSignaturePad] = useState(false);

  const fetchNote = useCallback(async () => {
    setLoading(true);
    try { const res = await deliveryNotesAPI.get(noteId); setNote(res.data); } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [noteId]);

  useEffect(() => { fetchNote(); }, [fetchNote]);

  const handleAdvanceStatus = async () => {
    if (!note) return;
    const nextStatus = WORKFLOW_NEXT[note.status];
    if (!nextStatus) return;
    // Open signature pad for delivered→signed transition
    if (nextStatus === 'signed') {
      setShowSignaturePad(true);
      return;
    }
    if (!confirm(`${WORKFLOW_LABELS[note.status]} ?`)) return;
    setUpdating(true);
    try {
      await deliveryNotesAPI.update(note.id, { status: nextStatus });
      await fetchNote();
      if (onUpdated) onUpdated();
    } catch (err) { alert(err.response?.data?.message || 'Erreur'); } finally { setUpdating(false); }
  };

  const handleSignatureConfirm = async (signatureDataUrl) => {
    setShowSignaturePad(false);
    setUpdating(true);
    try {
      await deliveryNotesAPI.sign(note.id, { signature_url: signatureDataUrl });
      await fetchNote();
      if (onUpdated) onUpdated();
    } catch (err) { alert(err.response?.data?.message || 'Erreur'); } finally { setUpdating(false); }
  };

  const handleDelete = async () => {
    if (!confirm('Supprimer ce bon de livraison ?')) return;
    try { await deliveryNotesAPI.remove(note.id); if (onUpdated) onUpdated(); onClose(); } catch (err) { alert(err.response?.data?.message || 'Erreur'); }
  };

  const handlePrint = () => {
    const token = localStorage.getItem('accessToken');
    const url = deliveryNotesAPI.pdf(noteId);
    window.open(`${url}?token=${token}`, '_blank');
  };

  const handleEmail = async () => {
    if (!confirm('Envoyer ce BL par email ?')) return;
    try { const res = await deliveryNotesAPI.sendEmail(noteId); alert(`Email préparé pour ${res.data.to}`); } catch (err) { alert(err.response?.data?.message || 'Erreur'); }
  };

  const startEdit = () => {
    setEditForm({ recipient_name: note.recipient_name || '', delivery_address: note.delivery_address || '', planned_date: note.planned_date ? note.planned_date.split('T')[0] : '' });
    setEditing(true);
  };

  const saveEdit = async () => {
    try { await deliveryNotesAPI.update(note.id, editForm); setEditing(false); await fetchNote(); if (onUpdated) onUpdated(); } catch (err) { alert(err.response?.data?.message || 'Erreur'); }
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" /></div>;
  if (!note) return <p className="text-center text-gray-500 py-8">BL introuvable</p>;

  const status = STATUS_CONFIG[note.status] || { label: note.status, color: 'bg-gray-100 text-gray-700' };
  const StatusIcon = status.icon;
  const nextStatus = WORKFLOW_NEXT[note.status];
  const canEdit = ['draft', 'ready'].includes(note.status);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2"><Truck size={20} className="text-wine-700" /> BL {note.ref}</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${status.color}`}>{StatusIcon && <StatusIcon size={12} />}{status.label}</span>
        {nextStatus && (
          <button onClick={handleAdvanceStatus} disabled={updating} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-wine-700 text-white hover:bg-wine-800 disabled:opacity-50">
            <ChevronRight size={14} />{updating ? 'Mise à jour...' : WORKFLOW_LABELS[note.status]}
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
              <span className={`px-2 py-0.5 rounded-full whitespace-nowrap ${isActive ? 'bg-wine-100 text-wine-800 font-semibold' : isPast ? 'text-wine-600' : 'text-gray-400'}`}>{stepCfg.label}</span>
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {canEdit && <button onClick={startEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"><Pencil size={14} /> Modifier</button>}
        <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"><Printer size={14} /> Imprimer PDF</button>
        <button onClick={handleEmail} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"><Mail size={14} /> Envoyer par email</button>
        {note.status === 'draft' && <button onClick={handleDelete} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700"><Trash2 size={14} /> Supprimer</button>}
      </div>

      {/* Edit form */}
      {editing && (
        <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Destinataire</label><input value={editForm.recipient_name} onChange={e => setEditForm(f => ({ ...f, recipient_name: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Adresse</label><textarea value={editForm.delivery_address} onChange={e => setEditForm(f => ({ ...f, delivery_address: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Date prévue</label><input type="date" value={editForm.planned_date} onChange={e => setEditForm(f => ({ ...f, planned_date: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Annuler</button>
            <button onClick={saveEdit} className="btn-primary flex items-center gap-1.5 text-sm"><Save size={14} /> Enregistrer</button>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div><span className="text-gray-500">Commande :</span> {note.order_ref ? <button onClick={() => navigate(`/admin/orders?selected=${note.order_id}`)} className="text-wine-700 hover:underline inline-flex items-center gap-1 font-medium">{note.order_ref} <ExternalLink size={12} /></button> : '—'}</div>
        <div><span className="text-gray-500">Destinataire :</span> {note.recipient_name}</div>
        <div className="col-span-2"><span className="text-gray-500">Adresse :</span> {note.delivery_address || '—'}</div>
        <div><span className="text-gray-500">Date prévue :</span> {formatDate(note.planned_date)}</div>
        <div><span className="text-gray-500">Total TTC :</span> <span className="font-semibold">{formatEur(note.total_ttc)}</span></div>
      </div>

      {/* Signature zone for delivered/signed */}
      {(note.status === 'delivered' || note.status === 'signed') && (
        <div className="border-2 border-dashed border-green-300 rounded-lg p-4 bg-green-50">
          {note.status === 'signed' && note.signature_url && note.signature_url.startsWith('data:') ? (
            <div>
              <p className="text-sm font-medium text-green-800 mb-2">Signature</p>
              <img src={note.signature_url} alt="Signature" className="max-w-[200px] h-auto border rounded bg-white" />
            </div>
          ) : note.status === 'signed' ? (
            <p className="text-sm font-medium text-green-800">Signé</p>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-amber-700">En attente de signature</p>
              <button onClick={() => setShowSignaturePad(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-wine-700 text-white rounded-lg hover:bg-wine-800">
                <PenTool size={14} /> Signer
              </button>
            </div>
          )}
          {note.delivered_at && <p className="text-xs text-green-600 mt-1">Livré le {formatDate(note.delivered_at)}</p>}
        </div>
      )}

      {/* Signature Pad fullscreen overlay */}
      {showSignaturePad && (
        <SignaturePad
          onConfirm={handleSignatureConfirm}
          onClose={() => setShowSignaturePad(false)}
        />
      )}

      {/* Items */}
      <h3 className="font-semibold text-sm mt-4">Articles</h3>
      {note.items?.length > 0 ? (
        <div className="border rounded-lg divide-y">
          {note.items.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 text-sm">
              <div><p className="font-medium">{item.product_name}</p><p className="text-xs text-gray-500">{formatEur(item.unit_price_ttc)} x {item.qty}</p></div>
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

export default function AdminDeliveryNotes() {
  const [searchParams] = useSearchParams();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [hideDelivered, setHideDelivered] = useState(false);
  const [selectedNote, setSelectedNote] = useState(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const res = await deliveryNotesAPI.list(params);
      setNotes(res.data.data || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  const handleBLCreated = () => { setShowGenerateModal(false); fetchNotes(); };

  const displayNotes = hideDelivered ? notes.filter(n => !['delivered', 'signed'].includes(n.status)) : notes;

  if (selectedNote) {
    return (
      <div className="card">
        <DeliveryNoteDetail noteId={selectedNote} onClose={() => setSelectedNote(null)} onUpdated={() => { setSelectedNote(null); fetchNotes(); }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Bons de livraison</h1>
        <button onClick={() => setShowGenerateModal(true)} className="btn-primary flex items-center gap-2"><FileText size={16} /> Générer un BL</button>
      </div>

      <div className="card">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="min-w-[180px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Statut</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Tous</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <button onClick={() => setHideDelivered(h => !h)} className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border ${hideDelivered ? 'bg-wine-50 border-wine-200 text-wine-700' : 'border-gray-200 text-gray-500'}`}>
            {hideDelivered ? <EyeOff size={14} /> : <Eye size={14} />}
            {hideDelivered ? 'Livrés masqués' : 'Masquer livrés'}
          </button>
          <button onClick={() => setStatusFilter('')} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">Effacer</button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" /></div>
        ) : displayNotes.length === 0 ? (
          <div className="text-center py-12 text-gray-400"><Truck size={40} className="mx-auto mb-3" /><p>Aucun bon de livraison</p></div>
        ) : (
          <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {displayNotes.map(n => {
              const st = STATUS_CONFIG[n.status] || { label: n.status, color: 'bg-gray-100 text-gray-700' };
              const StIcon = st.icon;
              return (
                <div key={n.id} onClick={() => setSelectedNote(n.id)} className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-gray-500">{n.ref}</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>{StIcon && <StIcon size={12} />}{st.label}</span>
                  </div>
                  <p className="font-medium text-sm">{n.recipient_name || n.user_name}</p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">{formatEur(n.total_ttc)}</span>
                    <span className="text-gray-500 text-xs">{formatDate(n.planned_date)}</span>
                  </div>
                  {n.order_ref && <p className="text-xs text-gray-400">Cmd : {n.order_ref}</p>}
                </div>
              );
            })}
          </div>
          {/* Desktop table */}
          <table className="hidden md:table w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-3 font-medium">Ref BL</th>
                <th className="pb-3 font-medium">Commande</th>
                <th className="pb-3 font-medium">Destinataire</th>
                <th className="pb-3 font-medium">Statut</th>
                <th className="pb-3 font-medium">Date prévue</th>
                <th className="pb-3 font-medium">Total TTC</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayNotes.map(n => {
                const st = STATUS_CONFIG[n.status] || { label: n.status, color: 'bg-gray-100 text-gray-700' };
                const StIcon = st.icon;
                return (
                  <tr key={n.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedNote(n.id)}>
                    <td className="py-3 font-mono text-xs">{n.ref}</td>
                    <td className="py-3 font-mono text-xs text-gray-500">{n.order_ref || '—'}</td>
                    <td className="py-3"><p className="font-medium">{n.recipient_name || n.user_name}</p></td>
                    <td className="py-3"><span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${st.color}`}>{StIcon && <StIcon size={12} />}{st.label}</span></td>
                    <td className="py-3 text-gray-500 text-xs">{formatDate(n.planned_date)}</td>
                    <td className="py-3 font-semibold">{formatEur(n.total_ttc)}</td>
                    <td className="py-3 text-right" onClick={e => e.stopPropagation()}><button onClick={() => setSelectedNote(n.id)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Voir détail"><Eye size={16} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </>
        )}
      </div>

      {showGenerateModal && <GenerateBLModal onClose={() => setShowGenerateModal(false)} onCreated={handleBLCreated} />}
    </div>
  );
}
