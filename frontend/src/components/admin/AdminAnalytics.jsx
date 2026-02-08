import { useState, useEffect } from 'react';
import { analyticsAPI, campaignsAPI } from '../../services/api';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';
import { TrendingUp, Users, ShoppingCart, Wine } from 'lucide-react';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);

export default function AdminAnalytics() {
  const [data, setData] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [filters, setFilters] = useState({ campaign_id: '', start: '', end: '' });
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    const params = {};
    if (filters.campaign_id) params.campaign_id = filters.campaign_id;
    if (filters.start) params.start = filters.start;
    if (filters.end) params.end = filters.end;
    analyticsAPI.get(params)
      .then((res) => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    campaignsAPI.list().then((res) => setCampaigns(res.data.data || [])).catch(() => {});
    load();
  }, []);

  useEffect(() => { load(); }, [filters]);

  if (loading && !data) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" /></div>;
  if (!data) return <div className="text-center py-20 text-gray-500">Erreur de chargement</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <div className="flex gap-2 flex-wrap">
          <select
            className="input text-sm"
            value={filters.campaign_id}
            onChange={(e) => setFilters({ ...filters, campaign_id: e.target.value })}
          >
            <option value="">Toutes campagnes</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="date" className="input text-sm" value={filters.start} onChange={(e) => setFilters({ ...filters, start: e.target.value })} />
          <input type="date" className="input text-sm" value={filters.end} onChange={(e) => setFilters({ ...filters, end: e.target.value })} />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Taux de conversion', value: `${data.tauxConversion}%`, icon: TrendingUp, color: 'text-green-600' },
          { label: 'CA TTC', value: formatEur(data.kpis.caTTC), icon: Wine, color: 'text-wine-700' },
          { label: 'Commandes', value: data.kpis.totalOrders, icon: ShoppingCart, color: 'text-blue-600' },
          { label: 'Bouteilles', value: data.kpis.totalBottles, icon: Users, color: 'text-purple-600' },
        ].map((kpi) => (
          <div key={kpi.label} className="card">
            <div className="flex items-center gap-3">
              <div className={`${kpi.color} bg-gray-50 p-2 rounded-lg`}>
                <kpi.icon size={20} />
              </div>
              <div>
                <p className="text-sm text-gray-500">{kpi.label}</p>
                <p className="text-xl font-bold">{kpi.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* LineChart — CA par période */}
      <div className="card">
        <h3 className="font-semibold mb-4">CA par mois</h3>
        <div className="h-[200px] md:h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.caParPeriode}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v) => formatEur(v)} />
            <Legend />
            <Line type="monotone" dataKey="ca_ttc" stroke="#ab2049" strokeWidth={2} name="CA TTC" />
            <Line type="monotone" dataKey="ca_ht" stroke="#2563eb" strokeWidth={2} name="CA HT" dot={false} />
          </LineChart>
        </ResponsiveContainer>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* BarChart — Top vendeurs */}
        <div className="card">
          <h3 className="font-semibold mb-4">Top Vendeurs</h3>
          <div className="h-[200px] md:h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.topVendeurs} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => formatEur(v)} />
              <Bar dataKey="ca" fill="#ab2049" radius={[0, 4, 4, 0]} name="CA" />
            </BarChart>
          </ResponsiveContainer>
          </div>
        </div>

        {/* BarChart — Top produits */}
        <div className="card">
          <h3 className="font-semibold mb-4">Top Produits</h3>
          <div className="h-[200px] md:h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.topProduits} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="qty" fill="#7c3aed" radius={[0, 4, 4, 0]} name="Bouteilles" />
            </BarChart>
          </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* BarChart — Comparaison campagnes */}
      <div className="card">
        <h3 className="font-semibold mb-4">Comparaison Campagnes</h3>
        <div className="h-[200px] md:h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.comparaisonCampagnes}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v, name) => name === 'CA' || name === 'Objectif' ? formatEur(v) : v} />
            <Legend />
            <Bar dataKey="ca" fill="#ab2049" radius={[4, 4, 0, 0]} name="CA" />
            <Bar dataKey="goal" fill="#e5e7eb" radius={[4, 4, 0, 0]} name="Objectif" />
          </BarChart>
        </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
