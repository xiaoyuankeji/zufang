$ErrorActionPreference = "Stop"

function Write-Info($msg) { Write-Host ("[INFO] " + $msg) -ForegroundColor Cyan }
function Write-Warn($msg) { Write-Host ("[WARN] " + $msg) -ForegroundColor Yellow }
function Write-Ok($msg)   { Write-Host ("[OK]   " + $msg) -ForegroundColor Green }
function Write-Err($msg)  { Write-Host ("[ERR]  " + $msg) -ForegroundColor Red }

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServerDir = Split-Path -Parent $ScriptDir
$Template = Join-Path $ServerDir "ENV_TEMPLATE.txt"
$EnvFile = Join-Path $ServerDir ".env"

Write-Info "Stripe Live 配置向导（生成 server/.env）"
Write-Info ("ServerDir: " + $ServerDir)

if (!(Test-Path $Template)) {
  throw "模板不存在：$Template"
}

# 读取模板（不包含真正密钥）
$tpl = Get-Content -LiteralPath $Template -Raw

# 提示用户输入（你可以直接粘贴）
Write-Host ""
Write-Host "请从 Stripe Dashboard（Live 模式）复制以下值：" -ForegroundColor White
Write-Host "  1) STRIPE_SECRET_KEY：sk_live_..." -ForegroundColor White
Write-Host "  2) STRIPE_WEBHOOK_SECRET：whsec_...（Live endpoint 的 Signing secret）" -ForegroundColor White
Write-Host "  3) WEB_BASE_URL：你的前端线上域名（例如 https://lierzufang.com）" -ForegroundColor White
Write-Host ""

$web = Read-Host "WEB_BASE_URL（例：https://lierzufang.com）"
$sk  = Read-Host "STRIPE_SECRET_KEY（必须 sk_live_...）"
$wh  = Read-Host "STRIPE_WEBHOOK_SECRET（必须 whsec_...）"

$web = ($web  | ForEach-Object { $_.Trim() })
$sk  = ($sk   | ForEach-Object { $_.Trim() })
$wh  = ($wh   | ForEach-Object { $_.Trim() })

if (!$web) { throw "WEB_BASE_URL 不能为空" }
if (!$sk)  { throw "STRIPE_SECRET_KEY 不能为空" }
if (!$wh)  { throw "STRIPE_WEBHOOK_SECRET 不能为空" }

if ($sk.StartsWith("sk_test_")) { throw "你输入的是 sk_test_...（测试密钥）。正式上线必须使用 sk_live_..." }
if (!$sk.StartsWith("sk_live_")) { throw "STRIPE_SECRET_KEY 格式不对：必须以 sk_live_ 开头" }
if (!$wh.StartsWith("whsec_")) { throw "STRIPE_WEBHOOK_SECRET 格式不对：必须以 whsec_ 开头" }
if ($web -match "localhost|127\.0\.0\.1") { Write-Warn "WEB_BASE_URL 仍是本地地址；正式上线请改成公网域名" }

# 生成 .env 内容（基于模板替换）
$out = $tpl
$out = $out -replace "(?m)^\s*NODE_ENV\s*=.*$", "NODE_ENV=production"
$out = $out -replace "(?m)^\s*WEB_BASE_URL\s*=.*$", ("WEB_BASE_URL=" + $web)
$out = $out -replace "(?m)^\s*STRIPE_SECRET_KEY\s*=.*$", ("STRIPE_SECRET_KEY=" + $sk)
$out = $out -replace "(?m)^\s*STRIPE_WEBHOOK_SECRET\s*=.*$", ("STRIPE_WEBHOOK_SECRET=" + $wh)

# 写入文件
Set-Content -LiteralPath $EnvFile -Value $out -Encoding UTF8
Write-Ok ("已生成： " + $EnvFile)

Write-Host ""
Write-Info "下一步：重启后端（或直接运行 boot_start.ps1）"
Write-Host "  - 后端 health： http://127.0.0.1:3001/api/v1/health" -ForegroundColor White
Write-Host "  - 确认输出里 stripe.mode = live，webhookConfigured = true" -ForegroundColor White
Write-Host ""

