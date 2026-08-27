/**
 * Slots d'image de hero manquants pour trois pages vitrine : equipe, avis, partenaires.
 *
 * Ces trois pages avaient un hero à dégradé fixe, sans emplacement image paramétrable,
 * alors que les huit autres pages vitrine sont sur le patron conditionnel
 * (image_url renseignée => photo + voile noir 45% ; image_url NULL => dégradé wine).
 *
 * AUCUN CHANGEMENT VISUEL : les trois slots sont créés avec image_url = NULL, donc les
 * trois pages restent en dégradé à l'identique. Le rendu ne change que le jour où Nicolas
 * uploade une image depuis l'écran « Images site ».
 *
 * ⚠️ equipe_hero — à signaler à Nicolas (réserve levée par Jeff le 27/08) : la page Équipe
 * affiche DÉJÀ la photo de groupe (slot equipe_groupe) juste sous le hero. Poser une image
 * de fond sur le hero empilerait deux photos en haut de page. Le slot est créé quand même
 * (inoffensif tant qu'il est vide, et réversible) mais l'arbitrage visuel appartient à
 * Nicolas au moment de l'upload.
 *
 * Schéma réel de site_images : page, slot, label, image_url, active — contrainte unique
 * (page, slot). ON CONFLICT (page, slot) DO NOTHING => ré-exécution sûre, ne réécrit
 * jamais une image déjà uploadée.
 *
 * Les valeurs de `page` reprennent les groupes affichés par SiteImages.jsx : 'equipe'
 * existe déjà (photos des membres) ; 'avis' et 'partenaires' sont des groupes neufs et
 * ont donc été ajoutés à PAGE_LABELS + PAGE_ORDER dans le même lot — sans quoi les slots
 * existeraient en base sans jamais s'afficher dans le back-office.
 *
 * down() : DELETE ciblé des trois slots (jamais de truncate).
 */

const SLOTS = [
  { page: 'equipe', slot: 'equipe_hero', label: 'Image hero page Équipe' },
  { page: 'avis', slot: 'avis_hero', label: 'Image hero page Avis' },
  { page: 'partenaires', slot: 'partenaires_hero', label: 'Image hero page Partenaires' },
];

exports.up = async function (knex) {
  for (const s of SLOTS) {
    await knex.raw(
      `INSERT INTO site_images (page, slot, label, image_url, active)
       VALUES (?, ?, ?, NULL, true)
       ON CONFLICT (page, slot) DO NOTHING`,
      [s.page, s.slot, s.label]
    );
  }
};

exports.down = async function (knex) {
  for (const s of SLOTS) {
    await knex('site_images').where({ page: s.page, slot: s.slot }).del();
  }
};
