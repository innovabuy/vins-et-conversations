import { useState, useEffect } from 'react';
import { exportsAPI, campaignsAPI } from '../../services/api';
import { Download, FileText, FileSpreadsheet, Calendar, Users, BarChart3 } from 'lucide-react';

function downloadBlob(res, filename) {
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

export default function AdminExports() {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [contactType, setContactType] = useState('');
  const [campaigns, setCampaigns] = useState([]);
  const [includeFree, setIncludeFree] = useState(false);
  const [loading, setLoading] = useState({});

  useEffect(() => {
    campaignsAPI.list().then((res) => setCampaigns(res.data.data || [])).catch(() => {});
  }, []);

  const handleExport = async (key, fn, filename) => {
    setLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await fn();
      downloadBlob(res, filename);
    } catch (err) {
      alert('Erreur export: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const exports = [
    {
      key: 'pennylane',
      title: 'Export Pennylane',
      description: 'Journal des ventes format Pennylane (CSV, comptes 411/707/44571)',
      icon: FileSpreadsheet,
      type: 'csv',
      needsDates: true,
      action: () => exportsAPI.pennylane(start, end),
      filename: 'pennylane-export.csv',
    },
    {
      key: 'sales',
      title: 'Journal des ventes',
      description: 'Détail par commande avec split TVA 20%/5.5% (CSV)',
      icon: FileSpreadsheet,
      type: 'csv',
      needsDates: true,
      action: () => exportsAPI.salesJournal(start, end),
      filename: 'journal-ventes.csv',
    },
    {
      key: 'commissions',
      title: 'Commissions',
      description: 'Commissions association par campagne (% CA HT configurable)',
      icon: FileSpreadsheet,
      type: 'csv',
      needsCampaign: true,
      action: () => exportsAPI.commissions(campaignId),
      filename: 'commissions.csv',
    },
    {
      key: 'stock',
      title: 'Valorisation stock',
      description: 'Stock actuel avec prix d\'achat et valorisation',
      icon: FileSpreadsheet,
      type: 'csv',
      action: () => exportsAPI.stock(),
      filename: 'stock.csv',
    },
    {
      key: 'delivery',
      title: 'Bons de livraison',
      description: 'Liste des BL avec détails (PDF)',
      icon: FileText,
      type: 'pdf',
      needsDates: true,
      action: () => exportsAPI.deliveryNotes(start, end),
      filename: 'bons-livraison.pdf',
    },
    {
      key: 'activity',
      title: 'Rapport d\'activité',
      description: 'CA, marges, top produits et vendeurs (PDF)',
      icon: FileText,
      type: 'pdf',
      needsDates: true,
      action: () => exportsAPI.activityReport(start, end),
      filename: 'rapport-activite.pdf',
    },
    {
      key: 'sales-by-contact',
      title: 'Ventes par contact',
      description: 'Récapitulatif et détail des ventes par contact (Excel)',
      icon: Users,
      type: 'xlsx',
      needsDates: true,
      action: () => exportsAPI.salesByContact(start, end, contactType),
      filename: 'ventes-par-contact.xlsx',
    },
    {
      key: 'ambassadors',
      title: 'Export Ambassadeurs',
      description: 'Profils, ventes, paliers et referral de chaque ambassadeur (Excel)',
      icon: Users,
      type: 'xlsx',
      needsDates: true,
      action: () => exportsAPI.ambassadors(start, end),
      filename: 'export-ambassadeurs.xlsx',
    },
    {
      key: 'campaign-pivot',
      title: 'Récap Campagne — Tableau croisé',
      description: 'Tableau pivot Étudiants × Produits : quantités, montants TTC/HT, récap par étudiant et produit (5 onglets Excel)',
      icon: BarChart3,
      type: 'xlsx',
      needsCampaign: true,
      hasIncludeFree: true,
      action: () => {
        if (!campaignId) { alert('Veuillez sélectionner une campagne'); return Promise.reject(new Error('no campaign')); }
        return exportsAPI.campaignPivot(campaignId, includeFree);
      },
      filename: 'recap-campagne-pivot.xlsx',
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Exports comptables</h1>
        <p className="text-sm text-gray-500 mt-1">Exports CSV et PDF pour la comptabilité</p>
      </div>

      {/* Date filters */}
      <div className="card mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-gray-400" />
            <label className="text-sm text-gray-600">Du</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="input-field" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Au</label>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="input-field" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Campagne</label>
            <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className="input-field">
              <option value="">Toutes</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Type contact</label>
            <select value={contactType} onChange={(e) => setContactType(e.target.value)} className="input-field">
              <option value="">Tous</option>
              <option value="particulier">Particulier</option>
              <option value="cse">CSE</option>
              <option value="ambassadeur">Ambassadeur</option>
              <option value="professionnel">Professionnel</option>
              <option value="etudiant">Etudiant</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={includeFree} onChange={(e) => setIncludeFree(e.target.checked)} className="rounded" />
            Inclure gratuites (12+1)
          </label>
        </div>
      </div>

      {/* Export cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {exports.map((exp) => (
          <div key={exp.key} className="card flex flex-col">
            <div className="flex items-start gap-3 mb-3">
              <div className={`p-2 rounded-lg ${exp.type === 'csv' ? 'bg-green-50 text-green-600' : exp.type === 'xlsx' ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'}`}>
                <exp.icon size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-sm">{exp.title}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{exp.description}</p>
              </div>
            </div>
            <div className="mt-auto">
              <span className="text-xs text-gray-400 uppercase">{exp.type}</span>
              <button
                onClick={() => handleExport(exp.key, exp.action, exp.filename)}
                disabled={loading[exp.key]}
                className="btn-primary w-full mt-2 flex items-center justify-center gap-2 text-sm py-1.5 disabled:opacity-50"
              >
                <Download size={14} />
                {loading[exp.key] ? 'Export...' : 'Télécharger'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
