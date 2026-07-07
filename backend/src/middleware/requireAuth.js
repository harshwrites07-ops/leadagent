const { getUserById } = require('../models/database');

const PAID_PLANS = ['starter', 'pro', 'growth', 'agency'];

function isTrialExpired(user) {
  if (!user) return false;
  if (user.is_admin) return false;
  if (PAID_PLANS.includes(user.plan) && user.plan_status === 'active') return false;
  if (!user.trial_ends_at) return false;
  return new Date(user.trial_ends_at) < new Date();
}

async function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' });
  }
  try {
    const user = await getUserById(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ success: false, error: 'Session invalid', code: 'UNAUTHENTICATED' });
    }
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}

function requireActiveSubscription(req, res, next) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  if (req.method === 'GET') return next();
  if (isTrialExpired(req.user)) {
    return res.status(402).json({
      success: false,
      error: 'Your free trial has ended. Upgrade to continue.',
      code: 'TRIAL_EXPIRED',
      upgradeRequired: true,
    });
  }
  next();
}

async function requireAdmin(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' });
  }
  try {
    const user = await getUserById(req.session.userId);
    if (!user || !user.is_admin) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}

module.exports = { requireAuth, requireAdmin, requireActiveSubscription, isTrialExpired, PAID_PLANS };
