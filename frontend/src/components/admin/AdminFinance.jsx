import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { marginsAPI } from '../../services/api';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Legend,
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { TrendingUp, DollarSign, BarChart3, Users, Wine, Truck, Building2, Filter, X, ChevronDown, ChevronUp } from 'lucide-react';
import { MULTI_PALETTE, WINE_PALETTE, axisStyle, gridStyle, PremiumTooltip, ChartGradient, chartAnimation, formatEur } from '../../utils/chartTheme';

const TABS = [
  { key: 'overview', label: 'Vue d\'ensemble', icon: BarChart3 },
  { key: 'products', label: 'Par vin', icon: Wine },
  { key: 'sellers', label: 'Par vendeur', icon: Users },
  { key: 'suppliers', label: 'Par fournisseur', icon: Truck },
  { key: 'campaigns', label: 'Par campagne', icon: Building2 },
];

function KPIGradient({ label, value, icon: Icon, gradient }) {
  return (
    <div className={`bg-gradient-to-br ${gradient} rounded-2xl p-5 text-white shadow-lg`}>
      <div className="flex items-center justify-between mb-3"><Icon size={22} className="opacity-80" /></div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm opacity-80 mt-1">{label}</p>
    </div>
  );
}

// ─── Filter Bar ─────────────────────────────────────
function FilterBar({ filters, setFilters, filterOptions }) {
  const [expanded, setExpanded] = useState(false);

  if (!filterOptions) return null;

  const activeCount = Object.values(filters).filter(Boolean).length;

  const clearAll = () => setFilters({
    campaign_id: '', seller_id: '', product_id: '', supplier_id: '',
    segment: '', class_group: '', date_from: '', date_to: '', source: '',
  });

  const clearOne = (key) => setFilters(prev => ({ ...prev, [key]: '' }));

  const filterLabels = {
    campaign_id: 'Campagne',
    seller_id: 'Vendeur',
    product_id: 'Produit',
    supplier_id: 'Fournisseur',
    segment: 'Segment',
    class_group: 'Classe',
    date_from: 'Du',
    date_to: 'Au',
    source: 'Source',
  };

  const getDisplayValue = (key, val) => {
    if (!val) return '';
    if (key === 'campaign_id') return filterOptions.campaigns?.find(c => c.id === val)?.name || val;
    if (key === 'seller_id') return filterOptions.sellers?.find(s => s.id === val)?.name || val;
    if (key === 'product_id') return filterOptions.products?.find(p => p.id === val)?.name || val;
    if (key === 'supplier_id') return filterOptions.suppliers?.find(s => s.id === val)?.name || val;
    if (key === 'segment') return filterOptions.segments?.find(s => s.name === val)?.label || val;
    if (key === 'source') return { campaign: 'Campagne', boutique_web: 'Boutique Web', ambassador_referral: 'Ambassadeur' }[val] || val;
    return val;
  };

  const sel = "input text-sm py-1.5";

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <Filter size={16} />
          Filtres
          {activeCount > 0 && (
            <span className="bg-wine-100 text-wine-700 text-xs px-2 py-0.5 rounded-full font-semibold">{activeCount}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <button onClick={clearAll} className="text-xs text-gray-500 hover:text-red-600 flex items-center gap-1">
              <X size={12} /> Tout effacer
            </button>
          )}
          <button onClick={() => setExpanded(!expanded)} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
            {expanded ? <><ChevronUp size={14} /> Moins</> : <><ChevronDown size={14} /> Plus de filtres</>}
          </button>
        </div>
      </div>

      {/* Row 1: always visible */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <select value={filters.campaign_id} onChange={e => setFilters(f => ({ ...f, campaign_id: e.target.value }))} className={sel}>
          <option value="">Toutes campagnes</option>
          {filterOptions.campaigns?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="flex gap-2">
          <input type="date" value={filters.date_from} onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))} className={sel + ' flex-1'} placeholder="Du" title="Date de debut" />
          <input type="date" value={filters.date_to} onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))} className={sel + ' flex-1'} placeholder="Au" title="Date de fin" />
        </div>
        <select value={filters.segment} onChange={e => setFilters(f => ({ ...f, segment: e.target.value }))} className={sel}>
          <option value="">Tous segments</option>
          {filterOptions.segments?.map(s => <option key={s.name} value={s.name}>{s.label}</option>)}
        </select>
        <select value={filters.source || ''} onChange={e => setFilters(f => ({ ...f, source: e.target.value }))} className={sel}>
          <option value="">Toutes sources</option>
          <option value="campaign">Campagne</option>
          <option value="boutique_web">Boutique Web</option>
          <option value="ambassador_referral">Ambassadeur</option>
        </select>
      </div>

      {/* Row 2: expandable */}
      {expanded && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <select value={filters.seller_id} onChange={e => setFilters(f => ({ ...f, seller_id: e.target.value }))} className={sel}>
            <option value="">Tous vendeurs</option>
            {filterOptions.sellers?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={filters.product_id} onChange={e => setFilters(f => ({ ...f, product_id: e.target.value }))} className={sel}>
            <option value="">Tous produits</option>
            {filterOptions.products?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={filters.supplier_id} onChange={e => setFilters(f => ({ ...f, supplier_id: e.target.value }))} className={sel}>
            <option value="">Tous fournisseurs</option>
            {filterOptions.suppliers?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={filters.class_group} onChange={e => setFilters(f => ({ ...f, class_group: e.target.value }))} className={sel}>
            <option value="">Toutes classes</option>
            {filterOptions.classes?.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}

      {/* Active filter badges */}
      {activeCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(filters).filter(([, v]) => v).map(([key, val]) => (
            <span key={key} className="inline-flex items-center gap-1 bg-wine-50 text-wine-700 text-xs px-2.5 py-1 rounded-full">
              {filterLabels[key]}: {getDisplayValue(key, val)}
              <button onClick={() => clearOne(key)} className="hover:text-red-600"><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab components ─────────────────────────────────
function OverviewTab({ data }) {
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPIGradient label="Ventes TTC" value={formatEur(data.sales.total_ttc)} icon={TrendingUp} gradient="from-wine-700 to-wine-900" />
        <KPIGradient label="Achats (cout)" value={formatEur(data.purchases.total_cost)} icon={DollarSign} gradient="from-blue-500 to-blue-700" />
        <KPIGradient label="Marge brute" value={formatEur(data.margin)} icon={BarChart3} gradient="from-emerald-500 to-emerald-700" />
        <KPIGradient label="Taux de marge" value={`${data.margin_pct}%`} icon={TrendingUp} gradient="from-purple-500 to-purple-700" />
      </div>

      {/* P&L chart */}
      {data.pl?.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-4">Compte de resultat mensuel</h3>
          <div className="h-[250px] md:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.pl} {...chartAnimation}>
                <defs>
                  <ChartGradient id="plCA" color="#7f1d1d" opacity={0.3} />
                  <ChartGradient id="plMargin" color="#059669" opacity={0.3} />
                </defs>
                <CartesianGrid {...gridStyle} />
                <XAxis dataKey="month" {...axisStyle} />
                <YAxis {...axisStyle} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <PremiumTooltip formatter={formatEur} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="ca_ht" stroke="#7f1d1d" fill="url(#plCA)" strokeWidth={2} name="CA HT" />
                <Area type="monotone" dataKey="cost" stroke="#dc2626" fill="none" strokeWidth={2} strokeDasharray="5 5" name="Achats" />
                <Area type="monotone" dataKey="margin" stroke="#059669" fill="url(#plMargin)" strokeWidth={2.5} name="Marge" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* By Campaign */}
      {data.byCampaign?.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-4">CA par campagne</h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byCampaign} {...chartAnimation}>
                <CartesianGrid {...gridStyle} />
                <XAxis dataKey="name" {...axisStyle} />
                <YAxis {...axisStyle} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <PremiumTooltip formatter={formatEur} />
                <Bar dataKey="ca_ttc" fill={WINE_PALETTE[0]} radius={[6, 6, 0, 0]} name="CA TTC" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductsTab({ data }) {
  if (!data) return null;
  const marginColor = (pct) => pct >= 40 ? 'bg-green-100 text-green-700' : pct >= 25 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';

  const pieData = data.bySegment?.map((s) => ({
    name: s.segment_label || s.segment,
    value: Math.max(0, s.margin_net || s.margin_brut || 0),
  })) || [];

  const barData = data.byProduct?.slice(0, 10).map(p => ({
    name: p.name.length > 14 ? p.name.substring(0, 14) + '...' : p.name,
    margin: p.margin,
  })) || [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPIGradient label="CA HT" value={formatEur(data.global.ca_ht)} icon={DollarSign} gradient="from-blue-500 to-blue-700" />
        <KPIGradient label="Marge" value={formatEur(data.global.margin)} icon={TrendingUp} gradient="from-emerald-500 to-emerald-700" />
        <KPIGradient label="Taux de marge" value={`${data.global.margin_pct}%`} icon={BarChart3} gradient="from-purple-500 to-purple-700" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {pieData.length > 0 && (
          <div className="card">
            <h3 className="font-semibold mb-4">Marge par segment</h3>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={45} paddingAngle={3} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} {...chartAnimation}>
                    {pieData.map((_, i) => <Cell key={i} fill={MULTI_PALETTE[i % MULTI_PALETTE.length]} />)}
                  </Pie>
                  <PremiumTooltip formatter={(v) => formatEur(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        {barData.length > 0 && (
          <div className="card">
            <h3 className="font-semibold mb-4">Top 10 marges</h3>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical" {...chartAnimation}>
                  <CartesianGrid {...gridStyle} />
                  <XAxis type="number" {...axisStyle} tickFormatter={(v) => `${v}€`} />
                  <YAxis dataKey="name" type="category" width={110} {...axisStyle} />
                  <PremiumTooltip formatter={formatEur} />
                  <Bar dataKey="margin" fill="#059669" radius={[0, 6, 6, 0]} name="Marge" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Product table */}
      <div className="card">
        <h3 className="font-semibold mb-4">Detail par produit</h3>
        <div className="md:hidden space-y-3">
          {data.byProduct.map((p) => (
            <div key={p.id || p.name} className="p-3 bg-gray-50 rounded-xl">
              <div className="flex justify-between">
                <span className="font-medium text-sm">{p.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${marginColor(p.margin_pct || 0)}`}>{p.margin_pct || 0}%</span>
              </div>
              <div className="flex gap-4 mt-1 text-sm text-gray-500">
                <span>{p.qty_sold} btl</span>
                <span>CA {formatEur(p.ca_ht)}</span>
                <span className="font-bold text-gray-900">Marge {formatEur(p.margin)}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-gray-500">
              <th className="py-2 px-2">Produit</th><th className="py-2 px-2 text-right">Qte</th><th className="py-2 px-2 text-right">CA HT</th><th className="py-2 px-2 text-right">Cout</th><th className="py-2 px-2 text-right">Marge</th><th className="py-2 px-2 text-right">%</th>
            </tr></thead>
            <tbody>
              {data.byProduct.map((p) => (
                <tr key={p.id || p.name} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-2 font-medium">{p.name}</td>
                  <td className="py-2 px-2 text-right">{p.qty_sold}</td>
                  <td className="py-2 px-2 text-right">{formatEur(p.ca_ht)}</td>
                  <td className="py-2 px-2 text-right text-gray-500">{p.cost ? formatEur(p.cost) : '—'}</td>
                  <td className="py-2 px-2 text-right font-bold">{formatEur(p.margin)}</td>
                  <td className="py-2 px-2 text-right"><span className={`text-xs px-2 py-0.5 rounded ${marginColor(p.margin_pct || 0)}`}>{p.margin_pct || 0}%</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SellersTab({ data }) {
  if (!data?.length) return <div className="text-center py-12 text-gray-400">Aucune donnee vendeur</div>;

  const barData = data.slice(0, 10).map(c => ({
    name: c.name.length > 14 ? c.name.substring(0, 14) + '...' : c.name,
    ca: c.ca_ttc,
    margin: c.margin,
  }));

  return (
    <div className="space-y-6">
      {barData.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-4">Top 10 vendeurs (CA TTC)</h3>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical" {...chartAnimation}>
                <CartesianGrid {...gridStyle} />
                <XAxis type="number" {...axisStyle} tickFormatter={(v) => `${v}€`} />
                <YAxis dataKey="name" type="category" width={110} {...axisStyle} />
                <PremiumTooltip formatter={formatEur} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="ca" fill={WINE_PALETTE[0]} radius={[0, 6, 6, 0]} name="CA TTC" />
                <Bar dataKey="margin" fill="#059669" radius={[0, 6, 6, 0]} name="Marge" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="font-semibold mb-4">Detail par vendeur</h3>
        <div className="md:hidden space-y-3">
          {data.map(c => (
            <div key={c.id} className="p-3 bg-gray-50 rounded-xl">
              <p className="font-medium text-sm">{c.name}</p>
              <p className="text-xs text-gray-500">{c.email} — {c.role}</p>
              <div className="flex gap-4 mt-1 text-sm">
                <span className="font-bold text-wine-700">{formatEur(c.ca_ttc)}</span>
                <span>{c.orders_count} cmd</span>
                <span>{c.qty} btl</span>
              </div>
            </div>
          ))}
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-gray-500">
              <th className="py-2 px-2">Vendeur</th><th className="py-2 px-2">Role</th><th className="py-2 px-2 text-right">Cmd</th><th className="py-2 px-2 text-right">Btl</th><th className="py-2 px-2 text-right">CA TTC</th><th className="py-2 px-2 text-right">Marge</th>
            </tr></thead>
            <tbody>
              {data.map(c => (
                <tr key={c.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-2"><p className="font-medium">{c.name}</p><p className="text-xs text-gray-400">{c.email}</p></td>
                  <td className="py-2 px-2"><span className="text-xs px-2 py-0.5 rounded-full bg-gray-100">{c.role}</span></td>
                  <td className="py-2 px-2 text-right">{c.orders_count}</td>
                  <td className="py-2 px-2 text-right">{c.qty}</td>
                  <td className="py-2 px-2 text-right font-bold text-wine-700">{formatEur(c.ca_ttc)}</td>
                  <td className="py-2 px-2 text-right font-bold text-green-700">{formatEur(c.margin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SuppliersTab({ data }) {
  if (!data?.length) return <div className="text-center py-12 text-gray-400">Aucune donnee fournisseur</div>;
  const marginColor = (pct) => pct >= 40 ? 'bg-green-100 text-green-700' : pct >= 25 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="font-semibold mb-4">Marge par fournisseur</h3>
        <div className="md:hidden space-y-3">
          {data.map(s => (
            <div key={s.supplier_id} className="p-3 bg-gray-50 rounded-xl">
              <div className="flex justify-between">
                <span className="font-medium text-sm">{s.supplier_name}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${marginColor(s.margin_pct)}`}>{s.margin_pct}%</span>
              </div>
              <div className="flex gap-4 mt-1 text-sm text-gray-500">
                <span>{s.products_count} vins</span>
                <span>CA {formatEur(s.ca_ht)}</span>
                <span className="font-bold text-green-700">Marge {formatEur(s.margin)}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-gray-500">
              <th className="py-2 px-2">Fournisseur</th><th className="py-2 px-2 text-right">Vins</th><th className="py-2 px-2 text-right">Btl</th><th className="py-2 px-2 text-right">CA HT</th><th className="py-2 px-2 text-right">Cout</th><th className="py-2 px-2 text-right">Marge</th><th className="py-2 px-2 text-right">%</th>
            </tr></thead>
            <tbody>
              {data.map(s => (
                <tr key={s.supplier_id} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-2 font-medium">{s.supplier_name}</td>
                  <td className="py-2 px-2 text-right">{s.products_count}</td>
                  <td className="py-2 px-2 text-right">{s.qty}</td>
                  <td className="py-2 px-2 text-right">{formatEur(s.ca_ht)}</td>
                  <td className="py-2 px-2 text-right text-gray-500">{formatEur(s.cost)}</td>
                  <td className="py-2 px-2 text-right font-bold text-green-700">{formatEur(s.margin)}</td>
                  <td className="py-2 px-2 text-right"><span className={`text-xs px-2 py-0.5 rounded ${marginColor(s.margin_pct)}`}>{s.margin_pct}%</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CampaignsFinanceTab({ data }) {
  if (!data?.length) return <div className="text-center py-12 text-gray-400">Aucune donnee campagne</div>;
  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="font-semibold mb-4">Performance par campagne</h3>
        <div className="md:hidden space-y-3">
          {data.map(c => (
            <div key={c.id} className="p-3 bg-gray-50 rounded-xl">
              <p className="font-medium text-sm">{c.name}</p>
              <p className="text-xs text-gray-500">{c.org_name}</p>
              <div className="flex gap-4 mt-1 text-sm">
                <span className="font-bold text-wine-700">{formatEur(c.ca_ttc)}</span>
                <span>{c.orders_count} cmd</span>
              </div>
            </div>
          ))}
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-gray-500">
              <th className="py-2 px-2">Campagne</th><th className="py-2 px-2">Organisation</th><th className="py-2 px-2 text-right">Commandes</th><th className="py-2 px-2 text-right">CA HT</th><th className="py-2 px-2 text-right">CA TTC</th>
            </tr></thead>
            <tbody>
              {data.map(c => (
                <tr key={c.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-2 font-medium">{c.name}</td>
                  <td className="py-2 px-2 text-gray-500">{c.org_name}</td>
                  <td className="py-2 px-2 text-right">{c.orders_count}</td>
                  <td className="py-2 px-2 text-right">{formatEur(c.ca_ht)}</td>
                  <td className="py-2 px-2 text-right font-bold text-wine-700">{formatEur(c.ca_ttc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────
export default function AdminFinance() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState('overview');
  const [tabData, setTabData] = useState({});
  const [loading, setLoading] = useState(true);
  const [filterOptions, setFilterOptions] = useState(null);

  // Init filters from URL params
  const [filters, setFilters] = useState(() => ({
    campaign_id: searchParams.get('campaign_id') || '',
    seller_id: searchParams.get('seller_id') || '',
    product_id: searchParams.get('product_id') || '',
    supplier_id: searchParams.get('supplier_id') || '',
    segment: searchParams.get('segment') || '',
    class_group: searchParams.get('class_group') || '',
    date_from: searchParams.get('date_from') || '',
    date_to: searchParams.get('date_to') || '',
    source: searchParams.get('source') || '',
  }));

  // Build clean params (remove empty values)
  const activeParams = useMemo(() => {
    const p = {};
    Object.entries(filters).forEach(([k, v]) => { if (v) p[k] = v; });
    return p;
  }, [filters]);

  // Load filter options on mount
  useEffect(() => {
    marginsAPI.filterOptions().then(r => setFilterOptions(r.data)).catch(() => {});
  }, []);

  // Load tab data whenever tab or filters change
  useEffect(() => {
    setLoading(true);
    const loadTab = async () => {
      try {
        if (tab === 'overview') {
          const r = await marginsAPI.overview(activeParams);
          setTabData(prev => ({ ...prev, overview: r.data }));
        } else if (tab === 'products') {
          const r = await marginsAPI.list(activeParams);
          setTabData(prev => ({ ...prev, products: r.data }));
        } else if (tab === 'sellers') {
          const r = await marginsAPI.byClient(activeParams);
          setTabData(prev => ({ ...prev, sellers: r.data.data }));
        } else if (tab === 'suppliers') {
          const r = await marginsAPI.bySupplier(activeParams);
          setTabData(prev => ({ ...prev, suppliers: r.data.data }));
        } else if (tab === 'campaigns') {
          const r = await marginsAPI.overview(activeParams);
          setTabData(prev => ({ ...prev, campaigns: r.data }));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadTab();
  }, [tab, activeParams]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pilotage economique</h1>
        <p className="text-sm text-gray-500 mt-1">Achats, ventes, marges et rentabilite</p>
      </div>

      {/* Filter Bar */}
      <FilterBar filters={filters} setFilters={setFilters} filterOptions={filterOptions} />

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              tab === key ? 'bg-white shadow text-wine-700' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" /></div>
      ) : (
        <>
          {tab === 'overview' && <OverviewTab data={tabData.overview} />}
          {tab === 'products' && <ProductsTab data={tabData.products} />}
          {tab === 'sellers' && <SellersTab data={tabData.sellers} />}
          {tab === 'suppliers' && <SuppliersTab data={tabData.suppliers} />}
          {tab === 'campaigns' && <CampaignsFinanceTab data={tabData.campaigns?.byCampaign} />}
        </>
      )}
    </div>
  );
}
