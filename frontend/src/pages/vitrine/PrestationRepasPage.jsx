import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { UtensilsCrossed, ChevronRight, CheckCircle } from 'lucide-react';
import api from '../../services/api';
import { useSiteImage } from '../../contexts/SiteImagesContext';

const DEFAULT_CONTENT = {
  hero: {
    title: 'Repas & Soirées — Fournisseur de vins événementiels',
    subtitle: 'Pour vos dîners d\'entreprise, séminaires et soirées privées, Vins & Conversations sélectionne les bouteilles qui feront de vos événements des moments mémorables.',
  },
  sections: [
    { type: 'features', title: 'Notre offre événementielle', items: [
      'Conseil personnalisé par Nicolas Froment',
      'Livraison sur site',
      'Devis sur mesure',
      'Coffrets cadeaux disponibles',
    ]},
    { type: 'text', title: '', body: 'Section photo événement — contenu à compléter par Nicolas.' },
  ],
  cta: { label: 'Demander un devis', href: '/boutique/contact' },
};

export default function PrestationRepasPage() {
  const [content, setContent] = useState(DEFAULT_CONTENT);
  const heroBg = useSiteImage('repas_hero');
  const gal1 = useSiteImage('repas_galerie_1');
  const gal2 = useSiteImage('repas_galerie_2');
  const galleryItems = [gal1, gal2].filter(g => g && g.image_url);

  useEffect(() => {
    api.get('/site-pages/prestations-repas')
      .then(({ data }) => { if (data.content_json) setContent(data.content_json); })
      .catch(() => {});
  }, []);

  return (
    <div>
      <section
        className={`relative text-white py-20 ${heroBg?.image_url ? 'bg-amber-900' : 'bg-gradient-to-br from-amber-800 via-amber-700 to-amber-900'}`}
        style={heroBg?.image_url ? { backgroundImage: `url(${heroBg.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      >
        {heroBg?.image_url && <div className="absolute inset-0 bg-black/45" aria-hidden="true" />}
        <div className="relative max-w-4xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur rounded-full px-4 py-1.5 text-sm mb-6">
            <UtensilsCrossed size={16} /> Événements & Réceptions
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-6">{content.hero.title}</h1>
          <p className="text-lg text-amber-200 max-w-2xl mx-auto">{content.hero.subtitle}</p>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 py-16">
        {content.sections.map((section, i) => (
          <div key={i} className="mb-12">
            {section.title && <h2 className="text-2xl font-bold text-gray-900 mb-6">{section.title}</h2>}
            {section.items && (
              <div className="grid sm:grid-cols-2 gap-4">
                {section.items.map((item, j) => (
                  <div key={j} className="flex items-start gap-3 p-4 bg-amber-50 rounded-xl">
                    <CheckCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700">{item}</span>
                  </div>
                ))}
              </div>
            )}
            {section.body && (
              <div className="p-6 bg-gray-50 rounded-xl border border-dashed border-gray-300 text-gray-500 italic">
                {section.body}
              </div>
            )}
          </div>
        ))}

        {galleryItems.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Nos interventions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {galleryItems.map((img, i) => (
                <figure key={i} className="rounded-2xl overflow-hidden bg-amber-50 shadow-sm">
                  <img
                    src={img.image_url}
                    alt={img.alt_text || `Événement ${i + 1}`}
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
          <Link to={content.cta.href} className="inline-flex items-center gap-2 bg-amber-700 text-white px-8 py-3 rounded-xl font-semibold hover:bg-amber-800 transition-colors">
            {content.cta.label} <ChevronRight size={18} />
          </Link>
        </div>
      </section>
    </div>
  );
}
