import { Package, CheckCircle, Truck, Clock, XCircle, AlertTriangle } from 'lucide-react';

const STATUS_CONFIG = {
  pending_payment: { label: 'En attente de paiement', color: 'bg-amber-100 text-amber-700', step: 0 },
  submitted: { label: 'Confirmee', color: 'bg-blue-100 text-blue-700', step: 1 },
  validated: { label: 'Validee', color: 'bg-blue-100 text-blue-700', step: 2 },
  preparing: { label: 'En preparation', color: 'bg-indigo-100 text-indigo-700', step: 3 },
  shipped: { label: 'Expediee', color: 'bg-purple-100 text-purple-700', step: 4 },
  delivered: { label: 'Livree', color: 'bg-green-100 text-green-700', step: 5 },
  cancelled: { label: 'Annulee', color: 'bg-red-100 text-red-700', step: -1 },
  payment_failed: { label: 'Paiement echoue', color: 'bg-red-100 text-red-700', step: -1 },
};

const STEPS = [
  { label: 'Confirmee', icon: CheckCircle },
  { label: 'Validee', icon: CheckCircle },
  { label: 'En preparation', icon: Package },
  { label: 'Expediee', icon: Truck },
  { label: 'Livree', icon: CheckCircle },
];

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function ProgressTimeline({ status }) {
  const cfg = STATUS_CONFIG[status];
  if (!cfg || cfg.step <= 0) return null;

  const currentStep = cfg.step - 1; // 0-indexed in STEPS array

  return (
    <div className="flex items-center gap-1 mt-3">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const done = i <= currentStep;
        const active = i === currentStep;
        return (
          <div key={i} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                done ? 'bg-wine-700 text-white' : 'bg-gray-200 text-gray-400'
              } ${active ? 'ring-2 ring-wine-300' : ''}`}>
                <Icon size={14} />
              </div>
              <span className={`text-[10px] mt-1 text-center leading-tight ${done ? 'text-wine-700 font-medium' : 'text-gray-400'}`}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 w-full mx-0.5 mt-[-12px] ${i < currentStep ? 'bg-wine-700' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function OrderTracker({ orders = [], showAmount = true, onOrderClick, showTimeline = false }) {
  if (orders.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Package size={32} className="mx-auto mb-2 text-gray-300" />
        <p className="text-sm">Aucune commande</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => {
        const cfg = STATUS_CONFIG[order.status] || {};
        const isCancelled = order.status === 'cancelled' || order.status === 'payment_failed';

        return (
          <div
            key={order.id}
            onClick={() => onOrderClick?.(order)}
            className={`border rounded-lg p-4 ${onOrderClick ? 'cursor-pointer hover:border-wine-300 hover:shadow-sm transition-all' : ''} ${
              isCancelled ? 'border-red-200 bg-red-50/30' : 'border-gray-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                  isCancelled ? 'bg-red-100 text-red-600' :
                  order.status === 'delivered' ? 'bg-green-100 text-green-600' :
                  'bg-wine-100 text-wine-700'
                }`}>
                  {isCancelled ? <XCircle size={18} /> :
                   order.status === 'delivered' ? <CheckCircle size={18} /> :
                   order.status === 'shipped' ? <Truck size={18} /> :
                   order.status === 'pending_payment' ? <AlertTriangle size={18} /> :
                   <Package size={18} />}
                </div>
                <div>
                  <p className="font-medium text-sm text-gray-900">
                    {order.ref || `#${order.id}`}
                    {order.customer_name && (
                      <span className="text-gray-500 font-normal ml-2">{order.customer_name}</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(order.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {order.total_items && ` — ${order.total_items} article${order.total_items > 1 ? 's' : ''}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {showAmount && order.total_ttc != null && (
                  <span className="font-semibold text-sm text-gray-900">
                    {parseFloat(order.total_ttc).toFixed(2)} EUR
                  </span>
                )}
                <StatusBadge status={order.status} />
              </div>
            </div>

            {showTimeline && <ProgressTimeline status={order.status} />}
          </div>
        );
      })}
    </div>
  );
}

export { StatusBadge, ProgressTimeline, STATUS_CONFIG };
