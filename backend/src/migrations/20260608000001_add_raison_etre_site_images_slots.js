/**
 * Add site_images slots for the "Raison d'être / Manifeste La Part des Anges" page.
 * Hero + 3 illustration slots (chèques géants, sorties pédagogiques, dégustations écoles).
 * Uses ON CONFLICT DO NOTHING to stay idempotent.
 */
exports.up = async function (knex) {
  const newSlots = [
    { page: 'raison_etre', slot: 'raison_etre_hero', label: 'Image hero page Raison d\'être', alt_text: 'Vins & Conversations — notre raison d\'être' },
    { page: 'raison_etre', slot: 'raison_etre_galerie_1', label: 'Galerie Raison d\'être — photo 1', alt_text: 'Remise de chèque géant à une association' },
    { page: 'raison_etre', slot: 'raison_etre_galerie_2', label: 'Galerie Raison d\'être — photo 2', alt_text: 'Sortie pédagogique avec des élèves' },
    { page: 'raison_etre', slot: 'raison_etre_galerie_3', label: 'Galerie Raison d\'être — photo 3', alt_text: 'Dégustation pédagogique en école' },
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
    'raison_etre_hero', 'raison_etre_galerie_1', 'raison_etre_galerie_2', 'raison_etre_galerie_3',
  ];
  await knex('site_images').whereIn('slot', slotsToRemove).del();
};
