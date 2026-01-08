const Landlord = require('../models/Landlord');
const Payment = require('../models/Payment');
const Stripe = require('stripe');

function validateStripeKey(raw) {
  if (!raw) return { ok: false, reason: 'missing' };
  const key = String(raw).trim();
  if (!key) return { ok: false, reason: 'missing' };
  if (key === 'sk_test_xxx' || key === 'sk_live_xxx' || key.includes('xxx')) return { ok: false, reason: 'placeholder' };
  if (!/^sk_(test|live)_[A-Za-z0-9]+$/.test(key)) return { ok: false, reason: 'format' };
  return { ok: true, key };
}

function getStripe() {
  const v = validateStripeKey(process.env.STRIPE_SECRET_KEY);
  if (!v.ok) return null;
  return new Stripe(v.key, { apiVersion: '2023-10-16' });
}

function getWebBaseUrl(req) {
  return (
    process.env.WEB_BASE_URL ||
    // fallback: try infer from request (dev only)
    `${req.protocol}://${req.get('host')}`.replace(':3001', ':3000')
  );
}

function getWebhookSecret() {
  const s = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  return s || null;
}

exports.topUp = async (req, res, next) => {
  try {
    const { amount, landlordId } = req.body;
    const topUpAmount = Number(amount);

    if (!Number.isFinite(topUpAmount) || topUpAmount <= 0) {
      return res.status(400).json({ status: 'fail', message: 'Invalid amount' });
    }
    
    // In a real app, verify Stripe/Alipay callback here.
    // For now, this is a manual admin action or mock endpoint.
    
    const landlord = await Landlord.findById(landlordId || req.user.id);
    if (!landlord) {
      return res.status(404).json({ status: 'fail', message: 'Landlord not found' });
    }

    landlord.balance += topUpAmount;
    await landlord.save({ validateBeforeSave: false });

    await Payment.create({
      landlord: landlord.id,
      amount: topUpAmount,
      type: 'deposit',
      status: 'completed'
    });

    res.status(200).json({
      status: 'success',
      data: {
        balance: landlord.balance
      }
    });

  } catch (err) {
    res.status(400).json({ status: 'fail', message: err.message });
  }
};

exports.getMyPayments = async (req, res, next) => {
  try {
    const payments = await Payment.find({ landlord: req.user.id }).sort('-createdAt').limit(200);
    res.status(200).json({
      status: 'success',
      results: payments.length,
      data: { payments }
    });
  } catch (err) {
    res.status(400).json({ status: 'fail', message: err.message });
  }
};

// --- Stripe checkout (production-ready flow: final credit should rely on webhook; confirm is for UX) ---
exports.createStripeCheckoutSession = async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      const v = validateStripeKey(process.env.STRIPE_SECRET_KEY);
      const msg =
        v.reason === 'missing'
          ? 'Stripe 未配置：请在 server/.env 设置 STRIPE_SECRET_KEY'
          : 'Stripe 密钥无效：请检查 server/.env 的 STRIPE_SECRET_KEY（必须是 sk_test_...，且不要用 pk_test_）';
      return res.status(400).json({ status: 'fail', message: msg });
    }

    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ status: 'fail', message: 'Invalid amount' });
    }
    if (amount > 5000) {
      return res.status(400).json({ status: 'fail', message: 'Amount too large' });
    }

    const unitAmount = Math.round(amount * 100); // EUR cents
    const webBase = getWebBaseUrl(req);

    // Create a pending payment record (idempotency handled on confirm)
    const payment = await Payment.create({
      landlord: req.user.id,
      amount,
      currency: 'EUR',
      type: 'deposit',
      status: 'pending'
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      // For predictable UX & automated verification in test mode, limit to card only.
      // (You can expand to more payment methods later.)
      payment_method_types: ['card'],
      client_reference_id: String(req.user.id),
      customer_email: req.user?.email || undefined,
      success_url: `${webBase}/landlord.html?tab=wallet&stripe_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${webBase}/landlord.html?tab=wallet&stripe_cancelled=1`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: unitAmount,
            product_data: { name: '账户充值' }
          }
        }
      ],
      metadata: {
        paymentId: String(payment._id),
        landlordId: String(req.user.id),
        amount: String(amount)
      }
    });

    payment.transactionId = session.id;
    await payment.save({ validateBeforeSave: false });

    return res.status(200).json({
      status: 'success',
      data: {
        url: session.url,
        sessionId: session.id
      }
    });
  } catch (err) {
    // Avoid leaking secrets in error messages
    if (err?.type === 'StripeAuthenticationError') {
      return res.status(400).json({
        status: 'fail',
        message: 'Stripe 密钥无效：请检查 server/.env 的 STRIPE_SECRET_KEY（必须是 sk_test_...，且不要用 pk_test_）'
      });
    }
    return res.status(400).json({ status: 'fail', message: err?.message || String(err) });
  }
};

