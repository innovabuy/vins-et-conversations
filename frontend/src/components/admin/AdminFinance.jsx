import { useState, useEffect } from 'react';
import { marginsAPI, campaignsAPI } from '../../services/api';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, DollarSign, BarChart3 } from 'lucide-react';

const COLORS = ['#7C3AED', '#2563EB', '#059669', '#D97706', '#DC2626', '#6366F1'];

export default function AdminFinance() {
  const [data, setData] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [campaignId, setCampaignId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    campaignsAPI.list().then((res) => setCampaigns(res.data.data || [])).catch(() => {});
    loadMargins();
  }, []);

  useEffect(() => {
    loadMargins();
  }, [campaignId]);

  const loadMargins = async () => {
    setLoading(true);
    try {
      const res = campaignId
        ? await marginsAPI.byCampaign(campaignId)
        : await marginsAPI.list();
      setData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" /></div>;
  }

  if (!data) return null;

  const pieData = data.bySegment?.map((s, i) => ({
    name: s.segment_label || s.segment,
    value: Math.max(0, s.margin_net || s.margin_brut || 0),
  })) || [];

  const marginColor = (pct) => {
    if (pct >= 40) return 'bg-green-100 text-green-700';
    if (pct >= 25) return 'bg-amber-100 text-amber-700';
    return 'bg-red-100 text-red-700';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Finance & Marges</h1>
          <p className="text-sm text-gray-500 mt-1">Analyse des marges et rentabilité</p>
        </div>
        <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className="input-field">
          <option value="">Toutes campagnes</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg"><DollarSign size={20} className="text-blue-600" /></div>
            <div>
              <p className="text-xs text-gray-500">CA HT</p>
              <p className="text-xl font-bold">{data.global.ca_ht.toFixed(2)} EUR</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg"><TrendingUp size={20} className="text-green-600" /></div>
            <div>
              <p className="text-xs text-gray-500">Marge</p>
              <p className="text-xl font-bold">{data.global.margin.toFixed(2)} EUR</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-50 rounded-lg"><BarChart3 size={20} className="text-purple-600" /></div>
            <div>
              <p className="text-xs text-gray-500">Taux de marge</p>
              <p className="text-xl font-bold">{data.global.margin_pct}%</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Pie chart — margin by segment */}
        {pieData.length > 0 && (
          <div className="card">
            <h3 className="font-semibold mb-4">Marge par segment</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => `${v.toFixed(2)} EUR`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Segment table */}
        {data.bySegment && (
          <div className="card">
            <h3 className="font-semibold mb-4">Détail par segment</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2">Segment</th>
                  <th className="py-2">CA HT</th>
                  <th className="py-2">Commission</th>
                  <th className="py-2">Marge nette</th>
                </tr>
              </thead>
              <tbody>
                {data.bySegment.map((s) => (
                  <tr key={s.segment} className="border-b">
                    <td className="py-2 font-medium">{s.segment_label}</td>
                    <td className="py-2">{s.ca_ht.toFixed(2)}</td>
                    <td className="py-2">{s.commission > 0 ? `-${s.commission.toFixed(2)}` : '-'}</td>
                    <td className="py-2 font-medium">{s.margin_net.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cross table: products × segments */}
      {data.crossTable && data.segments && (
        <div className="card overflow-x-auto">
          <h3 className="font-semibold mb-4">Tableau croisé Produit x Segment</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 px-2">Produit</th>
                {data.segments.map((s) => <th key={s} className="py-2 px-2">{s}</th>)}
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.crossTable).map(([product, segments]) => (
                <tr key={product} className="border-b">
                  <td className="py-2 px-2 font-medium">{product}</td>
                  {data.segments.map((seg) => {
                    const val = segments[seg] || 0;
                    return (
                      <td key={seg} className="py-2 px-2">
                        <span className={`text-xs px-2 py-0.5 rounded ${val > 0 ? 'bg-green-50 text-green-700' : val < 0 ? 'bg-red-50 text-red-700' : 'text-gray-400'}`}>
                          {val !== 0 ? val.toFixed(2) : '-'}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Product margin table */}
      <div className="card mt-6">
        <h3 className="font-semibold mb-4">Marge par produit</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2 px-2">Produit</th>
              <th className="py-2 px-2">Qté</th>
              <th className="py-2 px-2">CA HT</th>
              <th className="py-2 px-2">Coût</th>
              <th className="py-2 px-2">Marge</th>
              <th className="py-2 px-2">%</th>
            </tr>
          </thead>
          <tbody>
            {data.byProduct.map((p) => (
              <tr key={p.id || p.name} className="border-b hover:bg-gray-50">
                <td className="py-2 px-2 font-medium">{p.name}</td>
                <td className="py-2 px-2">{p.qty_sold}</td>
                <td className="py-2 px-2">{p.ca_ht.toFixed(2)}</td>
                <td className="py-2 px-2">{p.cost?.toFixed(2) || '-'}</td>
                <td className="py-2 px-2 font-medium">{p.margin.toFixed(2)}</td>
                <td className="py-2 px-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${marginColor(p.margin_pct || 0)}`}>
                    {p.margin_pct || 0}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
