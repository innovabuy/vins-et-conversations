const db = require('../config/database');
const rulesEngine = require('./rulesEngine');
const { calculateFreeBottleCosts } = require('./marginFilters');

// All order statuses that count as "active" for CA/stats calculations
const ACTIVE_STATUSES = ['submitted', 'pending_payment', 'pending_stock', 'validated', 'preparing', 'shipped', 'delivered'];
const ACTIVE_STATUSES_SQL = "('submitted','pending_payment','pending_stock','validated','preparing','shipped','delivered')";

/**
 * Sous-requête SQL centralisée : commandes attribuées à un étudiant.
 * CA étudiant = commandes directes (user_id) + commandes referral (referred_by + student_referral).
 *
 * Retourne une sous-requête nommée "student_orders" avec colonnes :
 *   effective_user_id, id, total_ttc, total_ht, total_items, campaign_id, status, created_at
 *
 * @param {string|null} campaignId - filtrer par campagne (null = toutes)
 * @returns {{ sql: string, params: any[] }}
 */
function studentOrdersCombinedSQL(campaignId = null) {
  const campaignFilter = campaignId ? ' AND campaign_id = ?' : '';
  const params = campaignId ? [campaignId, campaignId] : [];
  // Modèle C (Mathéo 29/04) : branche directe exclut les cmds cross-étudiant
  // (user_id=A AND referred_by=B où B≠A) — l'acheteur n'est pas le porteur du CA.
  // Ces cmds sont comptées chez le parrain via la branche referral.
  // Auto-referral (user_id=A AND referred_by=A) reste comptée 1× via branche directe
  // (le guard `referred_by = user_id` accepte ce cas).
  const sql = `(
    SELECT user_id as effective_user_id, id, total_ttc, total_ht, total_items, campaign_id, status, created_at
    FROM orders
    WHERE status IN ${ACTIVE_STATUSES_SQL} AND user_id IS NOT NULL AND (referred_by IS NULL OR referred_by = user_id)${campaignFilter}
    UNION ALL
    SELECT referred_by as effective_user_id, id, total_ttc, total_ht, total_items, campaign_id, status, created_at
    FROM orders
    WHERE referred_by IS NOT NULL AND source = 'student_referral' AND (user_id IS NULL OR user_id != referred_by) AND status IN ${ACTIVE_STATUSES_SQL}${campaignFilter}
  )`;
  return { sql, params };
}

/**
 * Dashboard Étudiant (CDC §4.2)
 */
