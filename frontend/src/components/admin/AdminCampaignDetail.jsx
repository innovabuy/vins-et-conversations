import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { campaignsAPI, campaignResourcesAPI, deliveryNotesAPI, ordersAPI } from '../../services/api';
import {
  ArrowLeft, Users, ShoppingCart, Wine, TrendingUp, Calendar,
  Target, Package, BarChart3, Mail, CreditCard, ExternalLink,
  Copy, Check, Store, FileText, BookOpen, Plus, Trash2, Upload,
  FileDown, Video, Image, Link as LinkIcon, Download, UserPlus, Loader2, X,
  AlertTriangle,
} from 'lucide-react';
import { copyToClipboard } from '../../utils/copyToClipboard';
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
  { key: 'resources', label: 'Ressources', icon: BookOpen },
];

const RESOURCE_ICONS = { pdf: FileDown, video: Video, image: Image, document: FileText, link: LinkIcon };
const RESOURCE_COLORS = { pdf: 'bg-red-100 text-red-700', video: 'bg-purple-100 text-purple-700', image: 'bg-blue-100 text-blue-700', document: 'bg-orange-100 text-orange-700', link: 'bg-green-100 text-green-700' };
const RESOURCE_CATEGORIES = ['formation', 'argumentaire', 'fiche_produit', 'autre'];

