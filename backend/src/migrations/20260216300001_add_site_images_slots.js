/**
 * Add new site_images slots for pages: prestations, cse, ecoles, ambassadeurs,
 * repas, apropos, equipe, coffrets, faq.
 * Uses ON CONFLICT DO NOTHING to avoid duplicates.
 */
exports.up = async function (knex) {
  const newSlots = [
    // PRESTATIONS
    { page: 'prestations', slot: 'prestations_hero', label: 'Image hero page prestations', alt_text: 'Nos prestations' },
    { page: 'prestations', slot: 'prestations_carte_cse', label: 'Image carte CSE', alt_text: 'Offres CSE' },
    { page: 'prestations', slot: 'prestations_carte_ecoles', label: 'Image carte Écoles', alt_text: 'Partenariat écoles' },
    { page: 'prestations', slot: 'prestations_carte_ambassadeurs', label: 'Image carte Ambassadeurs', alt_text: 'Réseau ambassadeurs' },
    { page: 'prestations', slot: 'prestations_carte_repas', label: 'Image carte Repas/Soirées', alt_text: 'Fournisseur événements' },

    // CSE
    { page: 'cse', slot: 'cse_hero', label: 'Image hero page CSE', alt_text: 'Espace CSE' },
    { page: 'cse', slot: 'cse_processus', label: 'Image processus CSE', alt_text: 'Comment ça marche' },

    // ECOLES
    { page: 'ecoles', slot: 'ecoles_hero', label: 'Image hero page Écoles', alt_text: 'Partenariat écoles' },
    { page: 'ecoles', slot: 'ecoles_concept', label: 'Image concept financement', alt_text: 'Financement projets' },

    // AMBASSADEURS
    { page: 'ambassadeurs', slot: 'ambassadeurs_hero', label: 'Image hero page Ambassadeurs', alt_text: 'Devenir ambassadeur' },
    { page: 'ambassadeurs', slot: 'ambassadeurs_paliers', label: 'Image paliers', alt_text: 'Paliers récompenses' },

    // REPAS/SOIREES
    { page: 'repas', slot: 'repas_hero', label: 'Image hero page Repas', alt_text: 'Fournisseur événements' },

    // A PROPOS
    { page: 'apropos', slot: 'apropos_hero', label: 'Image hero page À propos', alt_text: 'Notre histoire' },
    { page: 'apropos', slot: 'apropos_nicolas_grand', label: 'Grande photo Nicolas', alt_text: 'Nicolas Froment' },

    // EQUIPE
    { page: 'equipe', slot: 'equipe_nicolas', label: 'Photo Nicolas Froment', alt_text: 'Nicolas Froment, fondateur' },
    { page: 'equipe', slot: 'equipe_matheo', label: 'Photo Mathéo Benoit', alt_text: 'Mathéo Benoit' },
    { page: 'equipe', slot: 'equipe_malone', label: 'Photo Malone Froment', alt_text: 'Malone Froment' },
    { page: 'equipe', slot: 'equipe_martin', label: 'Photo Martin Hery', alt_text: 'Martin Hery' },

    // COFFRETS
    { page: 'coffrets', slot: 'coffrets_hero', label: 'Image hero page Coffrets', alt_text: 'Nos coffrets' },

    // FAQ
    { page: 'faq', slot: 'faq_hero', label: 'Image hero page FAQ', alt_text: 'Questions fréquentes' },
  ];

  for (const slot of newSlots) {
    await knex.raw(
      `INSERT INTO site_images (page, slot, label, alt_text) VALUES (?, ?, ?, ?) ON CONFLICT (page, slot) DO NOTHING`,
      [slot.page, slot.slot, slot.label, slot.alt_text]
    );
  }
};

exports.down = async function (knex) {
  const slotsToRemove = [
    'prestations_hero', 'prestations_carte_cse', 'prestations_carte_ecoles',
    'prestations_carte_ambassadeurs', 'prestations_carte_repas',
    'cse_hero', 'cse_processus',
    'ecoles_hero', 'ecoles_concept',
    'ambassadeurs_hero', 'ambassadeurs_paliers',
    'repas_hero',
    'apropos_hero', 'apropos_nicolas_grand',
    'equipe_nicolas', 'equipe_matheo', 'equipe_malone', 'equipe_martin',
    'coffrets_hero',
    'faq_hero',
  ];
  await knex('site_images').whereIn('slot', slotsToRemove).del();
};
