import { useState, useEffect } from 'react';
import { freeBottlesAPI, campaignsAPI } from '../../services/api';
import { Gift, Check, Award } from 'lucide-react';

export default function AdminFreeBottles() {
  const [campaignId, setCampaignId] = useState('');
  const [campaigns, setCampaigns] = useState([]);
  const [pending, setPending] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState({});
  const [ambassadors, setAmbassadors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState({});
  const [msg, setMsg] = useState(null);

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
      const students = pendingRes.data?.data || [];
      const prods = pendingRes.data?.products || [];
      setPending(students);
      setProducts(prods);
      setAmbassadors(ambaRes.data?.data || []);
      // Pre-select cheapest product (first in list, sorted by purchase_price asc)
      if (prods.length > 0) {
        const cheapest = prods[0].id;
        const defaults = {};
        students.forEach((s) => { defaults[s.user_id] = cheapest; });
        setSelectedProduct(defaults);
      } else {
        setSelectedProduct({});
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
    try {
      await freeBottlesAPI.record({ user_id: userId, campaign_id: campaignId, product_id: productId });
      setMsg({ type: 'success', text: 'Bouteille gratuite enregistrée' });
      loadPending(campaignId);
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Erreur' });
    }
  };

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
                      <button
                        onClick={() => handleRecord(p.user_id)}
                        disabled={p.available <= 0 || !selectedProduct[p.user_id]}
                        className="text-xs bg-wine-50 text-wine-700 px-3 py-1.5 rounded-lg hover:bg-wine-100 disabled:opacity-50"
                        title="Enregistrer comme récupérée"
                      >
                        <Check size={14} className="inline mr-1" />
                        Enregistrer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