async function getStudentDashboard(userId, campaignId) {
  const participation = await db('participations')
    .where({ user_id: userId, campaign_id: campaignId })
    .first();

  if (!participation) throw new Error('NOT_PARTICIPANT');

  // Auto-generate referral code if missing
  if (!participation.referral_code) {
    const crypto = require('crypto');
    const code = 'REF-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    await db('participations').where({ id: participation.id }).update({ referral_code: code });
    participation.referral_code = code;
  }

  // Combined user stats: direct CA/bottles/count + referred CA/bottles (3 queries → 1)
  const validStatuses = ACTIVE_STATUSES;
  // Modèle C : branche directe (CASE WHEN direct) exclut cross-étudiant
  // via `(referred_by IS NULL OR referred_by = ?)` — auto-referral OK, cross-étudiant exclu.
  const userStats = await db('orders')
    .whereIn('status', validStatuses)
    .where(function () {
      this.where(function () {
        this.where({ user_id: userId, campaign_id: campaignId })
          .whereRaw('(referred_by IS NULL OR referred_by = ?)', [userId]);
      })
        .orWhere(function () {
          this.where({ referred_by: userId, source: 'student_referral', campaign_id: campaignId })
            .whereRaw('(user_id IS NULL OR user_id != referred_by)');
        });
    })
    .select(
      db.raw('SUM(CASE WHEN user_id = ? AND campaign_id = ? AND (referred_by IS NULL OR referred_by = ?) THEN total_ttc ELSE 0 END) as direct_ca', [userId, campaignId, userId]),
      db.raw('SUM(CASE WHEN user_id = ? AND campaign_id = ? AND (referred_by IS NULL OR referred_by = ?) THEN total_ht ELSE 0 END) as direct_ca_ht', [userId, campaignId, userId]),
      db.raw('COUNT(CASE WHEN user_id = ? AND campaign_id = ? AND (referred_by IS NULL OR referred_by = ?) THEN 1 END) as order_count', [userId, campaignId, userId]),
      db.raw('SUM(CASE WHEN user_id = ? AND campaign_id = ? AND (referred_by IS NULL OR referred_by = ?) THEN total_items ELSE 0 END) as direct_bottles', [userId, campaignId, userId]),
      db.raw('SUM(CASE WHEN referred_by = ? AND source = \'student_referral\' AND campaign_id = ? AND (user_id IS NULL OR user_id != referred_by) THEN total_ttc ELSE 0 END) as referred_ca', [userId, campaignId]),
      db.raw('SUM(CASE WHEN referred_by = ? AND source = \'student_referral\' AND campaign_id = ? AND (user_id IS NULL OR user_id != referred_by) THEN total_ht ELSE 0 END) as referred_ca_ht', [userId, campaignId]),
      db.raw('SUM(CASE WHEN referred_by = ? AND source = \'student_referral\' AND campaign_id = ? AND (user_id IS NULL OR user_id != referred_by) THEN total_items ELSE 0 END) as referred_bottles', [userId, campaignId]),
      db.raw('COUNT(CASE WHEN referred_by = ? AND source = \'student_referral\' AND campaign_id = ? AND (user_id IS NULL OR user_id != referred_by) THEN 1 END) as referred_orders_count', [userId, campaignId]),
      db.raw('COUNT(DISTINCT CASE WHEN referred_by = ? AND source = \'student_referral\' AND campaign_id = ? AND (user_id IS NULL OR user_id != referred_by) THEN user_id END) as referred_clients_count', [userId, campaignId]),
    )
    .first();

  const ca = parseFloat(userStats?.direct_ca || 0);
  const caHt = parseFloat(userStats?.direct_ca_ht || 0);
  const orderCount = parseInt(userStats?.order_count || 0, 10);
  const caReferred = parseFloat(userStats?.referred_ca || 0);
  const caReferredHt = parseFloat(userStats?.referred_ca_ht || 0);
  const bottlesReferred = parseInt(userStats?.referred_bottles || 0, 10);
  const referredOrdersCount = parseInt(userStats?.referred_orders_count || 0, 10);
  const referredClientsCount = parseInt(userStats?.referred_clients_count || 0, 10);
  const caTotal = parseFloat((ca + caReferred).toFixed(2));
  const caTotalHt = parseFloat((caHt + caReferredHt).toFixed(2));
  const bottlesSold = parseInt(userStats?.direct_bottles || 0, 10) + bottlesReferred;

  // Classement (UNION ALL: direct orders + referred orders)
  // Modèle C : branche directe exclut cross-étudiant (referred_by IS NULL OR = user_id)
  const ranking = await db.raw(`
    SELECT user_id, SUM(total_ttc) as ca FROM (
      SELECT user_id, total_ttc FROM orders
        WHERE campaign_id = ? AND status IN ${ACTIVE_STATUSES_SQL} AND user_id IS NOT NULL AND (referred_by IS NULL OR referred_by = user_id)
      UNION ALL
      SELECT referred_by as user_id, total_ttc FROM orders
        WHERE referred_by IS NOT NULL AND source = 'student_referral' AND (user_id IS NULL OR user_id != referred_by) AND status IN ${ACTIVE_STATUSES_SQL} AND campaign_id = ?
    ) combined GROUP BY user_id ORDER BY ca DESC
  `, [campaignId, campaignId]);
  const rankingRows = ranking.rows || ranking;

  const position = rankingRows.findIndex((r) => r.user_id === userId) + 1;
  const totalParticipants = rankingRows.length;

  // Règles bouteilles gratuites + parts des anges (V4.1)
  const rules = await rulesEngine.loadRulesForCampaign(campaignId);
  const freeBottles = await rulesEngine.calculateFreeBottles(userId, campaignId, rules.freeBottle, { includeReferredBy: true });
  const funds = await rulesEngine.calculateFunds(campaignId, userId, rules.commission);

  // Historique des gratuités déjà remises (financial_events type='free_bottle')
  // Historique des gratuités déjà remises (financial_events type='free_bottle')
  const freeBottlesHistory = await db('financial_events')
    .where({ campaign_id: campaignId, type: 'free_bottle' })
    .whereRaw("metadata->>'user_id' = ?", [userId])
    .orderBy('created_at', 'desc')
    .select('created_at', 'metadata');

  freeBottles.history = freeBottlesHistory.map((fe) => {
    const meta = typeof fe.metadata === 'string' ? JSON.parse(fe.metadata) : (fe.metadata || {});
    return {
      date: fe.created_at,
      product_name: meta.product_name || 'Produit inconnu',
      quantity: 1,
    };
  });

  // Streak (simplifié — calculé depuis les dates de commandes)
  const recentOrders = await db('orders')
    .where({ user_id: userId, campaign_id: campaignId })
    .whereIn('status', ACTIVE_STATUSES)
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
  // Combined campaign stats (3 queries → 1)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const campaignStats = await db('orders')
    .where({ campaign_id: campaignId })
    .whereIn('status', validStatuses)
    .select(
      db.raw('SUM(total_ttc) as total_ca'),
      db.raw('SUM(total_items) as total_bottles'),
      db.raw('COUNT(DISTINCT user_id) as active_participants'),
      db.raw('MAX(CASE WHEN created_at >= ? THEN total_ttc ELSE 0 END) as record_today', [todayStart]),
    )
    .first();
  const totalCa = parseFloat(campaignStats?.total_ca || 0);
  const totalBottles = parseInt(campaignStats?.total_bottles || 0, 10);
  const activeParticipants = parseInt(campaignStats?.active_participants || 0, 10);
  const recordToday = parseFloat(campaignStats?.record_today || 0);
  const progressPct = campaignGoal > 0 ? Math.round((totalCa / campaignGoal) * 100) : 0;

  // Days remaining
  const campaignEnd = campaign?.end_date ? new Date(campaign.end_date) : null;
  const now = new Date();
  const daysRemaining = campaignEnd ? Math.max(0, Math.ceil((campaignEnd - now) / (1000 * 60 * 60 * 24))) : null;
  const dailyTarget = (daysRemaining && daysRemaining > 0 && campaignGoal > totalCa)
    ? parseFloat(((campaignGoal - totalCa) / daysRemaining).toFixed(2)) : 0;

  // Average CA per student
  const avgCaPerStudent = totalParticipants > 0 ? parseFloat((totalCa / totalParticipants).toFixed(2)) : 0;

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
    // Single query for all class stats (replaces N+1 loop)
    const classStats = await db('orders')
      .join('participations', function () {
        this.on('orders.user_id', 'participations.user_id')
          .andOn('orders.campaign_id', 'participations.campaign_id');
      })
      .where('orders.campaign_id', campaignId)
      .whereIn('participations.role_in_campaign', ['student', 'participant'])
      .whereIn('orders.status', validStatuses)
      .groupBy('participations.class_group')
      .select(
        'participations.class_group',
        db.raw('SUM(orders.total_ttc) as ca'),
        db.raw('COUNT(DISTINCT orders.user_id) as students')
      );

    const classMap = {};
    classStats.forEach((cs) => { classMap[cs.class_group] = cs; });

    // Also count all participants per class (including those with 0 orders)
    const participantCounts = await db('participations')
      .join('users', 'participations.user_id', 'users.id')
      .where('participations.campaign_id', campaignId)
      .whereIn('participations.role_in_campaign', ['student', 'participant'])
      .where('users.role', 'etudiant')
      .groupBy('participations.class_group')
      .select('participations.class_group', db.raw('COUNT(*) as count'));
    const countMap = {};
    participantCounts.forEach((pc) => { countMap[pc.class_group] = parseInt(pc.count, 10); });

    for (const cg of classGroups) {
      const stat = classMap[cg];
      classRanking.classes.push({
        name: cg,
        ca: parseFloat(stat?.ca || 0),
        students: countMap[cg] || 0,
      });
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
    .whereIn('orders.status', ACTIVE_STATUSES)
    .orderBy('orders.created_at', 'desc')
    .limit(5)
    .select('orders.id', 'orders.ref', 'orders.total_ttc', 'orders.total_ht', 'orders.total_items', 'orders.created_at', 'orders.payment_method', 'contacts.name as customer_name', 'orders.referred_by', 'orders.source');

  return {
    ca,
    ca_ht: caHt,
    ca_referred: caReferred,
    ca_referred_ht: caReferredHt,
    ca_total: caTotal,
    ca_total_ht: caTotalHt,
    referral_stats: {
      orders_count: referredOrdersCount,
      ca_ttc: caReferred,
      clients_count: referredClientsCount,
    },
    orderCount,
    bottlesSold,
    position,
    totalParticipants,
    classGroup: participation.class_group,
    referral_code: participation.referral_code || null,
    freeBottles,
    fund_collective: funds.fund_collective,
    fund_individual: funds.fund_individual,
    streak,
    badges,
    ui: rules.ui,
    campaign: {
      name: campaign?.name,
      brand_name: campaign?.brand_name || null,
      goal: campaignGoal,
      alcohol_free: campaign?.alcohol_free || false,
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
    recent_orders: await Promise.all(recentOrdersData.map(async (o) => {
      // Fetch top product images for this order
      const orderProducts = await db('order_items')
        .join('products', 'order_items.product_id', 'products.id')
        .where('order_items.order_id', o.id)
        .where('order_items.type', 'product')
        .orderBy('order_items.qty', 'desc')
        .limit(3)
        .select('products.name', 'products.image_url');
      return {
        id: o.id,
        ref: o.ref,
        total_ttc: parseFloat(o.total_ttc),
        total_ht: parseFloat(o.total_ht),
        total_items: parseInt(o.total_items, 10),
        created_at: o.created_at,
        payment_method: o.payment_method,
        customer_name: o.customer_name,
        is_referred: o.referred_by === userId && o.source === 'student_referral',
        products: orderProducts.map(p => ({ name: p.name, image_url: p.image_url })),
      };
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

  const validStatusList = ACTIVE_STATUSES_SQL;
  const rankingResult = await db.raw(`
    SELECT combined.user_id, u.name, p.class_group,
           SUM(combined.total_ttc) as ca,
           SUM(combined.total_items) as bottles,
           COUNT(combined.id) as orders_count
    FROM (
      SELECT id, user_id, total_ttc, total_items FROM orders
        WHERE campaign_id = ? AND status IN ${validStatusList} AND user_id IS NOT NULL AND (referred_by IS NULL OR referred_by = user_id)
      UNION ALL
      SELECT id, referred_by as user_id, total_ttc, total_items FROM orders
        WHERE referred_by IS NOT NULL AND source = 'student_referral' AND (user_id IS NULL OR user_id != referred_by) AND status IN ${validStatusList} AND campaign_id = ?
    ) combined
    JOIN users u ON combined.user_id = u.id
    JOIN participations p ON p.user_id = combined.user_id AND p.campaign_id = ?
    WHERE u.role = 'etudiant'
    GROUP BY combined.user_id, u.name, p.class_group
    ORDER BY ca DESC
  `, [campaignId, campaignId, campaignId]);
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

  // KPIs principaux — CA calculé depuis order_items (aligné avec margins.js), hors frais de port
  const campaignClause = campaignIds?.length
    ? `AND o.campaign_id IN (${campaignIds.map(() => '?').join(',')})`
    : '';
  const cockpitParams = campaignIds?.length ? campaignIds : [];
  const cockpitKPIs = await db.raw(`
    SELECT
      COALESCE(SUM(oi.qty * oi.unit_price_ttc), 0) as ca_ttc,
      COALESCE(SUM(oi.qty * oi.unit_price_ht), 0) as ca_ht,
      COUNT(DISTINCT o.id) as total_orders
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.status IN ${ACTIVE_STATUSES_SQL}
      AND COALESCE(oi.type, 'product') != 'shipping'
      ${campaignClause}
  `, cockpitParams);
  const kpiRow = cockpitKPIs.rows?.[0] || cockpitKPIs[0] || {};
  const caTTC = parseFloat(kpiRow.ca_ttc || 0);
  const caHT = parseFloat(kpiRow.ca_ht || 0);
  const totalOrders = parseInt(kpiRow.total_orders || 0, 10);

  // Marge globale (brute - coût 12+1 = nette)
  const marginResult = await db.raw(`
    SELECT COALESCE(SUM(oi.qty * (oi.unit_price_ht - p.purchase_price)), 0) as marge
    FROM order_items oi
    JOIN products p ON oi.product_id = p.id
    JOIN orders o ON oi.order_id = o.id
    WHERE o.status IN ('validated', 'preparing', 'shipped', 'delivered')
    ${campaignIds?.length ? `AND o.campaign_id IN (${campaignIds.map(() => '?').join(',')})` : ''}
  `, campaignIds?.length ? campaignIds : []);
  const margeBrute = parseFloat(marginResult.rows?.[0]?.marge || 0);
  const fbcFilters = campaignIds?.length === 1 ? { campaign_id: campaignIds[0] } : {};
  const fbcData = await calculateFreeBottleCosts(fbcFilters);
  const marge = parseFloat((margeBrute - fbcData.total).toFixed(2));

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

  // Classement étudiants (top 8) — inclut CA referral via UNION ALL
  // Si campaignIds fournis, filtrer sur la première campagne — sinon toutes
  const cockpitCampaignFilter = campaignIds && campaignIds.length > 0 ? campaignIds[0] : null;
  const { sql: studentSQL, params: studentParams } = studentOrdersCombinedSQL(cockpitCampaignFilter);
  const topStudentsResult = await db.raw(`
    SELECT so.effective_user_id as user_id, u.name,
           (SELECT p.class_group FROM participations p WHERE p.user_id = so.effective_user_id LIMIT 1) as class_group,
           SUM(so.total_ttc) as ca, COUNT(so.id) as orders_count
    FROM ${studentSQL} so
    JOIN users u ON so.effective_user_id = u.id
    WHERE u.role = 'etudiant'
    GROUP BY so.effective_user_id, u.name
    ORDER BY ca DESC LIMIT 8
  `, studentParams);
  const topStudents = (topStudentsResult.rows || topStudentsResult);

  // Top 3 produits
  const topProducts = await db('order_items')
    .join('products', 'order_items.product_id', 'products.id')
    .join('orders', 'order_items.order_id', 'orders.id')
    .whereIn('orders.status', ACTIVE_STATUSES)
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
    .whereIn('orders.status', ACTIVE_STATUSES)
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
    .whereIn('status', ACTIVE_STATUSES)
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
    .whereIn('status', ACTIVE_STATUSES)
    .sum('total_ttc as ca')
    .first();
  const ca = parseFloat(caResult?.ca || 0);
  const progress = campaign.goal > 0 ? Math.round((ca / campaign.goal) * 100) : 0;

  // Classement élèves — Tri par CA TTC décroissant (cohérent avec affichage CA,
  // levée partielle CDC §4.5 actée le 31/03 commit e3737e1).
  // Tie-break sur bottles_sold DESC pour déterminisme en cas d'égalité de CA.
  // Inclut referral via studentOrdersCombinedSQL.
  const { sql: teacherStudentSQL, params: teacherStudentParams } = studentOrdersCombinedSQL(campaignId);
  const studentsResult = await db.raw(`
    SELECT u.name, p.class_group, so.effective_user_id,
           COUNT(so.id) as sales_count, SUM(so.total_items) as bottles_sold,
           COALESCE(SUM(so.total_ttc), 0) as ca_ttc
    FROM ${teacherStudentSQL} so
    JOIN users u ON so.effective_user_id = u.id
    JOIN participations p ON p.user_id = so.effective_user_id AND p.campaign_id = ?
    WHERE u.role = 'etudiant'
    GROUP BY so.effective_user_id, u.name, p.class_group
    ORDER BY ca_ttc DESC, bottles_sold DESC
  `, [...teacherStudentParams, campaignId]);
  const students = (studentsResult.rows || studentsResult);

  // ─── CA de l'action (levée partielle de la restriction euros) ───
  // L'enseignant voit le CA global et par étudiant, la ventilation TVA et la rémunération asso.
  const { sql: caStudentSQL, params: caStudentParams } = studentOrdersCombinedSQL(campaignId);

  // Per-student CA (includes referral)
  const studentCaResult = await db.raw(`
    SELECT so.effective_user_id,
           COALESCE(SUM(so.total_ttc), 0) as ca_ttc,
           COALESCE(SUM(so.total_ht), 0) as ca_ht,
           MAX(so.created_at) as last_order_date
    FROM ${caStudentSQL} so
    JOIN users u ON so.effective_user_id = u.id
    WHERE u.role = 'etudiant'
    GROUP BY so.effective_user_id
  `, caStudentParams);
  const studentCaMap = {};
  for (const r of (studentCaResult.rows || studentCaResult)) {
    studentCaMap[r.effective_user_id] = {
      ca_ttc: parseFloat(parseFloat(r.ca_ttc).toFixed(2)),
      ca_ht: parseFloat(parseFloat(r.ca_ht).toFixed(2)),
      last_order_date: r.last_order_date,
    };
  }

  // Global VAT breakdown from order_items.vat_rate
  // CA totals are derived from VAT breakdown lines to guarantee consistency
  const globalOrderIds = await db('orders')
    .where({ campaign_id: campaignId })
    .whereIn('status', ACTIVE_STATUSES)
    .select('id');
  const gIds = globalOrderIds.map((o) => o.id);
  const globalVatRows = gIds.length > 0
    ? await db('order_items')
        .whereIn('order_id', gIds)
        .whereIn('type', ['product', 'component'])
        .where(function () {
          this.where('type', 'component')
            .orWhere(function () {
              this.where('type', 'product').whereNotExists(
                db.select(db.raw('1')).from('order_items as child')
                  .whereRaw('child.parent_item_id = order_items.id').where('child.type', 'component')
              );
            });
        })
        .groupBy('vat_rate')
        .select('vat_rate as rate', db.raw('SUM(unit_price_ht * qty) as amount_ht'), db.raw('SUM(unit_price_ttc * qty) as amount_ttc'))
    : [];
  const globalVatBreakdown = globalVatRows.map((r) => ({
    rate: parseFloat(r.rate),
    amount_ht: parseFloat(parseFloat(r.amount_ht).toFixed(2)),
    amount_ttc: parseFloat(parseFloat(r.amount_ttc).toFixed(2)),
  }));

  // Derive CA totals from VAT breakdown to guarantee SUM(lines) === displayed total
  const campCaHT = parseFloat(globalVatBreakdown.reduce((s, v) => s + v.amount_ht, 0).toFixed(2));
  const campCaTTC = parseFloat(globalVatBreakdown.reduce((s, v) => s + v.amount_ttc, 0).toFixed(2));

  // Per-student VAT breakdown
  const studentVatResult = gIds.length > 0
    ? await db('order_items')
        .join('orders', 'order_items.order_id', 'orders.id')
        .whereIn('orders.id', gIds)
        .whereIn('order_items.type', ['product', 'component'])
        .where(function () {
          this.where('order_items.type', 'component')
            .orWhere(function () {
              this.where('order_items.type', 'product').whereNotExists(
                db.select(db.raw('1')).from('order_items as child')
                  .whereRaw('child.parent_item_id = order_items.id').where('child.type', 'component')
              );
            });
        })
        .whereNotNull('orders.user_id')
        .groupBy('orders.user_id', 'order_items.vat_rate')
        .select('orders.user_id', 'order_items.vat_rate as rate',
          db.raw('SUM(order_items.unit_price_ht * order_items.qty) as amount_ht'),
          db.raw('SUM(order_items.unit_price_ttc * order_items.qty) as amount_ttc'))
    : [];
  const studentVatMap = {};
  for (const r of studentVatResult) {
    if (!studentVatMap[r.user_id]) studentVatMap[r.user_id] = [];
    studentVatMap[r.user_id].push({
      rate: parseFloat(r.rate),
      amount_ht: parseFloat(parseFloat(r.amount_ht).toFixed(2)),
      amount_ttc: parseFloat(parseFloat(r.amount_ttc).toFixed(2)),
    });
  }

  // Association remuneration from client_types.commission_rules
  let commissionRate = 0;
  try {
    const ct = await db('campaigns')
      .join('client_types', 'campaigns.client_type_id', 'client_types.id')
      .where('campaigns.id', campaignId)
      .select('client_types.commission_rules')
      .first();
    const commRules = typeof ct?.commission_rules === 'string' ? JSON.parse(ct.commission_rules) : (ct?.commission_rules || {});
    commissionRate = commRules.fund_collective?.value || 0;
  } catch (_) { /* graceful */ }

  const associationRemuneration = {
    rate_percent: commissionRate,
    amount_ht: parseFloat((campCaHT * commissionRate / 100).toFixed(2)),
  };

  // Alertes inactivité
  const allStudents = await db('participations')
    .join('users', 'participations.user_id', 'users.id')
    .where({ campaign_id: campaignId })
    .whereIn('participations.role_in_campaign', ['student', 'participant'])
    .where('users.role', 'etudiant')
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
    .where({ campaign_id: campaignId })
    .whereIn('participations.role_in_campaign', ['student', 'participant'])
    .where('users.role', 'etudiant')
    .select('users.id', 'users.name', 'participations.class_group');

  // Per-class aggregation (includes referral orders via UNION ALL)
  const classStatsMap = {};
  if (allStudentsWithGroup.length > 0) {
    const { sql: classSQL, params: classParams } = studentOrdersCombinedSQL(campaignId);
    const classStatsResult = await db.raw(`
      SELECT so.effective_user_id, SUM(so.total_items) as bottles, COUNT(so.id) as sales_count
      FROM ${classSQL} so
      WHERE so.effective_user_id IN (${allStudentsWithGroup.map(() => '?').join(',')})
      GROUP BY so.effective_user_id
    `, [...classParams, ...allStudentsWithGroup.map((s) => s.id)]);
    const classStatsRows = classStatsResult.rows || classStatsResult;
    classStatsRows.forEach((r) => { classStatsMap[r.effective_user_id] = r; });
  }

  const classTotals = {};
  for (const cg of classGroups) {
    const studentIds = allStudentsWithGroup.filter((s) => s.class_group === cg).map((s) => s.id);
    let bottles = 0, salesCount = 0;
    for (const sid of studentIds) {
      const stat = classStatsMap[sid];
      if (stat) {
        bottles += parseInt(stat.bottles || 0, 10);
        salesCount += parseInt(stat.sales_count || 0, 10);
      }
    }
    classTotals[cg] = { bottles, salesCount, studentCount: studentIds.length };
  }

  return {
    campaign_name: campaign.name,
    progress,
    totalStudents: allStudents.length,
    classGroups,
    classTotals,
    campaign_financials: {
      ca_ttc: campCaTTC,
      ca_ht: campCaHT,
      vat_breakdown: globalVatBreakdown,
      association_remuneration: associationRemuneration,
    },
    students: students.map((s, i) => {
      const caData = studentCaMap[s.effective_user_id] || { ca_ttc: 0, ca_ht: 0, last_order_date: null };
      return {
        id: s.effective_user_id,
        rank: i + 1,
        name: s.name,
        classGroup: s.class_group,
        salesCount: parseInt(s.sales_count, 10),
        bottlesSold: parseInt(s.bottles_sold, 10),
        ca_ttc: caData.ca_ttc,
        ca_ht: caData.ca_ht,
        vat_breakdown: studentVatMap[s.effective_user_id] || [],
        last_order_date: caData.last_order_date,
      };
    }),
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

  const validStatusList = ACTIVE_STATUSES_SQL;

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

  const allParams = [...params, campaignId, ...referralParams, campaignId, ...classParams];

  const rankingResult = await db.raw(`
    SELECT combined.user_id, u.name, p.class_group,
           SUM(combined.total_ttc) as ca,
           SUM(combined.total_items) as bottles,
           COUNT(combined.id) as orders_count
    FROM (
      SELECT id, user_id, total_ttc, total_items, created_at FROM orders
        WHERE campaign_id = ? AND status IN ${validStatusList} AND user_id IS NOT NULL AND (referred_by IS NULL OR referred_by = user_id)${periodFilter}
      UNION ALL
      SELECT id, referred_by as user_id, total_ttc, total_items, created_at FROM orders
        WHERE referred_by IS NOT NULL AND source = 'student_referral' AND (user_id IS NULL OR user_id != referred_by) AND status IN ${validStatusList} AND campaign_id = ?${periodFilter ? ' AND created_at >= ?' : ''}
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
    .whereIn('status', ACTIVE_STATUSES)
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

module.exports = { getStudentDashboard, getStudentRanking, getStudentLeaderboard, getAdminCockpit, getTeacherDashboard, studentOrdersCombinedSQL, ACTIVE_STATUSES, ACTIVE_STATUSES_SQL };
