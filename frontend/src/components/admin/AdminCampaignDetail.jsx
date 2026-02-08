import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { campaignsAPI } from '../../services/api';
import {
  ArrowLeft, Users, ShoppingCart, Wine, TrendingUp, Calendar,
  Target, Package, BarChart3, Mail, CreditCard, ExternalLink,
  Copy, Check, Store,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  BarChart, Bar, PieChart, Pie, Cell,
} from 'recharts';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);

const STATUS_LABELS = {
  draft: { label: 'Brouillon', color: 'bg-gray-100 text-gray-700' },
  active: { label: 'Active', color: 'bg-green-100 text-green-700' },
  closed: { label: 'Clôturée', color: 'bg-red-100 text-red-700' },
};

const TABS = [
  { key: 'overview', label: 'Vue d\'ensemble', icon: BarChart3 },
  { key: 'participants', label: 'Participants', icon: Users },
  { key: 'products', label: 'Vins', icon: Wine },
  { key: 'classes', label: 'Classes', icon: Target },
];

const PIE_COLORS = ['#7f1d1d', '#991b1b', '#b91c1c', '#dc2626', '#ef4444', '#f87171', '#fca5a5', '#fecaca'];

function KPICard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="card">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-xl ${color}`}>
          <Icon size={20} className="text-white" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ data }) {
  const { campaign, dailyCA, products } = data;

  // Cumulative CA chart
  let cumul = 0;
  const cumulativeData = (dailyCA || []).map((d) => {
    cumul += parseFloat(d.ca);
    return { date: new Date(d.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }), ca: parseFloat(d.ca), cumul };
  });

  // Top 5 products for pie
  const top5 = (products || []).slice(0, 5).filter(p => parseFloat(p.ca_ttc) > 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard icon={TrendingUp} label="CA TTC" value={formatEur(campaign.ca_ttc)} color="bg-wine-700" />
        <KPICard icon={ShoppingCart} label="Commandes" value={campaign.orders_count} sub={`Panier moyen: ${formatEur(campaign.panier_moyen)}`} color="bg-blue-600" />
        <KPICard icon={Users} label="Participants" value={campaign.participants_count} color="bg-purple-600" />
        <KPICard icon={Package} label="Bouteilles" value={campaign.total_bottles} sub={campaign.days_remaining !== null ? `${campaign.days_remaining}j restants` : undefined} color="bg-green-600" />
      </div>

      {/* Progress bar */}
      {campaign.goal > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Progression objectif</span>
            <span className="text-sm font-bold text-wine-700">{campaign.progress}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all ${campaign.progress >= 100 ? 'bg-green-500' : 'bg-wine-600'}`}
              style={{ width: `${Math.min(100, campaign.progress)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>{formatEur(campaign.ca_ttc)}</span>
            <span>{formatEur(campaign.goal)}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CA Evolution */}
        {cumulativeData.length > 0 && (
          <div className="card">
            <h3 className="text-sm font-semibold mb-4">Evolution du CA</h3>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cumulativeData}>
                  <defs>
                    <linearGradient id="caGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7f1d1d" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#7f1d1d" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => formatEur(v)} />
                  <Area type="monotone" dataKey="cumul" stroke="#7f1d1d" fill="url(#caGrad)" name="CA cumulé" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Top products pie */}
        {top5.length > 0 && (
          <div className="card">
            <h3 className="text-sm font-semibold mb-4">Top vins (CA)</h3>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={top5} dataKey="ca_ttc" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name.substring(0, 12)} ${(percent * 100).toFixed(0)}%`}>
                    {top5.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => formatEur(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ParticipantsTab({ participants, campaignId }) {
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{participants.length} participant(s)</p>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {participants.map((p) => (
          <div key={p.id} onClick={() => navigate(`/admin/orders?campaign_id=${campaignId}&user_id=${p.id}`)} className="card cursor-pointer hover:ring-1 hover:ring-wine-200 transition-all">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-sm">{p.name}</p>
                <p className="text-xs text-gray-500">{p.email}</p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100">{p.role}</span>
            </div>
            <div className="flex gap-4 mt-2 text-sm">
              <span className="font-bold text-wine-700">{formatEur(parseFloat(p.ca))}</span>
              <span className="text-gray-500">{p.orders_count} cmd</span>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left">#</th>
              <th className="px-4 py-3 text-left">Nom</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Rôle</th>
              <th className="px-4 py-3 text-right">CA TTC</th>
              <th className="px-4 py-3 text-right">Commandes</th>
              <th className="px-4 py-3 text-left">Inscrit le</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {participants.map((p, i) => (
              <tr key={p.id} onClick={() => navigate(`/admin/orders?campaign_id=${campaignId}&user_id=${p.id}`)} className="hover:bg-gray-50 cursor-pointer">
                <td className="px-4 py-3 font-medium text-gray-400">{i + 1}</td>
                <td className="px-4 py-3 font-medium text-wine-700">{p.name} <ExternalLink size={12} className="inline text-gray-300" /></td>
                <td className="px-4 py-3 text-gray-500">{p.email}</td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs bg-gray-100">{p.role}</span></td>
                <td className="px-4 py-3 text-right font-bold text-wine-700">{formatEur(parseFloat(p.ca))}</td>
                <td className="px-4 py-3 text-right">{p.orders_count}</td>
                <td className="px-4 py-3 text-gray-500">{new Date(p.joined_at).toLocaleDateString('fr-FR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductsTab({ products }) {
  const barData = products.filter(p => parseInt(p.qty_sold, 10) > 0).map(p => ({
    name: p.name.length > 15 ? p.name.substring(0, 15) + '…' : p.name,
    fullName: p.name,
    qty: parseInt(p.qty_sold, 10),
    ca: parseFloat(p.ca_ttc),
  }));

  return (
    <div className="space-y-6">
      {barData.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold mb-4">Ventes par vin (bouteilles)</h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} />
                <Tooltip formatter={(v, name) => name === 'qty' ? `${v} btl` : formatEur(v)} />
                <Bar dataKey="qty" fill="#7f1d1d" radius={[0, 4, 4, 0]} name="Bouteilles" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {products.map((p) => (
          <div key={p.id} className="card">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-sm">{p.name}</p>
                <p className="text-xs text-gray-500">{p.region} — {p.category}</p>
              </div>
              {p.color && <span className="text-xs px-2 py-0.5 rounded-full bg-wine-50 text-wine-700">{p.color}</span>}
            </div>
            <div className="flex gap-4 mt-2 text-sm">
              <span className="font-bold text-wine-700">{formatEur(parseFloat(p.ca_ttc))}</span>
              <span className="text-gray-500">{p.qty_sold} btl</span>
              <span className="text-gray-400">{formatEur(parseFloat(p.custom_price || p.price_ttc))}/btl</span>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left">Vin</th>
              <th className="px-4 py-3 text-left">Couleur</th>
              <th className="px-4 py-3 text-left">Région</th>
              <th className="px-4 py-3 text-right">Prix TTC</th>
              <th className="px-4 py-3 text-right">Vendus</th>
              <th className="px-4 py-3 text-right">CA TTC</th>
              <th className="px-4 py-3 text-center">Actif</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {products.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs bg-wine-50 text-wine-700">{p.color || '—'}</span></td>
                <td className="px-4 py-3 text-gray-500">{p.region || '—'}</td>
                <td className="px-4 py-3 text-right">{formatEur(parseFloat(p.custom_price || p.price_ttc))}</td>
                <td className="px-4 py-3 text-right font-bold">{p.qty_sold}</td>
                <td className="px-4 py-3 text-right font-bold text-wine-700">{formatEur(parseFloat(p.ca_ttc))}</td>
                <td className="px-4 py-3 text-center">{p.cp_active ? '✓' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ClassesTab({ classes }) {
  const barData = classes.map(c => ({
    name: c.class_name,
    ca: parseFloat(c.ca),
    students: parseInt(c.students, 10),
  }));

  return (
    <div className="space-y-6">
      {barData.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold mb-4">CA par classe</h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}€`} />
                <Tooltip formatter={(v, name) => name === 'ca' ? formatEur(v) : v} />
                <Bar dataKey="ca" fill="#7f1d1d" radius={[4, 4, 0, 0]} name="CA TTC" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {classes.map((c, i) => (
          <div key={i} className="card">
            <p className="font-semibold">{c.class_name}</p>
            <div className="flex gap-4 mt-2 text-sm">
              <span className="font-bold text-wine-700">{formatEur(parseFloat(c.ca))}</span>
              <span className="text-gray-500">{c.students} élèves</span>
              <span className="text-gray-400">{c.orders_count} cmd</span>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left">Classe</th>
              <th className="px-4 py-3 text-right">Élèves</th>
              <th className="px-4 py-3 text-right">Commandes</th>
              <th className="px-4 py-3 text-right">CA TTC</th>
              <th className="px-4 py-3 text-right">CA / élève</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {classes.map((c, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{c.class_name}</td>
                <td className="px-4 py-3 text-right">{c.students}</td>
                <td className="px-4 py-3 text-right">{c.orders_count}</td>
                <td className="px-4 py-3 text-right font-bold text-wine-700">{formatEur(parseFloat(c.ca))}</td>
                <td className="px-4 py-3 text-right text-gray-500">{parseInt(c.students, 10) > 0 ? formatEur(parseFloat(c.ca) / parseInt(c.students, 10)) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminCampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [sendingReport, setSendingReport] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const handleSendReport = async () => {
    if (!confirm('Envoyer le rapport à tous les participants ?')) return;
    setSendingReport(true);
    try {
      const { data: result } = await campaignsAPI.sendReport(id);
      alert(`${result.sent} rapport(s) envoyé(s)`);
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur lors de l\'envoi');
    } finally {
      setSendingReport(false);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: resp } = await campaignsAPI.get(id);
        setData(resp);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" /></div>;
  if (!data) return <div className="text-center py-20 text-gray-400">Campagne introuvable</div>;

  const { campaign } = data;
  const status = STATUS_LABELS[campaign.status] || { label: campaign.status, color: 'bg-gray-100 text-gray-700' };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/admin/campaigns" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{campaign.name}</h1>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>{status.label}</span>
          </div>
          <p className="text-sm text-gray-500">{campaign.org_name} — {campaign.type_label}</p>
        </div>
        <button
          onClick={handleSendReport}
          disabled={sendingReport}
          className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50"
        >
          {sendingReport ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-wine-700" /> : <Mail size={16} />}
          Envoyer rapports
        </button>
        {campaign.start_date && (
          <div className="text-right text-sm text-gray-500 hidden sm:block">
            <div className="flex items-center gap-1"><Calendar size={14} /> {new Date(campaign.start_date).toLocaleDateString('fr-FR')} → {campaign.end_date ? new Date(campaign.end_date).toLocaleDateString('fr-FR') : '…'}</div>
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => navigate(`/admin/orders?campaign_id=${id}`)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">
          <ShoppingCart size={14} /> Commandes
        </button>
        <button onClick={() => navigate(`/admin/payments?campaign_id=${id}`)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">
          <CreditCard size={14} /> Paiements
        </button>
        <button onClick={() => navigate('/admin/stock')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">
          <Package size={14} /> Stock
        </button>
      </div>

      {/* Boutique link */}
      <div className="card bg-wine-50 border border-wine-200">
        <div className="flex items-center gap-2 mb-2">
          <Store size={18} className="text-wine-700" />
          <h3 className="text-sm font-semibold text-wine-800">Lien boutique campagne</h3>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={`${window.location.origin}/boutique?campagne=${id}`}
            className="flex-1 text-sm bg-white border border-wine-200 rounded-lg px-3 py-2 text-gray-700"
          />
          <button
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/boutique?campagne=${id}`);
              setLinkCopied(true);
              setTimeout(() => setLinkCopied(false), 2000);
            }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-wine-700 text-white hover:bg-wine-800"
          >
            {linkCopied ? <Check size={14} /> : <Copy size={14} />}
            {linkCopied ? 'Copié' : 'Copier'}
          </button>
        </div>
        <p className="text-xs text-wine-600 mt-1.5">Partagez ce lien pour afficher uniquement les vins de cette campagne dans la boutique.</p>
      </div>

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

      {/* Tab content */}
      {tab === 'overview' && <OverviewTab data={data} />}
      {tab === 'participants' && <ParticipantsTab participants={data.participants} campaignId={id} />}
      {tab === 'products' && <ProductsTab products={data.products} />}
      {tab === 'classes' && <ClassesTab classes={data.classes} />}
    </div>
  );
}
