const crypto = require('crypto');

function generateStudentCode(campaignName, studentName) {
  const campInitials = (campaignName || 'STU')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join('')
    .substring(0, 3)
    .padEnd(3, 'X');

  const studentInitials = (studentName || 'XX')
    .replace(/[^a-zA-Z ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join('')
    .substring(0, 2)
    .padEnd(2, 'X');

  const random = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${campInitials}-${studentInitials}-${random}`;
}

function slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

exports.up = async function (knex) {
  // 1. Add slug column to campaigns
  const hasCampaignSlug = await knex.schema.hasColumn('campaigns', 'slug');
  if (!hasCampaignSlug) {
    await knex.schema.alterTable('campaigns', (table) => {
      table.string('slug').nullable().unique();
      table.index('slug');
    });
  }

  // 2. Generate slugs for existing campaigns
  const campaigns = await knex('campaigns').whereNull('slug').select('id', 'name');
  for (const c of campaigns) {
    const baseSlug = slugify(c.name);
    let slug = baseSlug;
    let attempt = 0;
    // eslint-disable-next-line no-await-in-loop
    while (await knex('campaigns').where({ slug }).whereNot({ id: c.id }).first()) {
      attempt++;
      slug = `${baseSlug}-${attempt}`;
    }
    await knex('campaigns').where({ id: c.id }).update({ slug });
  }

  // 3. Generate referral codes for existing student participations that don't have one
  const studentParticipations = await knex('participations')
    .join('users', 'participations.user_id', 'users.id')
    .join('campaigns', 'participations.campaign_id', 'campaigns.id')
    .where('users.role', 'etudiant')
    .whereNull('participations.referral_code')
    .select('participations.id', 'users.name as student_name', 'campaigns.name as campaign_name');

  for (const p of studentParticipations) {
    let code;
    let attempts = 0;
    do {
      code = generateStudentCode(p.campaign_name, p.student_name);
      attempts++;
      // eslint-disable-next-line no-await-in-loop
    } while (attempts < 10 && await knex('participations').where({ referral_code: code }).first());

    if (attempts >= 10) {
      code = 'STU-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    }

    await knex('participations').where({ id: p.id }).update({ referral_code: code });
  }
};

exports.down = async function (knex) {
  // Remove slug from campaigns
  const hasCampaignSlug = await knex.schema.hasColumn('campaigns', 'slug');
  if (hasCampaignSlug) {
    await knex.schema.alterTable('campaigns', (table) => {
      table.dropIndex('slug');
      table.dropUnique('slug');
      table.dropColumn('slug');
    });
  }

  // Nullify student referral codes (keep ambassador ones)
  await knex('participations')
    .whereIn('id', function () {
      this.select('participations.id')
        .from('participations')
        .join('users', 'participations.user_id', 'users.id')
        .where('users.role', 'etudiant')
        .whereNotNull('participations.referral_code');
    })
    .update({ referral_code: null });
};
