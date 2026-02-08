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

  // Bouteilles vendues
  const bottlesResult = await db('orders')
    .where({ user_id: userId, campaign_id: campaignId })
    .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
    .sum('total_items as total')
    .first();
  const bottlesSold = parseInt(bottlesResult?.total || 0, 10);

  // Classement
  const ranking = await db('orders')
    .select('user_id')
    .where({ campaign_id: campaignId })
    .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
    .groupBy('user_id')
    .sum('total_ttc as ca')
    .orderBy('ca', 'desc');

  const position = ranking.findIndex((r) => r.user_id === userId) + 1;
  const totalParticipants = ranking.length;

  // Règles bouteilles gratuites
  const rules = await rulesEngine.loadRulesForCampaign(campaignId);
  const freeBottles = await rulesEngine.calculateFreeBottles(userId, campaignId, rules.freeBottle);

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

  return {
    ca,
    orderCount,
    bottlesSold,
    position,
    totalParticipants,
    classGroup: participation.class_group,
    freeBottles,
    streak,
    badges,
    ui: rules.ui,
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

  const ranking = await db('orders')
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
      'orders.user_id',
      'users.name',
      'participations.class_group',
      db.raw('SUM(orders.total_ttc) as ca'),
      db.raw('SUM(orders.total_items) as bottles'),
      db.raw('COUNT(orders.id) as orders_count')
    )
    .orderBy('ca', 'desc');

  const myPosition = ranking.findIndex((r) => r.user_id === userId) + 1;

  return {
    myPosition,
    totalParticipants: ranking.length,
    ranking: ranking.map((r, i) => ({
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

  return {
    kpis: { caTTC, caHT, marge, totalOrders },
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

module.exports = { getStudentDashboard, getStudentRanking, getAdminCockpit, getTeacherDashboard };
