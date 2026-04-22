/**
 * Idempotent test fixtures for the Jest suite.
 *
 * This seed re-creates the minimum data required by the integration tests
 * (Sophie Laurent contact, a student_referral boutique order, ambassador CA
 * for tier calculation, a contact whose source starts with "referral:").
 * Every insertion checks for existence first, so the seed can be replayed
 * any number of times without producing duplicates or errors.
 *
 * It never wipes data — it only fills the gaps when expected fixtures are
 * missing, and leaves everything else (including production-scale tables)
 * untouched.
 */

const FIXTURE_STUDENT_EMAIL = 'ackavong@eleve.sc.fr';
const FIXTURE_AMBASSADOR_EMAIL = 'ambassadeur@example.fr';
const FIXTURE_SOPHIE_EMAIL = 'sophie.laurent@example.fr';
const FIXTURE_REFERRAL_CONTACT_EMAIL = 'referral.fixture@example.fr';
const FIXTURE_CUSTOMER_EMAIL = 'fixture.student.referral.customer@example.fr';
const FIXTURE_REF_STUDENT_ORDER = 'FIX-REF-STU-0001';
const FIXTURE_REF_AMB_ORDER = 'FIX-AMB-CA-0001';

exports.seed = async function (knex) {
  const ambassador = await knex('users').where({ email: FIXTURE_AMBASSADOR_EMAIL }).first();
  const student = await knex('users').where({ email: FIXTURE_STUDENT_EMAIL }).first();

  if (!ambassador || !student) {
    console.log('⚠️ test_fixtures: ambassador or student user missing, skipping fixtures');
    return;
  }

  // ─── 1. Public-page ambassador contacts (Sophie, Marc, Claire) ────────
  const regionPDL = await knex('regions').where({ code: 'PDL' }).first();
  const regionBretagne = await knex('regions').where({ code: 'BRE' }).first();
  const ambassador2 = await knex('users').where({ email: 'ambassadeur2@example.fr' }).first();

  const ambassadorContactFixtures = [
    {
      name: 'Sophie Laurent',
      email: FIXTURE_SOPHIE_EMAIL,
      phone: '0611223344',
      bio: 'Passionnée de vins de Loire depuis 15 ans, je partage ma passion avec mon réseau.',
      region_id: regionPDL?.id || null,
      source_user_id: ambassador.id,
    },
    {
      name: 'Marc Dupont',
      email: 'marc.dupont@example.fr',
      phone: '0655667788',
      bio: 'Amateur de vins et entrepreneur, je recommande les cuvées Vins & Conversations à mes partenaires.',
      region_id: regionBretagne?.id || null,
      source_user_id: ambassador2?.id || null,
    },
    {
      name: 'Claire Moreau',
      email: 'claire.moreau@example.fr',
      phone: '0677889900',
      bio: "Sommelière de formation, j'organise des dégustations privées avec les vins de Nicolas.",
      region_id: regionPDL?.id || null,
      source_user_id: null,
    },
  ];

  for (const fx of ambassadorContactFixtures) {
    const existing = await knex('contacts').where({ name: fx.name }).first();
    if (!existing) {
      await knex('contacts').insert({
        name: fx.name,
        email: fx.email,
        phone: fx.phone,
        type: 'ambassadeur',
        show_on_public_page: true,
        ambassador_bio: fx.bio,
        region_id: fx.region_id,
        source_user_id: fx.source_user_id,
      });
    } else if (existing.show_on_public_page === false) {
      // Re-enable visibility in case a previous test run left it hidden
      await knex('contacts').where({ id: existing.id }).update({ show_on_public_page: true });
    }
  }

  // ─── 2. Contact whose source starts with "referral:" ─────
  const referralContact = await knex('contacts')
    .where('source', 'like', 'referral:%')
    .first();
  if (!referralContact) {
    await knex('contacts').insert({
      name: 'Client Référé Fixture',
      email: FIXTURE_REFERRAL_CONTACT_EMAIL,
      type: 'particulier',
      source: 'referral:fixture',
    });
  }

  // ─── 3. Boutique order with student_referral source ──────
  const existingStudentReferralOrder = await knex('orders')
    .where({ source: 'student_referral' })
    .first();

  if (!existingStudentReferralOrder) {
    const boutiqueCampaign = await knex('campaigns').where({ name: 'Boutique Web' }).first();
    const studentParticipation = await knex('participations')
      .where({ user_id: student.id })
      .whereNotNull('referral_code')
      .first();

    if (boutiqueCampaign && studentParticipation) {
      let customer = await knex('contacts').where({ email: FIXTURE_CUSTOMER_EMAIL }).first();
      if (!customer) {
        const [inserted] = await knex('contacts')
          .insert({
            name: 'Client Fixture Étudiant',
            email: FIXTURE_CUSTOMER_EMAIL,
            type: 'particulier',
            source: `referral:${studentParticipation.referral_code}`,
            source_user_id: student.id,
          })
          .returning('*');
        customer = inserted;
      }

      const product = await knex('products')
        .where({ active: true, visible_boutique: true })
        .first();

      if (product) {
        const [order] = await knex('orders')
          .insert({
            ref: FIXTURE_REF_STUDENT_ORDER,
            campaign_id: boutiqueCampaign.id,
            user_id: null,
            customer_id: customer.id,
            referred_by: student.id,
            referral_code: studentParticipation.referral_code,
            source: 'student_referral',
            status: 'validated',
            total_ht: 20.00,
            total_ttc: 24.00,
            total_items: 2,
          })
          .returning('*');

        await knex('order_items').insert({
          order_id: order.id,
          product_id: product.id,
          qty: 2,
          unit_price_ht: 10.00,
          unit_price_ttc: 12.00,
          vat_rate: 20.00,
          type: 'product',
        });

        await knex('financial_events').insert({
          order_id: order.id,
          campaign_id: boutiqueCampaign.id,
          type: 'sale',
          amount: 24.00,
          description: 'Fixture student referral sale',
        });
      }
    }
  }

  // ─── 4. Ambassador CA ≥ Bronze threshold ─────────────────
  const ambCARow = await knex('orders')
    .where({ user_id: ambassador.id })
    .whereIn('status', ['validated', 'preparing', 'shipped', 'delivered'])
    .sum('total_ttc as total')
    .first();
  const ambCA = parseFloat(ambCARow?.total || 0);

  if (ambCA < 600) {
    const existingFixtureAmbOrder = await knex('orders').where({ ref: FIXTURE_REF_AMB_ORDER }).first();
    if (!existingFixtureAmbOrder) {
      const ambassadorCampaign = await knex('campaigns')
        .where('name', 'like', '%Ambassadeur%')
        .first();
      const product = await knex('products').where({ active: true }).first();

      if (ambassadorCampaign && product) {
        const [order] = await knex('orders')
          .insert({
            ref: FIXTURE_REF_AMB_ORDER,
            campaign_id: ambassadorCampaign.id,
            user_id: ambassador.id,
            status: 'validated',
            source: 'ambassador_direct',
            total_ht: 500.00,
            total_ttc: 600.00,
            total_items: 50,
          })
          .returning('*');

        await knex('order_items').insert({
          order_id: order.id,
          product_id: product.id,
          qty: 50,
          unit_price_ht: 10.00,
          unit_price_ttc: 12.00,
          vat_rate: 20.00,
          type: 'product',
        });

        await knex('financial_events').insert({
          order_id: order.id,
          campaign_id: ambassadorCampaign.id,
          type: 'sale',
          amount: 600.00,
          description: 'Fixture ambassador CA (Bronze tier)',
        });
      }
    }
  }
};
