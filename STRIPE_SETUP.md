### Stripe 测试充值接入说明（本项目）

#### 1) 在 `server/.env` 配置（**不要提交到 Git**）

把你的 Stripe 测试密钥写入：

```env
STRIPE_SECRET_KEY=sk_test_xxx
WEB_BASE_URL=http://localhost:3000
```

#### 2) 启动服务

运行 `boot_start.ps1`，确保：
- 前端：`http://localhost:3000/landlord.html`
- 后端：`http://127.0.0.1:3001/api/v1/health`

#### 3) 充值流程

在“房东工作台 → 钱包/充值”输入金额，点击“立即充值”会跳转到 Stripe Checkout（测试环境）。

支付成功后会回跳到 `landlord.html` 并自动确认入账（增加余额 + 写入充值记录）。

