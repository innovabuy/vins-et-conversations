import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Building2, ChevronRight, CheckCircle } from 'lucide-react';
import api from '../../services/api';
import { useSiteImage } from '../../contexts/SiteImagesContext';

const DEFAULT_CONTENT = {
  hero: {
    title: 'Espace CSE — Des vins d\'exception pour vos collaborateurs',
    subtitle: 'Offrez à vos salariés une sélection de vins français de qualité, à tarif préférentiel CSE. Commandes en ligne, livraison ou retrait, facture automatique.',
  },
  sections: [
    { type: 'features', title: 'Avantages CSE', items: [
      'Remise CSE (–10 % sur le prix public)',
      'Commande minimum 200 €',
      'Paiement par virement 30 jours',
      'Facture PDF automatique',
      'Catalogue dédié',
    ]},
  ],
  cta: { label: 'Accéder à l\'espace CSE', href: '/login' },
};

export default function PrestationCSEPage() {
  const [content, setContent] = useState(DEFAULT_CONTENT);
  const heroBg = useSiteImage('cse_hero');
  const gal1 = useSiteImage('cse_galerie_1');
  const gal2 = useSiteImage('cse_galerie_2');
  const gal3 = useSiteImage('cse_galerie_3');
  const galleryItems = [gal1, gal2, gal3].filter(g => g && g.image_url);

  useEffect(() => {
    api.get('/site-pages/prestations-cse')
      .then(({ data }) => { if (data.content_json) setContent(data.content_json); })
      .catch(() => {});
  }, []);

  return (
    <div>
      <section
        className={`relative text-white py-20 ${heroBg?.image_url ? 'bg-blue-900' : 'bg-gradient-to-br from-blue-800 via-blue-700 to-blue-900'}`}
        style={heroBg?.image_url ? { backgroundImage: `url(${heroBg.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      >
        {heroBg?.image_url && <div className="absolute inset-0 bg-black/45" aria-hidden="true" />}
        <div className="relative max-w-4xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur rounded-full px-4 py-1.5 text-sm mb-6">
            <Building2 size={16} /> Comités Sociaux et Économiques
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-6">{content.hero.title}</h1>
          <p className="text-lg text-blue-200 max-w-2xl mx-auto">{content.hero.subtitle}</p>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 py-16">
        {content.sections.map((section, i) => (
          <div key={i} className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">{section.title}</h2>
            {section.items && (
              <div className="grid sm:grid-cols-2 gap-4">
                {section.items.map((item, j) => (
                  <div key={j} className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl">
                    <CheckCircle size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700">{item}</span>
                  </div>
                ))}
              </div>
            )}
            {section.body && <p className="text-gray-600 leading-relaxed">{section.body}</p>}
          </div>
        ))}

        {galleryItems.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Nos interventions</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {galleryItems.map((img, i) => (
                <figure key={i} className="rounded-2xl overflow-hidden bg-blue-50 shadow-sm">
                  <img
                    src={img.image_url}
                    alt={img.alt_text || `Intervention CSE ${i + 1}`}
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
          <Link to={content.cta.href} className="inline-flex items-center gap-2 bg-blue-700 text-white px-8 py-3 rounded-xl font-semibold hover:bg-blue-800 transition-colors">
            {content.cta.label} <ChevronRight size={18} />
          </Link>
        </div>
      </section>
    </div>
  );
}
