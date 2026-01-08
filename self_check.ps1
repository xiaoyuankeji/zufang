$ErrorActionPreference = "Continue"

function Write-Section($title) {
  Write-Host ""
  Write-Host ("=== " + $title + " ===")
}

function Test-Listening($port) {
  $out = (netstat -ano | findstr (":" + $port) | findstr "LISTENING") 2>$null
  return [bool]$out
}

function Try-HttpJson($url) {
  try {
    $res = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 $url
    $body = $res.Content
    $json = $null
    try { $json = $body | ConvertFrom-Json } catch { $json = $null }
    return @{ ok = $true; status = $res.StatusCode; json = $json; text = $body }
  } catch {
    return @{ ok = $false; error = ($_.Exception.Message) }
  }
}

Write-Section "Port listening check"
$ports = @(27018, 3001, 3000)
foreach ($p in $ports) {
  $listening = Test-Listening $p
  Write-Host ("Port " + $p + ": " + ($(if ($listening) { "LISTENING" } else { "NOT LISTENING" })))
}

Write-Section "Backend health check"
$health = Try-HttpJson "http://127.0.0.1:3001/api/v1/health"
if ($health.ok) {
  $mongoConnected = $false
  try { $mongoConnected = [bool]$health.json.data.mongo.connected } catch { $mongoConnected = $false }
  Write-Host ("GET /api/v1/health: " + $health.status + " OK")
  Write-Host ("Mongo connected: " + ($(if ($mongoConnected) { "YES" } else { "NO" })))
} else {
  Write-Host ("GET /api/v1/health: FAILED  " + $health.error)
}

Write-Section "Listings API check"
$listings = Try-HttpJson "http://127.0.0.1:3001/api/v1/listings"
if ($listings.ok) {
  $count = 0
  try { $count = ($listings.json.data.listings | Measure-Object).Count } catch { $count = 0 }
  Write-Host ("GET /api/v1/listings: " + $listings.status + " OK  count=" + $count)
} else {
  Write-Host ("GET /api/v1/listings: FAILED  " + $listings.error)
}

Write-Section "Frontend page check"
$web = Try-HttpJson "http://127.0.0.1:3000/landlord.html"
if ($web.ok) {
  Write-Host ("GET /landlord.html (3000): " + $web.status + " OK")
} else {
  Write-Host ("GET /landlord.html (3000): FAILED  " + $web.error)
}

Write-Section "Next steps"
Write-Host "1) Double-click boot_start.ps1 to start MongoDB/backend/frontend"
Write-Host "2) Open: http://localhost:3000/index.html and http://localhost:3000/landlord.html"
Write-Host "3) Do NOT use file://, it will often cause Failed to fetch"


