// ─── Chart Theme — Vins & Conversations ───────────────
// Premium wine-inspired chart styling with gradients, animations, custom tooltips

export const WINE_PALETTE = [
  '#7f1d1d', '#991b1b', '#b91c1c', '#dc2626',
  '#ef4444', '#f87171', '#fca5a5', '#fecaca',
];

export const MULTI_PALETTE = [
  '#7f1d1d', // wine dark
  '#2563eb', // blue
  '#059669', // emerald
  '#d97706', // amber
  '#7c3aed', // violet
  '#db2777', // pink
  '#0891b2', // cyan
  '#65a30d', // lime
];

export const GRADIENT_DEFS = {
  wine: { id: 'gradWine', top: '#7f1d1d', bottom: '#7f1d1d' },
  blue: { id: 'gradBlue', top: '#2563eb', bottom: '#2563eb' },
  emerald: { id: 'gradEmerald', top: '#059669', bottom: '#059669' },
  violet: { id: 'gradViolet', top: '#7c3aed', bottom: '#7c3aed' },
};

// Shared axis props
export const axisStyle = {
  tick: { fontSize: 11, fill: '#6b7280' },
  axisLine: { stroke: '#e5e7eb' },
  tickLine: false,
};

export const gridStyle = {
  strokeDasharray: '3 3',
  stroke: '#f3f4f6',
};

// Gradient definitions component (use inside <defs>)
export function ChartGradient({ id, color, opacity = 0.3 }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%" stopColor={color} stopOpacity={opacity} />
      <stop offset="95%" stopColor={color} stopOpacity={0.02} />
    </linearGradient>
  );
}

// Premium custom tooltip
export function PremiumTooltip({ active, payload, label, formatter, suffix }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl px-4 py-3 shadow-xl">
      <p className="text-xs font-medium text-gray-500 mb-1.5">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-600">{entry.name}:</span>
          <span className="font-bold text-gray-900">
            {formatter ? formatter(entry.value, entry.name) : entry.value}{suffix || ''}
          </span>
        </div>
      ))}
    </div>
  );
}

// Animation settings
export const chartAnimation = {
  animationDuration: 800,
  animationEasing: 'ease-out',
};

// Format helpers
export const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0);
export const formatK = (v) => `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k€`;
export const formatPct = (v) => `${v}%`;
