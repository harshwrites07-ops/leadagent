const express = require('express');
const router = express.Router();
const webhookRouter = express.Router();
const { getDb } = require('../models/database');
const { asyncHandler } = require('../middleware/errorHandler');

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured');
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

const PRICE_MAP = {
  starter: process.env.STRIPE_STARTER_PRICE_ID,
  pro: process.env.STRIPE_PRO_PRICE_ID,
  agency: process.env.STRIPE_AGENCY_PRICE_ID,
};

router.post('/create-checkout', asyncHandler(async (req, res) => {
  const stripe = getStripe();
  const user = req.user;
  const { plan } = req.body;
  const priceId = PRICE_MAP[plan];
  if (!priceId) return res.status(400).json({ success: false, error: 'Invalid plan' });

  const db = getDb();
  const appUrl = process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:5173';

  let customerId = user.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email, name: user.full_name || undefined, metadata: { user_id: String(user.id) } });
    customerId = customer.id;
    await db.run(`UPDATE users SET stripe_customer_id=? WHERE id=?`, [customerId, user.id]);
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId, mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/settings?upgraded=true`,
    cancel_url: `${appUrl}/settings#billing`,
    allow_promotion_codes: true,
    subscription_data: { metadata: { user_id: String(user.id) } },
  });

  res.json({ success: true, url: session.url });
}));

router.post('/create-portal', asyncHandler(async (req, res) => {
  const stripe = getStripe();
  const user = req.user;
  if (!user.stripe_customer_id) return res.status(400).json({ success: false, error: 'No billing account found. Please subscribe first.' });
  const appUrl = process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
  const portalSession = await stripe.billingPortal.sessions.create({ customer: user.stripe_customer_id, return_url: `${appUrl}/settings#billing` });
  res.json({ success: true, url: portalSession.url });
}));

router.get('/subscription', asyncHandler(async (req, res) => {
  const db = getDb();
  const fresh = await db.get(`SELECT plan, plan_status, stripe_customer_id, stripe_subscription_id, trial_ends_at, leads_used_this_month, emails_used_this_month, usage_reset_date FROM users WHERE id=?`, [req.user.id]);
  const { PLAN_LIMITS } = require('../services/authService');
  const effectivePlan = (fresh.plan_status === 'cancelled' || fresh.plan_status === 'past_due') ? 'trial' : (fresh.plan || 'free');
  const limits = PLAN_LIMITS[effectivePlan] || PLAN_LIMITS.free;
  const trialDaysLeft = fresh.trial_ends_at ? Math.max(0, Math.ceil((new Date(fresh.trial_ends_at) - Date.now()) / (1000 * 60 * 60 * 24))) : null;
  res.json({ success: true, plan: fresh.plan, plan_status: fresh.plan_status, trial_ends_at: fresh.trial_ends_at, trial_days_left: trialDaysLeft, has_billing: !!fresh.stripe_customer_id, usage: { leads: { used: fresh.leads_used_this_month, limit: limits.leads }, emails: { used: fresh.emails_used_this_month, limit: limits.emails } }, reset_date: fresh.usage_reset_date });
}));

// POST /api/stripe/webhook  (raw body — registered before express.json())
webhookRouter.post('/', express.raw({ type: 'application/json' }), (req, res) => {
  const stripe = getStripe();
  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) console.warn('[Stripe] STRIPE_WEBHOOK_SECRET not set — skipping signature verification');

  let event;
  try { event = secret ? stripe.webhooks.constructEvent(req.body, sig, secret) : JSON.parse(req.body.toString()); }
  catch (e) { console.error('[Stripe] Webhook signature verification failed:', e.message); return res.status(400).send(`Webhook error: ${e.message}`); }

  const db = getDb();

  function applySubscription(sub) {
    const userId = sub.metadata?.user_id;
    if (!userId) return;
    const planNickname = sub.items?.data?.[0]?.price?.nickname?.toLowerCase();
    const priceId = sub.items?.data?.[0]?.price?.id;
    let plan = 'starter';
    if (priceId === process.env.STRIPE_AGENCY_PRICE_ID || planNickname?.includes('agency')) plan = 'agency';
    else if (priceId === process.env.STRIPE_PRO_PRICE_ID || planNickname?.includes('pro')) plan = 'pro';
    else if (priceId === process.env.STRIPE_STARTER_PRICE_ID || planNickname?.includes('starter')) plan = 'starter';
    const status = sub.status === 'active' || sub.status === 'trialing' ? 'active' : sub.status;
    db.run(`UPDATE users SET plan=?, plan_status=?, stripe_subscription_id=?, billing_cycle_start=? WHERE id=?`, [plan, status, sub.id, new Date(sub.current_period_start * 1000).toISOString(), userId])
      .then(() => console.log(`[Stripe] User ${userId} → plan=${plan} status=${status}`))
      .catch(console.error);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.subscription) stripe.subscriptions.retrieve(session.subscription).then(applySubscription).catch(console.error);
      break;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.created':
      applySubscription(event.data.object);
      break;
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const userId = sub.metadata?.user_id;
      if (userId) {
        db.run(`UPDATE users SET plan='free', plan_status='cancelled', stripe_subscription_id=NULL WHERE id=?`, [userId])
          .then(() => console.log(`[Stripe] User ${userId} subscription cancelled → plan=free`)).catch(console.error);
      }
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      if (invoice.subscription) {
        stripe.subscriptions.retrieve(invoice.subscription).then(sub => {
          const userId = sub.metadata?.user_id;
          if (userId) db.run(`UPDATE users SET plan_status='past_due' WHERE id=?`, [userId]).then(() => console.log(`[Stripe] User ${userId} payment failed → past_due`)).catch(console.error);
        }).catch(console.error);
      }
      break;
    }
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object;
      if (invoice.subscription) {
        stripe.subscriptions.retrieve(invoice.subscription).then(sub => {
          const userId = sub.metadata?.user_id;
          if (userId) db.run(`UPDATE users SET plan_status='active' WHERE id=?`, [userId]).catch(console.error);
        }).catch(console.error);
      }
      break;
    }
    default: break;
  }

  res.json({ received: true });
});

module.exports = { router, webhookRouter };
