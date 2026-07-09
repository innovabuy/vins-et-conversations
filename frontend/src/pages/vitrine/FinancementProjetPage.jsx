import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Coins, ChevronRight, CheckCircle, Building2, Target, Sparkles } from 'lucide-react';
import api from '../../services/api';
import { useSiteImage } from '../../contexts/SiteImagesContext';

const DEFAULT_CONTENT = {
  hero: {
    title: 'Financer ses projets',
    subtitle: 'Accompagnement tout type de structure dans la réalisation de vos projets.',
  },
  structures: {
    title: 'À qui s’adresse ce programme ?',
    items: [
      'Associations sportives, culturelles…',
      'Établissements scolaires (Supérieur, lycées, MFR)',
      'Soirées étudiantes / événementielles (BDE…)',
      'Associations de parents d’élèves',
    ],
  },
  objectifs: {
    title: 'Dans quel but réaliser un projet de vente de vins ?',
    intro: 'Un projet de vente rémunérateur, au service de vos objectifs :',
    items: [
      'Financer une action humanitaire',
      'Financer vos projets associatifs, pédagogiques…',
      'Financer vos soirées étudiantes / événementielles',
      'Monter en compétences dans le milieu de la vente',
    ],
  },
  principe: {
    title: 'Une rémunération pour booster vos projets',
    body: 'À travers cette action de vente directe, vous serez pleinement intégré dans le projet. Le but étant de récolter les fonds nécessaires afin de financer vos différents projets, calculés en fonction du chiffre d’affaires réalisé sur la durée du projet de vente de vins.\n\nCette action est totalement gratuite, sans engagement ni contrepartie demandée.',
  },
  preuve: {
    title: 'Ils l’ont fait : la CCI d’Angers',
    body: 'La CCI d’Angers a réalisé cette action de vente de vins pour financer une partie de son voyage au Salon de la Franchise, grâce à la commission générée sur les ventes.',
  },
  fonctionnement: {
    title: 'Notre fonctionnement',
    steps: [
      'Nous échangeons avec vous pour comprendre votre projet et vos objectifs de financement.',
      'Vous réalisez vos ventes sur catalogue, auprès de votre entourage, avec notre accompagnement.',
      'Nous vous livrons les vins commandés, en vous apportant les conseils de conservation et de service.',
    ],
  },
  avantages: {
    title: 'Les avantages Vins & Conversations',
    items: [
      'Proposer un produit « plaisir » et de qualité à son entourage',
      'Bénéficier d’une présentation de lancement dans vos locaux par notre équipe',
      'Un suivi et un accompagnement tout le long de l’opération, avec un calendrier de départ et de fin défini ensemble',
      'Vente sur catalogue, sans avance de trésorerie ni stock à gérer',
      'Différents supports physiques et digitaux pour faciliter vos ventes',
      'Commission pour la structure, entièrement dédiée au financement de votre projet',
      'Logistique assurée par nos soins (avec livraison intermédiaire si besoin)',
    ],
  },
  cta: {
    tagline: 'Votre projet vous tient à cœur ? Parlons-en.',
    label: 'Nous contacter',
    href: '/boutique/contact',
  },
};

export default function FinancementProjetPage() {
  const [content, setContent] = useState(DEFAULT_CONTENT);
  const heroBg = useSiteImage('financement_hero');

  useEffect(() => {
    api.get('/site-pages/prestations-financement')
      .then(({ data }) => { if (data.content_json) setContent(data.content_json); })
      .catch(() => {});
  }, []);

  return (
    <div>
      <section
        className={`relative text-white py-20 ${heroBg?.image_url ? 'bg-wine-900' : 'bg-gradient-to-br from-wine-800 via-wine-700 to-wine-900'}`}
        style={heroBg?.image_url ? { backgroundImage: `url(${heroBg.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      >
        {heroBg?.image_url && <div className="absolute inset-0 bg-black/45" aria-hidden="true" />}
        <div className="relative max-w-4xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur rounded-full px-4 py-1.5 text-sm mb-6">
            <Coins size={16} /> Financement de projet
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-6">{content.hero.title}</h1>
          <p className="text-lg text-wine-100 max-w-2xl mx-auto">{content.hero.subtitle}</p>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 py-16">
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Building2 size={22} className="text-wine-700" /> {content.structures.title}
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {content.structures.items.map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-4 bg-wine-50 rounded-xl">
                <CheckCircle size={20} className="text-wine-600 flex-shrink-0 mt-0.5" />
                <span className="text-gray-700">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-2">
            <Target size={22} className="text-wine-700" /> {content.objectifs.title}
          </h2>
          <p className="text-gray-600 mb-6">{content.objectifs.intro}</p>
          <div className="grid sm:grid-cols-2 gap-4">
            {content.objectifs.items.map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-4 bg-wine-50 rounded-xl">
                <CheckCircle size={20} className="text-wine-600 flex-shrink-0 mt-0.5" />
                <span className="text-gray-700">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">{content.principe.title}</h2>
          <p className="text-gray-600 leading-relaxed whitespace-pre-line">{content.principe.body}</p>
        </div>

        <div className="mb-12 p-6 bg-wine-50 border-l-4 border-wine-600 rounded-r-xl">
          <h2 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Sparkles size={20} className="text-wine-700" /> {content.preuve.title}
          </h2>
          <p className="text-gray-600 leading-relaxed">{content.preuve.body}</p>
        </div>

        <div className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">{content.fonctionnement.title}</h2>
          <div className="space-y-4">
            {content.fonctionnement.steps.map((step, i) => (
              <div key={i} className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-wine-700 text-white flex items-center justify-center font-bold text-sm">{i + 1}</div>
                <p className="text-gray-700 pt-1">{step}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">{content.avantages.title}</h2>
          <div className="space-y-3">
            {content.avantages.items.map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <CheckCircle size={20} className="text-wine-600 flex-shrink-0 mt-0.5" />
                <span className="text-gray-700">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="text-center mt-12">
          {content.cta.tagline && <p className="mb-4 text-lg font-medium text-gray-700">{content.cta.tagline}</p>}
          <Link to={content.cta.href} className="inline-flex items-center gap-2 bg-wine-700 text-white px-8 py-3 rounded-xl font-semibold hover:bg-wine-800 transition-colors">
            {content.cta.label} <ChevronRight size={18} />
          </Link>
        </div>
      </section>
    </div>
  );
}
