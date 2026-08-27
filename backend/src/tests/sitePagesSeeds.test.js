/**
 * TESTS — Seeds CMS des pages vitrine (SPS1 à SPS4)
 *
 * Verrouille la promesse « aucun changement visuel après cutover » : sur une base
 * fraîche (migrate + seed), chaque page vitrine doit servir par l'API exactement le
 * header que son composant affichait quand il tournait sur ses valeurs par défaut.
 *
 * Sans ce garde-fou, une migration de seed oubliée ou modifiée passe inaperçue : la
 * page continue de s'afficher (le composant retombe sur son DEFAULT_CONTENT) mais
 * devient inéditable depuis le back-office, et le contenu rédigé par Nicolas disparaît
 * au prochain rejeu — c'est exactement ce qui était arrivé à la FAQ.
 *
 * ⚠️ Les chaînes attendues ci-dessous sont une COPIE des DEFAULT_CONTENT des composants
 * React (le back ne peut pas les importer). Elles sont donc à mettre à jour de pair :
 * si un H1 change dans le JSX, la migration de seed ET ce tableau doivent suivre.
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

// slug -> header attendu. `highlight` n'existe que pour l'accueil (H1 bicolore, modèle
// à deux clés : hero.title + hero.title_highlight).
const SEEDED_PAGES = [
  {
    slug: 'faq',
    source: 'contenu rédigé par Nicolas le 27/08 (migration 20260827100000)',
    title: 'Questions fréquentes',
    subtitle: 'Retrouvez les réponses aux questions les plus courantes sur nos services.',
  },
  {
    slug: 'prestations-cse',
    source: 'DEFAULT_CONTENT de PrestationCSEPage.jsx',
    title: 'Espace CSE — Des vins d\'exception pour vos collaborateurs',
    subtitle: 'Offrez à vos salariés une sélection de vins français de qualité, à tarif préférentiel CSE. Commandes en ligne, livraison ou retrait, facture automatique.',
  },
  {
    slug: 'coffrets',
    source: 'fallbacks inline de CoffretsVitrinePage.jsx',
    title: 'Nos Coffrets — L\'art de l\'offrir',
    subtitle: 'Offrez une expérience gustative unique avec nos coffrets cadeaux soigneusement composés.',
  },
  {
    slug: 'accueil',
    source: 'H1 anciennement en dur dans BoutiqueHome.jsx',
    title: 'Des vins d\'exception',
    highlight: 'pour des moments uniques',
    subtitle: 'Découvrez notre sélection de vins français, choisis avec soin par Nicolas Froment. Chaque bouteille raconte une histoire.',
  },
  {
    slug: 'ambassadeurs',
    source: 'H1 anciennement en dur dans AmbassadorsPage.jsx',
    title: 'Nos Ambassadeurs',
    subtitle: 'Retrouvez nos ambassadeurs dans toute la France',
  },
  {
    slug: 'contact',
    source: 'H1 anciennement en dur dans ContactForm.jsx',
    title: 'Une question ? Un projet ?',
    subtitle: 'N\'hésitez pas à nous écrire. Nous répondons à toutes les demandes sous 48h.',
  },
  // Les trois seeds passés de DO UPDATE à DO NOTHING le 27/08 : on vérifie qu'ils
  // continuent de poser leur contenu sur base fraîche (un DO NOTHING sur une table
  // vide reste un INSERT).
  {
    slug: 'avis',
    source: 'migration 20260610000000 (ex-DO UPDATE)',
    title: 'Ils nous font confiance',
  },
  {
    slug: 'partenaires',
    source: 'migration 20260610000001 (ex-DO UPDATE)',
    title: 'Nos Partenaires',
  },
  {
    slug: 'devenir-ambassadeur',
    source: 'migration 20260714160000 (ex-DO UPDATE)',
    title: 'Devenir ambassadeur',
  },
];

beforeAll(async () => {
  await db.raw('SELECT 1');
});

afterAll(async () => {
  await db.destroy();
});

// SPS1 — chaque page seedée est servie par la route publique avec le bon header
describe('SPS1 — Header servi par l\'API pour chaque page vitrine seedée', () => {
  test.each(SEEDED_PAGES)('$slug — hero conforme ($source)', async (page) => {
    const res = await request(app).get(`/api/v1/site-pages/${page.slug}`);

    expect(res.status).toBe(200);
    expect(res.body.content_json).toBeTruthy();
    expect(res.body.content_json.hero).toBeTruthy();
    expect(res.body.content_json.hero.title).toBe(page.title);

    if (page.subtitle !== undefined) {
      expect(res.body.content_json.hero.subtitle).toBe(page.subtitle);
    }
    if (page.highlight !== undefined) {
      expect(res.body.content_json.hero.title_highlight).toBe(page.highlight);
    }
  });
});

// SPS2 — is_active explicite : sans lui la route publique renverrait 404 et le seed
// serait inerte (le composant retomberait silencieusement sur son DEFAULT_CONTENT).
describe('SPS2 — Pages seedées actives', () => {
  test('les 9 pages sont is_active = true en base', async () => {
    const rows = await db('site_pages')
      .whereIn('slug', SEEDED_PAGES.map((p) => p.slug))
      .select('slug', 'is_active');

    expect(rows).toHaveLength(SEEDED_PAGES.length);
    expect(rows.filter((r) => !r.is_active)).toEqual([]);
  });
});

// SPS3 — toute page listée dans le back-office doit exister en base, sinon Nicolas
// tombe sur un éditeur vide et doit écrire le JSON de zéro. Miroir de KNOWN_SLUGS
// (SitePagesAdmin.jsx) : les deux listes doivent rester alignées.
describe('SPS3 — Aucune page du back-office sans ligne en base', () => {
  const KNOWN_SLUGS = [
    'accueil', 'prestations-cse', 'prestations-ecoles', 'prestations-repas',
    'prestations-financement', 'a-propos', 'equipe', 'raison-d-etre',
    'ambassadeurs', 'devenir-ambassadeur', 'cercle-ambassadeurs', 'faq',
    'avis', 'partenaires', 'coffrets', 'contact',
  ];

  test('chaque slug de KNOWN_SLUGS a une ligne site_pages', async () => {
    const rows = await db('site_pages').whereIn('slug', KNOWN_SLUGS).select('slug');
    const present = rows.map((r) => r.slug);
    const missing = KNOWN_SLUGS.filter((s) => !present.includes(s));
    expect(missing).toEqual([]);
  });
});

// SPS4 — les slots d'image de hero survivent au seed. Le seed 001_seed_all.js faisait
// un site_images.del() qui effaçait tous les slots posés par migration ; le .del() a
// été retiré le 27/08 au profit d'un insert idempotent. Ce test empêche sa réapparition.
describe('SPS4 — Slots d\'image de hero posés par migration', () => {
  const MIGRATED_SLOTS = [
    'equipe_hero', 'avis_hero', 'partenaires_hero',
    'financement_hero', 'raison_etre_hero', 'cercle_ambassadeurs_hero',
    'equipe_groupe',
  ];

  test('les slots créés par migration ne sont pas effacés par le seed', async () => {
    const rows = await db('site_images').whereIn('slot', MIGRATED_SLOTS).select('slot');
    const present = rows.map((r) => r.slot);
    const missing = MIGRATED_SLOTS.filter((s) => !present.includes(s));
    expect(missing).toEqual([]);
  });
});
