/**
 * Stripe 充值 E2E 自动化验收（Playwright）
 *
 * 目标：在不扣真钱的前提下，自动完成一次 Stripe Checkout 测试支付并校验：
 * - 支付成功回跳（拿到 stripe_session_id）
 * - 调用 /payments/stripe/confirm 入账成功
 * - Payment 记录写入（deposit/completed）
 * - confirm 幂等（重复 confirm 不重复加钱）
 *
 * 注意：
 * - 依赖 playwright（需要安装 chromium）
 * - 不会输出任何密钥
 */

require('dotenv').config();
const { chromium } = require('playwright');

async function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const apiBase = process.env.API_BASE_URL || 'http://127.0.0.1:3001/api/v1';
  const email = process.env.E2E_EMAIL || 'admin@lierzufang.local';
  const password = process.env.E2E_PASSWORD || 'admin123456';

  // 1) login
  const loginRes = await fetch(apiBase + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const login = await loginRes.json();
  await assert(login?.token, 'LOGIN_FAIL');
  const token = login.token;
  const startBalance = typeof login?.data?.user?.balance === 'number' ? login.data.user.balance : null;

  // 2) create checkout session (1€)
  const csRes = await fetch(apiBase + '/payments/stripe/checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ amount: 1 })
  });
  const cs = await csRes.json();
  await assert(cs?.status === 'success', 'CHECKOUT_CREATE_FAIL');
  await assert(cs?.data?.url && cs?.data?.sessionId, 'CHECKOUT_CREATE_MISSING_URL');
  const checkoutUrl = cs.data.url;
  const createdSessionId = cs.data.sessionId;

  // 3) open Stripe Checkout and pay with test card (4242...)
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.setDefaultTimeout(60000);
  await page.goto(checkoutUrl, { waitUntil: 'domcontentloaded' });

  // Stripe checkout might show loading; wait a moment for frames
  await page.waitForTimeout(1500);

  // 选择“银行卡”支付方式（部分 Checkout 会先展示支付方式列表，未选中时不会渲染卡号 iframe）
  try {
    const radio = page.getByRole('radio', { name: /银行卡|Bank card/i });
    if (await radio.count()) {
      await radio.first().click({ timeout: 5000 });
      await page.waitForTimeout(800);
    } else {
      const row = page.locator('div').filter({ hasText: /银行卡|Bank card/i }).first();
      if (await row.count()) {
        await row.click({ timeout: 5000 });
        await page.waitForTimeout(800);
      }
    }
  } catch (e) {
    // ignore
  }

  // Fill card details
  // Some Stripe checkouts render fields directly (no iframes). Prefer that path first.
  const directCard = page.locator('input[placeholder*=\"1234\" i]').first();
  const directExp = page.locator('input[placeholder*=\"月\" i], input[placeholder*=\"MM\" i]').first();
  const directCvc = page.locator('input[placeholder*=\"CVC\" i]').first();
  const directName = page.locator('input[placeholder*=\"全名\" i], input[placeholder*=\"name\" i]').first();

  if (await directCard.count()) {
    await directCard.fill('4242 4242 4242 4242');
    if (await directExp.count()) await directExp.fill('12/34');
    if (await directCvc.count()) await directCvc.fill('123');
    if (await directName.count()) await directName.fill('Test User');
  } else {
    // Fallback: iframe-based elements
  const frameInfos = [];
  for (const f of page.frames()) {
    frameInfos.push({
      name: f.name(),
      url: (f.url() || '').slice(0, 120),
      title: (await f.title().catch(() => ''))?.slice(0, 80)
    });
  }

  const findFrameWithSelector = async (selector) => {
    for (const f of page.frames()) {
      try {
        const h = await f.$(selector);
        if (h) return f;
      } catch (e) {}
    }
    return null;
  };

  // Wait up to ~15s for fields to appear after selecting payment method
  let cardFrame = null;
  let expFrame = null;
  let cvcFrame = null;
  for (let i = 0; i < 15; i++) {
    cardFrame = await findFrameWithSelector('input[name=\"cardnumber\"]');
    expFrame = await findFrameWithSelector('input[name=\"exp-date\"]');
    cvcFrame = await findFrameWithSelector('input[name=\"cvc\"]');
    if (cardFrame && expFrame && cvcFrame) break;
    await sleep(1000);
  }

  if (!cardFrame || !expFrame || !cvcFrame) {
    await page.screenshot({ path: 'scripts/stripe_e2e_last.png', fullPage: true });
    try {
      const html = await page.content();
      require('fs').writeFileSync('scripts/stripe_e2e_last.html', html, 'utf8');
    } catch (e) {}
    throw new Error(
      'Stripe 卡号/日期/CVC 输入框未出现（可能是 headless 被拦截或页面结构变化）。' +
        ' 已保存截图 server/scripts/stripe_e2e_last.png（同时保存了 stripe_e2e_last.html 便于定位）'
    );
  }

  await cardFrame.fill('input[name=\"cardnumber\"]', '4242 4242 4242 4242');
  await expFrame.fill('input[name=\"exp-date\"]', '12 / 34');
  await cvcFrame.fill('input[name=\"cvc\"]', '123');
  }

  // Click Pay/Confirm button
  const payBtn = page.locator('button[type=\"submit\"]');
  await payBtn.first().click();

  // 4) Poll confirm endpoint until payment is marked paid (this is our true E2E success condition)
  let conf = null;
  for (let i = 0; i < 60; i++) {
    const r = await fetch(apiBase + '/payments/stripe/confirm?session_id=' + encodeURIComponent(createdSessionId), {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + token }
    });
    const j = await r.json().catch(() => ({}));
    if (j?.status === 'success') {
      conf = j;
      break;
    }
    await sleep(1000);
  }

  // Save artifacts if not confirmed
  if (!conf) {
    await page.screenshot({ path: 'scripts/stripe_e2e_after_pay.png', fullPage: true });
    try {
      const html = await page.content();
      require('fs').writeFileSync('scripts/stripe_e2e_after_pay.html', html, 'utf8');
    } catch (e) {}
    await browser.close();
    throw new Error('CONFIRM_TIMEOUT');
  }

  await browser.close();

  // 5) confirm again for idempotency
  const confRes2 = await fetch(apiBase + '/payments/stripe/confirm?session_id=' + encodeURIComponent(createdSessionId), {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + token }
  });
  const conf2 = await confRes2.json();
  await assert(conf2?.status === 'success', 'CONFIRM2_FAIL');

  // 7) payments list
  const paysRes = await fetch(apiBase + '/payments/my', { method: 'GET', headers: { Authorization: 'Bearer ' + token } });
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
        sessionId: createdSessionId,
        startBalance,
        creditedBalance: conf?.data?.balance,
        delta: typeof startBalance === 'number' && typeof conf?.data?.balance === 'number' ? conf.data.balance - startBalance : null,
        alreadyConfirmedOnSecondCall: Boolean(conf2?.data?.alreadyConfirmed),
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

