import { useState, useEffect, useMemo } from 'react';
import { shippingAPI } from '../../services/api';
import { Truck, Search, ChevronDown, ChevronUp, RefreshCw, Save, AlertTriangle } from 'lucide-react';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);

export default function AdminShipping() {
  const [zones, setZones] = useState([]);
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedZone, setExpandedZone] = useState(null);
  const [editingZone, setEditingZone] = useState(null);
  const [editingRate, setEditingRate] = useState(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState('zones');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [zonesRes, ratesRes] = await Promise.all([
        shippingAPI.zones(),
        shippingAPI.rates({}),
      ]);
      setZones(zonesRes.data.data || []);
      setRates(ratesRes.data.data || []);
    } catch (err) {
      setMessage('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  const filteredZones = useMemo(() => {
    if (!search) return zones;
    const s = search.toLowerCase();
    return zones.filter(
      (z) =>
        z.dept_code.includes(s) ||
        z.dept_name.toLowerCase().includes(s) ||
        z.difficulty.toLowerCase().includes(s)
    );
  }, [zones, search]);

  const ratesForZone = (zoneId) => rates.filter((r) => r.zone_id === zoneId);

  const handleSaveZone = async (zone) => {
    setSaving(true);
    try {
      await shippingAPI.updateZone(zone.id, {
        seasonal_eligible: zone.seasonal_eligible,
        surcharge_corse: zone.surcharge_corse,
        surcharge_seasonal_pct: zone.surcharge_seasonal_pct,
        active: zone.active,
      });
      setEditingZone(null);
      setMessage('Zone mise à jour');
      await loadData();
    } catch {
      setMessage('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const handleSaveRate = async (rate) => {
    setSaving(true);
    try {
      await shippingAPI.updateRate(rate.id, {
        price_ht: rate.price_ht,
        min_qty: rate.min_qty,
        max_qty: rate.max_qty,
        pricing_type: rate.pricing_type,
        valid_from: rate.valid_from,
        valid_to: rate.valid_to,
      });
      setEditingRate(null);
      setMessage('Tarif mis à jour');
      await loadData();
    } catch {
      setMessage('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const handleReimport = async () => {
    if (!confirm('Réimporter la grille écrasera les tarifs existants. Continuer ?')) return;
    setImporting(true);
    try {
      await shippingAPI.importGrid();
      setMessage('Grille réimportée avec succès');
      await loadData();
    } catch {
      setMessage('Erreur lors de la réimportation');
    } finally {
      setImporting(false);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  // Stats
  const activeZones = zones.filter((z) => z.active).length;
  const standardZones = zones.filter((z) => z.difficulty === 'standard').length;
  const totalRates = rates.length;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Truck className="text-wine-700" /> Transport
          </h1>
          <p className="text-sm text-gray-500 mt-1">Grille tarifaire Kuehne+Nagel — zones et tarifs</p>
        </div>
        <button
          onClick={handleReimport}
          disabled={importing}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <RefreshCw size={16} className={importing ? 'animate-spin' : ''} />
          {importing ? 'Réimportation...' : 'Réimporter grille'}
        </button>
      </div>

      {message && (
        <div className="bg-blue-50 text-blue-700 text-sm p-3 rounded-lg">{message}</div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 border">
          <p className="text-2xl font-bold text-wine-700">{activeZones}</p>
          <p className="text-xs text-gray-500">Zones actives</p>
        </div>
        <div className="bg-white rounded-xl p-4 border">
          <p className="text-2xl font-bold text-gray-900">{standardZones}</p>
          <p className="text-xs text-gray-500">Départements couverts</p>
        </div>
        <div className="bg-white rounded-xl p-4 border">
          <p className="text-2xl font-bold text-gray-900">{totalRates}</p>
          <p className="text-xs text-gray-500">Tarifs configurés</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => setTab('zones')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            tab === 'zones' ? 'bg-white text-wine-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Zones ({filteredZones.length})
        </button>
        <button
          onClick={() => setTab('rates')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            tab === 'rates' ? 'bg-white text-wine-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Grille tarifaire
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par département, code ou difficulté..."
          className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm"
        />
      </div>

      {tab === 'zones' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Code</th>
                <th className="px-4 py-3 text-left">Département</th>
                <th className="px-4 py-3 text-left">Difficulté</th>
                <th className="px-4 py-3 text-center">Saisonnier</th>
                <th className="px-4 py-3 text-right">Surc. Corse</th>
                <th className="px-4 py-3 text-center">Actif</th>
                <th className="px-4 py-3 text-center">Tarifs</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredZones.map((zone) => (
                <tr key={zone.id} className={`hover:bg-gray-50 ${!zone.active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-mono font-bold">{zone.dept_code}</td>
                  <td className="px-4 py-3">{zone.dept_name}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      zone.difficulty === 'standard' ? 'bg-green-100 text-green-700' :
                      zone.difficulty === 'Haute montagne' ? 'bg-orange-100 text-orange-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {zone.difficulty}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {zone.seasonal_eligible ? (
                      <span className="text-xs text-amber-600">+{parseFloat(zone.surcharge_seasonal_pct)}%</span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {parseFloat(zone.surcharge_corse) > 0 ? formatEur(zone.surcharge_corse) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`w-2 h-2 rounded-full inline-block ${zone.active ? 'bg-green-500' : 'bg-red-400'}`} />
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-500">
                    {ratesForZone(zone.id).length}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setExpandedZone(expandedZone === zone.id ? null : zone.id)}
                      className="text-gray-400 hover:text-gray-700"
                    >
                      {expandedZone === zone.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredZones.length === 0 && (
            <div className="p-8 text-center text-gray-500">Aucune zone trouvée</div>
          )}
        </div>
      )}

      {tab === 'rates' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Dept</th>
                  <th className="px-4 py-3 text-left">Zone</th>
                  <th className="px-4 py-3 text-center">Qté min</th>
                  <th className="px-4 py-3 text-center">Qté max</th>
                  <th className="px-4 py-3 text-right">Prix HT</th>
                  <th className="px-4 py-3 text-center">Type</th>
                  <th className="px-4 py-3 text-center">Validité</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rates
                  .filter((r) => {
                    if (!search) return true;
                    const s = search.toLowerCase();
                    return (
                      r.dept_code?.includes(s) ||
                      r.dept_name?.toLowerCase().includes(s) ||
                      r.difficulty?.toLowerCase().includes(s)
                    );
                  })
                  .slice(0, 100)
                  .map((rate) => (
                    <tr key={rate.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono font-bold text-xs">{rate.dept_code}</td>
                      <td className="px-4 py-2 text-xs">{rate.dept_name}</td>
                      <td className="px-4 py-2 text-center">{rate.min_qty}</td>
                      <td className="px-4 py-2 text-center">{rate.max_qty}</td>
                      <td className="px-4 py-2 text-right font-mono">
                        {editingRate === rate.id ? (
                          <input
                            type="number"
                            step="0.01"
                            defaultValue={rate.price_ht}
                            className="w-20 border rounded px-1 text-right text-xs"
                            onBlur={(e) => {
                              handleSaveRate({ ...rate, price_ht: parseFloat(e.target.value) });
                            }}
                          />
                        ) : (
                          <span>{parseFloat(rate.price_ht).toFixed(4)} €</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          rate.pricing_type === 'forfait' ? 'bg-purple-100 text-purple-700' : 'bg-cyan-100 text-cyan-700'
                        }`}>
                          {rate.pricing_type}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center text-xs text-gray-500">
                        {rate.valid_from?.slice(0, 10)} → {rate.valid_to?.slice(0, 10)}
                      </td>
                      <td className="px-4 py-2">
                        <button
                          onClick={() => setEditingRate(editingRate === rate.id ? null : rate.id)}
                          className="text-xs text-wine-600 hover:text-wine-800"
                        >
                          {editingRate === rate.id ? 'Annuler' : 'Modifier'}
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {rates.length > 100 && (
            <div className="p-3 bg-gray-50 text-center text-xs text-gray-500 flex items-center justify-center gap-1">
              <AlertTriangle size={12} />
              Affichage limité à 100 tarifs. Utilisez la recherche pour filtrer.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
