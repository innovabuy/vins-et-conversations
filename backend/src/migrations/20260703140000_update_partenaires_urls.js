/**
 * Enrichit la page site_pages slug='partenaires' :
 *  - ajoute un champ `url` cliquable sur chaque item,
 *  - normalise 'esup' -> 'ESUP',
 *  - ajoute le 4e partenaire "Groupe Sacré-Cœur La Salle" (logo partenaire_gscls.jpg déjà uploadé).
 *
 * La row EXISTE déjà => on UPDATE son content_json (UPSERT ON CONFLICT DO UPDATE, pattern d'origine
 * cf. 20260610000001_seed_partenaires.js). Ce n'est PAS un INSERT sec : pas de nouvelle row.
 *
 * down() : restaure le content_json à son état EXACT d'avant (3 items, sans url, 'esup' minuscule).
 * Rollback = row rendue à son état d'avant, jamais vidée.
 */

const SLUG = 'partenaires';
const TITLE = 'Nos Partenaires';

// État cible (up) — 4 items, url + ESUP normalisé + GSCLS.
const CONTENT_AFTER = {
  hero: {
    title: 'Nos Partenaires',
    subtitle: 'Ils nous accompagnent au quotidien dans notre démarche qualité.',
  },
  sections: [
    {
      type: 'partners',
      title: 'Partenaires',
      items: [
        { name: 'CCI 49', logo: '/uploads/site/partenaire_cci.jpg', url: 'https://www.paysdelaloire.cci.fr/maine-et-loire' },
        { name: 'ESUP', logo: '/uploads/site/partenaire_esup.jpg', url: 'https://www.esup.fr/ecole-de-commerce-angers/' },
        { name: 'ESPL', logo: '/uploads/site/partenaire_espl.png', url: 'https://www.espl.fr/' },
        { name: 'Groupe Sacré-Cœur La Salle', logo: '/uploads/site/partenaire_gscls.jpg', url: 'https://gscls.com/' },
      ],
    },
  ],
  cta: { label: 'Devenir partenaire', href: '/boutique/contact' },
};

// État d'origine EXACT (down) — capturé en live avant migration : 3 items, sans url, 'esup' minuscule.
const CONTENT_BEFORE = {
  cta: { href: '/boutique/contact', label: 'Devenir partenaire' },
  hero: {
    title: 'Nos Partenaires',
    subtitle: 'Ils nous accompagnent au quotidien dans notre démarche qualité.',
  },
  sections: [
    {
      type: 'partners',
      title: 'Partenaires',
      items: [
        { logo: '/uploads/site/partenaire_cci.jpg', name: 'CCI 49' },
        { logo: '/uploads/site/partenaire_esup.jpg', name: 'esup' },
        { logo: '/uploads/site/partenaire_espl.png', name: 'ESPL' },
      ],
    },
  ],
};

exports.up = async function (knex) {
  await knex.raw(
    `INSERT INTO site_pages (slug, title, content_json, is_active)
     VALUES (?, ?, ?::jsonb, true)
     ON CONFLICT (slug) DO UPDATE SET
       title = EXCLUDED.title,
       content_json = EXCLUDED.content_json,
       updated_at = now()`,
    [SLUG, TITLE, JSON.stringify(CONTENT_AFTER)]
  );
};

exports.down = async function (knex) {
  await knex('site_pages')
    .where({ slug: SLUG })
    .update({ content_json: JSON.stringify(CONTENT_BEFORE), updated_at: knex.fn.now() });
};
