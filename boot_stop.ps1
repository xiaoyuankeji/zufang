$ErrorActionPreference = "SilentlyContinue"

Write-Output "=== Lierzufang stop ==="

# stop web (port 3000)
$p3000 = (netstat -ano | findstr ":3000" | findstr "LISTENING" | Select-Object -First 1)
if ($p3000) {
  $pid = ($p3000 -split "\s+")[-1]
  if ($pid) {
    Write-Output ("Stopping web PID " + $pid)
    Stop-Process -Id $pid -Force
  }
}

# stop backend (port 3001)
$p3001 = (netstat -ano | findstr ":3001" | findstr "LISTENING" | Select-Object -First 1)
if ($p3001) {
  $pid = ($p3001 -split "\s+")[-1]
  if ($pid) {
    Write-Output ("Stopping backend PID " + $pid)
    Stop-Process -Id $pid -Force
  }
}

# stop mongod (port 27018)
$p27018 = (netstat -ano | findstr ":27018" | findstr "LISTENING" | Select-Object -First 1)
if ($p27018) {
  $pid = ($p27018 -split "\s+")[-1]
  if ($pid) {
    Write-Output ("Stopping mongod PID " + $pid)
    Stop-Process -Id $pid -Force
  }
}

Write-Output "=== Done ==="


