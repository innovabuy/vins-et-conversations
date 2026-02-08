import { useState, useEffect } from 'react';
import { dashboardAPI } from '../../services/api';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid } from 'recharts';
import {
  ShoppingCart, CreditCard, Truck, AlertTriangle, Package, Banknote,
  TrendingUp, Wine, Trophy, ArrowRight
} from 'lucide-react';
import { WINE_PALETTE, axisStyle, gridStyle, PremiumTooltip, ChartGradient, chartAnimation, formatEur } from '../../utils/chartTheme';

export default function AdminCockpit() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardAPI.adminCockpit()
      .then((res) => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" /></div>;
  if (!data) return <div className="text-center py-20 text-gray-500">Erreur de chargement</div>;

  const actionCards = [
    { label: 'Commandes à valider', value: data.actions.pendingOrders, icon: ShoppingCart, color: 'bg-blue-50 text-blue-700' },
    { label: 'Paiements reçus', value: formatEur(data.actions.unreconciledPayments), icon: CreditCard, color: 'bg-green-50 text-green-700' },
    { label: 'BL à préparer', value: data.actions.readyBL, icon: Truck, color: 'bg-purple-50 text-purple-700' },
    { label: 'Relances impayés', value: data.actions.unpaidOrders, icon: AlertTriangle, color: 'bg-red-50 text-red-700' },
    { label: 'Stock bas', value: data.actions.lowStock, icon: Package, color: 'bg-orange-50 text-orange-700' },
    { label: 'Espèces à rapprocher', value: formatEur(data.actions.cashToReconcile), icon: Banknote, color: 'bg-amber-50 text-amber-700' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Cockpit</h1>
        <span className="text-sm text-gray-500">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
      </div>

      {/* KPIs principaux */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'CA Total TTC', value: formatEur(data.kpis.caTTC), icon: TrendingUp, gradient: 'from-wine-700 to-wine-900' },
          { label: 'CA HT', value: formatEur(data.kpis.caHT), icon: Wine, gradient: 'from-blue-500 to-blue-700' },
          { label: 'Marge globale', value: formatEur(data.kpis.marge), icon: Trophy, gradient: 'from-emerald-500 to-emerald-700' },
          { label: 'Commandes', value: data.kpis.totalOrders, icon: ShoppingCart, gradient: 'from-purple-500 to-purple-700' },
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

      {/* Cartes d'action */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {actionCards.map((card) => (
          <button key={card.label} className={`${card.color} rounded-xl p-4 text-left hover:opacity-80 transition-opacity`}>
            <div className="flex items-start justify-between">
              <card.icon size={20} />
              <ArrowRight size={16} className="opacity-50" />
            </div>
            <p className="text-2xl font-bold mt-2">{card.value}</p>
            <p className="text-sm mt-1 opacity-80">{card.label}</p>
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top étudiants */}
        <div className="card">
          <h3 className="font-semibold mb-4">Classement étudiants</h3>
          <div className="space-y-2">
            {data.topStudents.map((s, i) => (
              <div key={s.user_id} className={`flex items-center gap-3 p-2 rounded-lg ${i < 3 ? 'bg-wine-50' : ''}`}>
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                  i === 0 ? 'bg-yellow-400 text-yellow-900' :
                  i === 1 ? 'bg-gray-300 text-gray-700' :
                  i === 2 ? 'bg-orange-300 text-orange-800' :
                  'bg-gray-100 text-gray-500'
                }`}>
                  {s.rank}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{s.name}</p>
                  <p className="text-xs text-gray-500">{s.class_group} · {s.orders_count} cmd</p>
                </div>
                <span className="font-semibold text-sm">{formatEur(s.ca)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CA par campagne */}
        <div className="card">
          <h3 className="font-semibold mb-4">CA par campagne</h3>
          <div className="h-[180px] md:h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.caByCampaign} {...chartAnimation}>
              <defs>
                <ChartGradient id="barWine" color="#7f1d1d" opacity={0.9} />
              </defs>
              <CartesianGrid {...gridStyle} />
              <XAxis dataKey="name" {...axisStyle} />
              <YAxis {...axisStyle} tickFormatter={(v) => `${(v/1000).toFixed(0)}k€`} />
              <PremiumTooltip formatter={formatEur} />
              <Bar dataKey="ca" fill={WINE_PALETTE[0]} radius={[6, 6, 0, 0]} name="CA" />
              <Bar dataKey="goal" fill="#e5e7eb" radius={[6, 6, 0, 0]} name="Objectif" />
            </BarChart>
          </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top produits */}
      <div className="card">
        <h3 className="font-semibold mb-4">Top 3 Produits</h3>
        <div className="grid sm:grid-cols-3 gap-4">
          {data.topProducts.map((p, i) => (
            <div key={p.id} className={`flex items-center gap-3 p-4 rounded-xl border ${
              i === 0 ? 'bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200' :
              i === 1 ? 'bg-gradient-to-r from-gray-50 to-slate-50 border-gray-200' :
              'bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200'
            }`}>
              <span className="text-3xl">{['🥇', '🥈', '🥉'][i]}</span>
              <div>
                <p className="font-semibold text-sm">{p.name}</p>
                <p className="text-xs text-gray-500">{p.total_qty} vendues</p>
                <p className="text-sm font-bold text-wine-700 mt-0.5">{formatEur(p.total_revenue)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
