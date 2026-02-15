exports.up = async function (knex) {
  // 1. organization_types
  const hasOrgTypes = await knex.schema.hasTable('organization_types');
  if (!hasOrgTypes) {
    await knex.schema.createTable('organization_types', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      t.string('code', 50).notNullable().unique();
      t.string('label', 150).notNullable();
      t.text('description');
      t.uuid('default_client_type_id').references('id').inTable('client_types').onDelete('SET NULL');
      t.jsonb('default_config').defaultTo(JSON.stringify({}));
      t.boolean('active').defaultTo(true);
      t.timestamps(true, true);
    });
  }

  // 2. campaign_types
  const hasCampTypes = await knex.schema.hasTable('campaign_types');
  if (!hasCampTypes) {
    await knex.schema.createTable('campaign_types', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      t.string('code', 50).notNullable().unique();
      t.string('label', 150).notNullable();
      t.text('description');
      t.uuid('default_client_type_id').references('id').inTable('client_types').onDelete('SET NULL');
      t.jsonb('default_config').defaultTo(JSON.stringify({}));
      t.boolean('active').defaultTo(true);
      t.timestamps(true, true);
    });
  }

  // 3. Junction table
  const hasJunction = await knex.schema.hasTable('organization_type_campaign_types');
  if (!hasJunction) {
    await knex.schema.createTable('organization_type_campaign_types', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      t.uuid('organization_type_id').notNullable().references('id').inTable('organization_types').onDelete('CASCADE');
      t.uuid('campaign_type_id').notNullable().references('id').inTable('campaign_types').onDelete('CASCADE');
      t.unique(['organization_type_id', 'campaign_type_id']);
      t.timestamps(true, true);
    });
  }

  // 4. Add organization_type_id to organizations
  const hasOrgTypeCol = await knex.schema.hasColumn('organizations', 'organization_type_id');
  if (!hasOrgTypeCol) {
    await knex.schema.alterTable('organizations', (t) => {
      t.uuid('organization_type_id').references('id').inTable('organization_types').onDelete('SET NULL');
      t.jsonb('config_override').defaultTo(JSON.stringify({}));
    });
  }

  // 5. Add campaign_type_id to campaigns
  const hasCampTypeCol = await knex.schema.hasColumn('campaigns', 'campaign_type_id');
  if (!hasCampTypeCol) {
    await knex.schema.alterTable('campaigns', (t) => {
      t.uuid('campaign_type_id').references('id').inTable('campaign_types').onDelete('SET NULL');
    });
  }

  // ── Inline data migration ──────────────────────────────

  // Check if data already migrated
  const existingOrgTypes = await knex('organization_types').count('id as c').first();
  if (parseInt(existingOrgTypes.c) > 0) return;

  // Look up existing client_types by name
  const clientTypes = await knex('client_types').select('id', 'name');
  const ctMap = {};
  for (const ct of clientTypes) ctMap[ct.name] = ct.id;

  // Insert organization types
  const orgTypes = [
    {
      code: 'school',
      label: 'Établissement scolaire',
      description: 'Lycées, collèges et écoles — campagnes de financement de projets scolaires',
      default_client_type_id: ctMap['scolaire'] || null,
      default_config: JSON.stringify({ allowed_roles: ['etudiant', 'enseignant'], allowed_dashboards: ['student', 'teacher'], features: ['gamification', 'ranking', 'badges'] }),
    },
    {
      code: 'company',
      label: 'Entreprise (CSE)',
      description: 'Comités sociaux et économiques — offres à tarifs préférentiels pour les salariés',
      default_client_type_id: ctMap['cse'] || null,
      default_config: JSON.stringify({ allowed_roles: ['cse'], allowed_dashboards: ['cse'], features: ['ecommerce_mode', 'discount'] }),
    },
    {
      code: 'network',
      label: 'Réseau ambassadeur',
      description: 'Réseaux de vente directe avec système de paliers et récompenses',
      default_client_type_id: ctMap['ambassadeur'] || null,
      default_config: JSON.stringify({ allowed_roles: ['ambassadeur'], allowed_dashboards: ['ambassador'], features: ['tiers', 'referral'] }),
    },
    {
      code: 'boutique',
      label: 'Boutique en ligne',
      description: 'Vente directe via la boutique web publique',
      default_client_type_id: ctMap['boutique_web'] || null,
      default_config: JSON.stringify({ allowed_roles: [], allowed_dashboards: [], features: ['public_shop'] }),
    },
  ];

  const insertedOrgTypes = await knex('organization_types').insert(orgTypes).returning(['id', 'code']);
  const otMap = {};
  for (const ot of insertedOrgTypes) otMap[ot.code] = ot.id;

  // Insert campaign types
  const campTypes = [
    {
      code: 'scolaire',
      label: 'Campagne scolaire',
      description: 'Financement de projets scolaires (voyages, équipements)',
      default_client_type_id: ctMap['scolaire'] || null,
      default_config: JSON.stringify({ show_ranking: true, show_gamification: true, show_badges: true }),
    },
    {
      code: 'cse',
      label: 'Campagne CSE',
      description: 'Offre CSE avec tarifs remisés',
      default_client_type_id: ctMap['cse'] || null,
      default_config: JSON.stringify({ ecommerce_mode: true, show_ranking: false }),
    },
    {
      code: 'ambassadeur',
      label: 'Campagne ambassadeur',
      description: 'Réseau de vente directe avec paliers de récompenses',
      default_client_type_id: ctMap['ambassadeur'] || null,
      default_config: JSON.stringify({ show_tiers: true, show_referral: true }),
    },
    {
      code: 'bts_ndrc',
      label: 'Campagne BTS NDRC',
      description: 'Projet commercial BTS NDRC avec formation intégrée',
      default_client_type_id: ctMap['bts_ndrc'] || null,
      default_config: JSON.stringify({ show_ranking: true, show_formation: true, show_gamification: true }),
    },
    {
      code: 'boutique_web',
      label: 'Boutique en ligne',
      description: 'Campagne permanente de vente directe',
      default_client_type_id: ctMap['boutique_web'] || null,
      default_config: JSON.stringify({ permanent: true }),
    },
  ];

  const insertedCampTypes = await knex('campaign_types').insert(campTypes).returning(['id', 'code']);
  const cptMap = {};
  for (const ct of insertedCampTypes) cptMap[ct.code] = ct.id;

  // Insert junction rows: which org types allow which campaign types
  const junctionRows = [
    { organization_type_id: otMap['school'], campaign_type_id: cptMap['scolaire'] },
    { organization_type_id: otMap['school'], campaign_type_id: cptMap['bts_ndrc'] },
    { organization_type_id: otMap['company'], campaign_type_id: cptMap['cse'] },
    { organization_type_id: otMap['network'], campaign_type_id: cptMap['ambassadeur'] },
    { organization_type_id: otMap['boutique'], campaign_type_id: cptMap['boutique_web'] },
  ];

  await knex('organization_type_campaign_types').insert(junctionRows);

  // Migrate existing organizations: map type string → organization_type_id
  const orgs = await knex('organizations').select('id', 'type');
  for (const org of orgs) {
    if (org.type && otMap[org.type]) {
      await knex('organizations').where({ id: org.id }).update({ organization_type_id: otMap[org.type] });
    }
  }

  // Migrate existing campaigns: map via client_types.name → campaign_type code
  const nameToCode = {
    scolaire: 'scolaire',
    cse: 'cse',
    ambassadeur: 'ambassadeur',
    bts_ndrc: 'bts_ndrc',
    boutique_web: 'boutique_web',
  };

  const campaigns = await knex('campaigns')
    .join('client_types', 'campaigns.client_type_id', 'client_types.id')
    .select('campaigns.id', 'client_types.name as ct_name');

  for (const camp of campaigns) {
    const code = nameToCode[camp.ct_name];
    if (code && cptMap[code]) {
      await knex('campaigns').where({ id: camp.id }).update({ campaign_type_id: cptMap[code] });
    }
  }
};

exports.down = async function (knex) {
  // Remove columns first
  const hasCampTypeCol = await knex.schema.hasColumn('campaigns', 'campaign_type_id');
  if (hasCampTypeCol) {
    await knex.schema.alterTable('campaigns', (t) => {
      t.dropColumn('campaign_type_id');
    });
  }

  const hasOrgTypeCol = await knex.schema.hasColumn('organizations', 'organization_type_id');
  if (hasOrgTypeCol) {
    await knex.schema.alterTable('organizations', (t) => {
      t.dropColumn('organization_type_id');
      t.dropColumn('config_override');
    });
  }

  await knex.schema.dropTableIfExists('organization_type_campaign_types');
  await knex.schema.dropTableIfExists('campaign_types');
  await knex.schema.dropTableIfExists('organization_types');
};
