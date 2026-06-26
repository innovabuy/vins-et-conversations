/**
 * Seed site_pages content for the "À Propos" page.
 * Slug 'a-propos'. Structure calée sur AProposPage.jsx (hero / sections[{type:'text'|'values',...}] / cta).
 * Accès non gardés côté front => hero{title,subtitle}, sections[], cta{label,href} OBLIGATOIRES.
 * La section « Notre histoire » reçoit la bio fondateur (texte Nicolas) ; la section « Nos valeurs »
 * est reconduite À L'IDENTIQUE du DEFAULT_CONTENT (ne pas la perdre). Paragraphes via \n\n
 * (la section text d'AProposPage utilise whitespace-pre-line).
 * UPSERT idempotent sur slug (ON CONFLICT (slug) DO UPDATE). Paramètre lié => pas de souci d'echappement.
 */
exports.up = async function (knex) {
  const slug = 'a-propos';
  const title = 'À Propos';

  const histoire = [
    "Pendant plus de douze ans, le vin a été bien plus qu'un métier pour moi : il a été une formidable école de rencontres, de transmission et de partage. Petit fils d'agriculteur qui avait quelques vignes dans l'Est de la France, ma passion pour les terroirs m'ont amené a en faire un métier : Je suis devenu, il y a plus de 20 ans, caviste puis négociant en vins et produits du terroir en fondant l'enseigne Nuances Terroirs. J'ai eu la chance de parcourir les vignobles, d'échanger avec des femmes et des hommes passionnés, de comprendre leur savoir-faire et de découvrir que derrière chaque bouteille se cache avant tout une histoire.",
    "Au fil de ces années, une conviction s'est imposée : le vin ne se résume pas à un produit de consommation. Il est un vecteur de culture, de patrimoine, de convivialité et de lien social. C'est cette vision qui a donné naissance à Vins & Conversations.",
    "Mon ambition n'a jamais été de proposer simplement une sélection de vins. Je souhaite créer des expériences de partage, favoriser les échanges entre les personnes et remettre l'humain au cœur de chaque dégustation. Chaque bouteille sélectionnée répond ainsi à des critères exigeants : la qualité du travail du vigneron, l'authenticité de son histoire, le respect de son terroir et sa capacité à susciter l'émotion.",
    "En parallèle de cette aventure entrepreneuriale, je suis également formateur et consultant en développement commercial. J'accompagne depuis plusieurs années des étudiants, des entrepreneurs et des entreprises dans la maîtrise de la relation client, convaincu que la performance commerciale ne peut être durable que lorsqu'elle s'appuie sur la confiance, l'écoute et la création de valeur.",
    "Cette volonté de transmettre se retrouve naturellement dans nos nombreux partenariats avec les établissements d'enseignement supérieur. Nous permettons chaque année à des étudiants de vivre une véritable expérience commerciale sur le terrain, en développant leurs compétences tout en participant à un projet entrepreneurial concret.",
  ].join('\n\n');

  const content = {
    hero: {
      title: 'À Propos — Des vins choisis avec passion',
      subtitle: "Vins & Conversations, c'est une sélection de vins français et du Nouveau Monde, choisis avec soin par Nicolas Froment. Chaque bouteille raconte une histoire.",
    },
    sections: [
      { type: 'text', title: 'Notre histoire', body: histoire },
      { type: 'values', title: 'Nos valeurs', items: [
        { icon: 'heart', label: 'Sélection rigoureuse', desc: "Chaque vin est dégusté et approuvé avant d'intégrer notre catalogue." },
        { icon: 'grape', label: 'Proximité producteurs', desc: "Des relations directes avec les vignerons pour garantir authenticité et traçabilité." },
        { icon: 'award', label: 'Engagement qualité-prix', desc: "Des vins d'exception accessibles à tous, sans compromis sur la qualité." },
      ]},
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
  await knex('site_pages').where({ slug: 'a-propos' }).del();
};
