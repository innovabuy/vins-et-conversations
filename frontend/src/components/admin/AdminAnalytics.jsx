import { useState, useEffect } from 'react';
import { analyticsAPI, campaignsAPI } from '../../services/api';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';
import { TrendingUp, Users, ShoppingCart, Wine } from 'lucide-react';
import { WINE_PALETTE, MULTI_PALETTE, axisStyle, gridStyle, PremiumTooltip, ChartGradient, chartAnimation, formatEur } from '../../utils/chartTheme';

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
          { label: 'Taux de conversion', value: `${data.tauxConversion}%`, icon: TrendingUp, gradient: 'from-emerald-500 to-emerald-700' },
          { label: 'CA TTC', value: formatEur(data.kpis.caTTC), icon: Wine, gradient: 'from-wine-700 to-wine-900' },
          { label: 'Commandes', value: data.kpis.totalOrders, icon: ShoppingCart, gradient: 'from-blue-500 to-blue-700' },
          { label: 'Bouteilles', value: data.kpis.totalBottles, icon: Users, gradient: 'from-purple-500 to-purple-700' },
        ].map((kpi) => (
          <div key={kpi.label} className={`bg-gradient-to-br ${kpi.gradient} rounded-2xl p-5 text-white shadow-lg`}>
            <div className="flex items-center justify-between mb-3">
              <kpi.icon size={22} className="opacity-80" />
            </div>
            <p className="text-2xl font-bold">{kpi.value}</p>
            <p className="text-sm opacity-80 mt-1">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* AreaChart — CA par période (was LineChart, now premium AreaChart) */}
      <div className="card">
        <h3 className="font-semibold mb-4">CA par mois</h3>
        <div className="h-[200px] md:h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data.caParPeriode} {...chartAnimation}>
            <defs>
              <ChartGradient id="areaWine" color="#7f1d1d" opacity={0.3} />
              <ChartGradient id="areaBlue" color="#2563eb" opacity={0.2} />
            </defs>
            <CartesianGrid {...gridStyle} />
            <XAxis dataKey="mois" {...axisStyle} />
            <YAxis {...axisStyle} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <PremiumTooltip formatter={formatEur} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="ca_ttc" stroke="#7f1d1d" fill="url(#areaWine)" strokeWidth={2.5} name="CA TTC" />
            <Area type="monotone" dataKey="ca_ht" stroke="#2563eb" fill="url(#areaBlue)" strokeWidth={2} name="CA HT" />
          </AreaChart>
        </ResponsiveContainer>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* BarChart — Top vendeurs */}
        <div className="card">
          <h3 className="font-semibold mb-4">Top Vendeurs</h3>
          <div className="h-[200px] md:h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.topVendeurs} layout="vertical" {...chartAnimation}>
              <CartesianGrid {...gridStyle} />
              <XAxis type="number" {...axisStyle} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <YAxis dataKey="name" type="category" width={100} {...axisStyle} />
              <PremiumTooltip formatter={formatEur} />
              <Bar dataKey="ca" fill={WINE_PALETTE[0]} radius={[0, 6, 6, 0]} name="CA" />
            </BarChart>
          </ResponsiveContainer>
          </div>
        </div>

        {/* BarChart — Top produits */}
        <div className="card">
          <h3 className="font-semibold mb-4">Top Produits</h3>
          <div className="h-[200px] md:h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.topProduits} layout="vertical" {...chartAnimation}>
              <CartesianGrid {...gridStyle} />
              <XAxis type="number" {...axisStyle} />
              <YAxis dataKey="name" type="category" width={120} {...axisStyle} />
              <PremiumTooltip />
              <Bar dataKey="qty" fill={MULTI_PALETTE[4]} radius={[0, 6, 6, 0]} name="Bouteilles" />
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
          <BarChart data={data.comparaisonCampagnes} {...chartAnimation}>
            <CartesianGrid {...gridStyle} />
            <XAxis dataKey="name" {...axisStyle} />
            <YAxis {...axisStyle} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <PremiumTooltip formatter={(v, name) => name === 'CA' || name === 'Objectif' ? formatEur(v) : v} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="ca" fill={WINE_PALETTE[0]} radius={[6, 6, 0, 0]} name="CA" />
            <Bar dataKey="goal" fill="#e5e7eb" radius={[6, 6, 0, 0]} name="Objectif" />
          </BarChart>
        </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
