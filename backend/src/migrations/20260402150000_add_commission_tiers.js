/**
 * Migration: Add commission_tiers to ambassadeur client_type commission_rules
 *
 * Paliers de commission progressifs par CA TTC mensuel :
 *   0-1200€ → 10%, 1201-2200€ → 12%, 2201-4400€ → 15%, 4401+€ → 18%
 *
 * Merge into existing commission_rules JSONB — does NOT touch tier_rules (cadeaux).
 */
exports.up = function (knex) {
  return knex.raw(`
    UPDATE client_types
    SET commission_rules = commission_rules || '{
      "commission_tiers": [
        { "from": 0,    "to": 1200,  "rate": 0.10 },
        { "from": 1201, "to": 2200,  "rate": 0.12 },
        { "from": 2201, "to": 4400,  "rate": 0.15 },
        { "from": 4401, "to": null,  "rate": 0.18 }
      ],
      "tier_period": "monthly"
    }'::jsonb
    WHERE name = 'ambassadeur'
  `);
};

exports.down = function (knex) {
  return knex.raw(`
    UPDATE client_types
    SET commission_rules = commission_rules - 'commission_tiers' - 'tier_period'
    WHERE name = 'ambassadeur'
  `);
};
