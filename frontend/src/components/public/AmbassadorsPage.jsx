import { useState, useEffect } from 'react';
import { MapPin, Users } from 'lucide-react';
import api from '../../services/api';
import { useSiteImage } from '../../contexts/SiteImagesContext';

// Contenu par défaut du header — repris à l'identique du H1/sous-titre qui étaient
// écrits en dur ici. Sert de fallback si la ligne 'ambassadeurs' est absente, inactive,
// ou si l'appel CMS échoue : le rendu reste alors exactement celui d'avant.
const DEFAULT_CONTENT = {
  hero: {
    title: 'Nos Ambassadeurs',
    subtitle: 'Retrouvez nos ambassadeurs dans toute la France',
  },
};

const AVATAR_COLORS = [
  '#7C3AED', '#2563EB', '#059669', '#D97706', '#DC2626',
  '#8B5CF6', '#0891B2', '#65A30D', '#EA580C', '#DB2777',
];

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0][0].toUpperCase();
}

function getAvatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function AmbassadorsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [regionFilter, setRegionFilter] = useState('');
  const [content, setContent] = useState(DEFAULT_CONTENT);
  const heroBg = useSiteImage('ambassadeurs_hero');

  // Contenu CMS du header. useEffect DISTINCT, à dépendances vides : le useEffect
  // ci-dessous dépend de regionFilter et se rejoue à chaque changement de filtre — y
  // fusionner cet appel referait un GET /site-pages/ambassadeurs à chaque clic.
  useEffect(() => {
    // (res) et non ({ data }) : ce composant a déjà un état nommé `data` (les
    // ambassadeurs), que la déstructuration masquerait ici.
    api.get('/site-pages/ambassadeurs')
      .then((res) => { if (res.data.content_json) setContent(res.data.content_json); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = {};
    if (regionFilter) params.region_id = regionFilter;
    setLoading(true);
    api.get('/ambassador/public', { params })
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [regionFilter]);

  return (
    <>
    <section
      className={`relative text-white py-16 ${heroBg?.image_url ? 'bg-wine-900' : 'bg-gradient-to-br from-wine-800 via-wine-700 to-wine-900'}`}
      style={heroBg?.image_url ? { backgroundImage: `url(${heroBg.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
    >
      {heroBg?.image_url && <div className="absolute inset-0 bg-black/45" aria-hidden="true" />}
      <div className="relative max-w-5xl mx-auto px-4 text-center">
        <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur rounded-full px-4 py-1.5 text-sm mb-6">
          <Users size={16} /> Le réseau
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold mb-4">{content.hero.title}</h1>
        <p className="text-lg text-wine-100 max-w-2xl mx-auto">{content.hero.subtitle}</p>
      </div>
    </section>

    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-gray-400" />
          <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm">
            <option value="">Toutes les regions</option>
            {data?.filters?.regions?.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" /></div>
      ) : !data?.ambassadors?.length ? (
        <div className="text-center py-16 text-gray-400">Aucun ambassadeur pour ces filtres</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.ambassadors.map((a) => (
            <div key={a.id} className="bg-white rounded-2xl shadow-md overflow-hidden hover:shadow-lg transition-shadow">
              <div className="h-48 bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center">
                {a.photo_url ? (
                  <img src={a.photo_url} alt={a.name} className="w-full h-full object-cover" />
                ) : (
                  <div
                    className="w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl font-bold shadow-md"
                    style={{ backgroundColor: getAvatarColor(a.name) }}
                  >
                    {getInitials(a.name)}
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-gray-900">{a.name}</h3>
                  {a.tier && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: a.tier.color + '22', color: a.tier.color }}>
                      {a.tier.label}
                    </span>
                  )}
                </div>
                {a.region && (
                  <p className="text-sm text-gray-500 flex items-center gap-1 mb-2"><MapPin size={12} /> {a.region}</p>
                )}
                {a.bio && <p className="text-sm text-gray-600 line-clamp-3">{a.bio}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    </>
  );
}
