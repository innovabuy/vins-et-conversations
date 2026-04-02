import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Star, ChevronRight, MessageSquare } from 'lucide-react';
import api from '../../services/api';

const DEFAULT_CONTENT = {
  hero: {
    title: 'Ils nous font confiance',
    subtitle: 'Découvrez les retours de nos clients et partenaires.',
  },
  sections: [
    { type: 'placeholder', body: 'Section avis clients — Vos retours comptent ! Contactez-nous pour partager votre expérience.' },
  ],
  cta: { label: 'Laisser un avis', href: '/boutique/contact' },
};

export default function AvisPage() {
  const [content, setContent] = useState(DEFAULT_CONTENT);

  useEffect(() => {
    api.get('/site-pages/avis')
      .then(({ data }) => { if (data.content_json) setContent(data.content_json); })
      .catch(() => {});
  }, []);

  return (
    <div>
      <section className="bg-gradient-to-br from-wine-800 via-wine-700 to-wine-900 text-white py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur rounded-full px-4 py-1.5 text-sm mb-6">
            <Star size={16} /> Témoignages
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-6">{content.hero.title}</h1>
          <p className="text-lg text-wine-200 max-w-2xl mx-auto">{content.hero.subtitle}</p>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 py-16">
        {content.sections.map((section, i) => (
          <div key={i} className="mb-12">
            {section.title && <h2 className="text-2xl font-bold text-gray-900 mb-6">{section.title}</h2>}
            {section.type === 'placeholder' && (
              <div className="p-8 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 text-center">
                <MessageSquare size={48} className="mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 italic">{section.body}</p>
              </div>
            )}
            {section.type === 'testimonials' && section.items && (
              <div className="grid sm:grid-cols-2 gap-6">
                {section.items.map((t, j) => (
                  <div key={j} className="p-6 bg-white border border-gray-100 rounded-2xl shadow-sm">
                    <div className="flex gap-1 mb-3">
                      {[...Array(5)].map((_, k) => (
                        <Star key={k} size={16} className={k < (t.rating || 5) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'} />
                      ))}
                    </div>
                    <p className="text-gray-700 italic mb-3">"{t.text}"</p>
                    <p className="text-sm font-medium text-gray-900">{t.author}</p>
                  </div>
                ))}
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
