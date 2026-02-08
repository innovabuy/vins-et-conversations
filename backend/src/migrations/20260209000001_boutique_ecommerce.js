const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

function generateReferralCode() {
  return 'AMB-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

exports.up = async function (knex) {
  // 1. Add source, referral_code, referred_by to orders
  await knex.schema.alterTable('orders', (table) => {
    table.string('source').defaultTo('campaign');
    table.string('referral_code').nullable();
    table.uuid('referred_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.index('source');
    table.index('referred_by');
  });

  // 2. Make orders.user_id nullable (boutique orders have no logged-in user)
  await knex.raw('ALTER TABLE orders ALTER COLUMN user_id DROP NOT NULL');

  // 3. Drop existing CHECK constraint on orders.status, re-create with pending_payment
  //    Knex .enum() generates a CHECK constraint named orders_status_check
  try {
    await knex.raw('ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check');
  } catch (e) {
    // Constraint may not exist
  }
  await knex.raw(`
    ALTER TABLE orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('draft', 'submitted', 'validated', 'preparing', 'shipped', 'delivered', 'cancelled', 'pending_payment'))
  `);

  // 4. Add referral_code to participations
  await knex.schema.alterTable('participations', (table) => {
    table.string('referral_code').nullable().unique();
    table.index('referral_code');
  });

  // 5. Create boutique_web client_type
  const clientTypeId = uuidv4();
  await knex('client_types').insert({
    id: clientTypeId,
    name: 'boutique_web',
    label: 'Boutique Web',
    pricing_rules: JSON.stringify({
      discount_pct: 0,
      commission_pct: 0,
      free_bottle_ratio: 0,
    }),
  });

  // 6. Create permanent Boutique Web organization + campaign
  // Extend organizations_type_check to include 'boutique'
  await knex.raw("ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_type_check");
  await knex.raw("ALTER TABLE organizations ADD CONSTRAINT organizations_type_check CHECK (type = ANY (ARRAY['school', 'company', 'network', 'boutique']))");

  const orgId = uuidv4();
  await knex('organizations').insert({
    id: orgId,
    name: 'Boutique Web',
    type: 'boutique',
    contact: JSON.stringify({ name: 'Nicolas Froment', email: 'nicolas@vins-conversations.fr' }),
  });

  const campaignId = uuidv4();
  await knex('campaigns').insert({
    id: campaignId,
    name: 'Boutique Web',
    org_id: orgId,
    client_type_id: clientTypeId,
    status: 'active',
    start_date: new Date(),
    // No end_date — permanent
    config: JSON.stringify({ type: 'boutique_web', permanent: true }),
  });

  // 7. Associate all visible_boutique products to the Boutique Web campaign
  const visibleProducts = await knex('products').where({ visible_boutique: true }).select('id');
  if (visibleProducts.length > 0) {
    await knex('campaign_products').insert(
      visibleProducts.map((p) => ({
        campaign_id: campaignId,
        product_id: p.id,
        active: true,
      }))
    );
  }

  // 8. Generate referral codes for existing ambassador participations
  const ambassadorParticipations = await knex('participations')
    .join('users', 'participations.user_id', 'users.id')
    .where('users.role', 'ambassadeur')
    .whereNull('participations.referral_code')
    .select('participations.id');

  for (const p of ambassadorParticipations) {
    await knex('participations')
      .where({ id: p.id })
      .update({ referral_code: generateReferralCode() });
  }
};

exports.down = async function (knex) {
  // Remove boutique campaign data
  const campaign = await knex('campaigns')
    .whereRaw("config->>'type' = 'boutique_web'")
    .first();

  if (campaign) {
    await knex('campaign_products').where({ campaign_id: campaign.id }).delete();
    await knex('orders').where({ campaign_id: campaign.id }).delete();
    await knex('campaigns').where({ id: campaign.id }).delete();
  }

  // Remove org
  await knex('organizations').where({ name: 'Boutique Web' }).delete();

  // Restore organizations_type_check
  await knex.raw("ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_type_check");
  await knex.raw("ALTER TABLE organizations ADD CONSTRAINT organizations_type_check CHECK (type = ANY (ARRAY['school', 'company', 'network']))");

  // Remove client_type
  await knex('client_types').where({ name: 'boutique_web' }).delete();

  // Remove referral_code from participations
  await knex.schema.alterTable('participations', (table) => {
    table.dropIndex('referral_code');
    table.dropUnique('referral_code');
    table.dropColumn('referral_code');
  });

  // Restore orders.status constraint
  try {
    await knex.raw('ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check');
  } catch (e) {}
  await knex.raw(`
    ALTER TABLE orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('draft', 'submitted', 'validated', 'preparing', 'shipped', 'delivered', 'cancelled'))
  `);

  // Remove new columns from orders
  await knex.schema.alterTable('orders', (table) => {
    table.dropIndex('source');
    table.dropIndex('referred_by');
    table.dropColumn('source');
    table.dropColumn('referral_code');
    table.dropColumn('referred_by');
  });

  // Restore NOT NULL on user_id
  await knex.raw('ALTER TABLE orders ALTER COLUMN user_id SET NOT NULL');
};
