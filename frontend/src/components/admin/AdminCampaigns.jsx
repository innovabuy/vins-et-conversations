import { useState, useEffect } from 'react';
import { campaignsAPI } from '../../services/api';
import { BookOpen, Copy, Users, ShoppingCart, Calendar, TrendingUp } from 'lucide-react';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);

const STATUS_LABELS = {
  draft: { label: 'Brouillon', color: 'bg-gray-100 text-gray-700' },
  active: { label: 'Active', color: 'bg-green-100 text-green-700' },
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

export default function AdminCampaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const { data } = await campaignsAPI.list();
      setCampaigns(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCampaigns(); }, []);

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
        <span className="text-sm text-gray-500">{campaigns.length} campagne(s)</span>
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
            return (
              <div key={c.id} className="card">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-lg font-bold">{c.name}</h2>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>{status.label}</span>
                    </div>
                    <p className="text-sm text-gray-500">{c.org_name} — {c.type_label}</p>
                  </div>
                  <button
                    onClick={() => handleDuplicate(c.id, c.name)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 text-gray-600"
                    title="Dupliquer"
                  >
                    <Copy size={14} />
                    Dupliquer
                  </button>
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
    </div>
  );
}