// Stripe webhook (production source of truth for credit)
exports.stripeWebhook = async (req, res) => {
  try {
    const stripe = getStripe();
    const whsec = getWebhookSecret();
    if (!stripe || !whsec) {
      // Misconfigured: don't break Stripe retries forever, but return 400 so operator notices.
      return res.status(400).send('stripe webhook not configured');
    }

    const sig = req.headers['stripe-signature'];
    if (!sig) return res.status(400).send('missing stripe-signature');

    let event;
    try {
      // req.body must be Buffer (express.raw)
      event = stripe.webhooks.constructEvent(req.body, sig, whsec);
    } catch (err) {
      console.warn('[STRIPE][WEBHOOK] signature verify failed:', err?.message || err);
      return res.status(400).send('signature verification failed');
    }

    // Handle events
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const sessionId = String(session.id || '');
      const paid = session.payment_status === 'paid';
      const userId = String(session.client_reference_id || '');

      if (paid && sessionId && userId) {
        const amount = Number(session.amount_total || 0) / 100;
        if (Number.isFinite(amount) && amount > 0) {
          const paymentId = session.metadata?.paymentId ? String(session.metadata.paymentId) : null;

          // Idempotency: only credit when transitioning pending -> completed
          const updated = await Payment.findOneAndUpdate(
            paymentId ? { _id: paymentId, status: 'pending' } : { transactionId: sessionId, status: 'pending' },
            {
              $set: {
                status: 'completed',
                amount,
                currency: String(session.currency || 'eur').toUpperCase(),
                transactionId: sessionId
              }
            },
            { new: true }
          );

          if (updated) {
            await Landlord.findByIdAndUpdate(userId, { $inc: { balance: amount } }, { new: false });
            console.log(`[STRIPE][WEBHOOK] credited user=${userId} +${amount} sid=${sessionId}`);
          } else {
            // Already completed or missing local record
            console.log(`[STRIPE][WEBHOOK] ignored (already processed?) user=${userId} sid=${sessionId}`);
          }
        }
      }
    }

    return res.json({ received: true });
  } catch (err) {
    console.error('[STRIPE][WEBHOOK] error:', err?.message || err);
    return res.status(500).send('webhook handler failed');
  }
};

exports.confirmStripeCheckoutSession = async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      const v = validateStripeKey(process.env.STRIPE_SECRET_KEY);
      const msg =
        v.reason === 'missing'
          ? 'Stripe 未配置：请在 server/.env 设置 STRIPE_SECRET_KEY'
          : 'Stripe 密钥无效：请检查 server/.env 的 STRIPE_SECRET_KEY（必须是 sk_test_...，且不要用 pk_test_）';
      return res.status(400).json({ status: 'fail', message: msg });
    }

    const sessionId = String(req.query?.session_id || '').trim();
    if (!sessionId) {
      return res.status(400).json({ status: 'fail', message: 'Missing session_id' });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session) return res.status(404).json({ status: 'fail', message: 'Session not found' });

    // Security: must match current user
    const ref = String(session.client_reference_id || '');
    if (ref && ref !== String(req.user.id)) {
      return res.status(403).json({ status: 'fail', message: 'Forbidden' });
    }

    if (session.payment_status !== 'paid') {
      return res.status(400).json({ status: 'fail', message: 'Payment not completed' });
    }

    const amountFromMeta = Number(session.metadata?.amount);
    const amountFromTotal = Number(session.amount_total || 0) / 100;
    const amount = Number.isFinite(amountFromMeta) && amountFromMeta > 0 ? amountFromMeta : amountFromTotal;

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ status: 'fail', message: 'Invalid paid amount' });
    }

    const paymentId = session.metadata?.paymentId ? String(session.metadata.paymentId) : null;

    // PRODUCTION SAFETY:
    // Make confirm idempotent and safe with webhook by transitioning pending -> completed atomically.
    // Only if we successfully flip status do we credit balance.
    const updated = await Payment.findOneAndUpdate(
      paymentId ? { _id: paymentId, status: 'pending' } : { transactionId: session.id, status: 'pending' },
      {
        $set: {
          status: 'completed',
          amount,
          currency: session.currency?.toUpperCase?.() || 'EUR',
          transactionId: session.id
        }
      },
      { new: true }
    );

    if (!updated) {
      const landlord = await Landlord.findById(req.user.id);
      return res.status(200).json({
        status: 'success',
        data: { balance: landlord?.balance ?? 0, alreadyConfirmed: true }
      });
    }

    await Landlord.findByIdAndUpdate(req.user.id, { $inc: { balance: amount } }, { new: false });
    const landlord = await Landlord.findById(req.user.id);
    return res.status(200).json({
      status: 'success',
      data: {
        balance: landlord?.balance ?? 0,
        paymentId: updated.id
      }
    });
  } catch (err) {
    if (err?.type === 'StripeAuthenticationError') {
      return res.status(400).json({
        status: 'fail',
        message: 'Stripe 密钥无效：请检查 server/.env 的 STRIPE_SECRET_KEY（必须是 sk_test_...，且不要用 pk_test_）'
      });
    }
    return res.status(400).json({ status: 'fail', message: err?.message || String(err) });
  }
};

