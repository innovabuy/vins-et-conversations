import { useState, useEffect } from 'react';
import { appSettingsAPI } from '../../services/api';
import { Settings, Palette, Save, Image, Type, Check, CreditCard, AlertTriangle, Wifi, WifiOff, Eye, EyeOff, Mail, Send, Upload, Database, Download } from 'lucide-react';

export default function AppSettings() {
  const [settings, setSettings] = useState({
    app_logo_url: '',
    app_name: '',
    app_primary_color: '#722F37',
    stripe_mode: 'test',
    stripe_test_publishable_key: '',
    stripe_test_secret_key: '',
    stripe_live_publishable_key: '',
    stripe_live_secret_key: '',
    stripe_webhook_secret: '',
    smtp_host: '',
    smtp_port: '587',
    smtp_user: '',
    smtp_password: '',
    smtp_from_name: 'Vins & Conversations',
    smtp_from_email: '',
    smtp_mode: 'test',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [stripeTest, setStripeTest] = useState(null);
  const [testingStripe, setTestingStripe] = useState(false);
  const [emailTest, setEmailTest] = useState(null);
  const [testingEmail, setTestingEmail] = useState(false);
  const [showSecrets, setShowSecrets] = useState({});
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [lastBackup, setLastBackup] = useState(null);

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

  const handleTestStripe = async () => {
    setTestingStripe(true);
    setStripeTest(null);
    try {
      const res = await appSettingsAPI.stripeTest();
      setStripeTest(res.data);
    } catch (err) {
      setStripeTest({ connected: false, error: err.message });
    } finally {
      setTestingStripe(false);
    }
  };

  const toggleSecret = (key) => {
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const { data } = await appSettingsAPI.uploadLogo(file);
      setSettings((prev) => ({ ...prev, app_logo_url: data.logo_url }));
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur upload logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleBackup = async () => {
    setBackupLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${import.meta.env.VITE_API_URL || '/api/v1'}/admin/backup/database`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        alert('Erreur lors de la sauvegarde');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vc_backup_${new Date().toISOString().slice(0, 10)}.sql`;
      a.click();
      URL.revokeObjectURL(url);
      setLastBackup(new Date().toLocaleString('fr-FR'));
    } catch (err) {
      alert('Erreur lors de la sauvegarde');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    setEmailTest(null);
    try {
      const res = await appSettingsAPI.emailTest();
      setEmailTest(res.data);
    } catch (err) {
      setEmailTest({ success: false, error: err.response?.data?.error || err.message });
    } finally {
      setTestingEmail(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" /></div>;
  }

  const isLive = settings.stripe_mode === 'live';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings size={24} className="text-wine-700" />
          <h1 className="text-2xl font-bold text-gray-900">Parametres</h1>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-2 disabled:opacity-50"
        >
          {saved ? <Check size={16} /> : <Save size={16} />}
          {saving ? 'Enregistrement...' : saved ? 'Enregistre' : 'Enregistrer'}
        </button>
      </div>

      {/* Branding section */}
      <div className="card">
        <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
          <Palette size={18} className="text-wine-700" />
          Branding
        </h2>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Image size={14} className="inline mr-1" />
              Logo principal
            </label>
            <div className="flex items-start gap-4">
              {settings.app_logo_url ? (
                <img
                  src={settings.app_logo_url}
                  alt="Logo"
                  className="h-16 w-auto object-contain border rounded-lg p-2"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              ) : (
                <div className="h-16 w-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400">
                  <Image size={24} />
                </div>
              )}
              <div className="flex flex-col gap-2">
                <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
                  uploadingLogo ? 'bg-gray-100 text-gray-400' : 'bg-wine-50 text-wine-700 hover:bg-wine-100'
                }`}>
                  <Upload size={16} />
                  {uploadingLogo ? 'Upload...' : settings.app_logo_url ? 'Changer le logo' : 'Uploader un logo'}
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" onChange={handleLogoUpload} className="hidden" disabled={uploadingLogo} />
                </label>
                <p className="text-xs text-gray-400">JPG, PNG, WebP ou SVG — max 2 Mo</p>
              </div>
            </div>
          </div>

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

      {/* Stripe section */}
      <div className="card">
        <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
          <CreditCard size={18} className="text-wine-700" />
          Paiement Stripe
        </h2>

        {/* Mode toggle */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">Mode</label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSettings({ ...settings, stripe_mode: 'test' })}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                !isLive ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-400' : 'bg-gray-100 text-gray-500'
              }`}
            >
              Test
            </button>
            <button
              onClick={() => setSettings({ ...settings, stripe_mode: 'live' })}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isLive ? 'bg-red-100 text-red-700 ring-2 ring-red-400' : 'bg-gray-100 text-gray-500'
              }`}
            >
              Production
            </button>
          </div>
          {isLive && (
            <div className="mt-2 flex items-center gap-2 text-red-600 text-sm">
              <AlertTriangle size={14} />
              Mode production : les paiements sont reels !
            </div>
          )}
        </div>

        {/* Test keys */}
        <div className="space-y-4 mb-5">
          <h3 className="text-sm font-medium text-gray-600">Cles Test</h3>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Cle publique (pk_test_...)</label>
            <input
              type="text"
              value={settings.stripe_test_publishable_key}
              onChange={(e) => setSettings({ ...settings, stripe_test_publishable_key: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
              placeholder="pk_test_..."
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Cle secrete (sk_test_...)</label>
            <div className="flex items-center gap-2">
              <input
                type={showSecrets.test_secret ? 'text' : 'password'}
                value={settings.stripe_test_secret_key}
                onChange={(e) => setSettings({ ...settings, stripe_test_secret_key: e.target.value })}
                className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono"
                placeholder="sk_test_..."
              />
              <button onClick={() => toggleSecret('test_secret')} className="text-gray-400 hover:text-gray-600">
                {showSecrets.test_secret ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
        </div>

        {/* Live keys */}
        <div className="space-y-4 mb-5">
          <h3 className="text-sm font-medium text-gray-600">Cles Production</h3>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Cle publique (pk_live_...)</label>
            <input
              type="text"
              value={settings.stripe_live_publishable_key}
              onChange={(e) => setSettings({ ...settings, stripe_live_publishable_key: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
              placeholder="pk_live_..."
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Cle secrete (sk_live_...)</label>
            <div className="flex items-center gap-2">
              <input
                type={showSecrets.live_secret ? 'text' : 'password'}
                value={settings.stripe_live_secret_key}
                onChange={(e) => setSettings({ ...settings, stripe_live_secret_key: e.target.value })}
                className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono"
                placeholder="sk_live_..."
              />
              <button onClick={() => toggleSecret('live_secret')} className="text-gray-400 hover:text-gray-600">
                {showSecrets.live_secret ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
        </div>

        {/* Webhook secret */}
        <div className="mb-5">
          <label className="block text-xs text-gray-500 mb-1">Webhook Secret (whsec_...)</label>
          <div className="flex items-center gap-2">
            <input
              type={showSecrets.webhook ? 'text' : 'password'}
              value={settings.stripe_webhook_secret}
              onChange={(e) => setSettings({ ...settings, stripe_webhook_secret: e.target.value })}
              className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono"
              placeholder="whsec_..."
            />
            <button onClick={() => toggleSecret('webhook')} className="text-gray-400 hover:text-gray-600">
              {showSecrets.webhook ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            URL webhook : {window.location.origin}/api/v1/webhooks/stripe
          </p>
        </div>

        {/* Test connection button */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleTestStripe}
            disabled={testingStripe}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {testingStripe ? 'Test en cours...' : 'Tester la connexion'}
          </button>
          {stripeTest && (
            <div className={`flex items-center gap-2 text-sm ${stripeTest.connected ? 'text-green-600' : 'text-red-600'}`}>
              {stripeTest.connected ? <Wifi size={16} /> : <WifiOff size={16} />}
              {stripeTest.connected
                ? `Connecte (${stripeTest.mode})`
                : `Erreur : ${stripeTest.error}`
              }
            </div>
          )}
        </div>
      </div>

      {/* Email section */}
      <div className="card">
        <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
          <Mail size={18} className="text-wine-700" />
          Emails transactionnels
        </h2>

        {/* Mode toggle */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">Mode</label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSettings({ ...settings, smtp_mode: 'test' })}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                settings.smtp_mode === 'test' ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-400' : 'bg-gray-100 text-gray-500'
              }`}
            >
              Test
            </button>
            <button
              onClick={() => setSettings({ ...settings, smtp_mode: 'production' })}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                settings.smtp_mode === 'production' ? 'bg-green-100 text-green-700 ring-2 ring-green-400' : 'bg-gray-100 text-gray-500'
              }`}
            >
              Production
            </button>
          </div>
          {settings.smtp_mode === 'test' && (
            <p className="mt-2 text-sm text-blue-600">
              Mode test actif : les emails ne sont pas envoyes, ils sont traces dans les logs du serveur.
            </p>
          )}
        </div>

        {/* SMTP config */}
        <div className="space-y-4 mb-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Serveur SMTP</label>
              <input
                type="text"
                value={settings.smtp_host}
                onChange={(e) => setSettings({ ...settings, smtp_host: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="smtp.example.com"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Port</label>
              <input
                type="text"
                value={settings.smtp_port}
                onChange={(e) => setSettings({ ...settings, smtp_port: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="587"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Utilisateur SMTP</label>
            <input
              type="text"
              value={settings.smtp_user}
              onChange={(e) => setSettings({ ...settings, smtp_user: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="user@example.com"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Mot de passe SMTP</label>
            <div className="flex items-center gap-2">
              <input
                type={showSecrets.smtp_password ? 'text' : 'password'}
                value={settings.smtp_password}
                onChange={(e) => setSettings({ ...settings, smtp_password: e.target.value })}
                className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono"
                placeholder="••••••••"
              />
              <button onClick={() => toggleSecret('smtp_password')} className="text-gray-400 hover:text-gray-600">
                {showSecrets.smtp_password ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nom expediteur</label>
              <input
                type="text"
                value={settings.smtp_from_name}
                onChange={(e) => setSettings({ ...settings, smtp_from_name: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="Vins & Conversations"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Email expediteur</label>
              <input
                type="email"
                value={settings.smtp_from_email}
                onChange={(e) => setSettings({ ...settings, smtp_from_email: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="noreply@vins-conversations.fr"
              />
            </div>
          </div>
        </div>

        {/* Test email button */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleTestEmail}
            disabled={testingEmail}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <Send size={14} />
            {testingEmail ? 'Envoi en cours...' : 'Envoyer un email de test'}
          </button>
          {emailTest && (
            <div className={`flex items-center gap-2 text-sm ${emailTest.success ? 'text-green-600' : 'text-red-600'}`}>
              {emailTest.success
                ? `${emailTest.testMode ? 'Email simule (mode test)' : 'Email envoye'}`
                : `Erreur : ${emailTest.error}`
              }
            </div>
          )}
        </div>
      </div>

      {/* Backup section */}
      <div className="card">
        <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
          <Database size={18} className="text-wine-700" />
          Sauvegarde de la base de donnees
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Telecharge un fichier SQL complet de toutes les donnees.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={handleBackup}
            disabled={backupLoading}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <Download size={14} />
            {backupLoading ? 'Sauvegarde en cours...' : 'Telecharger la sauvegarde'}
          </button>
          {lastBackup && (
            <span className="text-sm text-green-600">
              Derniere sauvegarde : {lastBackup}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
