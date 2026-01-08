/**
 * Stripe 充值 E2E 自检（不产生真实扣款）
 *
 * 流程：
 * 1) 用默认管理员登录拿 JWT
 * 2) 创建 1€ Stripe Checkout Session
 * 3) 用 Stripe 测试卡 pm_card_visa 在后台确认 PaymentIntent 成功（不会扣真钱）
 * 4) 调用 /payments/stripe/confirm 入账
 * 5) 再 confirm 一次验证幂等（不重复加钱）
 * 6) 拉取最近支付记录验证写入
 *
 * 注意：不会输出任何密钥。
 */

require('dotenv').config();
const Stripe = require('stripe');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const base = process.env.API_BASE_URL || 'http://127.0.0.1:3001/api/v1';
  const email = process.env.E2E_EMAIL || 'admin@lierzufang.local';
  const password = process.env.E2E_PASSWORD || 'admin123456';

  const key = process.env.STRIPE_SECRET_KEY;
  assert(key, 'STRIPE_SECRET_KEY missing');
  const stripe = new Stripe(key, { apiVersion: '2023-10-16' });

  // 1) login
  const loginRes = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const login = await loginRes.json();
  assert(login?.token, 'LOGIN_FAIL');
  const token = login.token;

  // 2) create checkout session
  const csRes = await fetch(base + '/payments/stripe/checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ amount: 1 })
  });
  const cs = await csRes.json();
  assert(cs?.status === 'success', 'CHECKOUT_CREATE_FAIL');
  assert(cs?.data?.sessionId, 'CHECKOUT_CREATE_MISSING_SESSION_ID');
  const sessionId = cs.data.sessionId;

  // 3) confirm payment intent (test)
  let session = await stripe.checkout.sessions.retrieve(sessionId);
  assert(session?.payment_intent, 'NO_PAYMENT_INTENT');
  const piId = session.payment_intent;

  await stripe.paymentIntents.confirm(piId, { payment_method: 'pm_card_visa' });

  // wait until checkout session reflects paid
  for (let i = 0; i < 12; i++) {
    session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status === 'paid') break;
    await sleep(500);
  }
  assert(session.payment_status === 'paid', 'SESSION_NOT_PAID');

  // 4) confirm -> credit
  const confirmRes = await fetch(base + '/payments/stripe/confirm?session_id=' + encodeURIComponent(sessionId), {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + token }
  });
  const confirm = await confirmRes.json();
  assert(confirm?.status === 'success', 'CONFIRM_API_FAIL');

  // 5) confirm again (idempotent)
  const confirmRes2 = await fetch(base + '/payments/stripe/confirm?session_id=' + encodeURIComponent(sessionId), {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + token }
  });
  const confirm2 = await confirmRes2.json();
  assert(confirm2?.status === 'success', 'CONFIRM2_API_FAIL');

  // 6) payments list
  const paysRes = await fetch(base + '/payments/my', { method: 'GET', headers: { Authorization: 'Bearer ' + token } });
  const pays = await paysRes.json();
  const latest = Array.isArray(pays?.data?.payments)
    ? pays.data.payments.slice(0, 5).map((p) => ({
        type: p.type,
        amount: p.amount,
        status: p.status,
        tx: p.transactionId ? String(p.transactionId).slice(0, 12) : null
      }))
    : [];

  console.log(
    JSON.stringify(
      {
        ok: true,
        sessionId,
        creditedBalance: confirm?.data?.balance,
        alreadyConfirmedOnSecondCall: Boolean(confirm2?.data?.alreadyConfirmed),
        latest
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error('E2E_FAIL', e?.message || e);
  process.exit(1);
});

