import { useState, useEffect } from 'react';
import { freeBottlesAPI, campaignsAPI } from '../../services/api';
import { Gift, Check, Award, Clock, Download, ChevronLeft, ChevronRight } from 'lucide-react';

const formatDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export default function AdminFreeBottles() {
  const [tab, setTab] = useState('pending'); // 'pending' | 'history'
  const [campaignId, setCampaignId] = useState('');
  const [campaigns, setCampaigns] = useState([]);
  const [pending, setPending] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState({});
  const [selectedQty, setSelectedQty] = useState({});
  const [ambassadors, setAmbassadors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState({});
  const [msg, setMsg] = useState(null);

  // History state
  const [history, setHistory] = useState([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyCampaign, setHistoryCampaign] = useState('');
  const [historyStudent, setHistoryStudent] = useState('');
  const [students, setStudents] = useState([]);

  // Load campaigns on mount
  useEffect(() => {
    campaignsAPI.list().then((res) => {
      const camps = res.data?.data || res.data || [];
      setCampaigns(Array.isArray(camps) ? camps : []);
    });
  }, []);

  const loadPending = async (cid) => {
    if (!cid) return;
    setLoading(true);
    try {
      const [pendingRes, ambaRes] = await Promise.all([
        freeBottlesAPI.pending(cid),
        freeBottlesAPI.ambassadors(cid),
      ]);
      const studs = pendingRes.data?.data || [];
      const prods = pendingRes.data?.products || [];
      setPending(studs);
      setProducts(prods);
      setAmbassadors(ambaRes.data?.data || []);
      // Pre-select cheapest product + default qty=1
      if (prods.length > 0) {
        const cheapest = prods[0].id;
        const defaults = {};
        const qtyDefaults = {};
        studs.forEach((s) => { defaults[s.user_id] = cheapest; qtyDefaults[s.user_id] = 1; });
        setSelectedProduct(defaults);
        setSelectedQty(qtyDefaults);
      } else {
        setSelectedProduct({});
        setSelectedQty({});
      }
    } catch {
      setPending([]);
      setProducts([]);
      setSelectedProduct({});
      setAmbassadors([]);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async (page = 1) => {
    setHistoryLoading(true);
    try {
      const params = { page, limit: 50 };
      if (historyCampaign) params.campaign_id = historyCampaign;
      if (historyStudent) params.student_id = historyStudent;
      const res = await freeBottlesAPI.history(params);
      setHistory(res.data?.data || []);
      setHistoryTotal(res.data?.total || 0);
      setHistoryPage(res.data?.page || 1);

      // Build unique students list for filter dropdown
      if (!historyCampaign && !historyStudent) {
        const seen = {};
        const studs = [];
        (res.data?.data || []).forEach((h) => {
          if (h.student_id && !seen[h.student_id]) {
            seen[h.student_id] = true;
            studs.push({ id: h.student_id, name: h.student_name });
          }
        });
        if (studs.length > 0) setStudents((prev) => {
          const ids = new Set(prev.map((s) => s.id));
          return [...prev, ...studs.filter((s) => !ids.has(s.id))];
        });
      }
    } catch {
      setHistory([]);
      setHistoryTotal(0);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Load full student list when switching to history tab
  useEffect(() => {
    if (tab === 'history') {
      loadHistory(1);
      // Load all students for the filter (from all campaigns)
      freeBottlesAPI.history({ limit: 200 }).then((res) => {
        const seen = {};
        const studs = [];
        (res.data?.data || []).forEach((h) => {
          if (h.student_id && !seen[h.student_id]) {
            seen[h.student_id] = true;
            studs.push({ id: h.student_id, name: h.student_name });
          }
        });
        setStudents(studs);
      }).catch(() => {});
    }
  }, [tab]);

  // Reload history on filter change
  useEffect(() => {
    if (tab === 'history') loadHistory(1);
  }, [historyCampaign, historyStudent]);

  const handleCampaignChange = (cid) => {
    setCampaignId(cid);
    loadPending(cid);
  };

  const handleToggle = async (userId, enabled) => {
    setToggling((prev) => ({ ...prev, [userId]: true }));
    try {
      await freeBottlesAPI.toggle({ user_id: userId, campaign_id: campaignId, enabled });
      setMsg({ type: 'success', text: `12+1 ${enabled ? 'activé' : 'désactivé'}` });
      loadPending(campaignId);
    } catch {
      setMsg({ type: 'error', text: 'Erreur lors de la modification' });
    } finally {
      setToggling((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const handleRecord = async (userId) => {
    const productId = selectedProduct[userId];
    if (!productId) {
      setMsg({ type: 'error', text: 'Sélectionnez un produit' });
      return;
    }
    const qty = parseInt(selectedQty[userId] || 1, 10);
    if (!qty || qty < 1) {
      setMsg({ type: 'error', text: 'Quantité invalide' });
      return;
    }
    try {
      const res = await freeBottlesAPI.record({ user_id: userId, campaign_id: campaignId, product_id: productId, quantity: qty });
      const recorded = res.data?.recorded || qty;
      setMsg({ type: 'success', text: `${recorded} bouteille(s) gratuite(s) enregistrée(s)` });
      loadPending(campaignId);
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Erreur' });
    }
  };

  const handleExport = async () => {
    try {
      const params = {};
      if (historyCampaign) params.campaign_id = historyCampaign;
      if (historyStudent) params.student_id = historyStudent;
      const res = await freeBottlesAPI.historyExport(params);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `gratuites-12+1-${Date.now()}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setMsg({ type: 'error', text: 'Erreur lors de l\'export' });
    }
  };

  const totalPages = Math.ceil(historyTotal / 50);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Gift size={24} className="text-wine-600" />
          <h1 className="text-xl font-bold text-gray-800">Bouteilles gratuites (12+1)</h1>
        </div>
      </div>

      {msg && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${msg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {msg.text}
          <button onClick={() => setMsg(null)} className="float-right font-bold">x</button>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('pending')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'pending' ? 'bg-wine-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <Gift size={14} className="inline mr-1.5 -mt-0.5" />
          Attribution
        </button>
        <button
          onClick={() => setTab('history')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'history' ? 'bg-wine-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <Clock size={14} className="inline mr-1.5 -mt-0.5" />
          Historique des remises
        </button>
      </div>

      {/* ===== PENDING TAB ===== */}
      {tab === 'pending' && (
        <>
          {/* Campaign selector */}
          <div className="card mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Campagne</label>
            <select
              value={campaignId}
              onChange={(e) => handleCampaignChange(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Sélectionner une campagne</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {campaignId && (
            <>
              {/* Ambassadors toggle section */}
              {ambassadors.length > 0 && (
                <div className="card mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Award size={18} className="text-purple-600" />
                    <h2 className="font-semibold">Ambassadeurs — Programme 12+1</h2>
                  </div>
                  <div className="space-y-2">
                    {ambassadors.map((a) => (
                      <div key={a.user_id} className="flex items-center justify-between border-b pb-2">
                        <div>
                          <p className="font-medium text-sm">{a.user_name}</p>
                          <p className="text-xs text-gray-500">{a.user_email}</p>
                        </div>
                        <button
                          onClick={() => handleToggle(a.user_id, !a.free_bottle_enabled)}
                          disabled={toggling[a.user_id]}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            a.free_bottle_enabled ? 'bg-green-500' : 'bg-gray-300'
                          } ${toggling[a.user_id] ? 'opacity-50' : ''}`}
                          title={a.free_bottle_enabled ? 'Désactiver 12+1' : 'Activer 12+1'}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              a.free_bottle_enabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pending student list */}
              <div className="card">
                <h2 className="font-semibold mb-3">Étudiants avec bouteilles gratuites disponibles</h2>
                {loading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" />
                  </div>
                ) : pending.length === 0 ? (
                  <p className="text-gray-500 text-sm py-4">Aucun étudiant n'a de bouteilles gratuites en attente pour cette campagne.</p>
                ) : (
                  <div className="space-y-3">
                    {pending.map((p) => (
                      <div key={p.user_id} className="flex items-center justify-between border-b pb-3 gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm">{p.user_name}</p>
                          <p className="text-xs text-gray-500">{p.user_email}</p>
                          <p className="text-xs text-gray-600 mt-1">
                            {p.totalSold} vendues · {p.earned} gagnées · {p.used} récupérées · <span className="font-semibold text-wine-700">{p.available} disponible(s)</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <select
                            value={selectedProduct[p.user_id] || ''}
                            onChange={(e) => setSelectedProduct((prev) => ({ ...prev, [p.user_id]: e.target.value }))}
                            className="border rounded-lg px-2 py-1.5 text-xs max-w-[180px]"
                          >
                            <option value="">— Produit —</option>
                            {products.map((prod) => (
                              <option key={prod.id} value={prod.id}>{prod.name}</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min="1"
                            value={selectedQty[p.user_id] || 1}
                            onChange={(e) => setSelectedQty((prev) => ({ ...prev, [p.user_id]: e.target.value }))}
                            className="border rounded-lg px-2 py-1.5 text-xs w-16 text-center"
                            title="Quantité"
                          />
                          <button
                            onClick={() => handleRecord(p.user_id)}
                            disabled={p.available <= 0 || !selectedProduct[p.user_id]}
                            className="text-xs bg-wine-50 text-wine-700 px-3 py-1.5 rounded-lg hover:bg-wine-100 disabled:opacity-50"
                            title="Attribuer les gratuités"
                          >
                            <Check size={14} className="inline mr-1" />
                            Attribuer
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ===== HISTORY TAB ===== */}
      {tab === 'history' && (
        <div className="card">
          {/* Filters */}
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Campagne</label>
              <select
                value={historyCampaign}
                onChange={(e) => { setHistoryCampaign(e.target.value); setHistoryPage(1); }}
                className="border rounded-lg px-3 py-1.5 text-sm"
              >
                <option value="">Toutes</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Étudiant</label>
              <select
                value={historyStudent}
                onChange={(e) => { setHistoryStudent(e.target.value); setHistoryPage(1); }}
                className="border rounded-lg px-3 py-1.5 text-sm"
              >
                <option value="">Tous</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleExport}
              className="ml-auto text-xs bg-green-50 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-100 flex items-center gap-1"
            >
              <Download size={14} />
              Exporter Excel
            </button>
          </div>

          <p className="text-xs text-gray-500 mb-2">{historyTotal} remise(s) au total</p>

          {/* Table */}
          {historyLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-gray-500 text-sm py-4">Aucune gratuité enregistrée.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-gray-500 uppercase">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Étudiant</th>
                    <th className="py-2 pr-3">Campagne</th>
                    <th className="py-2 pr-3">Produit</th>
                    <th className="py-2 pr-3 text-center">Qté</th>
                    <th className="py-2">Enregistré par</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 pr-3 text-gray-600">{formatDate(h.date)}</td>
                      <td className="py-2 pr-3 font-medium">{h.student_name}</td>
                      <td className="py-2 pr-3 text-gray-600">{h.campaign_name}</td>
                      <td className="py-2 pr-3">{h.product_name}</td>
                      <td className="py-2 pr-3 text-center font-semibold text-wine-700">{h.quantity}</td>
                      <td className="py-2 text-gray-500 text-xs">{h.recorded_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-4">
              <button
                onClick={() => loadHistory(historyPage - 1)}
                disabled={historyPage <= 1}
                className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm text-gray-600">
                Page {historyPage} / {totalPages}
              </span>
              <button
                onClick={() => loadHistory(historyPage + 1)}
                disabled={historyPage >= totalPages}
                className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
