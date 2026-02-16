import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { campaignsAPI } from '../../services/api';
import { BookOpen, Copy, Users, ShoppingCart, Calendar, TrendingUp, ChevronRight, Plus, Pencil, Trash2, X, Archive, AlertTriangle } from 'lucide-react';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);

const STATUS_LABELS = {
  draft: { label: 'Brouillon', color: 'bg-gray-100 text-gray-700' },
  active: { label: 'Active', color: 'bg-green-100 text-green-700' },
  paused: { label: 'En pause', color: 'bg-yellow-100 text-yellow-700' },
  completed: { label: 'Terminée', color: 'bg-blue-100 text-blue-700' },
  archived: { label: 'Archivée', color: 'bg-red-100 text-red-700' },
  closed: { label: 'Clôturée', color: 'bg-red-100 text-red-700' },
};

function ProgressGauge({ value, max, label }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-gray-500">{label}</span>
        <span className="font-semibold">{pct}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2.5">
        <div
          className={`h-2.5 rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : pct >= 50 ? 'bg-wine-600' : 'bg-wine-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs mt-1 text-gray-400">
        <span>{formatEur(value)}</span>
        <span>{formatEur(max)}</span>
      </div>
    </div>
  );
}

function DeleteModal({ campaign, onClose, onDeleted }) {
  const [deps, setDeps] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    campaignsAPI.dependencies(campaign.id)
      .then(({ data }) => setDeps(data))
      .catch(() => setDeps({ has_dependencies: false, deletable: true, counts: {} }))
      .finally(() => setLoading(false));
  }, [campaign.id]);

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await campaignsAPI.delete(campaign.id);
      onDeleted();
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur lors de la suppression');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold flex items-center gap-2">
            {deps?.deletable ? <Trash2 size={20} className="text-red-600" /> : <Archive size={20} className="text-amber-600" />}
            {deps?.deletable ? 'Supprimer' : 'Archiver'} la campagne
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
        </div>

        <p className="text-sm font-medium text-gray-900">{campaign.name}</p>

        {loading ? (
          <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" /></div>
        ) : deps?.deletable ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-red-700">
              <AlertTriangle size={16} />
              <p className="text-sm font-medium">Suppression définitive</p>
            </div>
            <p className="text-sm text-red-600">Aucune donnée liée. Cette campagne sera supprimée définitivement. Cette action est irréversible.</p>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-700">
              <Archive size={16} />
              <p className="text-sm font-medium">Archivage (données conservées)</p>
            </div>
            <div className="text-sm text-amber-600 space-y-1">
              {deps?.counts?.orders > 0 && <p>{deps.counts.orders} commande(s)</p>}
              {deps?.counts?.participations > 0 && <p>{deps.counts.participations} participation(s)</p>}
              {deps?.counts?.financial_events > 0 && <p>{deps.counts.financial_events} événement(s) financier(s)</p>}
              {deps?.counts?.delivery_notes > 0 && <p>{deps.counts.delivery_notes} bon(s) de livraison</p>}
            </div>
            <p className="text-xs text-amber-500 mt-2">La campagne sera masquée mais les données resteront accessibles dans les exports.</p>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Annuler</button>
          <button
            onClick={handleConfirm}
            disabled={deleting}
            className={`px-4 py-2 rounded-lg text-sm text-white disabled:opacity-50 ${deps?.deletable ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}`}
          >
            {deleting ? 'En cours...' : deps?.deletable ? 'Supprimer définitivement' : 'Archiver'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminCampaigns() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const params = showArchived ? { include_archived: 'true' } : {};
      const { data } = await campaignsAPI.list(params);
      setCampaigns(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCampaigns(); }, [showArchived]);

  const handleDuplicate = async (id, name) => {
    if (!confirm(`Dupliquer la campagne "${name}" ?`)) return;
    try {
      await campaignsAPI.duplicate(id);
      fetchCampaigns();
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur lors de la duplication');
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Campagnes</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded border-gray-300"
            />
            Inclure archivées
          </label>
          <span className="text-sm text-gray-500">{campaigns.length} campagne(s)</span>
          <Link to="/admin/campaigns/new" className="btn-primary flex items-center gap-2 text-sm"><Plus size={16} /> Nouvelle campagne</Link>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <BookOpen size={40} className="mx-auto mb-3" />
          <p>Aucune campagne</p>
        </div>
      ) : (
        <div className="grid gap-6">
          {campaigns.map((c) => {
            const status = STATUS_LABELS[c.status] || { label: c.status, color: 'bg-gray-100 text-gray-700' };
            const isArchived = !!c.deleted_at;
            return (
              <div key={c.id} className={`card ${isArchived ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between mb-4">
                  <Link to={`/admin/campaigns/${c.id}`} className="flex-1 hover:opacity-80">
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-lg font-bold">{c.name}</h2>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>{status.label}</span>
                      <ChevronRight size={16} className="text-gray-400" />
                    </div>
                    <p className="text-sm text-gray-500">{c.org_name} — {c.type_label}</p>
                  </Link>
                  {!isArchived && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate(`/admin/campaigns/${c.id}/edit`)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 text-gray-600"
                        title="Modifier"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDuplicate(c.id, c.name)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 text-gray-600"
                        title="Dupliquer"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(c)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-red-200 rounded-lg hover:bg-red-50 text-red-600"
                        title="Supprimer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>

                <ProgressGauge value={c.ca} max={c.goal} label="CA / Objectif" />

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
                  <div className="flex items-center gap-2">
                    <div className="bg-blue-50 p-2 rounded-lg"><Users size={16} className="text-blue-600" /></div>
                    <div>
                      <p className="text-lg font-bold">{c.participants}</p>
                      <p className="text-xs text-gray-500">Participants</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="bg-purple-50 p-2 rounded-lg"><ShoppingCart size={16} className="text-purple-600" /></div>
                    <div>
                      <p className="text-lg font-bold">{c.orders_count}</p>
                      <p className="text-xs text-gray-500">Commandes</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="bg-green-50 p-2 rounded-lg"><TrendingUp size={16} className="text-green-600" /></div>
                    <div>
                      <p className="text-lg font-bold">{formatEur(c.ca)}</p>
                      <p className="text-xs text-gray-500">CA TTC</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="bg-orange-50 p-2 rounded-lg"><Calendar size={16} className="text-orange-600" /></div>
                    <div>
                      <p className="text-lg font-bold">{c.days_remaining ?? '—'}</p>
                      <p className="text-xs text-gray-500">Jours restants</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {deleteTarget && (
        <DeleteModal
          campaign={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => { setDeleteTarget(null); fetchCampaigns(); }}
        />
      )}
    </div>
  );
}
