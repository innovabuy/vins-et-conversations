import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, ChevronRight } from 'lucide-react';
import api from '../../services/api';
import { useSiteImage } from '../../contexts/SiteImagesContext';

const DEFAULT_CONTENT = {
  hero: {
    title: 'Le Cercle des ambassadeurs',
    subtitle: 'Présentation à compléter — l\'esprit du réseau d\'ambassadeurs Vins & Conversations.',
  },
  sections: [
    { type: 'text', title: 'Notre réseau', body: 'Présentation du réseau d\'ambassadeurs — à compléter par Nicolas / Martin.' },
    { type: 'text', title: 'Nos valeurs', body: 'Valeurs du cercle — à compléter.' },
    { type: 'text', title: 'Comment nous rejoindre', body: 'Modalités pour devenir ambassadeur — à compléter.' },
  ],
  cta: { label: 'Devenir ambassadeur', href: '/boutique/ambassadeurs' },
};

export default function CercleAmbassadeursPage() {
  const [content, setContent] = useState(DEFAULT_CONTENT);
  const heroBg = useSiteImage('cercle_ambassadeurs_hero');
  const gal1 = useSiteImage('cercle_ambassadeurs_galerie_1');
  const gal2 = useSiteImage('cercle_ambassadeurs_galerie_2');
  const gal3 = useSiteImage('cercle_ambassadeurs_galerie_3');
  const galleryItems = [gal1, gal2, gal3].filter((g) => g && g.image_url);

  useEffect(() => {
    api.get('/site-pages/cercle-ambassadeurs')
      .then(({ data }) => { if (data.content_json) setContent(data.content_json); })
      .catch(() => {});
  }, []);

  // SEO propre à la page (restauré au démontage → pas de régression sur les autres pages)
  useEffect(() => {
    const prevTitle = document.title;
    const metaDesc = document.querySelector('meta[name="description"]');
    const prevDesc = metaDesc ? metaDesc.getAttribute('content') : null;
    document.title = 'Le Cercle des ambassadeurs | Vins & Conversations';
    if (metaDesc) {
      metaDesc.setAttribute('content', 'Le Cercle des ambassadeurs Vins & Conversations : l\'esprit du réseau, ses valeurs et comment le rejoindre.');
    }
    return () => {
      document.title = prevTitle;
      if (metaDesc && prevDesc != null) metaDesc.setAttribute('content', prevDesc);
    };
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
            <Users size={16} /> Ambassadeurs
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-6">{content.hero.title}</h1>
          <p className="text-lg text-wine-200 max-w-2xl mx-auto">{content.hero.subtitle}</p>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 py-16">
        {(content.sections || []).map((section, i) => (
          <div key={i} className="mb-12">
            {section.title && <h2 className="text-2xl font-bold text-gray-900 mb-6">{section.title}</h2>}
            {section.body && (
              <div className="p-6 bg-wine-50 rounded-xl text-gray-700 leading-relaxed whitespace-pre-line">{section.body}</div>
            )}
          </div>
        ))}

        {galleryItems.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">En images</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {galleryItems.map((img, i) => (
                <figure key={i} className="rounded-2xl overflow-hidden bg-wine-50 shadow-sm">
                  <img
                    src={img.image_url}
                    alt={img.alt_text || `Illustration cercle des ambassadeurs ${i + 1}`}
                    loading="lazy"
                    className="w-full aspect-[4/3] object-cover"
                  />
                  {img.alt_text && (
                    <figcaption className="px-4 py-3 text-sm text-gray-600 text-center">{img.alt_text}</figcaption>
                  )}
                </figure>
              ))}
            </div>
          </div>
        )}

        <div className="text-center mt-12">
          <Link to={content.cta.href} className="inline-flex items-center gap-2 bg-wine-700 text-white px-8 py-3 rounded-xl font-semibold hover:bg-wine-800 transition-colors">
            {content.cta.label} <ChevronRight size={18} />
          </Link>
        </div>
      </section>
    </div>
  );
}
