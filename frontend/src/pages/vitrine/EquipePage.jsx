import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, ChevronRight, Mail, UserRound } from 'lucide-react';
import api from '../../services/api';
import { useSiteImage } from '../../contexts/SiteImagesContext';

const DEFAULT_CONTENT = {
  hero: {
    title: 'L\'Équipe',
    subtitle: 'Les passionnés derrière Vins & Conversations.',
  },
  members: [
    { slot: 'equipe_nicolas', name: 'Nicolas Froment', role: 'Fondateur & Gérant', bio: 'Ancien caviste et négociant en vins et spiritueux pendant près de 12 ans, Nicolas a lancé Vins & Conversations pour partager sa passion du vin et du lien humain.', email: '' },
    { slot: 'equipe_matheo', name: 'Mathéo Benoit', role: 'Relation clients', bio: 'Présentation à compléter.', email: '' },
    { slot: 'equipe_malone', name: 'Malone Froment', role: 'Équipe', bio: 'Présentation à compléter.', email: '' },
    { slot: 'equipe_martin', name: 'Martin Hery', role: 'Équipe', bio: 'Présentation à compléter.', email: '' },
  ],
  cta: { label: 'Nous contacter', href: '/boutique/contact' },
};

export default function EquipePage() {
  const [content, setContent] = useState(DEFAULT_CONTENT);
  const imgNicolas = useSiteImage('equipe_nicolas');
  const imgMatheo = useSiteImage('equipe_matheo');
  const imgMalone = useSiteImage('equipe_malone');
  const imgMartin = useSiteImage('equipe_martin');
  const photoBySlot = {
    equipe_nicolas: imgNicolas,
    equipe_matheo: imgMatheo,
    equipe_malone: imgMalone,
    equipe_martin: imgMartin,
  };

  useEffect(() => {
    api.get('/site-pages/equipe')
      .then(({ data }) => { if (data.content_json) setContent(data.content_json); })
      .catch(() => {});
  }, []);

  const members = content.members || [];

  return (
    <div>
      <section className="bg-gradient-to-br from-wine-800 via-wine-700 to-wine-900 text-white py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur rounded-full px-4 py-1.5 text-sm mb-6">
            <Users size={16} /> Notre équipe
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-6">{content.hero.title}</h1>
          <p className="text-lg text-wine-200 max-w-2xl mx-auto">{content.hero.subtitle}</p>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 py-16">
        <div className="grid sm:grid-cols-2 gap-8">
          {members.map((m, i) => {
            const photo = photoBySlot[m.slot];
            return (
              <div key={m.slot || i} className="flex gap-5 p-6 bg-white border border-gray-100 rounded-2xl shadow-sm">
                <div className="flex-shrink-0">
                  {photo?.image_url ? (
                    <img
                      src={photo.image_url}
                      alt={photo.alt_text || m.name}
                      loading="lazy"
                      className="w-24 h-24 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-wine-100 flex items-center justify-center" aria-hidden="true">
                      <UserRound size={40} className="text-wine-400" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-gray-900">{m.name}</h3>
                  {m.role && <span className="inline-block text-sm font-medium text-wine-700 mb-2">{m.role}</span>}
                  {m.bio && <p className="text-sm text-gray-600 leading-relaxed">{m.bio}</p>}
                  {m.email && (
                    <a href={`mailto:${m.email}`} className="inline-flex items-center gap-1.5 mt-3 text-sm text-wine-700 hover:text-wine-800">
                      <Mail size={14} /> {m.email}
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-center mt-12">
          <Link to={content.cta.href} className="inline-flex items-center gap-2 bg-wine-700 text-white px-8 py-3 rounded-xl font-semibold hover:bg-wine-800 transition-colors">
            {content.cta.label} <ChevronRight size={18} />
          </Link>
        </div>
      </section>
    </div>
  );
}
