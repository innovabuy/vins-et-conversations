/**
 * Seed site_pages content for the "Raison d'être / Manifeste La Part des Anges" page.
 * Slug 'raison-d-etre'. Structure calée sur RaisonDetrePage.jsx (hero / sections[{title?,body?}] / cta).
 * UPSERT idempotent sur slug (ON CONFLICT (slug) DO UPDATE). Paramètre lié => pas de souci d'echappement.
 */
exports.up = async function (knex) {
  const slug = 'raison-d-etre';
  const title = 'Notre raison d\'être';
  const content = {
    hero: {
      title: 'Notre raison d\'être',
      subtitle: 'Transmettre, Partager, Créer du lien.',
    },
    sections: [
      { title: 'Notre vision', body: 'Des boissons de terroir, reflets d\'une terre et d\'un savoir-faire, vecteurs de partage et de culture. Le vin est notre point de départ, pas notre limite.' },
      { title: 'Notre conviction', body: 'Vendre, c\'est transmettre. Le vin est un lubrifiant social, un média, un moment de dialogue et non une simple transaction.' },
      { title: 'Notre ambition', body: 'Construire un modèle durable où la performance économique sert un projet humain et où la culture du terroir devient un outil d\'éducation et de lien social.' },
      { title: 'Passé · Présent · Futur', body: 'Nos traditions et savoirs d\'hier, le digital au service de la proximité aujourd\'hui, et demain : réapprendre d\'humain à humain.' },
      { title: 'Nos valeurs', body: 'Responsabilité · Environnement · Solidarité · Partage · Engagement · Convivialité · Transmission.' },
      { title: 'Nos engagements en action', body: 'OGEC Sacré-Cœur — 1 517 € (mars 2026)\nFlo Hockey Pro — 1 588 € (janvier 2026)\nAssociation Rêves 49 — 1 588 € (janvier 2026)' },
      { title: 'Notre mission pédagogique', body: '• Former et sensibiliser les jeunes\n• Accompagner des projets pédagogiques et associatifs\n• Valoriser les producteurs et leur savoir-faire\n• Utiliser la vente comme outil de financement pédagogique\n• Créer des expériences collectives porteuses de sens' },
      { body: '« Parce que partager compte plus que garder pour soi. Ce qui s\'évapore n\'est jamais perdu. Il élève l\'ensemble. »' },
    ],
    cta: { label: 'Découvrir nos vins', href: '/boutique' },
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
  await knex('site_pages').where({ slug: 'raison-d-etre' }).del();
};
