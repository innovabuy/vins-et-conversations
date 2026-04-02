import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap, ChevronRight, CheckCircle } from 'lucide-react';
import api from '../../services/api';

const DEFAULT_CONTENT = {
  hero: {
    title: 'Partenariat École — Financez vos projets avec la vente de vins',
    subtitle: 'Vos élèves vendent, votre association encaisse. Un programme clé en main pour financer voyages, équipements et projets pédagogiques.',
  },
  sections: [
    { type: 'features', title: 'Le programme en bref', items: [
      '5 % du CA HT reversé à l\'association',
      'Bouteille gratuite pour 12 vendues (règle 12+1)',
      'Dashboard élève gamifié',
      'Suivi en temps réel',
      'Campagne sur mesure',
    ]},
  ],
  cta: { label: 'Nous contacter', href: '/boutique/contact' },
};

export default function PrestationEcolesPage() {
  const [content, setContent] = useState(DEFAULT_CONTENT);

  useEffect(() => {
    api.get('/site-pages/prestations-ecoles')
      .then(({ data }) => { if (data.content_json) setContent(data.content_json); })
      .catch(() => {});
  }, []);

  return (
    <div>
      <section className="bg-gradient-to-br from-emerald-800 via-emerald-700 to-emerald-900 text-white py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur rounded-full px-4 py-1.5 text-sm mb-6">
            <GraduationCap size={16} /> Partenariat Écoles
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-6">{content.hero.title}</h1>
          <p className="text-lg text-emerald-200 max-w-2xl mx-auto">{content.hero.subtitle}</p>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 py-16">
        {content.sections.map((section, i) => (
          <div key={i} className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">{section.title}</h2>
            {section.items && (
              <div className="grid sm:grid-cols-2 gap-4">
                {section.items.map((item, j) => (
                  <div key={j} className="flex items-start gap-3 p-4 bg-emerald-50 rounded-xl">
                    <CheckCircle size={20} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700">{item}</span>
                  </div>
                ))}
              </div>
            )}
            {section.body && <p className="text-gray-600 leading-relaxed">{section.body}</p>}
          </div>
        ))}

        <div className="text-center mt-12">
          <Link to={content.cta.href} className="inline-flex items-center gap-2 bg-emerald-700 text-white px-8 py-3 rounded-xl font-semibold hover:bg-emerald-800 transition-colors">
            {content.cta.label} <ChevronRight size={18} />
          </Link>
        </div>
      </section>
    </div>
  );
}
