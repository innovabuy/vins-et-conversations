/**
 * Add site_images slot for the team group photo on the "Équipe" page.
 * Single slot. Uses ON CONFLICT DO NOTHING to stay idempotent.
 */
exports.up = async function (knex) {
  const newSlots = [
    { page: 'equipe', slot: 'equipe_groupe', label: 'Photo de groupe de l\'équipe', alt_text: 'L\'équipe Vins & Conversations' },
  ];

  for (const slot of newSlots) {
    await knex.raw(
      `INSERT INTO site_images (page, slot, label, alt_text) VALUES (?, ?, ?, ?) ON CONFLICT (page, slot) DO NOTHING`,
      [slot.page, slot.slot, slot.label, slot.alt_text]
    );
  }
};

exports.down = async function (knex) {
  await knex('site_images').whereIn('slot', ['equipe_groupe']).del();
};
