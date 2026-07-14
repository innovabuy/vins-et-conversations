import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, ChevronRight, Check } from 'lucide-react';
import api from '../../services/api';
import AmbassadorsGrid from '../../components/public/AmbassadorsGrid';

// Page "Devenir ambassadeur" : contenu (texte de Nicolas, verbatim, servi par la migration
// site_pages 'devenir-ambassadeur') puis le bloc "Nos ambassadeurs" existant en dessous.
// PAS de hero image / useSiteImage / slot (Nicolas n'en demande pas ; les photos ambassadeurs
// restent gérées via les fiches contacts existantes).

// Miroir EXACT du content_json de la migration 20260714160000_seed_devenir_ambassadeur.
const DEFAULT_CONTENT = {
  hero: {
    title: 'Devenir ambassadeur',
    subtitle: '',
  },
  sections: [
    {
      type: 'list',
      title: "Le rôle de l'ambassadeur V&C",
      items: [
        "Organisation d'événements avec dégustation de vins (ventes en réunion)",
        'Développer et fidéliser une clientèle pour augmenter ses ventes',
        "Développer un réseau d'ambassadeurs Vins & Conversations à travers les événements",
      ],
    },
    {
      type: 'numbered',
      title: "Les avantages de l'ambassadeur V&C",
      items: [
        { title: 'Flexibilité', text: 'Vous êtes libre de choisir le temps que vous souhaitez consacrer à cette activité ainsi que votre emploi du temps.' },
        { title: 'Indépendance', text: "Vous définissez vos propres objectifs et n'êtes pas soumis à une pression constante." },
        { title: 'Moments de convivialité', text: 'Une activité "plaisir" en partageant des moments conviviaux à travers des discussions pendant vos ventes.' },
        { title: 'Complément de revenu', text: "Rémunération en fonction de vos ventes et cumulable avec d'autres revenus." },
        { title: 'Accompagnement et Formation', text: "Vous bénéficiez d'une formation sur nos vins et d'un accompagnement tout au long de votre processus de vente." },
      ],
    },
    {
      type: 'steps',
      title: 'Rejoignez V&C comme ambassadeur',
      body: 'Vous aimez le vin et aimez discuter en le partageant ? Vous souhaitez développer une activité sans prise de tête ?',
      items: [
        'Remplir notre formulaire de contact',
        'Nous réalisons un entretien',
        'Je rejoins V&C et reçois mon kit de lancement',
      ],
    },
  ],
  cta: { label: 'Nous contacter', href: '/boutique/contact' },
};

export default function DevenirAmbassadeurPage() {
  const [content, setContent] = useState(DEFAULT_CONTENT);

  useEffect(() => {
    api.get('/site-pages/devenir-ambassadeur')
      .then(({ data }) => { if (data.content_json) setContent(data.content_json); })
      .catch(() => {});
  }, []);

  // Titre d'onglet propre à la page, restauré au démontage (pas de régression ailleurs).
  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Devenir ambassadeur | Vins & Conversations';
    return () => { document.title = prevTitle; };
  }, []);

  return (
    <div>
      {/* Titre de page (pas de hero image / slot) */}
      <section className="max-w-4xl mx-auto px-4 pt-12 pb-2 text-center">
        <div className="inline-flex items-center gap-2 bg-wine-50 text-wine-700 rounded-full px-4 py-1.5 text-sm mb-4">
          <Users size={16} /> Ambassadeurs
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-3">{content.hero?.title}</h1>
        {content.hero?.subtitle && <p className="text-lg text-gray-600 max-w-2xl mx-auto">{content.hero.subtitle}</p>}
      </section>

      {/* Contenu (sections list / numbered / steps) */}
      <section className="max-w-4xl mx-auto px-4 py-8">
        {(content.sections || []).map((section, i) => (
          <div key={i} className="mb-12">
            {section.title && <h2 className="text-2xl font-bold text-gray-900 mb-6">{section.title}</h2>}

            {section.type === 'list' && Array.isArray(section.items) && (
              <ul className="space-y-3">
                {section.items.map((item, j) => (
                  <li key={j} className="flex items-start gap-3 text-gray-700">
                    <Check size={18} className="text-wine-700 flex-shrink-0 mt-1" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}

            {section.type === 'numbered' && Array.isArray(section.items) && (
              <ol className="space-y-4">
                {section.items.map((item, j) => (
                  <li key={j} className="flex items-start gap-4">
                    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-wine-700 text-white flex items-center justify-center font-semibold text-sm">{j + 1}</span>
                    <p className="text-gray-700 pt-1"><span className="font-semibold text-gray-900">{item.title}</span> : {item.text}</p>
                  </li>
                ))}
              </ol>
            )}

            {section.type === 'steps' && (
              <div>
                {section.body && <p className="text-gray-700 mb-6 leading-relaxed">{section.body}</p>}
                {Array.isArray(section.items) && (
                  <ol className="space-y-3">
                    {section.items.map((step, j) => (
                      <li key={j} className="flex items-center gap-4 p-4 bg-wine-50 rounded-xl">
                        <span className="flex-shrink-0 w-8 h-8 rounded-full bg-wine-700 text-white flex items-center justify-center font-semibold text-sm">{j + 1}</span>
                        <span className="text-gray-800 font-medium">{step}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </div>
        ))}

        {/* CTA vers le formulaire de contact existant */}
        <div className="text-center mt-4">
          <Link to={content.cta?.href || '/boutique/contact'} className="inline-flex items-center gap-2 bg-wine-700 text-white px-8 py-3 rounded-xl font-semibold hover:bg-wine-800 transition-colors">
            {content.cta?.label || 'Nous contacter'} <ChevronRight size={18} />
          </Link>
        </div>
      </section>

      {/* Bloc "Nos ambassadeurs" existant, SOUS le contenu, même page */}
      <section className="bg-gray-50 py-10 mt-8">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-gray-900 text-center">Nos ambassadeurs</h2>
        </div>
        <AmbassadorsGrid />
      </section>
    </div>
  );
}
