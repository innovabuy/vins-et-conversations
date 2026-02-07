import { useState, useEffect } from 'react';
import { auditLogAPI } from '../../services/api';
import { Shield, ChevronDown, ChevronUp, X } from 'lucide-react';

export default function AdminAuditLog() {
  const [entries, setEntries] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [entities, setEntities] = useState([]);
  const [filters, setFilters] = useState({ entity: '', action: '', start: '', end: '', page: 1 });
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState(null);

  const load = () => {
    setLoading(true);
    const params = { page: filters.page, limit: 30 };
    if (filters.entity) params.entity = filters.entity;
    if (filters.action) params.action = filters.action;
    if (filters.start) params.start = filters.start;
    if (filters.end) params.end = filters.end;
    auditLogAPI.list(params)
      .then((res) => {
        setEntries(res.data.data || []);
        setPagination(res.data.pagination || { total: 0, page: 1, pages: 1 });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    auditLogAPI.entities().then((res) => setEntities(res.data.data || [])).catch(() => {});
    load();
  }, []);

  useEffect(() => { load(); }, [filters]);

  const DiffModal = ({ entry, onClose }) => {
    if (!entry) return null;
    const before = entry.before || {};
    const after = entry.after || {};
    const allKeys = [...new Set([...Object.keys(before), ...Object.keys(after)])];

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-lg">Diff — {entry.action}</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
          </div>
          <div className="text-sm mb-2 text-gray-500">
            {entry.user_name} ({entry.user_email}) — {new Date(entry.created_at).toLocaleString('fr-FR')}
          </div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left p-2 border">Champ</th>
                <th className="text-left p-2 border">Avant</th>
                <th className="text-left p-2 border">Apres</th>
              </tr>
            </thead>
            <tbody>
              {allKeys.map((key) => {
                const bVal = JSON.stringify(before[key] ?? '');
                const aVal = JSON.stringify(after[key] ?? '');
                const changed = bVal !== aVal;
                return (
                  <tr key={key} className={changed ? 'bg-yellow-50' : ''}>
                    <td className="p-2 border font-mono text-xs">{key}</td>
                    <td className={`p-2 border text-xs ${changed ? 'text-red-600' : ''}`}>{bVal}</td>
                    <td className={`p-2 border text-xs ${changed ? 'text-green-600' : ''}`}>{aVal}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {entry.ip_address && <div className="mt-3 text-xs text-gray-400">IP: {entry.ip_address}</div>}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield size={24} className="text-wine-700" />
        <h1 className="text-2xl font-bold text-gray-900">Journal d'audit</h1>
        <span className="text-sm text-gray-500 ml-auto">{pagination.total} entrees</span>
      </div>

      {/* Filters */}
      <div className="card flex gap-3 flex-wrap">
        <select className="input text-sm" value={filters.entity} onChange={(e) => setFilters({ ...filters, entity: e.target.value, page: 1 })}>
          <option value="">Toutes entites</option>
          {entities.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <input
          type="text"
          className="input text-sm"
          placeholder="Action..."
          value={filters.action}
          onChange={(e) => setFilters({ ...filters, action: e.target.value, page: 1 })}
        />
        <input type="date" className="input text-sm" value={filters.start} onChange={(e) => setFilters({ ...filters, start: e.target.value, page: 1 })} />
        <input type="date" className="input text-sm" value={filters.end} onChange={(e) => setFilters({ ...filters, end: e.target.value, page: 1 })} />
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left bg-gray-50">
                <th className="p-3">Date</th>
                <th className="p-3">Utilisateur</th>
                <th className="p-3">Action</th>
                <th className="p-3">Entite</th>
                <th className="p-3">ID</th>
                <th className="p-3">IP</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 whitespace-nowrap text-xs">{new Date(e.created_at).toLocaleString('fr-FR')}</td>
                  <td className="p-3">{e.user_name || '-'}</td>
                  <td className="p-3 font-mono text-xs">{e.action}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">{e.entity}</span>
                  </td>
                  <td className="p-3 font-mono text-xs">{e.entity_id ? e.entity_id.slice(0, 8) + '...' : '-'}</td>
                  <td className="p-3 text-xs text-gray-400">{e.ip_address || '-'}</td>
                  <td className="p-3">
                    <button className="text-wine-700 hover:underline text-xs" onClick={() => setSelectedEntry(e)}>Diff</button>
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-gray-400">Aucune entree</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            className="btn btn-secondary text-sm"
            disabled={filters.page <= 1}
            onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
          >Precedent</button>
          <span className="py-2 px-4 text-sm">Page {pagination.page} / {pagination.pages}</span>
          <button
            className="btn btn-secondary text-sm"
            disabled={filters.page >= pagination.pages}
            onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
          >Suivant</button>
        </div>
      )}

      {selectedEntry && <DiffModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />}
    </div>
  );
}
