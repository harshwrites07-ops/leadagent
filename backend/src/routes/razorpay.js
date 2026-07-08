const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const webhookRouter = express.Router();
const { getDb } = require('../models/database');
const { asyncHandler } = require('../middleware/errorHandler');

function getRazorpay() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be configured');
  }
  const Razorpay = require('razorpay');
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

// Plan amounts in cents (USD) — Razorpay international accounts bill in the
// smallest currency unit, so $29.00 = 2900.
const CURRENCY = 'USD';
const PLAN_CONFIG = {
  starter: { amount: 29 * 100, name: 'Starter Plan', interval: 1, period: 'monthly' },
  pro:     { amount: 49 * 100, name: 'Pro Plan',     interval: 1, period: 'monthly' },
  agency:  { amount: 149 * 100, name: 'Agency Plan', interval: 1, period: 'monthly' },
};

// Cache plan IDs so we don't recreate on every request
const planIdCache = {};

async function getOrCreateRazorpayPlanId(rzp, planKey) {
  if (planIdCache[planKey]) return planIdCache[planKey];

  const config = PLAN_CONFIG[planKey];
  if (!config) throw new Error(`Unknown plan: ${planKey}`);

  // Check if a plan with this item name already exists
  try {
    const plans = await rzp.plans.all({ count: 100 });
    const existing = plans.items?.find(p => p.item?.name === config.name && p.period === config.period && p.interval === config.interval);
    if (existing) {
      planIdCache[planKey] = existing.id;
      return existing.id;
    }
  } catch {}

  // Create new plan
  const plan = await rzp.plans.create({
    period: config.period,
    interval: config.interval,
    item: {
      name: config.name,
      amount: config.amount,
      currency: CURRENCY,
      description: `${config.name} monthly subscription`,
    },
  });

  planIdCache[planKey] = plan.id;
  return plan.id;
}

// POST /api/razorpay/create-subscription
// Creates a Razorpay subscription and returns subscription_id + key for frontend checkout
router.post('/create-subscription', asyncHandler(async (req, res) => {
  const rzp = getRazorpay();
  const user = req.user;
  const { plan } = req.body;

  if (!PLAN_CONFIG[plan]) return res.status(400).json({ success: false, error: 'Invalid plan' });

  const db = getDb();

  // Get or create Razorpay customer
  let customerId = user.razorpay_customer_id;
  if (!customerId) {
    const customer = await rzp.customers.create({
      name: user.full_name || user.email,
      email: user.email,
      contact: user.phone_number || undefined,
      notes: { user_id: String(user.id) },
    });
    customerId = customer.id;
    await db.run(`UPDATE users SET razorpay_customer_id=? WHERE id=?`, [customerId, user.id]);
  }

  const planId = await getOrCreateRazorpayPlanId(rzp, plan);

  const subscription = await rzp.subscriptions.create({
    plan_id: planId,
    customer_notify: 1,
    quantity: 1,
    total_count: 120, // 10 years max
    notes: { user_id: String(user.id), plan_key: plan },
    customer_id: customerId,
  });

  res.json({
    success: true,
    subscription_id: subscription.id,
    key: process.env.RAZORPAY_KEY_ID,
    amount: PLAN_CONFIG[plan].amount,
    currency: CURRENCY,
    plan_name: PLAN_CONFIG[plan].name,
    user_name: user.full_name || '',
    user_email: user.email,
    user_contact: user.phone_number || '',
  });
}));

// POST /api/razorpay/verify-payment
// Called by frontend after successful checkout to verify signature and activate plan
router.post('/verify-payment', asyncHandler(async (req, res) => {
  const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature, plan } = req.body;

  if (!razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature) {
    return res.status(400).json({ success: false, error: 'Missing payment details' });
  }

  // Verify HMAC signature
  const secret = process.env.RAZORPAY_KEY_SECRET;
  const body = `${razorpay_payment_id}|${razorpay_subscription_id}`;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');

  if (expected !== razorpay_signature) {
    console.error('[Razorpay] Signature mismatch — possible tampered request');
    return res.status(400).json({ success: false, error: 'Payment verification failed' });
  }

  const db = getDb();
  const validPlan = PLAN_CONFIG[plan] ? plan : 'starter';

  await db.run(
    `UPDATE users SET plan=?, plan_status='active', razorpay_subscription_id=?, billing_cycle_start=? WHERE id=?`,
    [validPlan, razorpay_subscription_id, new Date().toISOString(), req.user.id]
  );

  console.log(`[Razorpay] User ${req.user.id} upgraded to plan=${validPlan}`);
  res.json({ success: true, plan: validPlan });
}));

