/**
 * Migration initiale — 20 tables Vins & Conversations
 * Conforme au CDC v4 §2.3
 */
exports.up = async function (knex) {
  // ─── Extensions ─────────────────────────────────────
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  // ─── DOMAINE: Utilisateurs ──────────────────────────

  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.string('email').notNullable().unique();
    t.string('password_hash').notNullable();
    t.string('name').notNullable();
    t.string('avatar');
    t.enum('role', [
      'super_admin', 'commercial', 'comptable',
      'enseignant', 'etudiant', 'cse', 'ambassadeur', 'lecture_seule'
    ]).notNullable().defaultTo('etudiant');
    t.enum('status', ['active', 'disabled', 'pending']).defaultTo('pending');
    t.jsonb('permissions').defaultTo('{}');
    t.boolean('parental_consent').defaultTo(false);
    t.timestamp('last_login_at');
    t.timestamps(true, true);
    t.index('email');
    t.index('role');
  });

  await knex.schema.createTable('refresh_tokens', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('token').notNullable().unique();
    t.timestamp('expires_at').notNullable();
    t.boolean('revoked').defaultTo(false);
    t.timestamps(true, true);
    t.index('token');
    t.index('user_id');
  });

  // ─── DOMAINE: Organisations & Campagnes ─────────────

  await knex.schema.createTable('organizations', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.string('name').notNullable();
    t.enum('type', ['school', 'company', 'network']).notNullable();
    t.string('address');
    t.jsonb('contact').defaultTo('{}');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('client_types', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.string('name').notNullable().unique();
    t.string('label').notNullable();
    t.jsonb('pricing_rules').defaultTo('{}');
    t.jsonb('commission_rules').defaultTo('{}');
    t.jsonb('free_bottle_rules').defaultTo('{}');
    t.jsonb('tier_rules').defaultTo('{}');
    t.jsonb('ui_config').defaultTo('{}');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('campaigns', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('org_id').references('id').inTable('organizations').onDelete('SET NULL');
    t.uuid('client_type_id').references('id').inTable('client_types').onDelete('SET NULL');
    t.string('name').notNullable();
    t.enum('status', ['draft', 'active', 'paused', 'completed', 'archived']).defaultTo('draft');
    t.decimal('goal', 12, 2).defaultTo(0);
    t.date('start_date');
    t.date('end_date');
    t.jsonb('config').defaultTo('{}');
    t.timestamps(true, true);
    t.index('status');
    t.index('org_id');
  });

  await knex.schema.createTable('participations', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.uuid('campaign_id').notNullable().references('id').inTable('campaigns').onDelete('CASCADE');
    t.uuid('organization_id').references('id').inTable('organizations').onDelete('SET NULL');
    t.string('role_in_campaign').defaultTo('participant');
    t.string('class_group'); // GA, GB pour les scolaires
    t.jsonb('config').defaultTo('{}');
    t.timestamp('joined_at').defaultTo(knex.fn.now());
    t.timestamps(true, true);
    t.unique(['user_id', 'campaign_id']);
    t.index('campaign_id');
  });

  await knex.schema.createTable('invitations', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.string('code').notNullable().unique();
    t.uuid('campaign_id').notNullable().references('id').inTable('campaigns').onDelete('CASCADE');
    t.string('role').notNullable();
    t.enum('method', ['link', 'qr', 'email']).defaultTo('link');
    t.string('email'); // si envoi par email
    t.uuid('used_by').references('id').inTable('users');
    t.timestamp('expires_at');
    t.timestamp('used_at');
    t.timestamps(true, true);
    t.index('code');
    t.index('campaign_id');
  });

  // ─── DOMAINE: Catalogue & Produits ──────────────────

  await knex.schema.createTable('products', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.string('name').notNullable();
    t.decimal('price_ht', 10, 2).notNullable();
    t.decimal('price_ttc', 10, 2).notNullable();
    t.decimal('purchase_price', 10, 2).notNullable();
    t.decimal('tva_rate', 5, 2).notNullable().defaultTo(20.00);
    t.string('category');
    t.string('label'); // Bio, HVE, Cru Bourgeois
    t.string('image_url');
    t.text('description');
    t.boolean('active').defaultTo(true);
    t.integer('sort_order').defaultTo(0);
    t.timestamps(true, true);
    t.index('active');
    t.index('category');
  });

  await knex.schema.createTable('campaign_products', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('campaign_id').notNullable().references('id').inTable('campaigns').onDelete('CASCADE');
    t.uuid('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE');
    t.decimal('custom_price', 10, 2); // prix override par campagne
    t.boolean('active').defaultTo(true);
    t.integer('sort_order').defaultTo(0);
    t.timestamps(true, true);
    t.unique(['campaign_id', 'product_id']);
    t.index('campaign_id');
  });

  await knex.schema.createTable('stock_movements', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE');
    t.uuid('campaign_id').references('id').inTable('campaigns').onDelete('SET NULL');
    t.enum('type', ['initial', 'entry', 'exit', 'return', 'free', 'correction']).notNullable();
    t.integer('qty').notNullable();
    t.string('reference'); // BL, commande, correction
    t.text('reason');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index('product_id');
    t.index('campaign_id');
    // Append-only: pas de updated_at
  });

  // ─── DOMAINE: Commandes & Finance ───────────────────

  await knex.schema.createTable('contacts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.string('name').notNullable();
    t.string('email');
    t.string('phone');
    t.text('address');
    t.string('source'); // quel étudiant/ambassadeur
    t.uuid('source_user_id').references('id').inTable('users').onDelete('SET NULL');
    t.enum('type', ['particulier', 'cse', 'ambassadeur', 'professionnel']).defaultTo('particulier');
    t.jsonb('notes').defaultTo('{}');
    t.timestamps(true, true);
    t.index('email');
    t.index('source_user_id');
  });

  await knex.schema.createTable('orders', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.string('ref').notNullable().unique(); // VC-2026-0001
    t.uuid('campaign_id').notNullable().references('id').inTable('campaigns').onDelete('RESTRICT');
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.uuid('customer_id').references('id').inTable('contacts').onDelete('SET NULL');
    t.enum('status', [
      'draft', 'submitted', 'validated', 'preparing', 'shipped', 'delivered', 'cancelled'
    ]).defaultTo('draft');
    t.jsonb('items').defaultTo('[]'); // snapshot pour immutabilité
    t.decimal('total_ht', 12, 2).defaultTo(0);
    t.decimal('total_ttc', 12, 2).defaultTo(0);
    t.integer('total_items').defaultTo(0);
    t.text('notes');
    t.timestamps(true, true);
    t.index('campaign_id');
    t.index('user_id');
    t.index('status');
    t.index('ref');
  });

  await knex.schema.createTable('order_items', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    t.uuid('product_id').notNullable().references('id').inTable('products').onDelete('RESTRICT');
    t.integer('qty').notNullable();
    t.decimal('unit_price_ht', 10, 2).notNullable();
    t.decimal('unit_price_ttc', 10, 2).notNullable();
    t.integer('free_qty').defaultTo(0);
    t.timestamps(true, true);
    t.index('order_id');
  });

  await knex.schema.createTable('financial_events', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('order_id').references('id').inTable('orders').onDelete('SET NULL');
    t.uuid('campaign_id').references('id').inTable('campaigns').onDelete('SET NULL');
    t.enum('type', ['sale', 'refund', 'commission', 'correction', 'free_bottle']).notNullable();
    t.decimal('amount', 12, 2).notNullable();
    t.text('description');
    t.jsonb('metadata').defaultTo('{}');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index('order_id');
    t.index('campaign_id');
    t.index('type');
    // Append-only: pas de updated_at
  });

  await knex.schema.createTable('payments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('order_id').references('id').inTable('orders').onDelete('SET NULL');
    t.enum('method', ['stripe', 'transfer', 'cash', 'check']).notNullable();
    t.decimal('amount', 12, 2).notNullable();
    t.enum('status', ['pending', 'reconciled', 'partial', 'manual', 'unpaid']).defaultTo('pending');
    t.string('stripe_id');
    t.text('reference');
    t.timestamp('reconciled_at');
    t.jsonb('metadata').defaultTo('{}');
    t.timestamps(true, true);
    t.index('order_id');
    t.index('status');
  });

  await knex.schema.createTable('delivery_notes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    t.string('ref').notNullable().unique(); // BL-2026-0001
    t.enum('status', ['draft', 'ready', 'shipped', 'delivered', 'signed']).defaultTo('draft');
    t.string('recipient_name');
    t.text('delivery_address');
    t.date('planned_date');
    t.text('signature_url');
    t.timestamp('delivered_at');
    t.timestamps(true, true);
    t.index('order_id');
    t.index('status');
  });

  await knex.schema.createTable('returns', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    t.uuid('product_id').notNullable().references('id').inTable('products').onDelete('RESTRICT');
    t.integer('qty').notNullable();
    t.text('reason');
    t.enum('status', ['pending', 'credit_issued', 'replaced']).defaultTo('pending');
    t.decimal('credit_amount', 10, 2).defaultTo(0);
    t.timestamps(true, true);
    t.index('order_id');
  });

  // ─── DOMAINE: Admin & Audit ─────────────────────────

  await knex.schema.createTable('audit_log', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
    t.string('action').notNullable();
    t.string('entity').notNullable(); // table name
    t.uuid('entity_id');
    t.jsonb('before').defaultTo('{}');
    t.jsonb('after').defaultTo('{}');
    t.text('reason');
    t.string('ip_address');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index('entity');
    t.index('user_id');
    t.index('created_at');
    // Append-only
  });

  await knex.schema.createTable('notifications', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.enum('type', ['order', 'payment', 'ranking', 'stock', 'unpaid', 'delivery', 'milestone']).notNullable();
    t.text('message').notNullable();
    t.string('link'); // deep link dans l'app
    t.boolean('read').defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index('user_id');
    t.index(['user_id', 'read']);
  });

  await knex.schema.createTable('delivery_routes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.date('date').notNullable();
    t.string('zone');
    t.string('driver');
    t.jsonb('stops').defaultTo('[]');
    t.decimal('km', 8, 1).defaultTo(0);
    t.enum('status', ['draft', 'planned', 'in_progress', 'completed']).defaultTo('draft');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('pricing_conditions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.string('client_type').notNullable();
    t.string('label').notNullable();
    t.decimal('discount_pct', 5, 2).defaultTo(0);
    t.decimal('commission_pct', 5, 2).defaultTo(0);
    t.string('commission_student');
    t.decimal('min_order', 10, 2).defaultTo(0);
    t.string('payment_terms');
    t.boolean('active').defaultTo(true);
    t.timestamps(true, true);
  });
};

exports.down = async function (knex) {
  const tables = [
    'pricing_conditions', 'delivery_routes', 'notifications', 'audit_log',
    'returns', 'delivery_notes', 'payments', 'financial_events',
    'order_items', 'orders', 'contacts',
    'stock_movements', 'campaign_products', 'products',
    'invitations', 'participations', 'campaigns', 'client_types', 'organizations',
    'refresh_tokens', 'users',
  ];
  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
  await knex.raw('DROP EXTENSION IF EXISTS "uuid-ossp"');
  await knex.raw('DROP EXTENSION IF EXISTS "pgcrypto"');
};
