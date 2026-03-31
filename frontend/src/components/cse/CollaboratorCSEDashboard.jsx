import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { cseDashboardAPI } from '../../services/api';
import { Package, FileText, CreditCard, ChevronDown, ChevronUp, Truck, Clock, Check, AlertTriangle, LogOut } from 'lucide-react';
import CapNumerikCredit from '../shared/CapNumerikCredit';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);
const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const STATUS_LABELS = {
  submitted: { label: 'En attente', color: 'bg-yellow-100 text-yellow-800' },
  validated: { label: 'Validee', color: 'bg-green-100 text-green-800' },
  preparing: { label: 'En preparation', color: 'bg-blue-100 text-blue-800' },
  shipped: { label: 'Expediee', color: 'bg-purple-100 text-purple-800' },
  delivered: { label: 'Livree', color: 'bg-gray-200 text-gray-800' },
  pending: { label: 'En attente caution', color: 'bg-amber-100 text-amber-800' },
};

const PAYMENT_LABELS = {
  card: 'Carte', transfer: 'Virement', check: 'Cheque', cash: 'Especes', pending: 'A encaisser', deferred: 'Differe',
};

const BL_LABELS = {
  draft: 'BL brouillon', ready: 'BL pret', signed: 'BL signe',
};

const PAY_STATUS = {
  reconciled: { label: 'Rapproche', color: 'text-green-700' },
  pending: { label: 'En attente', color: 'text-amber-700' },
};

export default function CollaboratorCSEDashboard() {
  const { user, logout } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedOrder, setExpandedOrder] = useState(null);

  const campaignId = user?.campaigns?.[0]?.campaign_id;

  useEffect(() => {
    if (!campaignId) return;
    cseDashboardAPI.collaborator(campaignId)
      .then((res) => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [campaignId]);

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" /></div>;
  if (!data) return <p className="text-center py-12 text-gray-500">Aucune donnee disponible</p>;

  const { stats, orders, payments } = data;

  return (
    <div className="max-w-[700px] mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Mon espace CSE</h1>
          <p className="text-sm text-gray-500">{data.user?.name}</p>
        </div>
        <button onClick={logout} className="p-2 rounded-full hover:bg-gray-100 text-gray-500" title="Deconnexion">
          <LogOut size={18} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-4 border shadow-sm">
          <p className="text-xs text-gray-500">Commandes</p>
          <p className="text-xl font-bold text-gray-900">{stats.total_orders}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border shadow-sm">
          <p className="text-xs text-gray-500">Total TTC</p>
          <p className="text-xl font-bold text-wine-700">{formatEur(stats.total_ttc)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border shadow-sm">
          <p className="text-xs text-gray-500">Total HT</p>
          <p className="text-xl font-bold text-gray-700">{formatEur(stats.total_ht)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border shadow-sm">
          <p className="text-xs text-gray-500">En attente</p>
          <p className="text-xl font-bold text-amber-600">{stats.pending_orders}</p>
        </div>
      </div>

      {/* VAT Breakdown */}
      {stats.vat_breakdown?.length > 0 && (
        <div className="bg-white rounded-xl p-4 border shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Ventilation TVA</h3>
          <div className="divide-y text-sm">
            {stats.vat_breakdown.map((v) => (
              <div key={v.rate} className="flex justify-between py-1.5">
                <span className="text-gray-600">TVA {v.rate}%</span>
                <span className="text-gray-900">HT {formatEur(v.amount_ht)} — TTC {formatEur(v.amount_ttc)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Orders */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Package size={16} /> Mes commandes ({orders.length})
        </h2>
        {orders.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-6">Aucune commande</p>
        ) : (
          <div className="space-y-2">
            {orders.map((o) => {
              const st = STATUS_LABELS[o.status] || { label: o.status, color: 'bg-gray-100 text-gray-700' };
              const expanded = expandedOrder === o.id;
              return (
                <div key={o.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                  <button
                    onClick={() => setExpandedOrder(expanded ? null : o.id)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-gray-500">{o.reference}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span>
                        {o.delivery_note && (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <Truck size={12} /> {BL_LABELS[o.delivery_note.status] || o.delivery_note.status}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        <span>{formatDate(o.created_at)}</span>
                        <span>{PAYMENT_LABELS[o.payment_method] || o.payment_method}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{formatEur(o.total_ttc)}</span>
                      {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                    </div>
                  </button>
                  {expanded && (
                    <div className="border-t px-4 pb-4 pt-2">
                      <div className="text-xs text-gray-500 mb-2">
                        HT : {formatEur(o.total_ht)} — TTC : {formatEur(o.total_ttc)}
                      </div>
                      <div className="divide-y">
                        {o.items.map((item, i) => (
                          <div key={i} className="flex justify-between py-2 text-sm">
                            <div>
                              <p className="font-medium text-gray-800">{item.product_name}</p>
                              <p className="text-xs text-gray-500">
                                {item.qty} x {formatEur(item.unit_price_ttc)} — TVA {item.vat_rate}%
                              </p>
                            </div>
                            <span className="font-semibold text-sm self-center">{formatEur(item.line_ttc)}</span>
                          </div>
                        ))}
                      </div>
                      {o.delivery_note?.signed_at && (
                        <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                          <Check size={12} /> Signe le {formatDate(o.delivery_note.signed_at)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Payments */}
      {payments.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <CreditCard size={16} /> Paiements ({payments.length})
          </h2>
          <div className="bg-white rounded-xl border shadow-sm divide-y">
            {payments.map((p) => {
              const ps = PAY_STATUS[p.status] || { label: p.status, color: 'text-gray-600' };
              return (
                <div key={p.id} className="flex items-center justify-between p-3 text-sm">
                  <div>
                    <p className="font-medium text-gray-800">{formatEur(p.amount)}</p>
                    <p className="text-xs text-gray-500">{formatDate(p.date)} — {p.method}</p>
                  </div>
                  <span className={`text-xs font-medium ${ps.color}`}>{ps.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <CapNumerikCredit />
    </div>
  );
}
