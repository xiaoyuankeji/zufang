### Stripe 正式/测试充值接入说明（本项目）

#### 1) 在 `server/.env` 配置（**不要提交到 Git**）

把你的 Stripe 密钥写入（测试用 `sk_test_...`，正式用 `sk_live_...`）：

```env
STRIPE_SECRET_KEY=sk_test_xxx
WEB_BASE_URL=http://localhost:3000
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

说明：
- `STRIPE_SECRET_KEY`：后端用（**必须是 sk_ 开头**，不要用 pk_test_ / pk_live_）
- `WEB_BASE_URL`：前端域名/地址，用于 Checkout 回跳（正式环境请改成你的域名）
- `STRIPE_WEBHOOK_SECRET`：Stripe Webhook 签名密钥（正式环境必须配置）

#### 2) 启动服务

运行 `boot_start.ps1`，确保：
- 前端：`http://localhost:3000/landlord.html`
- 后端：`http://127.0.0.1:3001/api/v1/health`

#### 3) 充值流程（生产级）

在“房东工作台 → 钱包/充值”输入金额，点击“立即充值”会跳转到 Stripe Checkout（测试环境）。

支付成功后会回跳到 `landlord.html` 并触发前端确认（用于即时 UI 更新）。

最终入账以 Stripe Webhook 为准：
- Webhook 地址：`/api/v1/payments/stripe/webhook`
- Stripe 事件：`checkout.session.completed`
- 后端会校验签名并做幂等入账（不会重复加钱）

