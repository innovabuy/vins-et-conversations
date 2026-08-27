/**
 * Seed site_pages content for the "Partenaires" page.
 * Slug 'partenaires'. Structure calée sur PartenairesPage.jsx (hero / sections[{type:'partners',title,items[{name,logo}]}] / cta).
 * Accès non gardés côté front => hero{title,subtitle}, sections[], cta{label,href} OBLIGATOIRES.
 * UPSERT idempotent sur slug (ON CONFLICT (slug) DO NOTHING). Paramètre lié => pas de souci d'echappement.
 *
 * ⚠️ CORRIGÉ LE 27/08/2026 — cette migration était en ON CONFLICT (slug) DO UPDATE.
 * Rejouée sur une base déjà peuplée, elle ÉCRASAIT le contenu édité depuis le back-office
 * par le contenu figé ci-dessous, sans avertissement. Nicolas ayant édité des pages
 * vitrine depuis (Partenaires le 26/08 à 21h41, Raison d'être à 21h39), le risque était
 * concret. Passée en DO NOTHING : un seed ne réécrit JAMAIS une édition admin.
 *
 * Correction faite EN PLACE, volontairement : une migration ultérieure ne pourrait rien
 * y changer, puisque c'est CE fichier qui s'exécute lors d'un rejeu. Le fichier étant
 * déjà appliqué partout (ligne présente dans knex_migrations), l'édition est un no-op
 * sur les bases existantes — Knex ne recalcule pas de somme de contrôle. Elle ne prend
 * effet que là où la migration se rejoue : base fraîche, cutover, restauration.
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
     ON CONFLICT (slug) DO NOTHING`,
    [slug, title, JSON.stringify(content)]
  );
};

exports.down = async function (knex) {
  await knex('site_pages').where({ slug: 'partenaires' }).del();
};
