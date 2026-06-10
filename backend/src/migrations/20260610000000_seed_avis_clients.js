/**
 * Seed site_pages content for the "Avis clients" page.
 * Slug 'avis'. Structure calée sur AvisPage.jsx (hero / sections[{type,title?,items[{rating,text,author}]}] / cta).
 * UPSERT idempotent sur slug (ON CONFLICT (slug) DO UPDATE). Paramètre lié => pas de souci d'echappement.
 */
exports.up = async function (knex) {
  const slug = 'avis';
  const title = 'Avis clients';
  const content = {
    hero: {
      title: 'Ils nous font confiance',
      subtitle: 'Les retours de nos clients et partenaires.',
    },
    sections: [
      {
        type: 'testimonials',
        title: 'Avis de nos clients',
        items: [
          { rating: 5, text: 'Équipe très sympathique et pro. Donne de bons conseils et propose des produits de très belle facture. Je recommande activement.', author: 'Grégory C.' },
          { rating: 5, text: 'Vin acheté dernièrement pour les fêtes. Il a fait des heureux, avec une bonne paëlla, un délice ! Encore merci Vins & Conversations de vos conseils.', author: 'Tiphanie' },
          { rating: 5, text: 'Personnel très accueillant et à l\'écoute. Vins délicieux, avec de nombreuses connaissances sur leurs provenances. Je recommande.', author: 'Célia Simon' },
          { rating: 5, text: 'Actions menées avec notre école à merveille, je recommande !', author: 'Tristan' },
        ],
      },
    ],
    cta: { label: 'Laisser un avis', href: '/boutique/contact' },
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
  await knex('site_pages').where({ slug: 'avis' }).del();
};
