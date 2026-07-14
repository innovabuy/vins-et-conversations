/**
 * Étend le CHECK payments.method pour autoriser 'cawl' (Worldline Direct / CAWL),
 * en plus de stripe/transfer/cash/check/paypal.
 *
 * IDEMPOTENT + REJOUABLE (base fraîche au cutover/CI ET prod) :
 *  - DROP CONSTRAINT IF EXISTS -> ne casse jamais si la contrainte est absente ou déjà
 *    remplacée ; rejouer up() plusieurs fois recrée simplement la même contrainte.
 *  - ADD CONSTRAINT avec la liste élargie : le nouveau CHECK est un SUR-ENSEMBLE de l'ancien
 *    -> toutes les lignes existantes (stripe/paypal/…) le satisfont, validation OK sur prod
 *    avec données. Aucune garde 0-ligne, aucun throw (cf. leçon landmine cutover).
 *
 * down() : restaure la liste d'origine (sans 'cawl'), même patron idempotent.
 */

const NAME = 'payments_method_check';
const WITH_CAWL = "method IN ('stripe','transfer','cash','check','paypal','cawl')";
const WITHOUT_CAWL = "method IN ('stripe','transfer','cash','check','paypal')";

exports.up = async function (knex) {
  await knex.raw(`ALTER TABLE payments DROP CONSTRAINT IF EXISTS ${NAME}`);
  await knex.raw(`ALTER TABLE payments ADD CONSTRAINT ${NAME} CHECK (${WITH_CAWL})`);
};

exports.down = async function (knex) {
  await knex.raw(`ALTER TABLE payments DROP CONSTRAINT IF EXISTS ${NAME}`);
  await knex.raw(`ALTER TABLE payments ADD CONSTRAINT ${NAME} CHECK (${WITHOUT_CAWL})`);
};
