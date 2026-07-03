/**
 * Seed site_pages content for the 3 "Bloc 4" vitrine pages.
 * Slugs : 'prestations-ecoles', 'prestations-repas', 'cercle-ambassadeurs'.
 * Structure calée sur le rendu (hero{title,subtitle} / sections[{type,title,items[]|body}] / cta{label,href,tagline?}).
 * Le rendu ne lit que title / items[] / body / hero.* / cta.label / cta.href / cta.tagline ; `type` est inerte (convention maison, cf. seed_partenaires).
 * cta.tagline = accroche de Nicolas rendue au-dessus du bouton (ecoles + repas). Cercle n'en a pas (clé absente => non rendue).
 * is_active:true explicite (sinon le filtre WHERE is_active=true rend le seed inerte).
 * INSERT sec : conflit sur slug => throw (unique violation), rollback atomique. Pas de re-seed silencieux.
 * down() : DELETE ciblé des 3 slugs (jamais truncate).
 * Contenu fourni par Nicolas, reproduit fidèlement. Param lié => pas de souci d'échappement.
 */

const PAGES = [
  {
    slug: 'prestations-ecoles',
    title: 'Partenariat École',
    content: {
      hero: {
        title: 'Partenariat École',
        subtitle: 'Notre action de vente directe dans quels buts ?',
      },
      sections: [
        {
          type: 'features',
          title: 'Vendre des produits pour travailler son argumentation',
          items: [
            'Des produits sélectionnés pour leur qualité, provenant de producteurs partenaires français.',
            'Nos vins pourront ravir un grand nombre de personnes en fonction des goûts.',
            'Faire déguster et découvrir des vins de différents terroirs.',
            'Des produits idéaux pour des cadeaux de fin d’année et accompagner vos repas.',
          ],
        },
        {
          type: 'text',
          title: 'L’alliance du Physical et Digital',
          body: 'Pour répondre davantage aux nouvelles exigences du BTS NDRC et sa partie digitalisation, nous nous appuyons sur notre expérience physique et digitale en proposant différents outils pour réaliser cette action :\n\n- Site web tout support et appli mobile\n- Kit pour animations en réunion\n- Intranet personnel de gestion des ventes',
        },
        {
          type: 'text',
          title: 'Un partenariat rémunérateur',
          body: 'À travers cette action de vente directe, vos étudiants seront pleinement intégrés dans le projet. Le but étant de récolter les fonds nécessaires afin de financer différents projets pédagogiques (voyages, soirée d’intégration, sorties…).\n\nCette action est totalement gratuite, pas d’engagement et contrepartie demandé.',
        },
        {
          type: 'features',
          title: 'Les avantages Vins & Conversations',
          items: [
            'Proposer un produit "plaisir" et de qualité à son entourage',
            'Bénéficier d’une présentation de lancement dans vos locaux par notre équipe',
            'Bénéficier d’un suivi et d’un accompagnement tout le long de l’opération. Notre équipe définit avec vous le calendrier de départ et de fin de l’opération',
            'Kit de dégustation fourni pour chaque étudiant au départ de l’opération',
            'Différents supports physiques et digitals pour faciliter vos ventes',
            'Récompenses et challenge individuel pour les étudiants',
            'Commission pour l’école en fonction du chiffre d’affaires réalisé',
            'Logistique assurée par nos soins (avec livraison intermédiaire si besoin)',
          ],
        },
      ],
      cta: { label: 'Nous contacter', href: '/boutique/contact', tagline: 'Notre partenariat vous intéresse ?' },
    },
  },
  {
    slug: 'prestations-repas',
    title: 'Fournisseur de vin pour vos événements',
    content: {
      hero: {
        title: 'Fournisseur de vin pour vos événements',
        subtitle: 'Pour quel type d’événement ?',
      },
      sections: [
        {
          type: 'features',
          title: 'Nous accompagnons tout type de structure en fournissant le vin pour vos différents événements',
          items: [
            'Repas d’entreprise, séminaire, repas de fin d’année…',
            'Mariage, baptême, anniversaire…',
            'Soirées étudiantes / événementielles (BDE…)',
            'Fêtes de fin d’année',
            'Événements associatifs (tournoi de palet, pétanque…)',
          ],
        },
        {
          type: 'text',
          title: 'Notre fonctionnement',
          body: '1 : Nous nous contactons pour discuter de votre projet en prenant en compte les éléments importants de ce dernier et vos goûts.\n\n2 : Nous nous rencontrons pour déguster la sélection de vins que nous vous aurons concoctée, pour choisir ce que vous proposerez lors de votre événement.\n\n3 : Nous élaborons un devis pour votre événement.\n\n4 : Nous vous livrons vos différents vins, en vous apportant les conseils de conservation et de service pour ces derniers.\n\nTout au long de ces différentes étapes, notre équipe est là pour vous accompagner en vous fournissant des vins qui correspondront à votre budget, vos goûts et en quantité suffisante pour la réalisation de votre événement.',
        },
        {
          type: 'features',
          title: 'Les avantages Vins & Conversations',
          items: [
            'Forts de notre expérience, nous saurons vous conseiller les meilleurs vins en quantité suffisante pour vos événements',
            'Une relation de proximité avec nos équipes qui vous accompagne tout au long de votre projet',
            'Reprise des invendus / inutilisés',
            'Livraison par nos soins avec présence le jour de livraison pour donner les conseils de conservation et de service des différents vins',
          ],
        },
      ],
      cta: { label: 'Nous contacter', href: '/boutique/contact', tagline: 'Besoin de vins et conseils pour un événement ?' },
    },
  },
  {
    slug: 'cercle-ambassadeurs',
    title: 'Le Cercle Vins & Conversations',
    content: {
      hero: {
        title: 'Bienvenue dans le Cercle Vins & Conversations',
        subtitle: 'Une communauté d’amateurs de vin qui choisissent de vivre le vin autrement.',
      },
      sections: [
        {
          type: 'text',
          title: '',
          body: 'Le « Cercle des ambassadeurs » est une communauté d’amateurs de vin qui choisissent de vivre le vin autrement.\n\nIci, les bouteilles se découvrent avant de se dévoiler. Les dégustations deviennent des expériences, les échanges prennent le pas sur les certitudes et chaque rencontre donne naissance à de nouvelles conversations.\n\nAnimé par des ambassadeurs passionnés, chaque Cercle réunit localement des femmes et des hommes autour de sélections de vins, de découvertes thématiques au cours de l’année et l’objectif d’un même plaisir : partager.\n\nÀ l’intérieur du Cercle Vins & Conversations, on ne goûte pas un vin… on le découvre avant de le connaître.\n\nRejoignez un Cercle près de chez vous ou créez le vôtre et faites vivre cette expérience dans votre ville.',
        },
      ],
      cta: { label: 'Rejoindre un Cercle', href: '/boutique/contact' },
    },
  },
];

exports.up = async function (knex) {
  for (const page of PAGES) {
    await knex.raw(
      `INSERT INTO site_pages (slug, title, content_json, is_active)
       VALUES (?, ?, ?::jsonb, true)`,
      [page.slug, page.title, JSON.stringify(page.content)]
    );
  }
};

exports.down = async function (knex) {
  await knex('site_pages')
    .whereIn('slug', PAGES.map((p) => p.slug))
    .del();
};
