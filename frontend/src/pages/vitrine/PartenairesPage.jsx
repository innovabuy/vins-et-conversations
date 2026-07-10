import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, ChevronRight } from 'lucide-react';
import api from '../../services/api';

const DEFAULT_CONTENT = {
  hero: {
    title: 'Nos Partenaires',
    subtitle: 'Ils nous accompagnent au quotidien dans notre démarche qualité.',
  },
  sections: [
    { type: 'partners', title: 'Partenaires', items: [
      { name: 'ESPL', logo: null },
      { name: 'PBA', logo: null },
    ]},
    { type: 'brand_links', label: 'Nos autres marques', items: [
      { name: 'Cap Performances', url: 'https://www.cap-performances.fr/' },
      { name: 'VendMieux', url: 'https://vendmieux.fr/' },
    ]},
    { type: 'placeholder', body: 'Section partenaires à enrichir par Nicolas — logos et descriptions à ajouter.' },
  ],
  cta: { label: 'Devenir partenaire', href: '/boutique/contact' },
};

export default function PartenairesPage() {
  const [content, setContent] = useState(DEFAULT_CONTENT);

  useEffect(() => {
    api.get('/site-pages/partenaires')
      .then(({ data }) => { if (data.content_json) setContent(data.content_json); })
      .catch(() => {});
  }, []);

  return (
    <div>
      <section className="bg-gradient-to-br from-wine-800 via-wine-700 to-wine-900 text-white py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur rounded-full px-4 py-1.5 text-sm mb-6">
            <Users size={16} /> Partenaires
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-6">{content.hero.title}</h1>
          <p className="text-lg text-wine-200 max-w-2xl mx-auto">{content.hero.subtitle}</p>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 py-16">
        {content.sections.map((section, i) => (
          <div key={i} className="mb-12">
            {section.title && <h2 className="text-2xl font-bold text-gray-900 mb-6">{section.title}</h2>}
            {section.type === 'partners' && section.items && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
                {section.items.map((p, j) => {
                  const cardClass = 'flex items-center justify-center p-6 bg-white border border-gray-100 rounded-2xl shadow-sm aspect-square';
                  const inner = p.logo ? (
                    <img src={p.logo} alt={p.name} className="max-h-20 object-contain" />
                  ) : (
                    <span className="text-lg font-bold text-gray-400">{p.name}</span>
                  );
                  return p.url ? (
                    <a key={j} href={p.url} target="_blank" rel="noopener noreferrer" className={`${cardClass} transition-transform hover:-translate-y-0.5`}>
                      {inner}
                    </a>
                  ) : (
                    <div key={j} className={cardClass}>{inner}</div>
                  );
                })}
              </div>
            )}
            {section.type === 'placeholder' && (
              <div className="p-8 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 text-center">
                <Users size={48} className="mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 italic">{section.body}</p>
              </div>
            )}
            {section.type === 'brand_links' && section.items && (
              <p className="text-sm text-gray-400 text-center">
                {section.label ? `${section.label} : ` : ''}
                {section.items.map((b, k) => (
                  <span key={k}>
                    {k > 0 && <span className="text-gray-300"> · </span>}
                    <a href={b.url} target="_blank" rel="noopener" className="text-gray-500 hover:text-wine-700 underline-offset-2">{b.name}</a>
                  </span>
                ))}
              </p>
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
