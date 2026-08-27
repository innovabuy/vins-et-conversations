/**
 * Seed CMS des trois pages vitrine dont le H1 était écrit en dur dans le JSX :
 * 'accueil' (BoutiqueHome), 'ambassadeurs' (AmbassadorsPage), 'contact' (ContactForm).
 *
 * Ces trois composants viennent d'être alignés sur le patron des onze autres pages
 * (useState(DEFAULT_CONTENT) + api.get('/site-pages/<slug>') + rendu de content.hero.*).
 * Cette migration crée les lignes correspondantes avec EXACTEMENT le texte qui était
 * en dur — donc aucun changement visuel, ni avant ni après.
 *
 * ── Modèle du H1 de l'accueil (arbitrage Jeff du 27/08, modèle A) ──────────────────
 * Le H1 de BoutiqueHome est composé de deux morceaux, le second portant une mise en
 * forme propre :
 *     Des vins d'exception<br /><span className="text-wine-200">pour des moments uniques</span>
 * Il est donc porté par DEUX clés distinctes : hero.title et hero.title_highlight.
 * Le composant ne rend le <br /> + <span> QUE si title_highlight est non vide → Nicolas
 * peut écrire un titre sur une seule ligne (title_highlight vide ou absent) sans casser
 * la mise en page. Le modèle « une seule clé avec un \n » a été écarté : la convention
 * serait invisible dans l'éditeur JSON du back-office.
 * Les deux clés sont propres à l'accueil ; les autres pages gardent title/subtitle seuls.
 *
 * ON CONFLICT (slug) DO NOTHING — patron 20260709120000_seed_financement_cms_hero.js,
 * groupage multi-slugs sur le patron 20260703000001_seed_bloc4_pages.js. Jamais DO UPDATE.
 * is_active: true explicite (sinon 404 sur la route publique qui filtre is_active).
 *
 * down() : DELETE ciblé des trois slugs (jamais de truncate).
 */

const PAGES = [
  {
    slug: 'accueil',
    title: 'Accueil boutique',
    content: {
      hero: {
        title: 'Des vins d\'exception',
        title_highlight: 'pour des moments uniques',
        subtitle: 'Découvrez notre sélection de vins français, choisis avec soin par Nicolas Froment. Chaque bouteille raconte une histoire.',
      },
    },
  },
  {
    slug: 'ambassadeurs',
    title: 'Nos Ambassadeurs',
    content: {
      hero: {
        title: 'Nos Ambassadeurs',
        subtitle: 'Retrouvez nos ambassadeurs dans toute la France',
      },
    },
  },
  {
    slug: 'contact',
    title: 'Contact',
    content: {
      hero: {
        title: 'Une question ? Un projet ?',
        subtitle: 'N\'hésitez pas à nous écrire. Nous répondons à toutes les demandes sous 48h.',
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
