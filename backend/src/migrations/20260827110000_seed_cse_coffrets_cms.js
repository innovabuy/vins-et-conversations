/**
 * Seed CMS des deux pages vitrine listées dans SitePagesAdmin mais SANS ligne en base :
 * 'prestations-cse' et 'coffrets'.
 *
 * Diagnostic : les deux slugs apparaissent dans KNOWN_SLUGS et s'affichent « Par défaut »
 * dans le back-office. Sans ligne en base, un « Enregistrer » obligerait Nicolas à écrire
 * le JSON de zéro (le textarea est vide) — au moindre oubli de clé, la page casse. Ce seed
 * matérialise le contenu déjà affiché pour qu'il parte d'une base éditable.
 *
 * AUCUN CHANGEMENT VISUEL : les content_json sont la copie littérale de ce que les
 * composants rendent aujourd'hui via leurs valeurs par défaut.
 *
 *  - prestations-cse : copie du DEFAULT_CONTENT de PrestationCSEPage.jsx (hero, sections
 *    [features], cta). Le libellé « Remises CSE » est celui du commit b90218d (11/07),
 *    pas l'ancien intitulé.
 *
 *  - coffrets : hero SEUL. CoffretsVitrinePage.jsx n'a pas de DEFAULT_CONTENT ; ses
 *    valeurs par défaut sont deux fallbacks inline (heroTitle / heroSubtitle) et le
 *    composant NE LIT QUE content.hero.title et content.hero.subtitle. Le CTA « Voir tout
 *    le catalogue » et la grille de coffrets sont en dur / alimentés par le catalogue.
 *    Seeder ici un cta ou des sections produirait du JSON inerte que Nicolas éditerait
 *    sans effet visible — volontairement écarté.
 *
 * ON CONFLICT (slug) DO NOTHING — patron 20260709120000_seed_financement_cms_hero.js,
 * groupage multi-slugs sur le patron 20260703000001_seed_bloc4_pages.js. Jamais DO UPDATE.
 * is_active: true explicite (sinon 404 sur la route publique qui filtre is_active).
 *
 * down() : DELETE ciblé des deux slugs (jamais de truncate).
 */

const PAGES = [
  {
    slug: 'prestations-cse',
    title: 'Prestation CSE',
    content: {
      hero: {
        title: 'Espace CSE — Des vins d\'exception pour vos collaborateurs',
        subtitle: 'Offrez à vos salariés une sélection de vins français de qualité, à tarif préférentiel CSE. Commandes en ligne, livraison ou retrait, facture automatique.',
      },
      sections: [
        {
          type: 'features',
          title: 'Avantages CSE',
          items: [
            'Remises CSE',
            'Facture PDF automatique',
            'Catalogue dédié',
          ],
        },
      ],
      cta: { label: 'Accéder à l\'espace CSE', href: '/login' },
    },
  },
  {
    slug: 'coffrets',
    title: 'Coffrets',
    content: {
      hero: {
        title: 'Nos Coffrets — L\'art de l\'offrir',
        subtitle: 'Offrez une expérience gustative unique avec nos coffrets cadeaux soigneusement composés.',
      },
    },
  },
];

exports.up = async function (knex) {
  for (const page of PAGES) {
    await knex.raw(
      `INSERT INTO site_pages (slug, title, content_json, is_active)
       VALUES (?, ?, ?::jsonb, true)
       ON CONFLICT (slug) DO NOTHING`,
      [page.slug, page.title, JSON.stringify(page.content)]
    );
  }
};

exports.down = async function (knex) {
  await knex('site_pages')
    .whereIn('slug', PAGES.map((p) => p.slug))
    .del();
};
