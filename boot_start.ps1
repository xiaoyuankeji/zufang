$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

# Try to create an ASCII-only junction to avoid unicode path issues in some shells/tools.
# Example: F:\lierzufang1216_ascii -> F:\法国房屋\网站建设\里尔租房\lierzufang1216
$Drive = Split-Path -Qualifier $Root
$AsciiRoot = Join-Path $Drive "lierzufang1216_ascii"
$AsciiProbe = Join-Path $AsciiRoot "server\\index.js"

function Ensure-AsciiJunction() {
  try {
    if (Test-Path $AsciiRoot) {
      # If junction/folder exists but doesn't contain expected files, recreate it (it may be broken)
      if (!(Test-Path $AsciiProbe)) {
        Write-Output ("[WARN] Junction exists but looks broken (missing " + $AsciiProbe + "). Recreating...")
        try { Remove-Item -LiteralPath $AsciiRoot -Force -Recurse } catch {}
        Start-Sleep -Milliseconds 200
      }
    }

    if (!(Test-Path $AsciiRoot)) {
      New-Item -ItemType Junction -Path $AsciiRoot -Target $Root | Out-Null
      Write-Output ("[OK] Junction created: " + $AsciiRoot)
    } else {
      Write-Output ("[OK] Junction ready: " + $AsciiRoot)
    }
  } catch {
    Write-Output ("[WARN] Failed to ensure junction: " + $_.Exception.Message)
  }
}

Ensure-AsciiJunction
$RunRoot = $(if (Test-Path $AsciiProbe) { $AsciiRoot } else { $Root })
$ServerEntry = Join-Path $RunRoot "server\index.js"

# IMPORTANT:
# Use $RunRoot for ALL paths (dbpath/logs/mongod.exe) so MongoDB and log redirection
# never touch Unicode paths (mongod + some shells can choke on it on Windows).
$MongoExe = Join-Path $RunRoot "mongodb_bin\bin\mongod.exe"
$MongoData = Join-Path $RunRoot "mongo-data"
$MongoOutLog = Join-Path $RunRoot "logs\mongod.out.log"
$MongoErrLog = Join-Path $RunRoot "logs\mongod.err.log"
$ApiOutLog = Join-Path $RunRoot "logs\api.out.log"
$ApiErrLog = Join-Path $RunRoot "logs\api.err.log"
$WebOutLog = Join-Path $RunRoot "logs\web.out.log"
$WebErrLog = Join-Path $RunRoot "logs\web.err.log"

function Test-Listening($port) {
  $out = (netstat -ano | findstr (":" + $port) | findstr "LISTENING") 2>$null
  return [bool]$out
}

function Get-ListeningPid($port) {
  $line = (netstat -ano | findstr (":" + $port) | findstr "LISTENING" | Select-Object -First 1) 2>$null
  if ($line) {
    $procId = ($line -split "\s+")[-1]
    return $procId
  }
  return $null
}

function Kill-Port($port) {
  $procId = Get-ListeningPid $port
  if ($procId) {
    Write-Output ("[WARN] Port " + $port + " is in use by PID " + $procId + " -> stopping it")
    try { Stop-Process -Id $procId -Force } catch { Write-Output ("[WARN] Failed to stop PID " + $procId + ": " + $_.Exception.Message) }
    Start-Sleep -Seconds 1
  }
}

Write-Output "=== Lierzufang autostart ==="
Write-Output ("Root: " + $Root)
Write-Output ("RunRoot: " + $RunRoot)

# Stripe config hint (no secrets; keep ASCII-only to avoid encoding issues)
try {
  $envPath = Join-Path $RunRoot "server\.env"
  if (Test-Path $envPath) {
    $envText = (Get-Content -LiteralPath $envPath -Raw)
    $mode = "unknown"
    if ($envText -match "STRIPE_SECRET_KEY\s*=\s*sk_live_") { $mode = "live" }
    elseif ($envText -match "STRIPE_SECRET_KEY\s*=\s*sk_test_") { $mode = "test" }
    Write-Output ("[INFO] Stripe mode: " + $mode + " (from server/.env)")
    if ($mode -eq "test") {
      Write-Output "[WARN] Stripe is in TEST mode; real cards will be rejected in Checkout."
      Write-Output "[WARN] Run: powershell -ExecutionPolicy Bypass -File server\\scripts\\setup_stripe_live.ps1"
    }
  } else {
    Write-Output "[WARN] server/.env not found (Stripe config may be missing)."
    Write-Output "[WARN] Run: powershell -ExecutionPolicy Bypass -File server\\scripts\\setup_stripe_live.ps1"
  }
} catch {}

