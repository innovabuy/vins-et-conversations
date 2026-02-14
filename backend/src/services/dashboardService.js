const db = require('../config/database');
const rulesEngine = require('./rulesEngine');

/**
 * Dashboard Étudiant (CDC §4.2)
 */
async function getStudentDashboard(userId, campaignId) {
  const participation = await db('participations')
    .where({ user_id: userId, campaign_id: campaignId })
    .first();

  if (!participation) throw new Error('NOT_PARTICIPANT');

  // CA personnel
  const caResult = await db('orders')
    .where({ user_id: userId, campaign_id: campaignId })
    .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
    .sum('total_ttc as total')
    .count('id as count')
    .first();

  const ca = parseFloat(caResult?.total || 0);
  const orderCount = parseInt(caResult?.count || 0, 10);

  // CA from referred orders (student referral)
  const referredCaResult = await db('orders')
    .where({ referred_by: userId })
    .where('source', 'student_referral')
    .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
    .sum('total_ttc as total')
    .sum('total_items as bottles')
    .count('id as count')
    .first();
  const caReferred = parseFloat(referredCaResult?.total || 0);
  const bottlesReferred = parseInt(referredCaResult?.bottles || 0, 10);
  const caTotal = parseFloat((ca + caReferred).toFixed(2));

  // Bouteilles vendues
  const bottlesResult = await db('orders')
    .where({ user_id: userId, campaign_id: campaignId })
    .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
    .sum('total_items as total')
    .first();
  const bottlesSold = parseInt(bottlesResult?.total || 0, 10) + bottlesReferred;

  // Classement (UNION ALL: direct orders + referred orders)
  const validStatusList = "('submitted','validated','preparing','shipped','delivered')";
  const ranking = await db.raw(`
    SELECT user_id, SUM(total_ttc) as ca FROM (
      SELECT user_id, total_ttc FROM orders
        WHERE campaign_id = ? AND status IN ${validStatusList} AND user_id IS NOT NULL
      UNION ALL
      SELECT referred_by as user_id, total_ttc FROM orders
        WHERE referred_by IS NOT NULL AND source = 'student_referral' AND status IN ${validStatusList}
    ) combined GROUP BY user_id ORDER BY ca DESC
  `, [campaignId]);
  const rankingRows = ranking.rows || ranking;

  const position = rankingRows.findIndex((r) => r.user_id === userId) + 1;
  const totalParticipants = rankingRows.length;

  // Règles bouteilles gratuites + cagnottes (V4.1)
  const rules = await rulesEngine.loadRulesForCampaign(campaignId);
  const freeBottles = await rulesEngine.calculateFreeBottles(userId, campaignId, rules.freeBottle);
  const funds = await rulesEngine.calculateFunds(campaignId, userId, rules.commission);

  // Streak (simplifié — calculé depuis les dates de commandes)
  const recentOrders = await db('orders')
    .where({ user_id: userId, campaign_id: campaignId })
    .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
    .orderBy('created_at', 'desc')
    .select('created_at')
    .limit(30);

  const streak = calculateStreak(recentOrders.map((o) => o.created_at));

  // Badges from participation config (CDC §4.2)
  const config = participation.config || {};
  const badges = config.badges || [];

  // --- Campaign collective stats ---
  const campaign = await db('campaigns').where({ id: campaignId }).first();
  const campaignGoal = parseFloat(campaign?.goal || 0);
  const totalCaResult = await db('orders')
    .where({ campaign_id: campaignId })
    .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
    .sum('total_ttc as total')
    .sum('total_items as bottles')
    .first();
  const totalCa = parseFloat(totalCaResult?.total || 0);
  const totalBottles = parseInt(totalCaResult?.bottles || 0, 10);
  const progressPct = campaignGoal > 0 ? Math.round((totalCa / campaignGoal) * 100) : 0;

  // Days remaining
  const campaignEnd = campaign?.end_date ? new Date(campaign.end_date) : null;
  const now = new Date();
  const daysRemaining = campaignEnd ? Math.max(0, Math.ceil((campaignEnd - now) / (1000 * 60 * 60 * 24))) : null;
  const dailyTarget = (daysRemaining && daysRemaining > 0 && campaignGoal > totalCa)
    ? parseFloat(((campaignGoal - totalCa) / daysRemaining).toFixed(2)) : 0;

  // Active participants (at least 1 order)
  const activeParticipantsResult = await db('orders')
    .where({ campaign_id: campaignId })
    .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
    .countDistinct('user_id as count')
    .first();
  const activeParticipants = parseInt(activeParticipantsResult?.count || 0, 10);

  // Average CA per student
  const avgCaPerStudent = totalParticipants > 0 ? parseFloat((totalCa / totalParticipants).toFixed(2)) : 0;

  // Record today (highest single order today)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const recordTodayResult = await db('orders')
    .where({ campaign_id: campaignId })
    .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
    .where('created_at', '>=', todayStart)
    .max('total_ttc as max')
    .first();
  const recordToday = parseFloat(recordTodayResult?.max || 0);

  // Relative: vs average
  const vsAveragePct = avgCaPerStudent > 0 ? Math.round(((ca - avgCaPerStudent) / avgCaPerStudent) * 100) : 0;
  const vsAverageText = vsAveragePct > 0 ? 'above' : vsAveragePct < 0 ? 'below' : 'equal';
  const gapToAverage = parseFloat((ca - avgCaPerStudent).toFixed(2));

  // Leaderboard preview: top 3 + self if not in top 3
  const leaderboardPreview = rankingRows.slice(0, 3).map((r, i) => ({
    rank: i + 1,
    userId: r.user_id,
    name: null, // populated below
    ca: parseFloat(r.ca),
    isMe: r.user_id === userId,
  }));
  // Get names
  const previewUserIds = leaderboardPreview.map((r) => r.userId);
  if (position > 3) previewUserIds.push(userId);
  const userNames = await db('users').whereIn('id', previewUserIds).select('id', 'name');
  const nameMap = {};
  userNames.forEach((u) => { nameMap[u.id] = u.name; });
  leaderboardPreview.forEach((r) => { r.name = nameMap[r.userId]; });
  if (position > 3) {
    leaderboardPreview.push({
      rank: position,
      userId,
      name: nameMap[userId],
      ca,
      isMe: true,
    });
  }

  // Class ranking
  const campConfig = typeof campaign?.config === 'string' ? JSON.parse(campaign.config) : (campaign?.config || {});
  const classGroups = campConfig.classes || [];
  let classRanking = { enabled: classGroups.length > 0, myClass: participation.class_group, classes: [] };
  if (classGroups.length > 0) {
    const allParticipants = await db('participations')
      .join('users', 'participations.user_id', 'users.id')
      .where({ campaign_id: campaignId, role_in_campaign: 'student' })
      .select('users.id', 'participations.class_group');

    for (const cg of classGroups) {
      const studentIds = allParticipants.filter((s) => s.class_group === cg).map((s) => s.id);
      if (!studentIds.length) {
        classRanking.classes.push({ name: cg, ca: 0, students: 0 });
        continue;
      }
      const cgResult = await db('orders')
        .where({ campaign_id: campaignId })
        .whereIn('user_id', studentIds)
        .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
        .sum('total_ttc as ca')
        .first();
      classRanking.classes.push({ name: cg, ca: parseFloat(cgResult?.ca || 0), students: studentIds.length });
    }
    classRanking.classes.sort((a, b) => b.ca - a.ca);
  }

  // Recent orders (5 latest: direct + referred, with customer_name, payment_method)
  const recentOrdersData = await db('orders')
    .leftJoin('contacts', 'orders.customer_id', 'contacts.id')
    .where(function () {
      this.where({ 'orders.user_id': userId, 'orders.campaign_id': campaignId })
        .orWhere({ 'orders.referred_by': userId, 'orders.source': 'student_referral' });
    })
    .whereIn('orders.status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
    .orderBy('orders.created_at', 'desc')
    .limit(5)
    .select('orders.id', 'orders.ref', 'orders.total_ttc', 'orders.total_items', 'orders.created_at', 'orders.payment_method', 'contacts.name as customer_name', 'orders.referred_by', 'orders.source');

  return {
    ca,
    ca_referred: caReferred,
    ca_total: caTotal,
    orderCount,
    bottlesSold,
    position,
    totalParticipants,
    classGroup: participation.class_group,
    freeBottles,
    fund_collective: funds.fund_collective,
    fund_individual: funds.fund_individual,
    streak,
    badges,
    ui: rules.ui,
    campaign: {
      name: campaign?.name,
      goal: campaignGoal,
      total_ca: totalCa,
      progress_pct: progressPct,
      days_remaining: daysRemaining,
      daily_target: dailyTarget,
      total_bottles: totalBottles,
      active_participants: activeParticipants,
      total_participants: totalParticipants,
      avg_ca_per_student: avgCaPerStudent,
      record_today: recordToday,
    },
    relative: {
      vs_average_pct: vsAveragePct,
      vs_average_text: vsAverageText,
      gap_to_average: gapToAverage,
    },
    leaderboard_preview: leaderboardPreview,
    class_ranking: classRanking,
    recent_orders: recentOrdersData.map((o) => ({
      id: o.id,
      ref: o.ref,
      total_ttc: parseFloat(o.total_ttc),
      total_items: parseInt(o.total_items, 10),
      created_at: o.created_at,
      payment_method: o.payment_method,
      customer_name: o.customer_name,
      is_referred: o.referred_by === userId && o.source === 'student_referral',
    })),
  };
}

/**
 * Classement détaillé étudiant (CDC §4.2 — Ranking)
 */
async function getStudentRanking(userId, campaignId) {
  const participation = await db('participations')
    .where({ user_id: userId, campaign_id: campaignId })
    .first();
  if (!participation) throw new Error('NOT_PARTICIPANT');

  const validStatusList = "('submitted','validated','preparing','shipped','delivered')";
  const rankingResult = await db.raw(`
    SELECT combined.user_id, u.name, p.class_group,
           SUM(combined.total_ttc) as ca,
           SUM(combined.total_items) as bottles,
           COUNT(combined.id) as orders_count
    FROM (
      SELECT id, user_id, total_ttc, total_items FROM orders
        WHERE campaign_id = ? AND status IN ${validStatusList} AND user_id IS NOT NULL
      UNION ALL
      SELECT id, referred_by as user_id, total_ttc, total_items FROM orders
        WHERE referred_by IS NOT NULL AND source = 'student_referral' AND status IN ${validStatusList}
    ) combined
    JOIN users u ON combined.user_id = u.id
    JOIN participations p ON p.user_id = combined.user_id AND p.campaign_id = ?
    WHERE u.role = 'etudiant'
    GROUP BY combined.user_id, u.name, p.class_group
    ORDER BY ca DESC
  `, [campaignId, campaignId]);
  const rankingData = rankingResult.rows || rankingResult;

  const myPosition = rankingData.findIndex((r) => r.user_id === userId) + 1;

  return {
    myPosition,
    totalParticipants: rankingData.length,
    ranking: rankingData.map((r, i) => ({
      rank: i + 1,
      name: r.name,
      classGroup: r.class_group,
      ca: parseFloat(r.ca),
      bottles: parseInt(r.bottles, 10),
      ordersCount: parseInt(r.orders_count, 10),
      isMe: r.user_id === userId,
    })),
  };
}

/**
 * Dashboard Admin Cockpit (CDC §4.1 Module 1)
 */
async function getAdminCockpit(campaignIds) {
  const campaignFilter = campaignIds?.length
    ? (q) => q.whereIn('campaign_id', campaignIds)
    : (q) => q;

  // KPIs principaux
  const ordersStats = await campaignFilter(db('orders')
    .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered']))
    .sum('total_ttc as ca_ttc')
    .sum('total_ht as ca_ht')
    .count('id as total_orders')
    .first();

  const caTTC = parseFloat(ordersStats?.ca_ttc || 0);
  const caHT = parseFloat(ordersStats?.ca_ht || 0);
  const totalOrders = parseInt(ordersStats?.total_orders || 0, 10);

  // Marge globale
  const marginResult = await db.raw(`
    SELECT COALESCE(SUM(oi.qty * (oi.unit_price_ht - p.purchase_price)), 0) as marge
    FROM order_items oi
    JOIN products p ON oi.product_id = p.id
    JOIN orders o ON oi.order_id = o.id
    WHERE o.status IN ('validated', 'preparing', 'shipped', 'delivered')
    ${campaignIds?.length ? `AND o.campaign_id IN (${campaignIds.map(() => '?').join(',')})` : ''}
  `, campaignIds?.length ? campaignIds : []);
  const marge = parseFloat(marginResult.rows?.[0]?.marge || 0);

  // Cartes d'action
  const pendingOrders = await campaignFilter(db('orders').where({ status: 'submitted' })).count('id as c').first();
  const unreconciledPayments = await db('payments').where({ status: 'pending' }).sum('amount as total').first();
  const readyBL = await db('delivery_notes').where({ status: 'ready' }).count('id as c').first();
  const unpaidOrders = await db('payments').where({ status: 'unpaid' }).count('id as c').first();
  const lowStock = await db.raw(`
    SELECT COUNT(DISTINCT product_id) as count
    FROM (
      SELECT product_id, SUM(CASE WHEN type IN ('initial','entry','return') THEN qty ELSE -qty END) as stock
      FROM stock_movements GROUP BY product_id
    ) s WHERE s.stock < 10
  `);
  const cashToReconcile = await db('payments')
    .where({ method: 'cash', status: 'pending' })
    .sum('amount as total').first();

  // Classement étudiants (top 8)
  const topStudents = await db('orders')
    .join('users', 'orders.user_id', 'users.id')
    .join('participations', function () {
      this.on('participations.user_id', 'orders.user_id')
        .andOn('participations.campaign_id', 'orders.campaign_id');
    })
    .where('users.role', 'etudiant')
    .whereIn('orders.status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
    .groupBy('orders.user_id', 'users.name', 'participations.class_group')
    .select(
      'orders.user_id',
      'users.name',
      'participations.class_group',
      db.raw('SUM(orders.total_ttc) as ca'),
      db.raw('COUNT(orders.id) as orders_count')
    )
    .orderBy('ca', 'desc')
    .limit(8);

  // Top 3 produits
  const topProducts = await db('order_items')
    .join('products', 'order_items.product_id', 'products.id')
    .join('orders', 'order_items.order_id', 'orders.id')
    .whereIn('orders.status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
    .groupBy('products.id', 'products.name')
    .select(
      'products.id',
      'products.name',
      db.raw('SUM(order_items.qty) as total_qty'),
      db.raw('SUM(order_items.qty * order_items.unit_price_ttc) as total_revenue')
    )
    .orderBy('total_qty', 'desc')
    .limit(3);

  // CA par campagne
  const caByCampaign = await db('orders')
    .join('campaigns', 'orders.campaign_id', 'campaigns.id')
    .whereIn('orders.status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
    .groupBy('campaigns.id', 'campaigns.name', 'campaigns.goal')
    .select(
      'campaigns.id',
      'campaigns.name',
      'campaigns.goal',
      db.raw('SUM(orders.total_ttc) as ca')
    );

  // Boutique Web KPI
  const boutiqueStats = await db('orders')
    .whereIn('source', ['boutique_web', 'ambassador_referral', 'student_referral'])
    .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
    .sum('total_ttc as ca_ttc')
    .count('id as count')
    .first();
  const boutiqueCaTTC = parseFloat(boutiqueStats?.ca_ttc || 0);
  const boutiqueOrders = parseInt(boutiqueStats?.count || 0, 10);

  return {
    kpis: { caTTC, caHT, marge, totalOrders, boutiqueCaTTC, boutiqueOrders },
    actions: {
      pendingOrders: parseInt(pendingOrders?.c || 0, 10),
      unreconciledPayments: parseFloat(unreconciledPayments?.total || 0),
      readyBL: parseInt(readyBL?.c || 0, 10),
      unpaidOrders: parseInt(unpaidOrders?.c || 0, 10),
      lowStock: parseInt(lowStock.rows?.[0]?.count || 0, 10),
      cashToReconcile: parseFloat(cashToReconcile?.total || 0),
    },
    topStudents: topStudents.map((s, i) => ({
      rank: i + 1,
      ...s,
      ca: parseFloat(s.ca),
    })),
    topProducts: topProducts.map((p) => ({
      ...p,
      total_qty: parseInt(p.total_qty, 10),
      total_revenue: parseFloat(p.total_revenue),
    })),
    caByCampaign: caByCampaign.map((c) => ({
      ...c,
      ca: parseFloat(c.ca),
      goal: parseFloat(c.goal),
      progress: parseFloat(c.goal) > 0
        ? Math.round((parseFloat(c.ca) / parseFloat(c.goal)) * 100) : 0,
    })),
  };
}

/**
 * Dashboard Enseignant (CDC §4.6 — SANS montants €)
 */
async function getTeacherDashboard(userId, campaignId) {
  const campaign = await db('campaigns').where({ id: campaignId }).first();
  if (!campaign) throw new Error('CAMPAIGN_NOT_FOUND');

  const config = typeof campaign.config === 'string' ? JSON.parse(campaign.config) : (campaign.config || {});

  // Progression classe (objectif global en %)
  const caResult = await db('orders')
    .where({ campaign_id: campaignId })
    .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
    .sum('total_ttc as ca')
    .first();
  const ca = parseFloat(caResult?.ca || 0);
  const progress = campaign.goal > 0 ? Math.round((ca / campaign.goal) * 100) : 0;

  // Classement élèves — SANS CA, uniquement nombre de ventes
  const students = await db('orders')
    .join('users', 'orders.user_id', 'users.id')
    .join('participations', function () {
      this.on('participations.user_id', 'orders.user_id')
        .andOn('participations.campaign_id', 'orders.campaign_id');
    })
    .where('orders.campaign_id', campaignId)
    .where('users.role', 'etudiant')
    .whereIn('orders.status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
    .groupBy('orders.user_id', 'users.name', 'participations.class_group')
    .select(
      'users.name',
      'participations.class_group',
      db.raw('COUNT(orders.id) as sales_count'),
      db.raw('SUM(orders.total_items) as bottles_sold')
    )
    .orderBy('bottles_sold', 'desc');

  // AUCUN montant en euros n'est retourné ici
  // CDC §4.6 : "l'enseignant ne doit JAMAIS voir les montants en euros"

  // Alertes inactivité
  const allStudents = await db('participations')
    .join('users', 'participations.user_id', 'users.id')
    .where({ campaign_id: campaignId, role_in_campaign: 'student' })
    .select('users.id', 'users.name');

  const lastOrders = await db('orders')
    .where({ campaign_id: campaignId })
    .whereIn('user_id', allStudents.map((s) => s.id))
    .groupBy('user_id')
    .select('user_id', db.raw('MAX(created_at) as last_order'));

  const lastOrderMap = {};
  lastOrders.forEach((o) => { lastOrderMap[o.user_id] = o.last_order; });

  // Load inactivity threshold from campaign config (CDC §2.2 — zero hardcoded)
  const inactivityThreshold = config.inactivity_threshold ?? 7;

  const now = new Date();
  const inactiveStudents = allStudents.filter((s) => {
    const lastDate = lastOrderMap[s.id];
    if (!lastDate) return true;
    const daysSince = Math.floor((now - new Date(lastDate)) / (1000 * 60 * 60 * 24));
    return daysSince > inactivityThreshold;
  });

  // Class groups from config
  const classGroups = config.classes || [];

  // Per-class aggregation (bottles only — NO euros)
  const allStudentsWithGroup = await db('participations')
    .join('users', 'participations.user_id', 'users.id')
    .where({ campaign_id: campaignId, role_in_campaign: 'student' })
    .select('users.id', 'users.name', 'participations.class_group');

  const classTotals = {};
  for (const cg of classGroups) {
    const studentIds = allStudentsWithGroup.filter((s) => s.class_group === cg).map((s) => s.id);
    if (studentIds.length === 0) {
      classTotals[cg] = { bottles: 0, salesCount: 0, studentCount: studentIds.length };
      continue;
    }
    const result = await db('orders')
      .where({ campaign_id: campaignId })
      .whereIn('user_id', studentIds)
      .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
      .sum('total_items as bottles')
      .count('id as sales_count')
      .first();
    classTotals[cg] = {
      bottles: parseInt(result?.bottles || 0, 10),
      salesCount: parseInt(result?.sales_count || 0, 10),
      studentCount: studentIds.length,
    };
  }

  return {
    progress,
    totalStudents: allStudents.length,
    classGroups,
    classTotals,
    students: students.map((s, i) => ({
      rank: i + 1,
      name: s.name,
      classGroup: s.class_group,
      salesCount: parseInt(s.sales_count, 10),
      bottlesSold: parseInt(s.bottles_sold, 10),
      // PAS de champ ca, amount, total, etc.
    })),
    inactiveStudents: inactiveStudents.map((s) => s.name),
    inactivityThreshold,
  };
}

// ─── Helpers ──────────────────────────────────────────

function calculateStreak(dates) {
  if (!dates.length) return 0;
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const uniqueDays = [...new Set(dates.map((d) => {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }))].sort((a, b) => b - a);

  const todayTime = today.getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  // Le streak commence si la dernière vente est aujourd'hui ou hier
  if (uniqueDays[0] < todayTime - dayMs) return 0;

  for (let i = 0; i < uniqueDays.length; i++) {
    const expectedDay = todayTime - (i * dayMs);
    if (uniqueDays[i] === expectedDay || uniqueDays[i] === expectedDay - dayMs) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Leaderboard filtré étudiant (CDC §4.2 — Classement enrichi)
 * @param {string} userId
 * @param {string} campaignId
 * @param {Object} filters - { period: 'week'|'month'|'all', classFilter: string|'all' }
 */
async function getStudentLeaderboard(userId, campaignId, { period = 'all', classFilter = 'all' } = {}) {
  const participation = await db('participations')
    .where({ user_id: userId, campaign_id: campaignId })
    .first();
  if (!participation) throw new Error('NOT_PARTICIPANT');

  const validStatusList = "('submitted','validated','preparing','shipped','delivered')";

  // Build period filter SQL
  let periodFilter = '';
  const params = [campaignId];
  if (period === 'week') {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    periodFilter = ' AND created_at >= ?';
    params.push(weekAgo);
  } else if (period === 'month') {
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    periodFilter = ' AND created_at >= ?';
    params.push(monthAgo);
  }

  // Duplicate params for UNION ALL second part
  const referralParams = period !== 'all' ? [params[params.length - 1]] : [];

  // Build class filter SQL
  let classJoinFilter = '';
  const classParams = [];
  if (classFilter && classFilter !== 'all') {
    classJoinFilter = ' AND p.class_group = ?';
    classParams.push(classFilter);
  }

  const allParams = [...params, ...referralParams, campaignId, ...classParams];

  const rankingResult = await db.raw(`
    SELECT combined.user_id, u.name, p.class_group,
           SUM(combined.total_ttc) as ca,
           SUM(combined.total_items) as bottles,
           COUNT(combined.id) as orders_count
    FROM (
      SELECT id, user_id, total_ttc, total_items, created_at FROM orders
        WHERE campaign_id = ? AND status IN ${validStatusList} AND user_id IS NOT NULL${periodFilter}
      UNION ALL
      SELECT id, referred_by as user_id, total_ttc, total_items, created_at FROM orders
        WHERE referred_by IS NOT NULL AND source = 'student_referral' AND status IN ${validStatusList}${periodFilter ? ' AND created_at >= ?' : ''}
    ) combined
    JOIN users u ON combined.user_id = u.id
    JOIN participations p ON p.user_id = combined.user_id AND p.campaign_id = ?
    WHERE u.role = 'etudiant'${classJoinFilter}
    GROUP BY combined.user_id, u.name, p.class_group
    ORDER BY ca DESC
  `, allParams);
  const lbRanking = rankingResult.rows || rankingResult;

  const myPosition = lbRanking.findIndex((r) => r.user_id === userId) + 1;

  // Campaign header
  const campaign = await db('campaigns').where({ id: campaignId }).first();
  const totalCaResult = await db('orders')
    .where({ campaign_id: campaignId })
    .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
    .sum('total_ttc as total')
    .first();
  const totalCa = parseFloat(totalCaResult?.total || 0);
  const campaignGoal = parseFloat(campaign?.goal || 0);
  const campaignEnd = campaign?.end_date ? new Date(campaign.end_date) : null;
  const now = new Date();
  const daysRemaining = campaignEnd ? Math.max(0, Math.ceil((campaignEnd - now) / (1000 * 60 * 60 * 24))) : null;

  return {
    myPosition,
    totalParticipants: lbRanking.length,
    period,
    classFilter,
    campaignHeader: {
      name: campaign?.name,
      goal: campaignGoal,
      total_ca: totalCa,
      progress_pct: campaignGoal > 0 ? Math.round((totalCa / campaignGoal) * 100) : 0,
      days_remaining: daysRemaining,
    },
    ranking: lbRanking.map((r, i) => ({
      rank: i + 1,
      name: r.name,
      classGroup: r.class_group,
      ca: parseFloat(r.ca),
      bottles: parseInt(r.bottles, 10),
      ordersCount: parseInt(r.orders_count, 10),
      isMe: r.user_id === userId,
    })),
  };
}

module.exports = { getStudentDashboard, getStudentRanking, getStudentLeaderboard, getAdminCockpit, getTeacherDashboard };
