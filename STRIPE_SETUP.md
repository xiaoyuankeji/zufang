### Stripe 正式/测试充值接入说明（本项目）

#### 1) 在 `server/.env` 配置（**不要提交到 Git**）

把你的 Stripe 密钥写入（测试用 `sk_test_...`，正式用 `sk_live_...`）：

```env
STRIPE_SECRET_KEY=sk_test_xxx
WEB_BASE_URL=http://localhost:3000
STRIPE_WEBHOOK_SECRET=whsec_xxx
NODE_ENV=development
```

说明：
- `STRIPE_SECRET_KEY`：后端用（**必须是 sk_ 开头**，不要用 pk_...）
- `WEB_BASE_URL`：前端域名/地址，用于 Checkout 回跳（正式环境请改成你的域名）
- `STRIPE_WEBHOOK_SECRET`：Stripe Webhook 签名密钥（正式环境必须配置，且是 **Live 端点** 对应的 whsec）
- `NODE_ENV`：正式上线建议设置为 `production`（后端会自动禁止使用 `sk_test_...`，防止误上测试模式）

> 重要：如果你把 `WEB_BASE_URL` 配成公网域名（非 localhost/127.0.0.1），后端也会自动视为“生产环境”，并拒绝 `sk_test_...`。

#### 2) 启动服务

运行 `boot_start.ps1`，确保：
- 前端：`http://localhost:3000/landlord.html`
- 后端：`http://127.0.0.1:3001/api/v1/health`

你可以打开 health 看 Stripe 当前模式（test/live/unknown）。

#### 3) 充值流程（生产级）

在“房东工作台 → 钱包/充值”输入金额，点击“立即充值”会跳转到 Stripe Checkout（测试环境）。

支付成功后会回跳到 `landlord.html` 并触发前端确认（用于即时 UI 更新）。

最终入账以 Stripe Webhook 为准：
- Webhook 地址：`/api/v1/payments/stripe/webhook`
- Stripe 事件：`checkout.session.completed`
- 后端会校验签名并做幂等入账（不会重复加钱）

#### 4) 正式上线最小清单（必须做）

- 在 Stripe Dashboard 切到 **Live**，获取 `sk_live_...`
- 创建 Webhook（Live 端点），事件至少勾选：`checkout.session.completed`
- 把 `WEB_BASE_URL` 改成你的线上域名（例如 `https://lierzufang.com`）
- 设置 `NODE_ENV=production`