// Sync pending Stripe deposits (server-side reconciliation)
exports.reconcileStripeDeposits = async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      const v = validateStripeKey(process.env.STRIPE_SECRET_KEY);
      const msg =
        v.reason === 'missing'
          ? 'Stripe 未配置：请在 server/.env 设置 STRIPE_SECRET_KEY'
          : 'Stripe 密钥无效：请检查 server/.env 的 STRIPE_SECRET_KEY（必须是 sk_test_...，且不要用 pk_test_）';
      return res.status(400).json({ status: 'fail', message: msg });
    }

    const limit = Math.min(Number(req.body?.limit || 50) || 50, 200);
    const userId = String(req.user.id);

    const pendings = await Payment.find({
      landlord: req.user.id,
      type: 'deposit',
      status: 'pending',
      transactionId: { $regex: /^cs_/ }
    })
      .sort('-createdAt')
      .limit(limit);

    let credited = 0;
    let failed = 0;
    let stillPending = 0;

    // Note: We keep logs concise & non-sensitive
    console.log(`[STRIPE][RECONCILE] user=${userId} pending=${pendings.length}`);

    for (const p of pendings) {
      try {
        const sid = String(p.transactionId || '');
        const session = await stripe.checkout.sessions.retrieve(sid);

        const ref = String(session.client_reference_id || '');
        if (ref && ref !== userId) {
          console.warn(`[STRIPE][RECONCILE] skip foreign session user=${userId} sid=${sid}`);
          stillPending += 1;
          continue;
        }

        // closed + unpaid => treat as failed
        const isClosed = session.status === 'complete' || session.status === 'expired' || session.status === 'canceled';
        const paid = session.payment_status === 'paid';

        if (paid) {
          if (p.status === 'completed') {
            continue;
          }

          const amountFromTotal = Number(session.amount_total || 0) / 100;
          const amount = Number.isFinite(amountFromTotal) && amountFromTotal > 0 ? amountFromTotal : Number(p.amount);
          if (!Number.isFinite(amount) || amount <= 0) {
            console.warn(`[STRIPE][RECONCILE] invalid amount sid=${sid} total=${session.amount_total}`);
            stillPending += 1;
            continue;
          }

          // Idempotent credit: only credit when marking pending -> completed
          const updatedPayment = await Payment.findOneAndUpdate(
            { _id: p._id, status: 'pending' },
            {
              $set: {
                status: 'completed',
                amount,
                currency: session.currency?.toUpperCase?.() || p.currency || 'EUR',
                transactionId: sid
              }
            },
            { new: true }
          );

          if (updatedPayment) {
            await Landlord.findByIdAndUpdate(req.user.id, { $inc: { balance: amount } }, { new: false });
            credited += 1;
            console.log(`[STRIPE][RECONCILE] credited user=${userId} +${amount} sid=${sid}`);
          }
          continue;
        }

        if (isClosed && !paid) {
          await Payment.findOneAndUpdate(
            { _id: p._id, status: 'pending' },
            { $set: { status: 'failed' } },
            { new: false }
          );
          failed += 1;
          console.log(`[STRIPE][RECONCILE] failed user=${userId} sid=${sid} status=${session.status} payment_status=${session.payment_status}`);
          continue;
        }

        stillPending += 1;
      } catch (e) {
        stillPending += 1;
        console.warn(`[STRIPE][RECONCILE] error user=${userId} paymentId=${p.id}: ${e?.message || e}`);
      }
    }

    const landlord = await Landlord.findById(req.user.id);
    return res.status(200).json({
      status: 'success',
      data: {
        balance: landlord?.balance ?? 0,
        stats: { scanned: pendings.length, credited, failed, pending: stillPending }
      }
    });
  } catch (err) {
    if (err?.type === 'StripeAuthenticationError') {
      return res.status(400).json({
        status: 'fail',
        message: 'Stripe 密钥无效：请检查 server/.env 的 STRIPE_SECRET_KEY（必须是 sk_test_...，且不要用 pk_test_）'
      });
    }
    return res.status(400).json({ status: 'fail', message: err?.message || String(err) });
  }
};


