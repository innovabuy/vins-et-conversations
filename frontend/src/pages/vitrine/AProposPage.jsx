import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Wine, ChevronRight, Heart, Grape, Award } from 'lucide-react';
import api from '../../services/api';

const DEFAULT_CONTENT = {
  hero: {
    title: 'À Propos — Des vins choisis avec passion',
    subtitle: 'Vins & Conversations, c\'est une sélection de vins français et du Nouveau Monde, choisis avec soin par Nicolas Froment. Chaque bouteille raconte une histoire.',
  },
  sections: [
    { type: 'text', title: 'Notre histoire', body: 'Biographie de Nicolas Froment — contenu à compléter.' },
    { type: 'values', title: 'Nos valeurs', items: [
      { icon: 'heart', label: 'Sélection rigoureuse', desc: 'Chaque vin est dégusté et approuvé avant d\'intégrer notre catalogue.' },
      { icon: 'grape', label: 'Proximité producteurs', desc: 'Des relations directes avec les vignerons pour garantir authenticité et traçabilité.' },
      { icon: 'award', label: 'Engagement qualité-prix', desc: 'Des vins d\'exception accessibles à tous, sans compromis sur la qualité.' },
    ]},
  ],
  cta: { label: 'Découvrir nos vins', href: '/boutique' },
};

const ICON_MAP = { heart: Heart, grape: Grape, award: Award };

export default function AProposPage() {
  const [content, setContent] = useState(DEFAULT_CONTENT);

  useEffect(() => {
    api.get('/site-pages/a-propos')
      .then(({ data }) => { if (data.content_json) setContent(data.content_json); })
      .catch(() => {});
  }, []);

  return (
    <div>
      <section className="bg-gradient-to-br from-wine-800 via-wine-700 to-wine-900 text-white py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur rounded-full px-4 py-1.5 text-sm mb-6">
            <Wine size={16} /> Notre histoire
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-6">{content.hero.title}</h1>
          <p className="text-lg text-wine-200 max-w-2xl mx-auto">{content.hero.subtitle}</p>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 py-16">
        {content.sections.map((section, i) => (
          <div key={i} className="mb-12">
            {section.title && <h2 className="text-2xl font-bold text-gray-900 mb-6">{section.title}</h2>}
            {section.type === 'text' && section.body && (
              <div className="p-6 bg-wine-50 rounded-xl text-gray-700 leading-relaxed">{section.body}</div>
            )}
            {section.type === 'values' && section.items && (
              <div className="grid sm:grid-cols-3 gap-6">
                {section.items.map((val, j) => {
                  const Icon = ICON_MAP[val.icon] || Heart;
                  return (
                    <div key={j} className="text-center p-6 bg-white border border-gray-100 rounded-2xl shadow-sm">
                      <div className="w-12 h-12 bg-wine-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Icon size={24} className="text-wine-700" />
                      </div>
                      <h3 className="font-semibold text-gray-900 mb-2">{val.label}</h3>
                      <p className="text-sm text-gray-600">{val.desc}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        <div className="text-center mt-12">
          <Link to={content.cta.href} className="inline-flex items-center gap-2 bg-wine-700 text-white px-8 py-3 rounded-xl font-semibold hover:bg-wine-800 transition-colors">
            {content.cta.label} <ChevronRight size={18} />
          </Link>
        </div>
      </section>
    </div>
  );
}
