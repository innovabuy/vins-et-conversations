import { useState, useEffect } from 'react';
import { FileText, Save, RotateCcw, Eye, EyeOff, ChevronRight, ChevronDown } from 'lucide-react';
import api from '../../services/api';

const KNOWN_SLUGS = [
  { slug: 'prestations-cse', label: 'Prestation CSE' },
  { slug: 'prestations-ecoles', label: 'Prestation Écoles' },
  { slug: 'prestations-repas', label: 'Prestation Repas & Soirées' },
  { slug: 'a-propos', label: 'À Propos' },
  { slug: 'equipe', label: 'L\'Équipe' },
  { slug: 'faq', label: 'FAQ' },
  { slug: 'avis', label: 'Avis' },
  { slug: 'partenaires', label: 'Partenaires' },
  { slug: 'coffrets', label: 'Coffrets' },
];

export default function SitePagesAdmin() {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editSlug, setEditSlug] = useState(null);
  const [editData, setEditData] = useState({ title: '', content_json: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const fetchPages = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/site-pages');
      setPages(data);
    } catch {
      setPages([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPages(); }, []);

  const mergedPages = KNOWN_SLUGS.map((ks) => {
    const existing = pages.find((p) => p.slug === ks.slug);
    return {
      slug: ks.slug,
      label: ks.label,
      title: existing?.title || ks.label,
      content_json: existing?.content_json || null,
      is_active: existing?.is_active ?? true,
      updated_at: existing?.updated_at || null,
      inDb: !!existing,
    };
  });

  const openEdit = (page) => {
    setEditSlug(page.slug);
    setEditData({
      title: page.title,
      content_json: page.content_json ? JSON.stringify(page.content_json, null, 2) : '',
    });
    setMessage(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      let parsedContent = null;
      if (editData.content_json.trim()) {
        parsedContent = JSON.parse(editData.content_json);
      }
      await api.put(`/admin/site-pages/${editSlug}`, {
        title: editData.title,
        content_json: parsedContent,
      });
      setMessage({ type: 'success', text: 'Page enregistrée avec succès.' });
      fetchPages();
    } catch (err) {
      if (err instanceof SyntaxError) {
        setMessage({ type: 'error', text: 'JSON invalide. Vérifiez la syntaxe.' });
      } else {
        setMessage({ type: 'error', text: err.response?.data?.message || 'Erreur lors de la sauvegarde.' });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      await api.put(`/admin/site-pages/${editSlug}`, {
        title: editData.title,
        content_json: null,
      });
      setEditData((prev) => ({ ...prev, content_json: '' }));
      setMessage({ type: 'success', text: 'Contenu réinitialisé (le site affichera le contenu par défaut).' });
      fetchPages();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Erreur.' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (slug) => {
    try {
      await api.post(`/admin/site-pages/${slug}/toggle`);
      fetchPages();
    } catch {
      setMessage({ type: 'error', text: 'Erreur lors du changement de statut.' });
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText size={24} className="text-wine-700" /> Pages vitrine
          </h1>
          <p className="text-sm text-gray-500 mt-1">Gérez le contenu des pages publiques du site.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {mergedPages.map((page) => (
            <div key={page.slug}>
              <div
                className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => editSlug === page.slug ? setEditSlug(null) : openEdit(page)}
              >
                <div className="flex items-center gap-3">
                  {editSlug === page.slug ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                  <div>
                    <span className="font-medium text-gray-900">{page.label}</span>
                    <span className="text-xs text-gray-400 ml-2">/{page.slug}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {page.updated_at && (
                    <span className="text-xs text-gray-400">
                      {new Date(page.updated_at).toLocaleDateString('fr-FR')}
                    </span>
                  )}
                  {page.content_json ? (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Personnalisé</span>
                  ) : (
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Par défaut</span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleToggle(page.slug); }}
                    className={`p-1.5 rounded-lg transition-colors ${page.is_active ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
                    title={page.is_active ? 'Page active — cliquer pour désactiver' : 'Page inactive — cliquer pour activer'}
                  >
                    {page.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                </div>
              </div>

              {editSlug === page.slug && (
                <div className="px-6 pb-6 bg-gray-50 border-t border-gray-100">
                  <div className="space-y-4 pt-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Titre de la page</label>
                      <input
                        type="text"
                        value={editData.title}
                        onChange={(e) => setEditData((prev) => ({ ...prev, title: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-wine-500 focus:border-wine-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Contenu JSON <span className="text-gray-400 font-normal">(laisser vide pour utiliser le contenu par défaut)</span>
                      </label>
                      <textarea
                        value={editData.content_json}
                        onChange={(e) => setEditData((prev) => ({ ...prev, content_json: e.target.value }))}
                        rows={12}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-wine-500 focus:border-wine-500"
                        placeholder='{"hero": {"title": "...", "subtitle": "..."}, "sections": [...], "cta": {"label": "...", "href": "/..."}}'
                      />
                    </div>

                    {message && (
                      <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {message.text}
                      </div>
                    )}

                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="inline-flex items-center gap-2 bg-wine-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-wine-800 disabled:opacity-50 transition-colors"
                      >
                        <Save size={16} /> {saving ? 'Enregistrement...' : 'Enregistrer'}
                      </button>
                      <button
                        onClick={handleReset}
                        disabled={saving}
                        className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 disabled:opacity-50 transition-colors"
                      >
                        <RotateCcw size={16} /> Réinitialiser au contenu par défaut
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
