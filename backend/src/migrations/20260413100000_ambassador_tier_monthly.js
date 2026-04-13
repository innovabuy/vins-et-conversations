exports.up = async (knex) => {
  const ct = await knex('client_types').where({ name: 'ambassadeur' }).first();
  if (!ct) return;
  const tierRules = typeof ct.tier_rules === 'string' ? JSON.parse(ct.tier_rules) : (ct.tier_rules || {});
  tierRules.period = 'monthly';
  tierRules.reset = 'monthly';
  await knex('client_types').where({ name: 'ambassadeur' }).update({ tier_rules: JSON.stringify(tierRules) });
};

exports.down = async (knex) => {
  const ct = await knex('client_types').where({ name: 'ambassadeur' }).first();
  if (!ct) return;
  const tierRules = typeof ct.tier_rules === 'string' ? JSON.parse(ct.tier_rules) : (ct.tier_rules || {});
  tierRules.period = 'cumulative';
  tierRules.reset = 'never';
  await knex('client_types').where({ name: 'ambassadeur' }).update({ tier_rules: JSON.stringify(tierRules) });
};
