import { useState, useEffect } from 'react';
import { dashboardAPI, formationAPI, campaignResourcesAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { GraduationCap, ShoppingCart, Trophy, BookOpen, Play, FileText, HelpCircle, CheckCircle, Clock, ExternalLink, Video, Image, FileDown } from 'lucide-react';

const TYPE_ICONS = {
  video: Play,
  quiz: HelpCircle,
  document: FileText,
  exercise: BookOpen,
};

const STATUS_STYLES = {
  not_started: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Non commencé' },
  in_progress: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'En cours' },
  completed: { bg: 'bg-green-100', text: 'text-green-700', label: 'Terminé' },
};

export default function BTSDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('ventes'); // 'ventes' | 'formation' | 'resources'
  const [updating, setUpdating] = useState(null);

  const campaignId = user?.campaigns?.[0]?.campaign_id;

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const [dashRes, resRes] = await Promise.allSettled([
        dashboardAPI.bts(),
        campaignId ? campaignResourcesAPI.list(campaignId) : Promise.resolve({ data: { data: [] } }),
      ]);
      if (dashRes.status === 'fulfilled') setData(dashRes.value.data);
      if (resRes.status === 'fulfilled') setResources(resRes.value.data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const updateProgress = async (moduleId, status) => {
    setUpdating(moduleId);
    try {
      await formationAPI.updateProgress(moduleId, { status });
      await loadDashboard();
    } catch (err) {
      console.error(err);
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" /></div>;
  }

  if (!data) return <p className="text-center text-gray-500 py-12">Impossible de charger le tableau de bord.</p>;

  const { formation } = data;

  return (
    <div className="space-y-6">
      {/* Header stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card text-center">
          <p className="text-2xl font-bold text-wine-700">{data.ca?.toFixed(0) || 0} EUR</p>
          <p className="text-xs text-gray-500">CA TTC</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-green-600">{data.bottlesSold || 0}</p>
          <p className="text-xs text-gray-500">Bouteilles vendues</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setTab('ventes')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === 'ventes' ? 'border-wine-700 text-wine-700' : 'border-transparent text-gray-500'}`}
        >
          <ShoppingCart size={16} className="inline mr-1" /> Ventes
        </button>
        <button
          onClick={() => setTab('formation')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === 'formation' ? 'border-wine-700 text-wine-700' : 'border-transparent text-gray-500'}`}
        >
          <GraduationCap size={16} className="inline mr-1" /> Formation ({formation?.pct || 0}%)
        </button>
        {resources.length > 0 && (
          <button
            onClick={() => setTab('resources')}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === 'resources' ? 'border-wine-700 text-wine-700' : 'border-transparent text-gray-500'}`}
          >
            <BookOpen size={16} className="inline mr-1" /> Ressources
          </button>
        )}
      </div>

      {/* Ventes tab */}
      {tab === 'ventes' && (
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <Trophy size={18} className="text-wine-700" />
              <h3 className="font-semibold">Classement</h3>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-lg font-bold">{data.position || '-'}</p>
                <p className="text-xs text-gray-500">Position</p>
              </div>
              <div>
                <p className="text-lg font-bold">{data.orderCount || 0}</p>
                <p className="text-xs text-gray-500">Commandes</p>
              </div>
              <div>
                <p className="text-lg font-bold">{data.freeBottles?.available || 0}</p>
                <p className="text-xs text-gray-500">Gratuites dispo</p>
              </div>
            </div>
          </div>

          {data.streak > 0 && (
            <div className="card bg-amber-50 border-amber-200">
              <p className="text-sm font-medium text-amber-800">Streak actuel : {data.streak} jours</p>
            </div>
          )}
        </div>
      )}

      {/* Formation tab */}
      {tab === 'formation' && formation && (
        <div className="space-y-4">
          {/* Progress bar */}
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Progression formation</span>
              <span className="text-sm text-gray-500">{formation.completed}/{formation.total} modules</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="h-3 rounded-full bg-wine-700 transition-all"
                style={{ width: `${formation.pct}%` }}
              />
            </div>
          </div>

          {/* Modules list */}
          <div className="space-y-3">
            {formation.modules.map((m) => {
              const Icon = TYPE_ICONS[m.type] || BookOpen;
              const style = STATUS_STYLES[m.status];
              const isUpdating = updating === m.id;

              return (
                <div key={m.id} className="card">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${style.bg}`}>
                      <Icon size={20} className={style.text} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-sm">{m.title}</h4>
                        <span className={`text-xs px-2 py-0.5 rounded ${style.bg} ${style.text}`}>
                          {style.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{m.description}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-gray-400">
                          <Clock size={12} className="inline mr-1" />{m.duration_minutes} min
                        </span>
                        {m.score > 0 && (
                          <span className="text-xs text-green-600">Score: {m.score}%</span>
                        )}
                      </div>
                      {/* Action buttons */}
                      <div className="flex gap-2 mt-2">
                        {m.status === 'not_started' && (
                          <button
                            onClick={() => updateProgress(m.id, 'in_progress')}
                            disabled={isUpdating}
                            className="text-xs bg-wine-700 text-white px-3 py-1 rounded hover:bg-wine-800 disabled:opacity-50"
                          >
                            {isUpdating ? '...' : 'Commencer'}
                          </button>
                        )}
                        {m.status === 'in_progress' && (
                          <button
                            onClick={() => updateProgress(m.id, 'completed')}
                            disabled={isUpdating}
                            className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 disabled:opacity-50"
                          >
                            {isUpdating ? '...' : 'Marquer terminé'}
                          </button>
                        )}
                        {m.status === 'completed' && (
                          <span className="text-xs text-green-600 flex items-center gap-1">
                            <CheckCircle size={14} /> Complété
                          </span>
                        )}
                        {m.url && (
                          <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                            Ouvrir le contenu
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Resources tab */}
      {tab === 'resources' && resources.length > 0 && (
        <div className="space-y-3">
          {resources.map((r) => {
            const typeIcons = { pdf: FileDown, video: Video, image: Image, document: FileText, link: ExternalLink };
            const TypeIcon = typeIcons[r.type] || ExternalLink;
            const typeColors = { pdf: 'bg-red-100 text-red-600', video: 'bg-purple-100 text-purple-600', image: 'bg-blue-100 text-blue-600', document: 'bg-orange-100 text-orange-600', link: 'bg-green-100 text-green-600' };
            return (
              <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer" className="card flex items-start gap-3 hover:shadow-md transition-shadow">
                <div className={`p-2 rounded-lg ${typeColors[r.type] || 'bg-gray-100 text-gray-600'}`}>
                  <TypeIcon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{r.title}</p>
                  {r.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{r.description}</p>}
                  <span className="text-[10px] text-gray-400 uppercase mt-1 inline-block">{r.type}</span>
                </div>
                <ExternalLink size={14} className="text-gray-300 shrink-0 mt-1" />
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
