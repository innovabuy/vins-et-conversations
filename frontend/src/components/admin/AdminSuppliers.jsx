import { useState, useEffect, useCallback } from 'react';
import { suppliersAPI } from '../../services/api';
import { Factory, AlertTriangle, Package } from 'lucide-react';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);
const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

export default function AdminSuppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [restockAlerts, setRestockAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await suppliersAPI.list();
      setSuppliers(data.data || []);
      setRestockAlerts(data.restock_alerts || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Fournisseurs</h1>
        <span className="text-sm text-gray-500">{suppliers.length} fournisseur(s)</span>
      </div>

      {/* Restock Alerts */}
      {restockAlerts.length > 0 && (
        <div className="card border-l-4 border-l-orange-500 bg-orange-50">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-orange-600" />
            <h2 className="font-semibold text-orange-800">Alertes de r&eacute;approvisionnement</h2>
          </div>
          <div className="space-y-2">
            {restockAlerts.map((alert) => (
              <div key={alert.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Package size={14} className="text-orange-500" />
                  <span className="font-medium text-gray-800">{alert.name}</span>
                </div>
                <span className="text-orange-700 font-semibold">
                  Stock : {alert.current_stock} unit&eacute;(s)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suppliers Table */}
      <div className="card overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" />
          </div>
        ) : suppliers.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Factory size={40} className="mx-auto mb-3" />
            <p>Aucun fournisseur enregistr&eacute;</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-3 font-medium">Fournisseur</th>
                <th className="pb-3 font-medium">Produits</th>
                <th className="pb-3 font-medium">Alerte stock</th>
                <th className="pb-3 font-medium">Derni&egrave;re commande</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {suppliers.map((s) => {
                const hasAlert = restockAlerts.some((a) => a.supplier_id === s.id);
                return (
                  <tr key={s.id} className={`hover:bg-gray-50 ${hasAlert ? 'bg-orange-50/50' : ''}`}>
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-wine-50 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Factory size={16} className="text-wine-600" />
                        </div>
                        <div>
                          <p className="font-medium">{s.name}</p>
                          {s.region && <p className="text-xs text-gray-400">{s.region}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-1.5">
                        <Package size={14} className="text-gray-400" />
                        <span>{s.products_count ?? 0} r&eacute;f&eacute;rence(s)</span>
                      </div>
                    </td>
                    <td className="py-3">
                      {hasAlert ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                          <AlertTriangle size={12} />
                          Stock bas
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          OK
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-gray-500 text-xs">
                      {formatDate(s.last_order_date)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Reference Suppliers Info */}
      <div className="card">
        <h2 className="font-semibold text-gray-700 mb-3">Fournisseurs de r&eacute;f&eacute;rence</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {['Domaine de la Fruiti\u00e8re', 'Ch\u00e2teau Carillon', 'Cave de Vouvray'].map((name) => {
            const supplier = suppliers.find((s) => s.name === name);
            return (
              <div key={name} className="flex items-center gap-3 p-3 bg-wine-50 rounded-lg">
                <div className="w-8 h-8 bg-wine-100 rounded-full flex items-center justify-center">
                  <Factory size={14} className="text-wine-700" />
                </div>
                <div>
                  <p className="text-sm font-medium text-wine-800">{name}</p>
                  <p className="text-xs text-wine-600">
                    {supplier ? `${supplier.products_count ?? 0} produit(s)` : 'Non r\u00e9f\u00e9renc\u00e9'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