function ResourcesTab({ campaignId }) {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', type: 'link', url: '', description: '', category: 'autre', visible_to_roles: ['student', 'bts'] });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState('');

  const loadResources = async () => {
    try {
      const { data } = await campaignResourcesAPI.adminList(campaignId);
      setResources(data.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadResources(); }, [campaignId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');
    setSaving(true);
    try {
      if (file && ['document', 'image', 'pdf'].includes(form.type)) {
        await campaignResourcesAPI.upload(file, {
          campaign_id: campaignId,
          title: form.title,
          description: form.description,
          visible_to_roles: JSON.stringify(form.visible_to_roles),
        });
      } else {
        await campaignResourcesAPI.create({
          campaign_id: campaignId,
          title: form.title,
          type: form.type,
          url: form.url,
          description: form.description,
          visible_to_roles: form.visible_to_roles,
        });
      }
      setShowForm(false);
      setForm({ title: '', type: 'link', url: '', description: '', category: 'autre', visible_to_roles: ['student', 'bts'] });
      setFile(null);
      loadResources();
    } catch (err) {
      setApiError(err.response?.data?.message || 'Erreur');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Supprimer cette ressource ?')) return;
    setApiError('');
    try {
      await campaignResourcesAPI.delete(id);
      loadResources();
    } catch (err) { setApiError('Erreur de suppression'); }
  };

  if (loading) return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" /></div>;

  return (
    <div className="space-y-4">
      {apiError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle size={16} className="shrink-0" />
          <span>{apiError}</span>
          <button onClick={() => setApiError('')} className="ml-auto text-red-400 hover:text-red-600"><X size={14} /></button>
        </div>
      )}

      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">{resources.length} ressource(s)</p>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-1 text-sm">
          <Plus size={16} /> Ajouter
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card space-y-3">
          <input type="text" placeholder="Titre *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" required />
          <div className="grid grid-cols-2 gap-3">
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="border rounded-lg px-3 py-2 text-sm">
              <option value="link">Lien externe</option>
              <option value="video">Video (URL)</option>
              <option value="document">Document (upload)</option>
              <option value="pdf">PDF (upload)</option>
              <option value="image">Image (upload)</option>
            </select>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="border rounded-lg px-3 py-2 text-sm">
              <option value="formation">Formation</option>
              <option value="argumentaire">Argumentaire</option>
              <option value="fiche_produit">Fiche produit</option>
              <option value="autre">Autre</option>
            </select>
          </div>
          {['link', 'video'].includes(form.type) ? (
            <input type="url" placeholder="URL *" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" required />
          ) : (
            <div>
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer bg-gray-100 hover:bg-gray-200 transition-colors">
                <Upload size={16} />
                {file ? file.name : 'Choisir un fichier'}
                <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
              </label>
              <p className="text-xs text-gray-400 mt-1">PDF, Word, Excel, images — max 10 Mo</p>
            </div>
          )}
          <textarea placeholder="Description (optionnel)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary text-sm">{saving ? 'Enregistrement...' : 'Enregistrer'}</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-sm">Annuler</button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {resources.map((r) => {
          const Icon = RESOURCE_ICONS[r.type] || FileText;
          const color = RESOURCE_COLORS[r.type] || 'bg-gray-100 text-gray-700';
          return (
            <div key={r.id} className="card flex items-center gap-3">
              <div className={`p-2 rounded-lg ${color}`}><Icon size={18} /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{r.title}</p>
                {r.description && <p className="text-xs text-gray-400 truncate">{r.description}</p>}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded ${color}`}>{r.type}</span>
              {r.url && (
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700"><ExternalLink size={16} /></a>
              )}
              <button onClick={() => handleDelete(r.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
            </div>
          );
        })}
        {resources.length === 0 && <p className="text-center text-gray-400 py-6 text-sm">Aucune ressource pour cette campagne</p>}
      </div>
    </div>
  );
}

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

function GroupedBLModal({ participant, campaignId, onClose }) {
  const [orders, setOrders] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await ordersAPI.list({
          user_id: participant.id,
          campaign_id: campaignId,
          status: 'validated',
          limit: 200,
        });
        const list = data.data || [];
        setOrders(list);
        setSelected(new Set(list.map((o) => o.id)));
      } catch (err) {
        console.error('Error loading orders', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [participant.id, campaignId]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedTotal = orders.filter((o) => selected.has(o.id)).reduce((sum, o) => sum + parseFloat(o.total_ttc || 0), 0);

  const handleGenerate = () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const url = deliveryNotesAPI.groupedStudentPdf(participant.id, campaignId, ids);
    window.open(url + '&token=' + localStorage.getItem('accessToken'), '_blank');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-semibold text-gray-900">BL Groupe — {participant.name}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin text-wine-600" />
            </div>
          ) : orders.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">Aucune commande validee pour ce participant.</p>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-3">Selectionnez les commandes a inclure :</p>
              <div className="space-y-2">
                {orders.map((o) => (
                  <label key={o.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(o.id)}
                      onChange={() => toggle(o.id)}
                      className="rounded border-gray-300 text-wine-600 focus:ring-wine-500"
                    />
                    <span className="flex-1 text-sm font-medium">{o.ref}</span>
                    <span className="text-sm text-gray-500">{o.user_name || participant.name}</span>
                    <span className="text-sm font-semibold">{formatEur(parseFloat(o.total_ttc || 0))}</span>
                  </label>
                ))}
              </div>

              <div className="flex gap-3 mt-3">
                <button onClick={() => setSelected(new Set(orders.map((o) => o.id)))} className="text-xs text-wine-600 hover:underline">
                  Tout selectionner
                </button>
                <button onClick={() => setSelected(new Set())} className="text-xs text-gray-500 hover:underline">
                  Tout deselectionner
                </button>
              </div>
            </>
          )}
        </div>

        <div className="border-t px-5 py-4 flex items-center justify-between">
          <span className="text-sm font-semibold">
            Total selection : {formatEur(selectedTotal)}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">
              Annuler
            </button>
            <button
              onClick={handleGenerate}
              disabled={selected.size === 0}
              className="px-4 py-2 text-sm bg-wine-700 text-white rounded-lg hover:bg-wine-800 disabled:opacity-50"
            >
              Generer le BL
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const BL_STATUS_OPTIONS = [
  { value: 'draft', label: 'Brouillon' },
  { value: 'ready', label: 'Pret' },
  { value: 'shipped', label: 'Expedie' },
  { value: 'delivered', label: 'Livre' },
  { value: 'signed', label: 'Signe' },
];

function GroupedBLFilters({ campaignId, onClose }) {
  const [statuses, setStatuses] = useState(['ready']);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const toggleStatus = (val) => {
    setStatuses((prev) => prev.includes(val) ? prev.filter((s) => s !== val) : [...prev, val]);
  };

  const handleGenerate = () => {
    const filters = {};
    if (statuses.length > 0 && statuses.length < BL_STATUS_OPTIONS.length) filters.statuses = statuses;
    if (dateFrom) filters.dateFrom = dateFrom;
    if (dateTo) filters.dateTo = dateTo;
    const url = deliveryNotesAPI.groupedCampaignPdf(campaignId, filters);
    const sep = url.includes('?') ? '&' : '?';
    window.open(url + sep + 'token=' + localStorage.getItem('accessToken'), '_blank');
    onClose();
  };

  return (
    <div className="bg-gray-50 border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700">Filtres BL Groupes</h4>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
      </div>
      <div>
        <p className="text-xs font-medium text-gray-500 mb-1.5">Statut des BL</p>
        <div className="flex flex-wrap gap-2">
          {BL_STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => toggleStatus(opt.value)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                statuses.includes(opt.value)
                  ? 'bg-wine-600 text-white border-wine-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Date debut</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="w-full text-sm border rounded-lg px-3 py-2" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Date fin</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="w-full text-sm border rounded-lg px-3 py-2" />
        </div>
      </div>
      <button onClick={handleGenerate} className="w-full sm:w-auto px-5 py-2 bg-wine-700 text-white text-sm rounded-lg hover:bg-wine-800 flex items-center justify-center gap-2">
        <FileDown size={16} /> Generer le PDF
      </button>
    </div>
  );
}

function ParticipantsTab({ participants, campaignId }) {
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(null);
  const [blModal, setBlModal] = useState(null); // participant object or null
  const [groups, setGroups] = useState(() => Object.fromEntries(participants.map(p => [p.id, p.class_group || ''])));
  const [apiError, setApiError] = useState('');

  const handleGroupChange = async (e, participant) => {
    e.stopPropagation();
    const val = e.target.value || null;
    setGroups(g => ({ ...g, [participant.id]: val || '' }));
    setApiError('');
    try {
      await campaignsAPI.updateParticipantGroup(campaignId, participant.id, val);
    } catch (err) {
      setGroups(g => ({ ...g, [participant.id]: participant.class_group || '' }));
      setApiError('Erreur: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleExportExcel = async (e, participant) => {
    e.stopPropagation();
    setExporting(participant.id);
    setApiError('');
    try {
      const res = await campaignsAPI.participantExcel(campaignId, participant.id);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `ventes-${participant.name.replace(/\s+/g, '-').toLowerCase()}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setApiError('Erreur export: ' + (err.response?.data?.message || err.message));
    } finally {
      setExporting(null);
    }
  };

  const openBlModal = (e, participant) => {
    e.stopPropagation();
    setBlModal(participant);
  };

  return (
    <div className="space-y-4">
      {apiError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle size={16} className="shrink-0" />
          <span>{apiError}</span>
          <button onClick={() => setApiError('')} className="ml-auto text-red-400 hover:text-red-600"><X size={14} /></button>
        </div>
      )}

      <p className="text-sm text-gray-500">{participants.length} participant(s)</p>

      {blModal && (
        <GroupedBLModal participant={blModal} campaignId={campaignId} onClose={() => setBlModal(null)} />
      )}

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {participants.map((p) => (
          <div key={p.id} onClick={() => navigate(`/admin/orders?campaign_id=${campaignId}&user_id=${p.id}`)} className="card cursor-pointer hover:ring-1 hover:ring-wine-200 transition-all">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-sm">{p.name}</p>
                <p className="text-xs text-gray-500">{p.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100">{p.role}</span>
                <button onClick={(e) => handleExportExcel(e, p)} disabled={exporting === p.id} className="p-1 text-gray-400 hover:text-wine-600 disabled:opacity-50" title="Export Excel">
                  <Download size={14} />
                </button>
                <button onClick={(e) => openBlModal(e, p)} className="p-1 text-gray-400 hover:text-wine-600" title="BL Groupe">
                  <FileDown size={14} />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-2 text-sm">
              <span className="font-bold text-wine-700">{formatEur(parseFloat(p.ca))}</span>
              <span className="text-gray-500">{p.orders_count} cmd</span>
              <select value={groups[p.id] || ''} onChange={(e) => handleGroupChange(e, p)} onClick={e => e.stopPropagation()} className="text-xs border rounded px-1.5 py-0.5 bg-white">
                <option value="">—</option>
                <option value="GA">GA</option>
                <option value="GB">GB</option>
              </select>
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
              <th className="px-4 py-3 text-left">Role</th>
              <th className="px-4 py-3 text-center">Groupe</th>
              <th className="px-4 py-3 text-right">CA TTC</th>
              <th className="px-4 py-3 text-right">Commandes</th>
              <th className="px-4 py-3 text-left">Inscrit le</th>
              <th className="px-4 py-3 text-center">Export</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {participants.map((p, i) => (
              <tr key={p.id} onClick={() => navigate(`/admin/orders?campaign_id=${campaignId}&user_id=${p.id}`)} className="hover:bg-gray-50 cursor-pointer">
                <td className="px-4 py-3 font-medium text-gray-400">{i + 1}</td>
                <td className="px-4 py-3 font-medium text-wine-700">{p.name} <ExternalLink size={12} className="inline text-gray-300" /></td>
                <td className="px-4 py-3 text-gray-500">{p.email}</td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs bg-gray-100">{p.role}</span></td>
                <td className="px-4 py-3 text-center">
                  <select value={groups[p.id] || ''} onChange={(e) => handleGroupChange(e, p)} onClick={e => e.stopPropagation()} className="text-xs border rounded px-1.5 py-0.5 bg-white cursor-pointer">
                    <option value="">—</option>
                    <option value="GA">GA</option>
                    <option value="GB">GB</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-right font-bold text-wine-700">{formatEur(parseFloat(p.ca))}</td>
                <td className="px-4 py-3 text-right">{p.orders_count}</td>
                <td className="px-4 py-3 text-gray-500">{new Date(p.joined_at).toLocaleDateString('fr-FR')}</td>
                <td className="px-4 py-3 text-center">
                  <button onClick={(e) => handleExportExcel(e, p)} disabled={exporting === p.id} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-wine-600 disabled:opacity-50" title="Export Excel">
                    <Download size={14} />
                  </button>
                  <button onClick={(e) => openBlModal(e, p)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-wine-600" title="BL Groupe">
                    <FileDown size={14} />
                  </button>
                </td>
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

function JoinQRCode({ url }) {
  const [QRCode, setQRCode] = useState(null);
  useEffect(() => {
    import('react-qr-code').then((mod) => setQRCode(() => mod.default)).catch(() => {});
  }, []);
  if (!QRCode) return <div className="text-center py-4 text-sm text-gray-400">Chargement...</div>;
  return (
    <div className="mt-3 flex flex-col items-center gap-2 p-4 bg-white rounded-lg border border-emerald-200">
      <QRCode value={url} size={200} />
      <p className="text-xs text-gray-500 text-center break-all">{url}</p>
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
  const [joinLinkCopied, setJoinLinkCopied] = useState(false);
  const [showJoinQR, setShowJoinQR] = useState(false);
  const [exportingCampaign, setExportingCampaign] = useState(false);
  const [showBlFilters, setShowBlFilters] = useState(false);
  const [apiError, setApiError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleExportCampaignExcel = async () => {
    setApiError('');
    setExportingCampaign(true);
    try {
      const { data: blob } = await campaignsAPI.campaignExcel(id);
      const url = URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `ventes-campagne-${id.slice(0, 8)}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setApiError(err.response?.data?.message || "Erreur lors de l'export");
    } finally {
      setExportingCampaign(false);
    }
  };

  const handleSendReport = async () => {
    if (!confirm('Envoyer le rapport à tous les participants ?')) return;
    setApiError('');
    setSuccessMsg('');
    setSendingReport(true);
    try {
      const { data: result } = await campaignsAPI.sendReport(id);
      setSuccessMsg(`${result.sent} rapport(s) envoyé(s)`);
    } catch (err) {
      setApiError(err.response?.data?.message || "Erreur lors de l'envoi");
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
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCampaignExcel}
            disabled={exportingCampaign}
            className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50"
          >
            {exportingCampaign ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-wine-700" /> : <Download size={16} />}
            Export Excel
          </button>
          <button
            onClick={() => { const url = campaignsAPI.reportPdf(id); window.open(url + '?token=' + localStorage.getItem('accessToken'), '_blank'); }}
            className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm"
          >
            <FileText size={16} /> Rapport PDF
          </button>
          <button
            onClick={() => setShowBlFilters((v) => !v)}
            className={`flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm ${showBlFilters ? 'bg-wine-50 border-wine-300' : ''}`}
          >
            <FileDown size={16} /> BL Groupes
          </button>
          <button
            onClick={handleSendReport}
            disabled={sendingReport}
            className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50"
          >
            {sendingReport ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-wine-700" /> : <Mail size={16} />}
            Envoyer rapports
          </button>
        </div>

        {/* BL Groupes — Filter Panel */}
        {showBlFilters && <GroupedBLFilters campaignId={id} onClose={() => setShowBlFilters(false)} />}

        {campaign.start_date && (
          <div className="text-right text-sm text-gray-500 hidden sm:block">
            <div className="flex items-center gap-1"><Calendar size={14} /> {new Date(campaign.start_date).toLocaleDateString('fr-FR')} → {campaign.end_date ? new Date(campaign.end_date).toLocaleDateString('fr-FR') : '…'}</div>
          </div>
        )}
      </div>

      {apiError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle size={16} className="shrink-0" />
          <span>{apiError}</span>
          <button onClick={() => setApiError('')} className="ml-auto text-red-400 hover:text-red-600"><X size={14} /></button>
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          <Check size={16} className="shrink-0" />
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg('')} className="ml-auto text-green-400 hover:text-green-600"><X size={14} /></button>
        </div>
      )}

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
        <button onClick={() => navigate(`/admin/finance?campaign_id=${id}`)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">
          <TrendingUp size={14} /> Pilotage eco.
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
              copyToClipboard(`${window.location.origin}/boutique?campagne=${id}`).then(() => {
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2000);
              }).catch(() => {});
            }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-wine-700 text-white hover:bg-wine-800"
          >
            {linkCopied ? <Check size={14} /> : <Copy size={14} />}
            {linkCopied ? 'Copié' : 'Copier'}
          </button>
        </div>
        <p className="text-xs text-wine-600 mt-1.5">Partagez ce lien pour afficher uniquement les vins de cette campagne dans la boutique.</p>
      </div>

      {/* Join campaign link */}
      <div className="card bg-emerald-50 border border-emerald-200">
        <div className="flex items-center gap-2 mb-2">
          <UserPlus size={18} className="text-emerald-700" />
          <h3 className="text-sm font-semibold text-emerald-800">Lien d'inscription campagne</h3>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={`${window.location.origin}/join-campaign/${id}`}
            className="flex-1 text-sm bg-white border border-emerald-200 rounded-lg px-3 py-2 text-gray-700"
          />
          <button
            onClick={() => {
              copyToClipboard(`${window.location.origin}/join-campaign/${id}`).then(() => {
                setJoinLinkCopied(true);
                setTimeout(() => setJoinLinkCopied(false), 2000);
              }).catch(() => {});
            }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-emerald-700 text-white hover:bg-emerald-800"
          >
            {joinLinkCopied ? <Check size={14} /> : <Copy size={14} />}
            {joinLinkCopied ? 'Copié' : 'Copier'}
          </button>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => setShowJoinQR(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border ${showJoinQR ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}
          >
            QR Code
          </button>
          <p className="text-xs text-emerald-600">Les participants scannent ce QR code ou ouvrent ce lien pour s'inscrire.</p>
        </div>
        {showJoinQR && <JoinQRCode url={`${window.location.origin}/join-campaign/${id}`} />}
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
      {tab === 'resources' && <ResourcesTab campaignId={id} />}
    </div>
  );
}
