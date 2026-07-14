/**
 * Seed de la page vitrine "Devenir ambassadeur" (slug 'devenir-ambassadeur').
 * Même patron idempotent que seed_a_propos / seed_equipe / seed_bloc4_pages :
 * INSERT ... ON CONFLICT (slug) DO UPDATE -> passe sur base vierge ET peuplée,
 * AUCUN throw (pas de garde 0-ligne, cf. leçon cutover des migrations hide catégories).
 *
 * content_json = { hero, sections[], cta } ; types de section :
 *   list     -> puces, items: [string]
 *   numbered -> liste numérotée titre+texte, items: [{title, text}]
 *   steps    -> processus, body: accroche, items: [string]
 *
 * Texte de Nicolas repris MOT POUR MOT (validé tel quel).
 */

exports.up = async function (knex) {
  const slug = 'devenir-ambassadeur';
  const title = 'Devenir ambassadeur';

  const content = {
    hero: {
      title: 'Devenir ambassadeur',
      subtitle: '',
    },
    sections: [
      {
        type: 'list',
        title: "Le rôle de l'ambassadeur V&C",
        items: [
          "Organisation d'événements avec dégustation de vins (ventes en réunion)",
          'Développer et fidéliser une clientèle pour augmenter ses ventes',
          "Développer un réseau d'ambassadeurs Vins & Conversations à travers les événements",
        ],
      },
      {
        type: 'numbered',
        title: "Les avantages de l'ambassadeur V&C",
        items: [
          { title: 'Flexibilité', text: 'Vous êtes libre de choisir le temps que vous souhaitez consacrer à cette activité ainsi que votre emploi du temps.' },
          { title: 'Indépendance', text: "Vous définissez vos propres objectifs et n'êtes pas soumis à une pression constante." },
          { title: 'Moments de convivialité', text: 'Une activité "plaisir" en partageant des moments conviviaux à travers des discussions pendant vos ventes.' },
          { title: 'Complément de revenu', text: "Rémunération en fonction de vos ventes et cumulable avec d'autres revenus." },
          { title: 'Accompagnement et Formation', text: "Vous bénéficiez d'une formation sur nos vins et d'un accompagnement tout au long de votre processus de vente." },
        ],
      },
      {
        type: 'steps',
        title: 'Rejoignez V&C comme ambassadeur',
        body: 'Vous aimez le vin et aimez discuter en le partageant ? Vous souhaitez développer une activité sans prise de tête ?',
        items: [
          'Remplir notre formulaire de contact',
          'Nous réalisons un entretien',
          'Je rejoins V&C et reçois mon kit de lancement',
        ],
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
  await knex('site_pages').where({ slug: 'devenir-ambassadeur' }).del();
};
