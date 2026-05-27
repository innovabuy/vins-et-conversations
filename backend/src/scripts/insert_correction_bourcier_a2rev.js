/**
 * BUG-A2-rev Phase 2 — INSERT correction event (one-shot)
 *
 * Corrige le seul orphelin identifié par audit_orphan_freebottles.js :
 * BOURCIER Lilian / Sacré-Cœur 2025-2026.
 *
 * Event corrigé : 6f4f51b6-21d9-4ce4-aedf-6c013c4e2b14
 *   (free_bottle Oriolus Blanc CQ @ €3.00, triggered par VC-2026-1780)
 *
 * Append-only : INSERT seul, jamais UPDATE/DELETE sur financial_events.
 */

const db = require('../config/database');

const CORRECTED_EVENT_ID = '6f4f51b6-21d9-4ce4-aedf-6c013c4e2b14';
const USER_ID = '373a96af-a635-4109-8983-deb0b3243a02';
const CAMPAIGN_ID = '71c7e396-53da-45da-ac19-583b96b0580d';
const ORDER_ID = 'ae155fc2-6743-4c28-a017-b50f4b032073';
const PRODUCT_ID = '4a06d79b-812c-4e5c-8a63-46873f237d12';

async function main() {
  // Garde-fou idempotence : refuser si une correction sur ce même event existe déjà
  const existing = await db('financial_events')
    .where('type', 'correction')
    .whereRaw("metadata->>'corrects_event_id' = ?", [CORRECTED_EVENT_ID])
    .first();
  if (existing) {
    console.log(`[Phase 2] Correction déjà présente (id=${existing.id}, créée=${existing.created_at.toISOString()}). Abort.`);
    process.exit(0);
  }

  // Vérifier que l'event original existe toujours
  const original = await db('financial_events').where({ id: CORRECTED_EVENT_ID, type: 'free_bottle' }).first();
  if (!original) {
    console.error(`[Phase 2] Event original ${CORRECTED_EVENT_ID} introuvable ou pas de type free_bottle. Abort.`);
    process.exit(1);
  }

  const [inserted] = await db('financial_events').insert({
    type: 'correction',
    amount: -3.00,
    campaign_id: CAMPAIGN_ID,
    order_id: ORDER_ID,
    description: 'Correction 12+1 — choix obsolète remplacé par produit moins cher arrivé ultérieurement',
    metadata: JSON.stringify({
      user_id: USER_ID,
      corrects_event_id: CORRECTED_EVENT_ID,
      reason: 'retroactive_optimum_shift',
      product_id: PRODUCT_ID,
      product_name: 'Oriolus Blanc - Cheval Quancard',
      corrected_at: new Date().toISOString(),
      brief: 'BUG-A2-rev',
    }),
  }).returning('*');

  console.log('[Phase 2] Correction insérée :');
  console.log(JSON.stringify({
    id: inserted.id,
    type: inserted.type,
    amount: inserted.amount,
    created_at: inserted.created_at,
    metadata: inserted.metadata,
  }, null, 2));

  await db.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
