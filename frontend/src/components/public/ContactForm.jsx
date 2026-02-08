import { useState } from 'react';
import { Mail, Send, CheckCircle } from 'lucide-react';
import api from '../../services/api';

const TYPES = [
  { value: 'question', label: 'Question' },
  { value: 'devis', label: 'Demande de devis' },
  { value: 'partenariat', label: 'Partenariat' },
  { value: 'autre', label: 'Autre' },
];

export default function ContactForm() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', message: '', type: 'question' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const update = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      await api.post('/public/contact', form);
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de l\'envoi');
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="bg-green-50 rounded-2xl p-12">
          <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Message envoyé !</h2>
          <p className="text-gray-600">Merci pour votre message. Nous vous répondrons dans les meilleurs délais.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 bg-wine-50 text-wine-700 rounded-full px-4 py-1.5 text-sm mb-4">
          <Mail size={16} /> Nous contacter
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Une question ? Un projet ?</h1>
        <p className="text-gray-500 max-w-lg mx-auto">
          N'hésitez pas à nous écrire. Nous répondons à toutes les demandes sous 48h.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
        <form onSubmit={handleSubmit} className="lg:col-span-3 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
              <input type="text" value={form.name} onChange={(e) => update('name', e.target.value)} required minLength={2} className="w-full border rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-wine-200 focus:border-wine-500 outline-none" placeholder="Jean Dupont" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required className="w-full border rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-wine-200 focus:border-wine-500 outline-none" placeholder="jean@example.fr" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
              <input type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} className="w-full border rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-wine-200 focus:border-wine-500 outline-none" placeholder="06 12 34 56 78" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Entreprise</label>
              <input type="text" value={form.company} onChange={(e) => update('company', e.target.value)} className="w-full border rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-wine-200 focus:border-wine-500 outline-none" placeholder="Nom de l'entreprise" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type de demande</label>
            <select value={form.type} onChange={(e) => update('type', e.target.value)} className="w-full border rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-wine-200 focus:border-wine-500 outline-none">
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Message *</label>
            <textarea value={form.message} onChange={(e) => update('message', e.target.value)} required minLength={10} rows={5} className="w-full border rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-wine-200 focus:border-wine-500 outline-none resize-none" placeholder="Votre message..." />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button type="submit" disabled={sending} className="btn-primary w-full flex items-center justify-center gap-2 py-3 disabled:opacity-50">
            {sending ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Send size={16} />}
            Envoyer le message
          </button>
        </form>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-wine-50 rounded-2xl p-6">
            <h3 className="font-semibold text-wine-800 mb-3">Vins & Conversations</h3>
            <p className="text-sm text-wine-700 leading-relaxed">
              Nicolas Froment<br />
              Angers, France<br /><br />
              nicolas@vins-conversations.fr
            </p>
          </div>
          <div className="bg-gray-50 rounded-2xl p-6">
            <h3 className="font-semibold text-gray-800 mb-3">Réponse rapide</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Nous nous engageons à répondre à toutes les demandes sous 48h ouvrées.
              Pour les urgences, privilégiez le téléphone.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
