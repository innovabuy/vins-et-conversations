import { useState, useEffect } from 'react';
import { dashboardAPI } from '../../services/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import {
  ShoppingCart, CreditCard, Truck, AlertTriangle, Package, Banknote,
  TrendingUp, Wine, Trophy, ArrowRight
} from 'lucide-react';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);

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
          { label: 'CA Total TTC', value: formatEur(data.kpis.caTTC), icon: TrendingUp, color: 'text-wine-700' },
          { label: 'CA HT', value: formatEur(data.kpis.caHT), icon: Wine, color: 'text-blue-600' },
          { label: 'Marge globale', value: formatEur(data.kpis.marge), icon: Trophy, color: 'text-green-600' },
          { label: 'Commandes', value: data.kpis.totalOrders, icon: ShoppingCart, color: 'text-purple-600' },
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
          <h3 className="font-semibold mb-4">🏆 Classement étudiants</h3>
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
          <h3 className="font-semibold mb-4">📊 CA par campagne</h3>
          <div className="h-[180px] md:h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.caByCampaign}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `${(v/1000).toFixed(0)}k€`} />
              <Tooltip formatter={(v) => formatEur(v)} />
              <Bar dataKey="ca" fill="#ab2049" radius={[4, 4, 0, 0]} name="CA" />
              <Bar dataKey="goal" fill="#e5e7eb" radius={[4, 4, 0, 0]} name="Objectif" />
            </BarChart>
          </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top produits */}
      <div className="card">
        <h3 className="font-semibold mb-4">🍷 Top 3 Produits</h3>
        <div className="grid sm:grid-cols-3 gap-4">
          {data.topProducts.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <span className="text-2xl">{['🥇', '🥈', '🥉'][i]}</span>
              <div>
                <p className="font-medium text-sm">{p.name}</p>
                <p className="text-xs text-gray-500">{p.total_qty} vendues · {formatEur(p.total_revenue)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
