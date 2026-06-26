/**
 * Seed site_pages content for the "Équipe" page.
 * Slug 'equipe'. Structure calée sur EquipePage.jsx (hero / members[{slot,name,role,bio,email}] / cta).
 * Accès non gardés côté front => hero{title,subtitle}, members[], cta{label,href} OBLIGATOIRES.
 * Photos résolues séparément via site_images (slots equipe_*) — uploadées par l'admin, hors seed.
 * UPSERT idempotent sur slug (ON CONFLICT (slug) DO UPDATE). Paramètre lié => pas de souci d'echappement.
 */
exports.up = async function (knex) {
  const slug = 'equipe';
  const title = "L'Équipe";
  const content = {
    hero: {
      title: "L'Équipe",
      subtitle: 'Les passionnés derrière Vins & Conversations.',
    },
    members: [
      {
        slot: 'equipe_nicolas',
        name: 'Nicolas Froment',
        role: 'Gérant',
        bio: "Ancien caviste, négociant en vins et spiritueux pendant 12 ans, je place mon expérience et ma connaissance des domaines au service de Vins&Conversations pour le bonheur des amateurs de beaux terroirs !",
        email: 'vins.et.conversations@gmail.com',
      },
      {
        slot: 'equipe_matheo',
        name: 'Mathéo Benoit',
        role: 'Responsable Commercial et animateur réseau',
        bio: "Diplômé d'un Master - Commerce - Management et Entrepreneuriat, je développe les liens et les partenariats pour faire découvrir nos trouvailles gustatives !",
        email: 'bmatheo.vins.et.conversations@gmail.com',
      },
      {
        slot: 'equipe_malone',
        name: 'Malone Froment',
        role: 'Alternant Assistant commercial',
        bio: "Actuellement en BTS Négociation et Digitalisation de la Relation Client (NDRC), je contribue activement, au sein de l'équipe, au développement des activités commerciales et marketing de Vins & Conversations. Mon rôle est centré sur le support opérationnel, l'aide à la prospection, la gestion administrative des ventes et la participation aux projets de communication digitale.",
        email: 'fmalone.vins.et.conversations@gmail.com',
      },
      {
        slot: 'equipe_martin',
        name: 'Martin Hery',
        role: 'Alternant commercial',
        bio: "Diplômé d'un BTS NDRC et actuellement en Bachelor, j'assure le développement commercial et marketing stratégique de Vins & Conversations. Mes missions principales incluent la gestion de portefeuille clients Vins & Conversations, la négociation de partenariats, l'atteinte d'objectifs de vente et la mise en œuvre des stratégies de croissance.",
        email: 'hmartin.vins.et.conversations@gmail.com',
      },
    ],
    cta: { label: 'Nous contacter', href: '/boutique/contact' },
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
  await knex('site_pages').where({ slug: 'equipe' }).del();
};
