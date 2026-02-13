import { useState, useEffect } from 'react';
import { appSettingsAPI } from '../../services/api';
import { Settings, Palette, Save, Image, Type, Check } from 'lucide-react';

export default function AppSettings() {
  const [settings, setSettings] = useState({
    app_logo_url: '',
    app_name: '',
    app_primary_color: '#722F37',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    appSettingsAPI.getAdmin()
      .then((res) => setSettings((prev) => ({ ...prev, ...res.data })))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await appSettingsAPI.update(settings);
      setSettings((prev) => ({ ...prev, ...res.data }));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings size={24} className="text-wine-700" />
          <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-2 disabled:opacity-50"
        >
          {saved ? <Check size={16} /> : <Save size={16} />}
          {saving ? 'Enregistrement...' : saved ? 'Enregistré' : 'Enregistrer'}
        </button>
      </div>

      {/* Branding section */}
      <div className="card">
        <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
          <Palette size={18} className="text-wine-700" />
          Branding
        </h2>

        <div className="space-y-5">
          {/* Logo URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Image size={14} className="inline mr-1" />
              Logo principal (URL)
            </label>
            <input
              type="url"
              value={settings.app_logo_url}
              onChange={(e) => setSettings({ ...settings, app_logo_url: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="https://example.com/logo.png"
            />
            {settings.app_logo_url && (
              <div className="mt-2 p-3 bg-gray-50 rounded-lg flex items-center gap-3">
                <img
                  src={settings.app_logo_url}
                  alt="Logo preview"
                  className="h-12 w-auto object-contain"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <span className="text-xs text-gray-500">Aperçu du logo</span>
              </div>
            )}
          </div>

          {/* App name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Type size={14} className="inline mr-1" />
              Nom de l'application
            </label>
            <input
              type="text"
              value={settings.app_name}
              onChange={(e) => setSettings({ ...settings, app_name: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="Vins & Conversations"
            />
          </div>

          {/* Primary color */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Palette size={14} className="inline mr-1" />
              Couleur principale
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={settings.app_primary_color}
                onChange={(e) => setSettings({ ...settings, app_primary_color: e.target.value })}
                className="h-10 w-14 rounded border cursor-pointer"
              />
              <input
                type="text"
                value={settings.app_primary_color}
                onChange={(e) => setSettings({ ...settings, app_primary_color: e.target.value })}
                className="border rounded-lg px-3 py-2 text-sm w-32 font-mono"
                placeholder="#722F37"
              />
              <div
                className="h-10 flex-1 rounded-lg"
                style={{ backgroundColor: settings.app_primary_color }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
