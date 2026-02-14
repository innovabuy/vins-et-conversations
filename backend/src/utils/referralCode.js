const crypto = require('crypto');
const db = require('../config/database');

/**
 * Generate a student referral code from campaign name + student name
 * Format: {3 initiales campagne}-{2 initiales etudiant}-{4 hex random}
 * Example: SCO-MA-7K2P
 */
function generateStudentReferralCode(campaignName, studentName) {
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

/**
 * Generate a unique referral code with retry loop
 * Falls back to STU-XXXXXXXX after 10 attempts
 */
async function generateUniqueReferralCode(campaignName, studentName) {
  for (let i = 0; i < 10; i++) {
    const code = generateStudentReferralCode(campaignName, studentName);
    const existing = await db('participations').where({ referral_code: code }).first();
    if (!existing) return code;
  }
  // Fallback: fully random
  const fallback = 'STU-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  return fallback;
}

module.exports = { generateStudentReferralCode, generateUniqueReferralCode };
