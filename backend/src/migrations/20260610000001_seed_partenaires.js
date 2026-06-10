/**
 * Seed site_pages content for the "Partenaires" page.
 * Slug 'partenaires'. Structure calée sur PartenairesPage.jsx (hero / sections[{type:'partners',title,items[{name,logo}]}] / cta).
 * Accès non gardés côté front => hero{title,subtitle}, sections[], cta{label,href} OBLIGATOIRES.
 * UPSERT idempotent sur slug (ON CONFLICT (slug) DO UPDATE). Paramètre lié => pas de souci d'echappement.
 */
exports.up = async function (knex) {
  const slug = 'partenaires';
  const title = 'Nos Partenaires';
  const content = {
    hero: {
      title: 'Nos Partenaires',
      subtitle: 'Ils nous accompagnent au quotidien dans notre démarche qualité.',
    },
    sections: [
      {
        type: 'partners',
        title: 'Partenaires',
        items: [
          { name: 'CCI 49', logo: '/uploads/site/partenaire_cci.jpg' },
          { name: 'esup', logo: '/uploads/site/partenaire_esup.jpg' },
          { name: 'ESPL', logo: '/uploads/site/partenaire_espl.png' },
        ],
      },
    ],
    cta: { label: 'Devenir partenaire', href: '/boutique/contact' },
  };

  await knex.raw(
    `INSERT INTO site_pages (slug, title, content_json, is_active)
     VALUES (?, ?, ?::jsonb, true)
     ON CONFLICT (slug) DO UPDATE SET
       title = EXCLUDED.title,
       content_json = EXCLUDED.content_json,
       updated_at = now()`,
    [slug, title, JSON.stringify(content)]
  );
};

exports.down = async function (knex) {
  await knex('site_pages').where({ slug: 'partenaires' }).del();
};
