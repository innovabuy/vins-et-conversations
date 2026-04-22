/**
 * Add gallery slots for Écoles (x2), CSE (x3), Repas (x2).
 * Uses ON CONFLICT DO NOTHING to stay idempotent.
 */
exports.up = async function (knex) {
  const newSlots = [
    { page: 'ecoles', slot: 'ecoles_galerie_1', label: 'Galerie Écoles — photo 1', alt_text: 'Intervention en classe' },
    { page: 'ecoles', slot: 'ecoles_galerie_2', label: 'Galerie Écoles — photo 2', alt_text: "Remise de chèque à l'association" },
    { page: 'cse', slot: 'cse_galerie_1', label: 'Galerie CSE — photo 1', alt_text: 'Dégustation en réunion CSE' },
    { page: 'cse', slot: 'cse_galerie_2', label: 'Galerie CSE — photo 2', alt_text: 'Sélection de coffrets pour CSE' },
    { page: 'cse', slot: 'cse_galerie_3', label: 'Galerie CSE — photo 3', alt_text: 'Moment de partage autour des vins' },
    { page: 'repas', slot: 'repas_galerie_1', label: 'Galerie Repas & Soirées — photo 1', alt_text: 'Salle en pierre pour événement' },
    { page: 'repas', slot: 'repas_galerie_2', label: 'Galerie Repas & Soirées — photo 2', alt_text: 'Table de dégustation' },
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
    'ecoles_galerie_1', 'ecoles_galerie_2',
    'cse_galerie_1', 'cse_galerie_2', 'cse_galerie_3',
    'repas_galerie_1', 'repas_galerie_2',
  ];
  await knex('site_images').whereIn('slot', slotsToRemove).del();
};
