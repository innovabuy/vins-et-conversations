import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { HelpCircle, ChevronRight, ChevronDown } from 'lucide-react';
import api from '../../services/api';

const DEFAULT_CONTENT = {
  hero: {
    title: 'Questions fréquentes',
    subtitle: 'Retrouvez les réponses aux questions les plus courantes sur nos services.',
  },
  sections: [
    { type: 'faq', items: [
      { q: 'Comment passer une commande ?', a: 'Réponse à compléter par Nicolas.' },
      { q: 'Quels sont les délais de livraison ?', a: 'Réponse à compléter par Nicolas.' },
      { q: 'Puis-je retirer ma commande sur place ?', a: 'Réponse à compléter par Nicolas.' },
      { q: 'Comment fonctionne le programme ambassadeur ?', a: 'Réponse à compléter par Nicolas.' },
      { q: 'Les vins sont-ils disponibles en CSE ?', a: 'Réponse à compléter par Nicolas.' },
    ]},
  ],
  cta: { label: 'Nous contacter', href: '/boutique/contact' },
};

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors">
        <span className="font-medium text-gray-900">{q}</span>
        <ChevronDown size={18} className={`text-gray-400 transition-transform flex-shrink-0 ml-4 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 pb-5 text-gray-600 leading-relaxed border-t border-gray-100 pt-3">
          {a}
        </div>
      )}
    </div>
  );
}

export default function FAQPage() {
  const [content, setContent] = useState(DEFAULT_CONTENT);

  useEffect(() => {
    api.get('/site-pages/faq')
      .then(({ data }) => { if (data.content_json) setContent(data.content_json); })
      .catch(() => {});
  }, []);

  return (
    <div>
      <section className="bg-gradient-to-br from-wine-800 via-wine-700 to-wine-900 text-white py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur rounded-full px-4 py-1.5 text-sm mb-6">
            <HelpCircle size={16} /> FAQ
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-6">{content.hero.title}</h1>
          <p className="text-lg text-wine-200 max-w-2xl mx-auto">{content.hero.subtitle}</p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 py-16">
        {content.sections.map((section, i) => (
          <div key={i} className="mb-12">
            {section.type === 'faq' && section.items && (
              <div className="space-y-3">
                {section.items.map((item, j) => (
                  <FAQItem key={j} q={item.q} a={item.a} />
                ))}
              </div>
            )}
          </div>
        ))}

        <div className="text-center mt-12 p-6 bg-wine-50 rounded-2xl">
          <p className="text-gray-700 mb-4">Vous ne trouvez pas la réponse à votre question ?</p>
          <Link to={content.cta.href} className="inline-flex items-center gap-2 bg-wine-700 text-white px-8 py-3 rounded-xl font-semibold hover:bg-wine-800 transition-colors">
            {content.cta.label} <ChevronRight size={18} />
          </Link>
        </div>
      </section>
    </div>
  );
}
