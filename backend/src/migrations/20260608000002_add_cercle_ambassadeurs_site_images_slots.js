/**
 * Add site_images slots for the "Cercle des ambassadeurs" editorial page.
 * Hero + 3 illustration slots. Uses ON CONFLICT DO NOTHING to stay idempotent.
 */
exports.up = async function (knex) {
  const newSlots = [
    { page: 'cercle_ambassadeurs', slot: 'cercle_ambassadeurs_hero', label: 'Image hero page Cercle des ambassadeurs', alt_text: 'Le réseau d\'ambassadeurs Vins & Conversations' },
    { page: 'cercle_ambassadeurs', slot: 'cercle_ambassadeurs_galerie_1', label: 'Galerie Cercle des ambassadeurs — photo 1', alt_text: 'Ambassadeurs réunis' },
    { page: 'cercle_ambassadeurs', slot: 'cercle_ambassadeurs_galerie_2', label: 'Galerie Cercle des ambassadeurs — photo 2', alt_text: 'Dégustation entre ambassadeurs' },
    { page: 'cercle_ambassadeurs', slot: 'cercle_ambassadeurs_galerie_3', label: 'Galerie Cercle des ambassadeurs — photo 3', alt_text: 'Moment de partage du réseau' },
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
    'cercle_ambassadeurs_hero', 'cercle_ambassadeurs_galerie_1', 'cercle_ambassadeurs_galerie_2', 'cercle_ambassadeurs_galerie_3',
  ];
  await knex('site_images').whereIn('slot', slotsToRemove).del();
};
