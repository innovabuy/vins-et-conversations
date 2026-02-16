import { useState, useEffect } from 'react';
import { siteImagesAPI } from '../../services/api';
import { Image, Upload, Save, Check, Eye, EyeOff, RefreshCw } from 'lucide-react';

const PAGE_LABELS = {
  accueil: 'Page d\'accueil',
  boutique: 'Boutique',
  contact: 'Contact',
  commun: 'Éléments communs',
};

const PAGE_ORDER = ['commun', 'accueil', 'boutique', 'contact'];

export default function SiteImages() {
  const [grouped, setGrouped] = useState({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(null);
  const [editingAlt, setEditingAlt] = useState({});
  const [savingAlt, setSavingAlt] = useState(null);
  const [savedAlt, setSavedAlt] = useState(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const { data } = await siteImagesAPI.list();
      setGrouped(data.data || data);
    } catch (err) {
      console.error('Failed to load site images:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (img, file) => {
    setUploading(img.id);
    try {
      const { data } = await siteImagesAPI.upload(img.id, file);
      // Update in state
      setGrouped(prev => {
        const next = { ...prev };
        for (const page of Object.keys(next)) {
          next[page] = next[page].map(i => i.id === img.id ? { ...i, ...data } : i);
        }
        return next;
      });
    } catch (err) {
      alert('Erreur upload: ' + (err.response?.data?.message || err.message));
    } finally {
      setUploading(null);
    }
  };

  const handleAltSave = async (img) => {
    setSavingAlt(img.id);
    try {
      await siteImagesAPI.update(img.id, { alt_text: editingAlt[img.id] ?? img.alt_text });
      setGrouped(prev => {
        const next = { ...prev };
        for (const page of Object.keys(next)) {
          next[page] = next[page].map(i => i.id === img.id ? { ...i, alt_text: editingAlt[img.id] ?? img.alt_text } : i);
        }
        return next;
      });
      setSavedAlt(img.id);
      setTimeout(() => setSavedAlt(null), 2000);
    } catch (err) {
      alert('Erreur: ' + (err.response?.data?.message || err.message));
    } finally {
      setSavingAlt(null);
    }
  };

  const handleToggleActive = async (img) => {
    try {
      const { data } = await siteImagesAPI.update(img.id, { active: !img.active });
      setGrouped(prev => {
        const next = { ...prev };
        for (const page of Object.keys(next)) {
          next[page] = next[page].map(i => i.id === img.id ? { ...i, ...data } : i);
        }
        return next;
      });
    } catch (err) {
      alert('Erreur: ' + (err.response?.data?.message || err.message));
    }
  };

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" />
    </div>
  );

  const pages = PAGE_ORDER.filter(p => grouped[p]?.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Image size={24} className="text-wine-700" />
            Images du site
          </h1>
          <p className="text-sm text-gray-500 mt-1">Gérez les images affichées sur le site public</p>
        </div>
        <button
          onClick={() => { setLoading(true); load(); }}
          className="flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
        >
          <RefreshCw size={16} /> Actualiser
        </button>
      </div>

      {pages.map(page => (
        <div key={page} className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800">{PAGE_LABELS[page] || page}</h2>
            <p className="text-xs text-gray-400">{grouped[page].length} emplacement(s)</p>
          </div>
          <div className="divide-y divide-gray-100">
            {grouped[page].map(img => (
              <div key={img.id} className="px-6 py-4 flex items-start gap-4">
                {/* Preview */}
                <div className="w-32 h-24 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center border">
                  {img.image_url ? (
                    img.slot?.includes('video') ? (
                      <video src={img.image_url} className="max-h-full max-w-full object-contain" muted />
                    ) : (
                      <img src={img.image_url} alt={img.alt_text || img.label} className="max-h-full max-w-full object-contain" />
                    )
                  ) : (
                    <div className="text-gray-300 text-xs text-center px-2">Aucune image</div>
                  )}
                </div>

                {/* Info + actions */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm text-gray-900">{img.label}</span>
                    <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full text-gray-500 font-mono">{img.slot}</span>
                    {!img.active && (
                      <span className="text-xs px-2 py-0.5 bg-red-50 text-red-600 rounded-full">Désactivé</span>
                    )}
                  </div>

                  {/* Alt text */}
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="text"
                      value={editingAlt[img.id] ?? img.alt_text ?? ''}
                      onChange={(e) => setEditingAlt(prev => ({ ...prev, [img.id]: e.target.value }))}
                      placeholder="Texte alternatif (alt)"
                      className="flex-1 text-sm border rounded-lg px-3 py-1.5"
                    />
                    <button
                      onClick={() => handleAltSave(img)}
                      disabled={savingAlt === img.id}
                      className="text-sm px-2 py-1.5 border rounded-lg hover:bg-gray-50 disabled:opacity-50"
                      title="Enregistrer le texte alt"
                    >
                      {savedAlt === img.id ? <Check size={14} className="text-green-600" /> : <Save size={14} />}
                    </button>
                  </div>

                  {img.updated_by_name && (
                    <p className="text-xs text-gray-400 mt-1">
                      Modifié par {img.updated_by_name} le {new Date(img.updated_at).toLocaleDateString('fr-FR')}
                    </p>
                  )}
                </div>

                {/* Upload + toggle */}
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <label className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg cursor-pointer transition-colors ${
                    uploading === img.id ? 'bg-gray-100 text-gray-400' : 'bg-wine-50 text-wine-700 hover:bg-wine-100'
                  }`}>
                    {uploading === img.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-wine-700" />
                    ) : (
                      <Upload size={16} />
                    )}
                    {uploading === img.id ? 'Upload...' : 'Changer'}
                    <input
                      type="file"
                      className="hidden"
                      accept={img.slot?.includes('video') ? 'video/mp4' : 'image/jpeg,image/png,image/webp,image/svg+xml'}
                      onChange={(e) => e.target.files[0] && handleUpload(img, e.target.files[0])}
                      disabled={uploading === img.id}
                    />
                  </label>
                  <button
                    onClick={() => handleToggleActive(img)}
                    className={`flex items-center gap-1 px-3 py-2 text-sm rounded-lg transition-colors ${
                      img.active ? 'text-gray-500 hover:bg-gray-100' : 'text-green-600 hover:bg-green-50'
                    }`}
                    title={img.active ? 'Désactiver' : 'Activer'}
                  >
                    {img.active ? <EyeOff size={16} /> : <Eye size={16} />}
                    {img.active ? 'Masquer' : 'Afficher'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
