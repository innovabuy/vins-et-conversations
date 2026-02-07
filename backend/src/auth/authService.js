const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev_refresh_change_me';
const ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

function generateAccessToken(user, participations) {
  const campaignIds = participations.map((p) => p.campaign_id);
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      permissions: user.permissions || {},
      campaign_ids: campaignIds,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_EXPIRY }
  );
}

async function generateRefreshToken(userId) {
  const token = uuidv4();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  await db('refresh_tokens').insert({
    user_id: userId,
    token,
    expires_at: expiresAt,
  });
  return token;
}

async function login(email, password) {
  const user = await db('users').where({ email: email.toLowerCase().trim() }).first();
  if (!user) throw new Error('INVALID_CREDENTIALS');
  if (user.status === 'disabled') throw new Error('ACCOUNT_DISABLED');

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new Error('INVALID_CREDENTIALS');

  const participations = await db('participations').where({ user_id: user.id });
  const accessToken = generateAccessToken(user, participations);
  const refreshToken = await generateRefreshToken(user.id);

  await db('users').where({ id: user.id }).update({ last_login_at: new Date() });

  logger.info(`User logged in: ${user.email} [${user.role}]`);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatar: user.avatar,
      permissions: user.permissions,
      campaigns: participations.map((p) => ({
        campaign_id: p.campaign_id,
        role: p.role_in_campaign,
        class_group: p.class_group,
      })),
    },
  };
}

async function register(code, name, email, password) {
  // Verify invitation code
  const invitation = await db('invitations')
    .where({ code })
    .whereNull('used_by')
    .where('expires_at', '>', new Date())
    .first();

  if (!invitation) throw new Error('INVALID_INVITATION');

  // Check email uniqueness
  const existing = await db('users').where({ email: email.toLowerCase().trim() }).first();
  if (existing) throw new Error('EMAIL_EXISTS');

  const passwordHash = await bcrypt.hash(password, 12);
  const userId = uuidv4();

  await db.transaction(async (trx) => {
    await trx('users').insert({
      id: userId,
      email: email.toLowerCase().trim(),
      password_hash: passwordHash,
      name,
      role: invitation.role,
      status: 'active',
    });

    await trx('participations').insert({
      user_id: userId,
      campaign_id: invitation.campaign_id,
      role_in_campaign: invitation.role,
    });

    await trx('invitations').where({ id: invitation.id }).update({
      used_by: userId,
      used_at: new Date(),
    });
  });

  logger.info(`New user registered: ${email} via invitation ${code}`);
  return login(email, password);
}

async function refresh(refreshToken) {
  const stored = await db('refresh_tokens')
    .where({ token: refreshToken, revoked: false })
    .where('expires_at', '>', new Date())
    .first();

  if (!stored) throw new Error('INVALID_REFRESH_TOKEN');

  const user = await db('users').where({ id: stored.user_id }).first();
  if (!user || user.status === 'disabled') throw new Error('ACCOUNT_DISABLED');

  const participations = await db('participations').where({ user_id: user.id });
  const newAccessToken = generateAccessToken(user, participations);

  // Rotate refresh token
  await db('refresh_tokens').where({ id: stored.id }).update({ revoked: true });
  const newRefreshToken = await generateRefreshToken(user.id);

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

async function logout(userId) {
  await db('refresh_tokens').where({ user_id: userId }).update({ revoked: true });
}

function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { login, register, refresh, logout, verifyAccessToken };
