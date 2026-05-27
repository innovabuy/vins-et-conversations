/**
 * Audit orphan free_bottle events — BUG-A2-rev Phase 0-bis
 *
 * Détecte les paires (user_id, campaign_id) où le nombre d'events
 * financial_events.type='free_bottle' dépasse le `earned` global calculé
 * par rulesEngine.calculateFreeBottles (alcohol filter + Modèle C).
 *
 * Lecture seule. Aucune écriture.
 */

const db = require('../config/database');
const rulesEngine = require('../services/rulesEngine');

async function main() {
  // 1. Toutes les paires (user_id, campaign_id) qui ont au moins 1 event free_bottle
  const pairs = await db('financial_events')
    .where('type', 'free_bottle')
    .whereNotNull('campaign_id')
    .whereRaw("metadata->>'user_id' IS NOT NULL")
    .select(
      db.raw("metadata->>'user_id' as user_id"),
      'campaign_id',
      db.raw('COUNT(*)::int as event_count')
    )
    .groupByRaw("metadata->>'user_id', campaign_id");

  console.log(`\n[AUDIT] ${pairs.length} paire(s) (user, campaign) avec au moins 1 event free_bottle\n`);

  const orphans = [];

  for (const p of pairs) {
    // Charger les règles de la campagne
    let rules;
    try {
      rules = await rulesEngine.loadRulesForCampaign(p.campaign_id);
    } catch (e) {
      console.log(`  SKIP campaign ${p.campaign_id}: ${e.message}`);
      continue;
    }
    if (!rules.freeBottle?.trigger || rules.freeBottle.trigger !== 'every_n_sold') {
      continue;
    }

    const balance = await rulesEngine.calculateFreeBottles(
      p.user_id,
      p.campaign_id,
      rules.freeBottle,
      { includeReferredBy: true }
    );

    const excess = p.event_count - balance.earned;
    if (excess > 0) {
      // Récupérer email pour lisibilité
      const user = await db('users').where({ id: p.user_id }).first('email', 'name');
      const campaign = await db('campaigns').where({ id: p.campaign_id }).first('name');
      orphans.push({
        user_id: p.user_id,
        user_email: user?.email,
        user_name: user?.name,
        campaign_id: p.campaign_id,
        campaign_name: campaign?.name,
        events_created: p.event_count,
        earned_global: balance.earned,
        excess,
      });
    }
  }

  if (orphans.length === 0) {
    console.log('[AUDIT] Aucun orphelin détecté.\n');
  } else {
    console.log(`[AUDIT] ${orphans.length} cas d'excès détecté(s) :\n`);
    console.table(orphans);

    // Pour chaque orphelin, identifier le(s) produit(s) "sorti(s) de details"
    console.log('\n[AUDIT] Détail des events orphelins (product_id présent en DB mais sorti de balance.details) :\n');
    for (const o of orphans) {
      const rules = await rulesEngine.loadRulesForCampaign(o.campaign_id);
      const balance = await rulesEngine.calculateFreeBottles(o.user_id, o.campaign_id, rules.freeBottle, { includeReferredBy: true });
      const currentProductIds = new Set(balance.details.map((d) => d.product_id));

      const events = await db('financial_events')
        .where({ campaign_id: o.campaign_id, type: 'free_bottle' })
        .whereRaw("metadata->>'user_id' = ?", [o.user_id])
        .select(
          'id',
          'order_id',
          'amount',
          'created_at',
          db.raw("metadata->>'product_id' as product_id"),
          db.raw("metadata->>'product_name' as product_name")
        )
        .orderBy('created_at');

      // Compter par produit
      const eventsByProduct = new Map();
      for (const e of events) {
        if (!eventsByProduct.has(e.product_id)) eventsByProduct.set(e.product_id, []);
        eventsByProduct.get(e.product_id).push(e);
      }

      console.log(`  ${o.user_email} / ${o.campaign_name}`);
      for (const [pid, evs] of eventsByProduct.entries()) {
        const inCurrentDetails = currentProductIds.has(pid);
        const earnedNow = balance.details.find((d) => d.product_id === pid)?.earned || 0;
        const flag = inCurrentDetails
          ? (evs.length > earnedNow ? `EXCESS (events=${evs.length} > earned=${earnedNow})` : 'OK')
          : `ORPHAN (events=${evs.length}, no longer in details)`;
        console.log(`    - ${evs[0].product_name} [${pid}] : ${evs.length} event(s) — ${flag}`);
        if (flag.startsWith('ORPHAN') || flag.startsWith('EXCESS')) {
          for (const e of evs) {
            console.log(`        event ${e.id}  amount=${e.amount}  order=${e.order_id}  created=${e.created_at.toISOString()}`);
          }
        }
      }
      console.log('');
    }
  }

  await db.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
