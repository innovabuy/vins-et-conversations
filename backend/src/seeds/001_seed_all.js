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
  // BTS student
  bts_student1: uuidv4(),
  // Ambassadeur
  ambassadeur1: uuidv4(),
  // BTS campaign
  camp_bts_espl: uuidv4(),
  // Formation modules
  fm1: uuidv4(), fm2: uuidv4(), fm3: uuidv4(),
  fm4: uuidv4(), fm5: uuidv4(), fm6: uuidv4(),
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
  // Suppliers
  supplier_fruitiere: uuidv4(),
  supplier_carillon: uuidv4(),
  supplier_vouvray: uuidv4(),
};

exports.seed = async function (knex) {
  // Clean en ordre inverse des FK
  const tables = [
    'formation_progress', 'formation_modules',
    'suppliers', 'pricing_conditions', 'delivery_routes', 'notifications', 'audit_log',
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
      id: IDS.bts_student1,
      email: 'bts@espl.fr',
      password_hash: hash,
      name: 'Lucas Dupont (BTS)',
      role: 'etudiant',
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
      config: JSON.stringify({ classes: ['GA', 'GB'], project: 'Financement Projet', max_unpaid_orders: 3, inactivity_threshold: 7, badge_config: { premier_1000_threshold: 1000, machine_vendre_threshold: 50, streak_7_days: 7, fidele_days: 14 } }),
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
      config: JSON.stringify({ discount: 10, min_order: 200, payment_terms: '30_days', max_unpaid_orders: 3, inactivity_threshold: 7 }),
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
      config: JSON.stringify({ max_unpaid_orders: 3, inactivity_threshold: 7 }),
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
      config: JSON.stringify({ classes: ['A'], project: 'Financement Projet', max_unpaid_orders: 3, inactivity_threshold: 7, badge_config: { premier_1000_threshold: 1000, machine_vendre_threshold: 50, streak_7_days: 7, fidele_days: 14 } }),
    },
    {
      id: IDS.camp_bts_espl,
      org_id: IDS.espl_angers,
      client_type_id: IDS.ct_bts,
      name: 'BTS NDRC ESPL 2025-2026',
      status: 'active',
      goal: 10000,
      start_date: '2025-09-15',
      end_date: '2026-06-30',
      config: JSON.stringify({ classes: ['NDRC1'], project: 'Projet BTS NDRC', show_formation: true, max_unpaid_orders: 3, inactivity_threshold: 7, badge_config: { premier_1000_threshold: 1000, machine_vendre_threshold: 50, streak_7_days: 7, fidele_days: 14 } }),
    },
  ]);

  // ═══════════════════════════════════════════════════════
  // PRODUITS (catalogue CDC §7.1)
  // ═══════════════════════════════════════════════════════
  await knex('products').insert([
    {
      id: IDS.oriolus, name: 'Oriolus Blanc', description: 'Vin blanc sec et frais aux notes d\'agrumes et de fruits blancs. Idéal en apéritif ou avec des fruits de mer.', price_ht: 5.42, price_ttc: 6.50, purchase_price: 3.20, tva_rate: 20,
      category: 'Blancs Secs', label: 'HVE', sort_order: 1,
      region: 'Loire', appellation: 'Anjou', color: 'blanc', vintage: 2023,
      grape_varieties: JSON.stringify(['Chenin Blanc']),
      serving_temp: '8-10°C',
      food_pairing: JSON.stringify(['Fruits de mer', 'Poisson grillé', 'Fromage de chèvre']),
      tasting_notes: JSON.stringify({ fruite: 4, mineralite: 3, rondeur: 3, acidite: 4, boise: 1, longueur: 3, puissance: 2 }),
      winemaker_notes: 'Nez expressif de fruits blancs et d\'agrumes. Bouche vive et minérale avec une belle longueur.',
      awards: JSON.stringify([{ year: 2024, name: 'Médaille Argent Concours des Vins de Loire' }]),
    },
    {
      id: IDS.clemence, name: 'Cuvée Clémence', description: 'Blanc moelleux Bio issu de vendanges tardives. Arômes de miel, coing et fruits confits pour un vin gourmand.', price_ht: 7.08, price_ttc: 8.50, purchase_price: 4.10, tva_rate: 20,
      category: 'Blancs Moelleux', label: 'Bio', sort_order: 2,
      region: 'Loire', appellation: 'Anjou', color: 'blanc', vintage: 2022,
      grape_varieties: JSON.stringify(['Chenin Blanc']),
      serving_temp: '8-10°C',
      food_pairing: JSON.stringify(['Foie gras', 'Desserts', 'Fromages bleus']),
      tasting_notes: JSON.stringify({ fruite: 5, douceur: 4, rondeur: 4, acidite: 3, boise: 0, longueur: 4, puissance: 3 }),
      winemaker_notes: 'Vendanges tardives, riche et onctueux. Notes de miel, coing et fruits confits.',
      awards: JSON.stringify([{ year: 2023, name: 'Médaille Or Concours Général Agricole Paris' }]),
    },
    {
      id: IDS.carillon, name: 'Carillon', description: 'Rouge de garde élevé 12 mois en fûts de chêne. Tanins élégants, fruits noirs et finale épicée.', price_ht: 10.42, price_ttc: 12.50, purchase_price: 5.80, tva_rate: 20,
      category: 'Rouges', label: 'Cru Bourgeois', sort_order: 3,
      region: 'Loire', appellation: 'Anjou-Villages', color: 'rouge', vintage: 2021,
      grape_varieties: JSON.stringify(['Cabernet Franc', 'Merlot']),
      serving_temp: '16-18°C',
      food_pairing: JSON.stringify(['Viandes rouges', 'Gibier', 'Fromages affinés']),
      tasting_notes: JSON.stringify({ fruite: 4, mineralite: 2, rondeur: 4, acidite: 2, tanins: 4, boise: 3, longueur: 4, puissance: 4 }),
      winemaker_notes: 'Élevage 12 mois en fûts de chêne. Structure tannique élégante, finale épicée.',
      awards: JSON.stringify([{ year: 2023, name: 'Cru Bourgeois' }, { year: 2024, name: 'Médaille Or Concours Paris' }]),
    },
    {
      id: IDS.apertus, name: 'Apertus', description: 'Rouge gourmand HVE aux arômes de fruits rouges et poivre. Equilibré et souple, parfait pour les grillades.', price_ht: 11.25, price_ttc: 13.50, purchase_price: 6.50, tva_rate: 20,
      category: 'Rouges', label: 'HVE', sort_order: 4,
      region: 'Loire', appellation: 'Anjou', color: 'rouge', vintage: 2022,
      grape_varieties: JSON.stringify(['Cabernet Franc']),
      serving_temp: '15-17°C',
      food_pairing: JSON.stringify(['Charcuterie', 'Grillades', 'Plats mijotés']),
      tasting_notes: JSON.stringify({ fruite: 3, mineralite: 3, rondeur: 3, acidite: 3, tanins: 3, boise: 2, longueur: 3, puissance: 3 }),
      winemaker_notes: 'Vin gourmand et équilibré. Fruits rouges, poivre et notes de sous-bois.',
      awards: JSON.stringify([]),
    },
    {
      id: IDS.cremant, name: 'Crémant de Loire', description: 'Effervescent méthode traditionnelle, 18 mois sur lattes. Fines bulles, fraîcheur et élégance.', price_ht: 10.75, price_ttc: 12.90, purchase_price: 5.90, tva_rate: 20,
      category: 'Effervescents', label: null, sort_order: 5,
      region: 'Loire', appellation: 'Crémant de Loire', color: 'effervescent', vintage: null,
      grape_varieties: JSON.stringify(['Chenin Blanc', 'Chardonnay']),
      serving_temp: '6-8°C',
      food_pairing: JSON.stringify(['Apéritif', 'Fruits de mer', 'Desserts légers']),
      tasting_notes: JSON.stringify({ fruite: 4, finesse_bulles: 4, fraicheur: 4, rondeur: 2, longueur: 3, puissance: 2 }),
      winemaker_notes: 'Méthode traditionnelle, 18 mois sur lattes. Fines bulles, fraîcheur et élégance.',
      awards: JSON.stringify([{ year: 2024, name: 'Médaille Argent Effervescents du Monde' }]),
    },
    {
      id: IDS.coffret, name: 'Coffret Découverte 3bt', description: 'Coffret de 3 bouteilles pour découvrir notre gamme : 1 blanc, 1 rouge et 1 effervescent.', price_ht: 26.67, price_ttc: 32.00, purchase_price: 14.00, tva_rate: 20,
      category: 'Coffrets', label: null, sort_order: 6,
      region: 'Loire', appellation: null, color: null, vintage: null,
      grape_varieties: JSON.stringify([]),
      serving_temp: null,
      food_pairing: JSON.stringify([]),
      tasting_notes: null,
      winemaker_notes: 'Coffret comprenant 1 Oriolus Blanc, 1 Carillon rouge et 1 Crémant de Loire.',
      awards: JSON.stringify([]),
    },
    {
      id: IDS.coteaux, name: 'Coteaux du Layon', description: 'Grand moelleux du Layon aux arômes de fruits exotiques et miel d\'acacia. Idéal avec foie gras ou desserts.', price_ht: 9.17, price_ttc: 11.00, purchase_price: 5.30, tva_rate: 20,
      category: 'Blancs Moelleux', label: 'HVE', sort_order: 7,
      region: 'Loire', appellation: 'Coteaux du Layon', color: 'blanc', vintage: 2022,
      grape_varieties: JSON.stringify(['Chenin Blanc']),
      serving_temp: '8-10°C',
      food_pairing: JSON.stringify(['Foie gras', 'Tarte Tatin', 'Roquefort']),
      tasting_notes: JSON.stringify({ fruite: 5, douceur: 5, rondeur: 5, acidite: 3, boise: 1, longueur: 5, puissance: 3 }),
      winemaker_notes: 'Grand moelleux du Layon. Arômes de fruits exotiques, abricot confit et miel d\'acacia.',
      awards: JSON.stringify([{ year: 2023, name: 'Médaille Or Vins de Loire' }, { year: 2024, name: 'Guide Hachette ★★' }]),
    },
    {
      id: IDS.jus_pomme, name: 'Jus de Pomme', description: 'Pur jus de pommes Bio du Maine-et-Loire. Sans sucre ajouté, naturellement doux et rafraîchissant.', price_ht: 3.32, price_ttc: 3.50, purchase_price: 1.80, tva_rate: 5.5,
      category: 'Sans Alcool', label: 'Bio', sort_order: 8,
      region: 'Loire', appellation: null, color: 'sans_alcool', vintage: null,
      grape_varieties: JSON.stringify([]),
      serving_temp: '6-8°C',
      food_pairing: JSON.stringify(['Crêpes', 'Goûter', 'Desserts']),
      tasting_notes: JSON.stringify({ fruite: 4, acidite: 3, douceur: 4, longueur: 2 }),
      winemaker_notes: 'Pur jus de pommes Bio, variétés locales du Maine-et-Loire. Sans sucre ajouté.',
      awards: JSON.stringify([]),
    },
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
  for (const campId of [IDS.camp_cse_leroy, IDS.camp_ambassadeurs, IDS.camp_espl, IDS.camp_bts_espl]) {
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

  // Participation BTS student
  await knex('participations').insert({
    user_id: IDS.bts_student1,
    campaign_id: IDS.camp_bts_espl,
    organization_id: IDS.espl_angers,
    role_in_campaign: 'student',
    class_group: 'NDRC1',
  });

  // Admin/commercial participent à toutes les campagnes
  for (const campId of [IDS.camp_sacre_coeur, IDS.camp_cse_leroy, IDS.camp_ambassadeurs, IDS.camp_espl, IDS.camp_bts_espl]) {
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
  // COMMANDES AMBASSADEUR (pour test paliers — CA total ~1800€ → Bronze+Argent)
  // ═══════════════════════════════════════════════════════
  const ambassadorOrders = [
    { ca: 650, items: 50 },
    { ca: 580, items: 45 },
    { ca: 570, items: 42 },
  ];
  for (let i = 0; i < ambassadorOrders.length; i++) {
    const ao = ambassadorOrders[i];
    const aoRef = `VC-2026-${String(orderCounter++).padStart(4, '0')}`;
    const aoId = uuidv4();
    const aoDate = new Date(2025, 10 + i, 10);

    await knex('orders').insert({
      id: aoId,
      ref: aoRef,
      campaign_id: IDS.camp_ambassadeurs,
      user_id: IDS.ambassadeur1,
      status: 'delivered',
      total_ttc: ao.ca,
      total_ht: parseFloat((ao.ca / 1.20).toFixed(2)),
      total_items: ao.items,
      created_at: aoDate,
      updated_at: aoDate,
    });

    await knex('financial_events').insert({
      order_id: aoId,
      campaign_id: IDS.camp_ambassadeurs,
      type: 'sale',
      amount: ao.ca,
      description: `Vente ${aoRef} - Ambassadeur Martin`,
      created_at: aoDate,
    });
  }

  // ═══════════════════════════════════════════════════════
  // FORMATION MODULES BTS NDRC (6 modules prédéfinis)
  // ═══════════════════════════════════════════════════════
  await knex('formation_modules').insert([
    { id: IDS.fm1, title: 'Techniques de vente directe', description: 'Fondamentaux de la vente en face-à-face : argumentaire, objections, closing.', type: 'video', url: 'https://example.com/formation/vente-directe', duration_minutes: 45, sort_order: 1 },
    { id: IDS.fm2, title: 'Négociation commerciale', description: 'Stratégies de négociation, concessions mutuelles, gestion des prix.', type: 'video', url: 'https://example.com/formation/negociation', duration_minutes: 60, sort_order: 2 },
    { id: IDS.fm3, title: 'Quiz — Connaissance produit vin', description: 'Évaluation des connaissances sur les cépages, appellations et accords mets-vins.', type: 'quiz', url: null, duration_minutes: 20, sort_order: 3 },
    { id: IDS.fm4, title: 'Relation client et CRM', description: 'Suivi client, outils CRM, fidélisation et relance.', type: 'document', url: 'https://example.com/formation/crm', duration_minutes: 30, sort_order: 4 },
    { id: IDS.fm5, title: 'Prospection terrain', description: 'Organisation de tournées, ciblage, prise de rendez-vous, pitch.', type: 'exercise', url: null, duration_minutes: 40, sort_order: 5 },
    { id: IDS.fm6, title: 'Bilan et soutenance', description: 'Préparation du dossier de soutenance BTS NDRC avec résultats de campagne.', type: 'document', url: 'https://example.com/formation/soutenance', duration_minutes: 90, sort_order: 6 },
  ]);

  // BTS student orders (2 orders for test data)
  for (let i = 0; i < 2; i++) {
    const btsRef = `VC-2026-${String(orderCounter++).padStart(4, '0')}`;
    const btsOrdId = uuidv4();
    const btsDate = new Date(2025, 10 + i, 20);

    await knex('orders').insert({
      id: btsOrdId,
      ref: btsRef,
      campaign_id: IDS.camp_bts_espl,
      user_id: IDS.bts_student1,
      status: 'delivered',
      total_ttc: 195,
      total_ht: 162.50,
      total_items: 15,
      created_at: btsDate,
      updated_at: btsDate,
    });

    await knex('financial_events').insert({
      order_id: btsOrdId,
      campaign_id: IDS.camp_bts_espl,
      type: 'sale',
      amount: 195,
      description: `Vente ${btsRef} - BTS Dupont`,
      created_at: btsDate,
    });
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

  // ═══════════════════════════════════════════════════════
  // FOURNISSEURS (CDC §7.4)
  // ═══════════════════════════════════════════════════════
  await knex.raw("CREATE TABLE IF NOT EXISTS suppliers (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name VARCHAR(255) NOT NULL, contact_name VARCHAR(255), email VARCHAR(255), phone VARCHAR(255), address TEXT, products JSONB DEFAULT '[]', notes TEXT, active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())");
  await knex('suppliers').del();
  await knex('suppliers').insert([
    {
      id: IDS.supplier_fruitiere,
      name: 'Domaine de la Fruitière',
      contact_name: 'Pierre Duval',
      email: 'contact@fruitiere.fr',
      phone: '02 41 78 90 12',
      address: 'Château de la Fruitière, 49380 Champ-sur-Layon',
      products: JSON.stringify([IDS.oriolus, IDS.clemence, IDS.coteaux]),
      notes: 'Fournisseur principal — vins blancs Loire',
      active: true,
    },
    {
      id: IDS.supplier_carillon,
      name: 'Château Carillon',
      contact_name: 'Marie Carillon',
      email: 'contact@chateau-carillon.fr',
      phone: '02 41 56 34 78',
      address: '12 Route des Vignes, 49290 Chalonnes-sur-Loire',
      products: JSON.stringify([IDS.carillon, IDS.apertus]),
      notes: 'Vins rouges premium — Cru Bourgeois et HVE',
      active: true,
    },
    {
      id: IDS.supplier_vouvray,
      name: 'Cave de Vouvray',
      contact_name: 'François Blanc',
      email: 'caves@vouvray-vins.fr',
      phone: '02 47 52 68 90',
      address: '8 Rue de la Cave, 37210 Vouvray',
      products: JSON.stringify([IDS.cremant]),
      notes: 'Crémant de Loire — effervescents',
      active: true,
    },
  ]);
  console.log('✅ Seed complet Vins & Conversations — Données CDC v4');
};
