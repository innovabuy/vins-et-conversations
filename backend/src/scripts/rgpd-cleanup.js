#!/usr/bin/env node
/**
 * RGPD Cleanup Script — Vins & Conversations (CDC §5.4)
 *
 * Durées de conservation :
 * - Données financières (orders, financial_events, payments) : 10 ans (obligation légale)
 * - Données personnelles (users, contacts) : 3 ans après dernière activité
 *
 * Ce script anonymise automatiquement les utilisateurs inactifs depuis plus de 3 ans
 * (aucun login ET aucune commande dans les 3 dernières années).
 *
 * Usage : node src/scripts/rgpd-cleanup.js
 * Cron recommandé : 0 3 1 * * (1er du mois à 3h)
 */
require('dotenv').config();
const crypto = require('crypto');
const db = require('../config/database');

const THREE_YEARS_AGO = new Date();
THREE_YEARS_AGO.setFullYear(THREE_YEARS_AGO.getFullYear() - 3);

async function run() {
  console.log(`[RGPD Cleanup] Starting at ${new Date().toISOString()}`);
  console.log(`[RGPD Cleanup] Threshold: ${THREE_YEARS_AGO.toISOString()}`);

  // Find users inactive for 3+ years
  const candidates = await db('users')
    .where(function () {
      this.where('last_login_at', '<', THREE_YEARS_AGO)
        .orWhereNull('last_login_at');
    })
    .whereNot('email', 'like', '%@anonymized.local') // skip already anonymized
    .whereNotIn('role', ['super_admin']) // never auto-anonymize admins
    .select('id', 'email', 'name', 'last_login_at');

  let anonymized = 0;
  let skipped = 0;

  for (const user of candidates) {
    // Check if user has orders in the last 3 years
    const recentOrder = await db('orders')
      .where({ user_id: user.id })
      .where('created_at', '>', THREE_YEARS_AGO)
      .first();

    if (recentOrder) {
      skipped++;
      continue;
    }

    // Anonymize
    const hash = crypto.createHash('sha256').update(user.email + Date.now()).digest('hex').substring(0, 12);
    await db('users').where({ id: user.id }).update({
      name: 'Utilisateur supprimé',
      email: `deleted_${hash}@anonymized.local`,
      avatar: null,
      password_hash: 'ANONYMIZED',
      status: 'disabled',
      permissions: JSON.stringify({}),
      updated_at: new Date(),
    });

    await db('contacts').where({ source_user_id: user.id }).update({
      source_user_id: null,
      source: `anonymized_${hash}`,
    });

    await db('refresh_tokens').where({ user_id: user.id }).update({ revoked: true });

    await db('audit_log').insert({
      action: 'rgpd_auto_anonymize',
      entity: 'users',
      entity_id: user.id,
      reason: `Inactif depuis plus de 3 ans (dernier login: ${user.last_login_at || 'jamais'})`,
      after: JSON.stringify({ anonymized: true }),
    });

    anonymized++;
    console.log(`  Anonymized: ${user.email} (last login: ${user.last_login_at || 'never'})`);
  }

  console.log(`[RGPD Cleanup] Done. Anonymized: ${anonymized}, Skipped: ${skipped}, Total candidates: ${candidates.length}`);
  await db.destroy();
}

run().catch((err) => {
  console.error('[RGPD Cleanup] Error:', err);
  process.exit(1);
});
