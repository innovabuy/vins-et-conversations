/**
 * Rend la page vitrine « Financement de projet » (/boutique/prestations/financement)
 * pilotable depuis le back-office : slot image hero + contenu texte CMS.
 *
 * Aujourd'hui le composant FinancementProjetPage.jsx tourne sur ses valeurs par défaut
 * (dégradé wine + DEFAULT_CONTENT en dur) car aucune ligne n'existe en base. Ce seed
 * crée les deux entrées manquantes sans rien changer au rendu (image_url NULL => le
 * composant garde le dégradé ; content_json identique au DEFAULT_CONTENT).
 *
 * 1) site_images : slot 'financement_hero' (schéma réel : page, slot, label, image_url,
 *    active ; contrainte unique (page, slot)). image_url=NULL => reste en dégradé mais
 *    devient éditable dans SiteImagesAdmin.
 *
 * 2) site_pages : ligne slug='prestations-financement'. is_active:true explicite, sinon
 *    le filtre WHERE is_active=true de la route publique (GET /site-pages/:slug) rend le
 *    seed inerte (404). content_json calé EXACTEMENT sur le DEFAULT_CONTENT du composant :
 *    clés hero/structures/objectifs/principe/preuve/fonctionnement/avantages/cta (structure
 *    page-spécifique, PAS le pattern générique sections[] des autres pages vitrine).
 *
 * ON CONFLICT DO NOTHING sur les deux (diagnostic : lignes absentes) => ré-exécution sûre,
 * non destructif, ne réécrit jamais un contenu déjà édité par l'admin.
 *
 * down() : DELETE ciblé des deux lignes insérées (jamais de truncate).
 */

const IMAGE_SLOT = {
  page: 'financement',
  slot: 'financement_hero',
  label: 'Financement de projet — image hero',
};

const PAGE = {
  slug: 'prestations-financement',
  title: 'Financement de projet',
  content: {
    hero: {
      title: 'Financer ses projets',
      subtitle: 'Accompagnement tout type de structure dans la réalisation de vos projets.',
    },
    structures: {
      title: 'À qui s’adresse ce programme ?',
      items: [
        'Associations sportives, culturelles…',
        'Établissements scolaires (Supérieur, lycées, MFR)',
        'Soirées étudiantes / événementielles (BDE…)',
        'Associations de parents d’élèves',
      ],
    },
    objectifs: {
      title: 'Dans quel but réaliser un projet de vente de vins ?',
      intro: 'Un projet de vente rémunérateur, au service de vos objectifs :',
      items: [
        'Financer une action humanitaire',
        'Financer vos projets associatifs, pédagogiques…',
        'Financer vos soirées étudiantes / événementielles',
        'Monter en compétences dans le milieu de la vente',
      ],
    },
    principe: {
      title: 'Une rémunération pour booster vos projets',
      body: 'À travers cette action de vente directe, vous serez pleinement intégré dans le projet. Le but étant de récolter les fonds nécessaires afin de financer vos différents projets, calculés en fonction du chiffre d’affaires réalisé sur la durée du projet de vente de vins.\n\nCette action est totalement gratuite, sans engagement ni contrepartie demandée.',
    },
    preuve: {
      title: 'Ils l’ont fait : la CCI d’Angers',
      body: 'La CCI d’Angers a réalisé cette action de vente de vins pour financer une partie de son voyage au Salon de la Franchise, grâce à la commission générée sur les ventes.',
    },
    fonctionnement: {
      title: 'Notre fonctionnement',
      steps: [
        'Nous échangeons avec vous pour comprendre votre projet et vos objectifs de financement.',
        'Vous réalisez vos ventes sur catalogue, auprès de votre entourage, avec notre accompagnement.',
        'Nous vous livrons les vins commandés, en vous apportant les conseils de conservation et de service.',
      ],
    },
    avantages: {
      title: 'Les avantages Vins & Conversations',
      items: [
        'Proposer un produit « plaisir » et de qualité à son entourage',
        'Bénéficier d’une présentation de lancement dans vos locaux par notre équipe',
        'Un suivi et un accompagnement tout le long de l’opération, avec un calendrier de départ et de fin défini ensemble',
        'Vente sur catalogue, sans avance de trésorerie ni stock à gérer',
        'Différents supports physiques et digitaux pour faciliter vos ventes',
        'Commission pour la structure, entièrement dédiée au financement de votre projet',
        'Logistique assurée par nos soins (avec livraison intermédiaire si besoin)',
      ],
    },
    cta: {
      tagline: 'Votre projet vous tient à cœur ? Parlons-en.',
      label: 'Nous contacter',
      href: '/boutique/contact',
    },
  },
};

exports.up = async function (knex) {
  // 1) Slot image hero — reste en dégradé (image_url NULL) mais devient éditable admin.
  await knex.raw(
    `INSERT INTO site_images (page, slot, label, image_url, active)
     VALUES (?, ?, ?, NULL, true)
     ON CONFLICT (page, slot) DO NOTHING`,
    [IMAGE_SLOT.page, IMAGE_SLOT.slot, IMAGE_SLOT.label]
  );

  // 2) Contenu CMS texte — identique au DEFAULT_CONTENT du composant.
  await knex.raw(
    `INSERT INTO site_pages (slug, title, content_json, is_active)
     VALUES (?, ?, ?::jsonb, true)
     ON CONFLICT (slug) DO NOTHING`,
    [PAGE.slug, PAGE.title, JSON.stringify(PAGE.content)]
  );
};

exports.down = async function (knex) {
  await knex('site_pages').where({ slug: PAGE.slug }).del();
  await knex('site_images').where({ page: IMAGE_SLOT.page, slot: IMAGE_SLOT.slot }).del();
};
