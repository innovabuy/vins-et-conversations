const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// ─── IDs fixes pour les relations ─────────────────────
const IDS = {
  // Users
  admin: uuidv4(),
  matheo: uuidv4(),
  nicolas: uuidv4(),
  // Étudiants
  ackavong: uuidv4(),
  bourcier: uuidv4(),
  lebreton: uuidv4(),
  flipeau: uuidv4(),
  portier: uuidv4(),
  benoit: uuidv4(),
  moreau: uuidv4(),
  berthommier: uuidv4(),
  // Enseignant
  enseignant1: uuidv4(),
  // CSE
  cse_leroy: uuidv4(),
  // Ambassadeur
  ambassadeur1: uuidv4(),
  // Organisations
  sacre_coeur: uuidv4(),
  leroy_merlin: uuidv4(),
  reseau_loire: uuidv4(),
  espl_angers: uuidv4(),
  // Client types
  ct_scolaire: uuidv4(),
  ct_cse: uuidv4(),
  ct_ambassadeur: uuidv4(),
  ct_bts: uuidv4(),
  // Campaigns
  camp_sacre_coeur: uuidv4(),
  camp_cse_leroy: uuidv4(),
  camp_ambassadeurs: uuidv4(),
  camp_espl: uuidv4(),
  // Products
  oriolus: uuidv4(),
  clemence: uuidv4(),
  carillon: uuidv4(),
  apertus: uuidv4(),
  cremant: uuidv4(),
  coffret: uuidv4(),
  coteaux: uuidv4(),
  jus_pomme: uuidv4(),
};

