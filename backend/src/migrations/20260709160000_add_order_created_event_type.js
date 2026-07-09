/**
 * Ajoute 'order_created' aux types autorisés de financial_events.type.
 *
 * POURQUOI : aujourd'hui l'event de CRÉATION d'une commande boutique
 * (boutiqueOrderService) et l'event de PAIEMENT (capture PayPal/Stripe) partagent
 * le type 'sale'. Cette surcharge cause deux bugs symétriques :
 *   - PayPal : la garde d'idempotence (existingSale) matche le 'sale' de création
 *     → capture court-circuitée, RIEN encaissé (cf. VC-2026-1884).
 *   - Stripe : capture écrit un 2e 'sale' → double-compte dans la base de commission.
 * En séparant création ('order_created') et paiement ('sale'), la garde redevient
 * correcte et rulesEngine ne somme plus que les vrais encaissements.
 *
 * ⚠️ ORDRE DE DÉPLOIEMENT NON NÉGOCIABLE : cette migration doit être appliquée
 * AVANT le code applicatif qui écrit type='order_created' (boutiqueOrderService),
 * sinon l'INSERT de création viole le CHECK → 500.
 *
 * DOWN : des lignes 'order_created' peuvent exister. On les repasse en 'sale'
 * (état sémantique pré-migration) AVANT de restaurer l'ancien CHECK, sinon le
 * rollback échoue (lignes violant la contrainte restaurée).
 */

const TYPES_WITH_ORDER_CREATED = "'sale','refund','commission','correction','free_bottle','deferred_validated','deferred_refused','payment_received','order_created'";
const TYPES_WITHOUT = "'sale','refund','commission','correction','free_bottle','deferred_validated','deferred_refused','payment_received'";

exports.up = async function (knex) {
  await knex.raw('ALTER TABLE financial_events DROP CONSTRAINT IF EXISTS financial_events_type_check');
  await knex.raw(`
    ALTER TABLE financial_events ADD CONSTRAINT financial_events_type_check
    CHECK (type IN (${TYPES_WITH_ORDER_CREATED}))
  `);
};

exports.down = async function (knex) {
  // Rollback sûr : aucune ligne 'order_created' ne doit subsister sous l'ancien CHECK.
  await knex('financial_events').where({ type: 'order_created' }).update({ type: 'sale' });
  await knex.raw('ALTER TABLE financial_events DROP CONSTRAINT IF EXISTS financial_events_type_check');
  await knex.raw(`
    ALTER TABLE financial_events ADD CONSTRAINT financial_events_type_check
    CHECK (type IN (${TYPES_WITHOUT}))
  `);
};