# ensure logs dir
$LogsDir = Join-Path $RunRoot "logs"
if (!(Test-Path $LogsDir)) { New-Item -ItemType Directory -Path $LogsDir | Out-Null }

# 1) Start MongoDB if not running
if (Test-Listening 27018) {
  Write-Output "[OK] MongoDB already listening on 27018"
} else {
  if (!(Test-Path $MongoExe)) { throw "MongoDB not found: $MongoExe" }
  if (!(Test-Path $MongoData)) { New-Item -ItemType Directory -Path $MongoData | Out-Null }

  Write-Output "[...] Starting MongoDB on 127.0.0.1:27018"
  Start-Process -FilePath $MongoExe `
    -ArgumentList "--dbpath `"$MongoData`" --port 27018 --bind_ip 127.0.0.1" `
    -RedirectStandardOutput $MongoOutLog `
    -RedirectStandardError $MongoErrLog | Out-Null

  # mongod may take a few seconds to open the listener (especially after unclean shutdown recovery)
  $maxWait = 12
  $ok = $false
  for ($i = 0; $i -lt $maxWait; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Listening 27018) { $ok = $true; break }
  }
  if (!$ok) { throw "MongoDB failed to start (27018 not listening)" }
  Write-Output "[OK] MongoDB started"
}

# Make sure web/api ports are free (avoid serve choosing random port, and avoid stale backend)
Kill-Port 3000
Kill-Port 3001

# 2) Start backend if not running
if (Test-Listening 3001) {
  Write-Output "[OK] Backend already listening on 3001"
} else {
  Write-Output "[...] Starting backend API on 127.0.0.1:3001"
  # run node directly to avoid npm wrapper
  Start-Process -FilePath "node" `
    -ArgumentList "`"$ServerEntry`"" `
    -RedirectStandardOutput $ApiOutLog `
    -RedirectStandardError $ApiErrLog | Out-Null

  # Node/Express may need a moment to boot; poll for a few seconds to avoid false negatives.
  $maxWait = 8
  $ok = $false
  for ($i = 0; $i -lt $maxWait; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Listening 3001) { $ok = $true; break }
  }
  if (!$ok) {
    Write-Output "[ERR] Backend failed to start (3001 not listening). Last api.log lines:"
    if (Test-Path $ApiOutLog) { Get-Content $ApiOutLog -Tail 50 | ForEach-Object { Write-Output $_ } }
    if (Test-Path $ApiErrLog) { Get-Content $ApiErrLog -Tail 50 | ForEach-Object { Write-Output $_ } }
    throw "Backend failed to start (3001 not listening)"
  }
  Write-Output "[OK] Backend started"
}

# 3) Start frontend static server if not running
if (Test-Listening 3000) {
  Write-Output "[OK] Web already listening on 3000"
} else {
  Write-Output "[...] Starting web on http://127.0.0.1:3000 (serve .)"
  Start-Process -FilePath "npx" `
    -ArgumentList "-y serve `"$RunRoot`" -l 3000" `
    -RedirectStandardOutput $WebOutLog `
    -RedirectStandardError $WebErrLog | Out-Null

  # npx/serve may take a moment to boot; poll for a few seconds to avoid false negatives.
  $maxWait = 8
  $ok = $false
  for ($i = 0; $i -lt $maxWait; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Listening 3000) { $ok = $true; break }
  }
  if (!$ok) {
    Write-Output "[ERR] Web failed to start (3000 not listening). Last web logs:"
    if (Test-Path $WebOutLog) { Get-Content $WebOutLog -Tail 50 | ForEach-Object { Write-Output $_ } }
    if (Test-Path $WebErrLog) { Get-Content $WebErrLog -Tail 50 | ForEach-Object { Write-Output $_ } }
    throw "Web failed to start (3000 not listening)"
  }
  Write-Output "[OK] Web started"
}

Write-Output "=== Done ==="
Write-Output ""
Write-Output "Open in browser (DO NOT use file://):"
Write-Output "  - http://localhost:3000/index.html"
Write-Output "  - http://localhost:3000/landlord.html"
Write-Output "Backend health:"
Write-Output "  - http://127.0.0.1:3001/api/v1/health"