exports.seed = async function (knex) {
  // Clean en ordre inverse des FK
  const tables = [
    'pricing_conditions', 'delivery_routes', 'notifications', 'audit_log',
    'returns', 'delivery_notes', 'payments', 'financial_events',
    'order_items', 'orders', 'contacts',
    'stock_movements', 'campaign_products', 'products',
    'invitations', 'participations', 'campaigns', 'client_types', 'organizations',
    'refresh_tokens', 'users',
  ];
  for (const table of tables) {
    await knex(table).del();
  }

  const hash = await bcrypt.hash('VinsConv2026!', 12);

  // ═══════════════════════════════════════════════════════
  // USERS
  // ═══════════════════════════════════════════════════════
  await knex('users').insert([
    {
      id: IDS.nicolas,
      email: 'nicolas@vins-conversations.fr',
      password_hash: hash,
      name: 'Nicolas Froment',
      role: 'super_admin',
      status: 'active',
      permissions: JSON.stringify({ all: true }),
    },
    {
      id: IDS.matheo,
      email: 'matheo@vins-conversations.fr',
      password_hash: hash,
      name: 'Mathéo (Stagiaire)',
      role: 'commercial',
      status: 'active',
      permissions: JSON.stringify({
        modules: ['orders', 'delivery_notes', 'crm', 'stock', 'analytics', 'catalogue', 'notifications'],
      }),
    },
    {
      id: IDS.enseignant1,
      email: 'enseignant@sacrecoeur.fr',
      password_hash: hash,
      name: 'Mme Dupont',
      role: 'enseignant',
      status: 'active',
    },
    {
      id: IDS.cse_leroy,
      email: 'cse@leroymerlin.fr',
      password_hash: hash,
      name: 'Marie Leroux (CSE)',
      role: 'cse',
      status: 'active',
    },
    {
      id: IDS.ambassadeur1,
      email: 'ambassadeur@example.fr',
      password_hash: hash,
      name: 'Jean-Pierre Martin',
      role: 'ambassadeur',
      status: 'active',
    },
    // Étudiants Sacré-Cœur
    ...[
      { id: IDS.ackavong, name: 'ACKAVONG Mathéo', email: 'ackavong@eleve.sc.fr' },
      { id: IDS.bourcier, name: 'BOURCIER Lilian', email: 'bourcier@eleve.sc.fr' },
      { id: IDS.lebreton, name: 'LEBRETON Paul', email: 'lebreton@eleve.sc.fr' },
      { id: IDS.flipeau, name: 'FLIPEAU Lilian', email: 'flipeau@eleve.sc.fr' },
      { id: IDS.portier, name: 'PORTIER Pierre', email: 'portier@eleve.sc.fr' },
      { id: IDS.benoit, name: 'BENOIT Lucas', email: 'benoit@eleve.sc.fr' },
      { id: IDS.moreau, name: 'MOREAU Louann', email: 'moreau@eleve.sc.fr' },
      { id: IDS.berthommier, name: 'BERTHOMMIER Charles', email: 'berthommier@eleve.sc.fr' },
    ].map((s) => ({
      ...s,
      password_hash: hash,
      role: 'etudiant',
      status: 'active',
      parental_consent: true,
    })),
  ]);

  // ═══════════════════════════════════════════════════════
  // ORGANISATIONS
  // ═══════════════════════════════════════════════════════
  await knex('organizations').insert([
    { id: IDS.sacre_coeur, name: 'Lycée Sacré-Cœur', type: 'school', address: 'Angers, 49' },
    { id: IDS.leroy_merlin, name: 'Leroy Merlin', type: 'company', address: 'Angers, 49' },
    { id: IDS.reseau_loire, name: 'Réseau Ambassadeurs Loire', type: 'network', address: 'Loire Valley' },
    { id: IDS.espl_angers, name: 'ESPL Angers', type: 'school', address: 'Angers, 49' },
  ]);

  // ═══════════════════════════════════════════════════════
  // CLIENT TYPES (moteur de règles)
  // ═══════════════════════════════════════════════════════
  await knex('client_types').insert([
    {
      id: IDS.ct_scolaire,
      name: 'scolaire',
      label: 'Financement Projet Scolaire',
      pricing_rules: JSON.stringify({ type: 'standard', value: 0, applies_to: 'all' }),
      commission_rules: JSON.stringify({
        association: { type: 'percentage', value: 5, base: 'ca_ht_global' },
        student: { type: 'free_bottle', trigger: 'every_n_sold', n: 12 },
      }),
      free_bottle_rules: JSON.stringify({
        trigger: 'every_n_sold',
        n: 12,
        reward: 'free_bottle',
        choice: 'student_picks',
        from_catalog: true,
      }),
      tier_rules: JSON.stringify({ tiers: [] }),
      ui_config: JSON.stringify({
        show_ranking: true,
        show_streak: true,
        show_gamification: true,
        mobile_width: 390,
      }),
    },
    {
      id: IDS.ct_cse,
      name: 'cse',
      label: 'Offre CSE',
      pricing_rules: JSON.stringify({ type: 'percentage_discount', value: 10, applies_to: 'all', min_order: 200 }),
      commission_rules: JSON.stringify({}),
      free_bottle_rules: JSON.stringify({}),
      tier_rules: JSON.stringify({ tiers: [] }),
      ui_config: JSON.stringify({
        show_ranking: false,
        show_streak: false,
        show_gamification: false,
        ecommerce_mode: true,
        desktop_width: 900,
      }),
    },
    {
      id: IDS.ct_ambassadeur,
      name: 'ambassadeur',
      label: 'Réseau Ambassadeur',
      pricing_rules: JSON.stringify({ type: 'standard', value: 0, applies_to: 'all' }),
      commission_rules: JSON.stringify({}),
      free_bottle_rules: JSON.stringify({}),
      tier_rules: JSON.stringify({
        tiers: [
          { label: 'Bronze', threshold: 500, reward: 'Carte cadeau 25€', color: '#CD7F32' },
          { label: 'Argent', threshold: 1500, reward: 'Carte cadeau 75€', color: '#C0C0C0' },
          { label: 'Or', threshold: 3000, reward: 'Carte cadeau 200€', color: '#C4A35A' },
          { label: 'Platine', threshold: 5000, reward: 'Week-end œnologique', color: '#E5E4E2' },
        ],
        period: 'cumulative',
        reset: 'never',
      }),
      ui_config: JSON.stringify({
        show_ranking: false,
        show_tiers: true,
        show_referral: true,
        desktop_width: 600,
      }),
    },
    {
      id: IDS.ct_bts,
      name: 'bts_ndrc',
      label: 'BTS NDRC',
      pricing_rules: JSON.stringify({ type: 'standard', value: 0, applies_to: 'all' }),
      commission_rules: JSON.stringify({
        association: { type: 'percentage', value: 5, base: 'ca_ht_global' },
        student: { type: 'free_bottle', trigger: 'every_n_sold', n: 12 },
      }),
      free_bottle_rules: JSON.stringify({
        trigger: 'every_n_sold',
        n: 12,
        reward: 'free_bottle',
        choice: 'student_picks',
        from_catalog: true,
      }),
      tier_rules: JSON.stringify({ tiers: [] }),
      ui_config: JSON.stringify({
        show_ranking: true,
        show_streak: true,
        show_gamification: true,
        show_formation: true,
        mobile_width: 400,
      }),
    },
  ]);

  // ═══════════════════════════════════════════════════════
  // CAMPAGNES
  // ═══════════════════════════════════════════════════════
  await knex('campaigns').insert([
    {
      id: IDS.camp_sacre_coeur,
      org_id: IDS.sacre_coeur,
      client_type_id: IDS.ct_scolaire,
      name: 'Sacré-Cœur 2025-2026',
      status: 'active',
      goal: 25000,
      start_date: '2025-09-15',
      end_date: '2026-03-21',
      config: JSON.stringify({ classes: ['GA', 'GB'], project: 'Financement Projet' }),
    },
    {
      id: IDS.camp_cse_leroy,
      org_id: IDS.leroy_merlin,
      client_type_id: IDS.ct_cse,
      name: 'CSE Leroy Merlin',
      status: 'active',
      goal: 8000,
      start_date: '2025-11-01',
      end_date: '2026-03-07',
      config: JSON.stringify({ discount: 10, min_order: 200, payment_terms: '30_days' }),
    },
    {
      id: IDS.camp_ambassadeurs,
      org_id: IDS.reseau_loire,
      client_type_id: IDS.ct_ambassadeur,
      name: 'Ambassadeurs Loire',
      status: 'active',
      goal: 15000,
      start_date: '2025-10-01',
      end_date: '2026-05-08',
      config: JSON.stringify({}),
    },
    {
      id: IDS.camp_espl,
      org_id: IDS.espl_angers,
      client_type_id: IDS.ct_scolaire,
      name: 'ESPL Angers',
      status: 'active',
      goal: 12000,
      start_date: '2025-10-01',
      end_date: '2026-03-14',
      config: JSON.stringify({ classes: ['A'], project: 'Financement Projet' }),
    },
  ]);

  // ═══════════════════════════════════════════════════════
  // PRODUITS (catalogue CDC §7.1)
  // ═══════════════════════════════════════════════════════
  await knex('products').insert([
    { id: IDS.oriolus, name: 'Oriolus Blanc', price_ht: 5.42, price_ttc: 6.50, purchase_price: 3.20, tva_rate: 20, category: 'Blancs Secs', label: 'HVE', sort_order: 1 },
    { id: IDS.clemence, name: 'Cuvée Clémence', price_ht: 7.08, price_ttc: 8.50, purchase_price: 4.10, tva_rate: 20, category: 'Blancs Moelleux', label: 'Bio', sort_order: 2 },
    { id: IDS.carillon, name: 'Carillon', price_ht: 10.42, price_ttc: 12.50, purchase_price: 5.80, tva_rate: 20, category: 'Rouges', label: 'Cru Bourgeois', sort_order: 3 },
    { id: IDS.apertus, name: 'Apertus', price_ht: 11.25, price_ttc: 13.50, purchase_price: 6.50, tva_rate: 20, category: 'Rouges', label: 'HVE', sort_order: 4 },
    { id: IDS.cremant, name: 'Crémant de Loire', price_ht: 10.75, price_ttc: 12.90, purchase_price: 5.90, tva_rate: 20, category: 'Effervescents', label: null, sort_order: 5 },
    { id: IDS.coffret, name: 'Coffret Découverte 3bt', price_ht: 26.67, price_ttc: 32.00, purchase_price: 14.00, tva_rate: 20, category: 'Coffrets', label: null, sort_order: 6 },
    { id: IDS.coteaux, name: 'Coteaux du Layon', price_ht: 9.17, price_ttc: 11.00, purchase_price: 5.30, tva_rate: 20, category: 'Blancs Moelleux', label: 'HVE', sort_order: 7 },
    { id: IDS.jus_pomme, name: 'Jus de Pomme', price_ht: 3.32, price_ttc: 3.50, purchase_price: 1.80, tva_rate: 5.5, category: 'Sans Alcool', label: 'Bio', sort_order: 8 },
  ]);

  // Assignation produits → campagne Sacré-Cœur (tous les produits)
  const allProductIds = [IDS.oriolus, IDS.clemence, IDS.carillon, IDS.apertus, IDS.cremant, IDS.coffret, IDS.coteaux, IDS.jus_pomme];
  await knex('campaign_products').insert(
    allProductIds.map((pid, i) => ({
      campaign_id: IDS.camp_sacre_coeur,
      product_id: pid,
      active: true,
      sort_order: i + 1,
    }))
  );

  // Idem pour les autres campagnes
  for (const campId of [IDS.camp_cse_leroy, IDS.camp_ambassadeurs, IDS.camp_espl]) {
    await knex('campaign_products').insert(
      allProductIds.map((pid, i) => ({
        campaign_id: campId,
        product_id: pid,
        active: true,
        sort_order: i + 1,
      }))
    );
  }

  // ═══════════════════════════════════════════════════════
  // PARTICIPATIONS (étudiants → Sacré-Cœur)
  // ═══════════════════════════════════════════════════════
  const students = [
    { id: IDS.ackavong, class_group: 'GA' },
    { id: IDS.bourcier, class_group: 'GB' },
    { id: IDS.lebreton, class_group: 'GA' },
    { id: IDS.flipeau, class_group: 'GA' },
    { id: IDS.portier, class_group: 'GB' },
    { id: IDS.benoit, class_group: 'GB' },
    { id: IDS.moreau, class_group: 'GA' },
    { id: IDS.berthommier, class_group: 'GA' },
  ];

  await knex('participations').insert(
    students.map((s) => ({
      user_id: s.id,
      campaign_id: IDS.camp_sacre_coeur,
      organization_id: IDS.sacre_coeur,
      role_in_campaign: 'student',
      class_group: s.class_group,
    }))
  );

  // Participation enseignant
  await knex('participations').insert({
    user_id: IDS.enseignant1,
    campaign_id: IDS.camp_sacre_coeur,
    organization_id: IDS.sacre_coeur,
    role_in_campaign: 'teacher',
  });

  // Participation CSE
  await knex('participations').insert({
    user_id: IDS.cse_leroy,
    campaign_id: IDS.camp_cse_leroy,
    organization_id: IDS.leroy_merlin,
    role_in_campaign: 'cse_manager',
  });

  // Participation ambassadeur
  await knex('participations').insert({
    user_id: IDS.ambassadeur1,
    campaign_id: IDS.camp_ambassadeurs,
    organization_id: IDS.reseau_loire,
    role_in_campaign: 'ambassador',
  });

  // Admin/commercial participent à toutes les campagnes
  for (const campId of [IDS.camp_sacre_coeur, IDS.camp_cse_leroy, IDS.camp_ambassadeurs, IDS.camp_espl]) {
    await knex('participations').insert([
      { user_id: IDS.nicolas, campaign_id: campId, role_in_campaign: 'admin' },
      { user_id: IDS.matheo, campaign_id: campId, role_in_campaign: 'commercial' },
    ]);
  }

  // ═══════════════════════════════════════════════════════
  // STOCK INITIAL
  // ═══════════════════════════════════════════════════════
  await knex('stock_movements').insert(
    allProductIds.map((pid) => ({
      product_id: pid,
      campaign_id: IDS.camp_sacre_coeur,
      type: 'initial',
      qty: 200,
      reference: 'Stock initial campagne',
    }))
  );

  // ═══════════════════════════════════════════════════════
  // COMMANDES DE RÉFÉRENCE (données CDC §7.2)
  // ═══════════════════════════════════════════════════════
  const studentData = [
    { id: IDS.ackavong, ca: 2383.70, orders: 12, free: 15, streak: 5 },
    { id: IDS.bourcier, ca: 2231.90, orders: 10, free: 15, streak: 3 },
    { id: IDS.lebreton, ca: 1802.60, orders: 8, free: 14, streak: 0 },
    { id: IDS.flipeau, ca: 1677.90, orders: 7, free: 10, streak: 1 },
    { id: IDS.portier, ca: 1544.30, orders: 9, free: 13, streak: 2 },
    { id: IDS.benoit, ca: 1328.50, orders: 6, free: 8, streak: 0 },
    { id: IDS.moreau, ca: 1317.00, orders: 5, free: 6, streak: 1 },
    { id: IDS.berthommier, ca: 1038.00, orders: 4, free: 8, streak: 0 },
  ];

  let orderCounter = 1;
  for (const student of studentData) {
    for (let i = 0; i < student.orders; i++) {
      const orderAmount = student.ca / student.orders;
      const ref = `VC-2026-${String(orderCounter++).padStart(4, '0')}`;
      const orderId = uuidv4();
      const orderDate = new Date(2025, 8 + Math.floor(i / 3), 15 + (i * 3));

      await knex('orders').insert({
        id: orderId,
        ref,
        campaign_id: IDS.camp_sacre_coeur,
        user_id: student.id,
        status: 'delivered',
        total_ttc: parseFloat(orderAmount.toFixed(2)),
        total_ht: parseFloat((orderAmount / 1.20).toFixed(2)),
        total_items: Math.ceil(orderAmount / 10),
        created_at: orderDate,
        updated_at: orderDate,
      });

      // Financial event (append-only)
      await knex('financial_events').insert({
        order_id: orderId,
        campaign_id: IDS.camp_sacre_coeur,
        type: 'sale',
        amount: parseFloat(orderAmount.toFixed(2)),
        description: `Vente ${ref} - ${student.id === IDS.ackavong ? 'ACKAVONG' : 'Étudiant'}`,
        created_at: orderDate,
      });
    }
  }

  // ═══════════════════════════════════════════════════════
  // CONDITIONS COMMERCIALES (CDC §Module 14)
  // ═══════════════════════════════════════════════════════
  await knex('pricing_conditions').insert([
    { client_type: 'scolaire', label: 'Scolaire Standard', discount_pct: 0, commission_pct: 5, commission_student: '1bt/12 vendues', min_order: 0, payment_terms: 'immediate', active: true },
    { client_type: 'cse', label: 'CSE Standard', discount_pct: 10, commission_pct: 0, commission_student: null, min_order: 200, payment_terms: '30_days', active: true },
    { client_type: 'ambassadeur_bronze', label: 'Ambassadeur Bronze', discount_pct: 0, commission_pct: 0, commission_student: null, min_order: 0, payment_terms: 'immediate', active: true },
    { client_type: 'ambassadeur_argent', label: 'Ambassadeur Argent', discount_pct: 0, commission_pct: 0, commission_student: null, min_order: 0, payment_terms: 'immediate', active: true },
    { client_type: 'ambassadeur_or', label: 'Ambassadeur Or', discount_pct: 5, commission_pct: 0, commission_student: null, min_order: 0, payment_terms: 'immediate', active: true },
    { client_type: 'bts_ndrc', label: 'BTS NDRC', discount_pct: 0, commission_pct: 5, commission_student: '1bt/12 vendues', min_order: 0, payment_terms: 'immediate', active: true },
    { client_type: 'particulier', label: 'Particulier Hors Campagne', discount_pct: 0, commission_pct: 0, commission_student: null, min_order: 0, payment_terms: 'immediate', active: true },
  ]);

  console.log('✅ Seed complet Vins & Conversations — Données CDC v4');
};
