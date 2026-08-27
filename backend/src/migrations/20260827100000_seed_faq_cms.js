/**
 * Seed CMS de la page vitrine « FAQ » (slug 'faq').
 *
 * URGENT — la FAQ rédigée par Nicolas le 27/08/2026 (5 questions/réponses) n'existait
 * QUE dans la base live : aucune migration ne la portait. Un rejeu de migrations sur
 * base fraîche (cutover) la faisait disparaître au profit des cinq « Réponse à compléter
 * par Nicolas. » du DEFAULT_CONTENT de FAQPage.jsx. Cette migration matérialise le
 * contenu réel pour qu'il survive.
 *
 * Le content_json ci-dessous est la copie EXACTE de la ligne live au 27/08/2026
 * (dump de site_pages.content_json WHERE slug='faq'), y compris les sauts de ligne \n
 * et les puces « • » des réponses longues — rendus par le whitespace-pre-line du
 * commit 81b1717. La question 5 porte la reformulation de Nicolas (« disponibles POUR
 * LES CSE »), qui diverge du DEFAULT_CONTENT du composant (« EN CSE ») : c'est la
 * version live qui fait foi ici, le composant n'est pas touché.
 *
 * ON CONFLICT (slug) DO NOTHING — patron 20260709120000_seed_financement_cms_hero.js.
 * Jamais DO UPDATE : la ligne live existe déjà, cette migration doit y être un no-op
 * absolu et ne JAMAIS réécrire une édition faite depuis le back-office.
 *
 * is_active: true explicite, sinon le filtre WHERE is_active=true de la route publique
 * GET /site-pages/:slug rendrait le seed inerte (404).
 *
 * down() : DELETE ciblé du seul slug 'faq' (jamais de truncate).
 */

const PAGE = {
  slug: 'faq',
  title: 'FAQ',
  content: {
    "hero": {
      "title": "Questions fréquentes",
      "subtitle": "Retrouvez les réponses aux questions les plus courantes sur nos services."
    },
    "sections": [
      {
        "type": "faq",
        "items": [
          {
            "a": "Passer une commande sur notre site est simple et rapide. Voici les étapes à suivre.\n\n1. Sélectionnez vos produits : naviguez sur notre site, choisissez vos articles ainsi que la quantité souhaitée, puis cliquez sur « Ajouter au panier ».\n2. Validez votre panier : une fois vos achats terminés, rendez-vous dans votre panier en haut à droite de l'écran et cliquez sur « Commander ».\n3. Renseignez vos informations : complétez les données personnelles nécessaires au suivi de votre commande.\n4. Choisissez votre mode de livraison : optez pour la livraison à domicile en renseignant votre adresse, ou choisissez le Click and Collect pour retirer votre commande directement chez nous.\n5. Procédez au paiement : sélectionnez votre moyen de paiement préféré et validez définitivement votre commande.",
            "q": "Comment passer une commande ?"
          },
          {
            "a": "Nos délais de livraison standard sont de 4 à 5 jours ouvrés à compter de la validation de votre commande.",
            "q": "Quels sont les délais de livraison ?"
          },
          {
            "a": "Oui, tout à fait. Grâce à notre service de Click and Collect, vous pouvez retirer gratuitement votre commande directement chez nous.\n\nLors de la validation de votre panier, sélectionnez simplement l'option « Retrait sur place ». Vous recevrez un e-mail dès que vos bouteilles seront prêtes à être récupérées.",
            "q": "Puis-je retirer ma commande sur place ?"
          },
          {
            "a": "Devenir ambassadeur Vins & Conversations, c'est partager votre passion du vin en organisant des dégustations conviviales, tout en générant un complément de revenu.\n\nPourquoi nous rejoindre :\n• Liberté totale : vous travaillez à votre rythme, sans aucune pression.\n• Activité plaisir : vous alliez convivialité, discussions et partages.\n• Accompagnement : vous bénéficiez d'une formation sur nos vins et d'un kit de lancement.\n\nComment ça marche :\n1. Remplissez notre formulaire de contact.\n2. Passez un court entretien avec notre équipe.\n3. Recevez votre kit et démarrez l'aventure.\n\nPrêt à vous lancer ? Rendez-vous sur notre page « Devenir Ambassadeur » pour postuler.",
            "q": "Comment fonctionne le programme ambassadeur ?"
          },
          {
            "a": "Oui. Nos vins sont tout à fait accessibles aux Comités Sociaux et Économiques.\n\nAfin de vous proposer l'offre la plus adaptée, une sélection sur mesure est préalablement construite en collaboration directe avec vos référents CSE.\n\nVous êtes membre ou bénéficiaire d'un CSE ? Rendez-vous sur notre Espace CSE dédié pour découvrir nos offres exclusives et nous faire part de vos besoins.",
            "q": "Les vins sont-ils disponibles pour les CSE ?"
          }
        ]
      }
    ],
    "cta": {
      "href": "/boutique/contact",
      "label": "Nous contacter"
    }
  },
};

exports.up = async function (knex) {
  await knex.raw(
    `INSERT INTO site_pages (slug, title, content_json, is_active)
     VALUES (?, ?, ?::jsonb, true)
     ON CONFLICT (slug) DO NOTHING`,
    [PAGE.slug, PAGE.title, JSON.stringify(PAGE.content)]
  );
};

exports.down = async function (knex) {
  await knex('site_pages').where({ slug: PAGE.slug }).del();
};