// GET /api/razorpay/subscription  — returns current plan info + usage
router.get('/subscription', asyncHandler(async (req, res) => {
  const db = getDb();
  const fresh = await db.get(
    `SELECT plan, plan_status, razorpay_customer_id, razorpay_subscription_id,
            trial_ends_at, leads_used_this_month, emails_used_this_month, usage_reset_date
     FROM users WHERE id=?`,
    [req.user.id]
  );
  const { PLAN_LIMITS } = require('../services/authService');
  const effectivePlan = (fresh.plan_status === 'cancelled' || fresh.plan_status === 'past_due')
    ? 'trial' : (fresh.plan || 'free');
  const limits = PLAN_LIMITS[effectivePlan] || PLAN_LIMITS.free;
  const trialDaysLeft = fresh.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(fresh.trial_ends_at) - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  res.json({
    success: true,
    plan: fresh.plan,
    plan_status: fresh.plan_status,
    trial_ends_at: fresh.trial_ends_at,
    trial_days_left: trialDaysLeft,
    has_billing: !!fresh.razorpay_customer_id,
    usage: {
      leads: { used: fresh.leads_used_this_month, limit: limits.leads },
      emails: { used: fresh.emails_used_this_month, limit: limits.emails },
    },
    reset_date: fresh.usage_reset_date,
  });
}));

// POST /api/razorpay/cancel-subscription
router.post('/cancel-subscription', asyncHandler(async (req, res) => {
  const rzp = getRazorpay();
  const db = getDb();
  const user = await db.get(`SELECT razorpay_subscription_id FROM users WHERE id=?`, [req.user.id]);

  if (!user?.razorpay_subscription_id) {
    return res.status(400).json({ success: false, error: 'No active subscription found' });
  }

  await rzp.subscriptions.cancel(user.razorpay_subscription_id, { cancel_at_cycle_end: true });
  await db.run(`UPDATE users SET plan_status='cancelled' WHERE id=?`, [req.user.id]);

  res.json({ success: true, message: 'Subscription will cancel at end of billing cycle' });
}));

// POST /api/razorpay/webhook  (raw body — registered before express.json())
webhookRouter.post('/', express.raw({ type: 'application/json' }), (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const sig = req.headers['x-razorpay-signature'];

  if (secret && sig) {
    const expected = crypto.createHmac('sha256', secret).update(req.body).digest('hex');
    if (expected !== sig) {
      console.error('[Razorpay] Webhook signature mismatch');
      return res.status(400).send('Invalid signature');
    }
  } else if (secret) {
    console.warn('[Razorpay] Webhook received without signature — rejecting');
    return res.status(400).send('Missing signature');
  }

  let event;
  try { event = JSON.parse(req.body.toString()); }
  catch (e) { return res.status(400).send('Invalid JSON'); }

  const db = getDb();
  const entity = event.payload?.subscription?.entity || event.payload?.payment?.entity;
  const notes = entity?.notes || {};
  const userId = notes.user_id;
  const planKey = notes.plan_key;

  console.log(`[Razorpay] Webhook: ${event.event}, user=${userId}, plan=${planKey}`);

  switch (event.event) {
    case 'subscription.activated':
    case 'subscription.charged': {
      if (!userId) break;
      const plan = planKey && PLAN_CONFIG[planKey] ? planKey : 'starter';
      db.run(
        `UPDATE users SET plan=?, plan_status='active', razorpay_subscription_id=?, billing_cycle_start=? WHERE id=?`,
        [plan, entity.id, new Date().toISOString(), userId]
      ).then(() => console.log(`[Razorpay] User ${userId} → plan=${plan} active`)).catch(console.error);
      break;
    }
    case 'subscription.cancelled':
    case 'subscription.completed': {
      if (!userId) break;
      db.run(
        `UPDATE users SET plan='free', plan_status='cancelled', razorpay_subscription_id=NULL WHERE id=?`,
        [userId]
      ).then(() => console.log(`[Razorpay] User ${userId} subscription ended → free`)).catch(console.error);
      break;
    }
    case 'subscription.halted': {
      if (!userId) break;
      db.run(`UPDATE users SET plan_status='past_due' WHERE id=?`, [userId])
        .then(() => console.log(`[Razorpay] User ${userId} → past_due`)).catch(console.error);
      break;
    }
    case 'subscription.resumed': {
      if (!userId) break;
      db.run(`UPDATE users SET plan_status='active' WHERE id=?`, [userId])
        .then(() => console.log(`[Razorpay] User ${userId} subscription resumed`)).catch(console.error);
      break;
    }
    default: break;
  }

  res.json({ received: true });
});

module.exports = { router, webhookRouter };
