# Lierzufang Ultimate Setup with Embedded MongoDB
# Run this script to auto-download and start MongoDB + Backend

$ErrorActionPreference = "Stop"
$ProjectRoot = Get-Location
$MongoUrl = "https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-7.0.2.zip"
$MongoZip = "$ProjectRoot\mongodb.zip"
$MongoDir = "$ProjectRoot\mongodb_bin"
$DataDir = "$ProjectRoot\mongo-data"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "   AUTO SETUP: MongoDB + Node.js Environment " -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# 1. Prepare Data Directory
if (-not (Test-Path $DataDir)) {
    New-Item -ItemType Directory -Path $DataDir | Out-Null
    Write-Host "[OK] Created data directory: $DataDir" -ForegroundColor Green
}

# 2. Check/Download MongoDB
if (-not (Test-Path "$MongoDir\bin\mongod.exe")) {
    Write-Host "[...] Downloading MongoDB (this may take a minute)..." -ForegroundColor Yellow
    try {
        Invoke-WebRequest -Uri $MongoUrl -OutFile $MongoZip
        Write-Host "[OK] Download complete." -ForegroundColor Green
        
        Write-Host "[...] Extracting MongoDB..." -ForegroundColor Yellow
        Expand-Archive -Path $MongoZip -DestinationPath $MongoDir -Force
        
        # Move files from nested dir if necessary
        $NestedDir = Get-ChildItem -Path $MongoDir -Directory | Select-Object -First 1
        if ($NestedDir.Name -like "mongodb-*") {
            Move-Item -Path "$($NestedDir.FullName)\bin" -Destination "$MongoDir" -Force
            Remove-Item -Path $NestedDir.FullName -Recurse -Force
        }
        
        Remove-Item $MongoZip -Force
        Write-Host "[OK] MongoDB installed locally." -ForegroundColor Green
    } catch {
        Write-Host "[ERROR] Failed to download MongoDB. Please check internet connection." -ForegroundColor Red
        exit
    }
} else {
    Write-Host "[OK] MongoDB already installed." -ForegroundColor Green
}

# 3. Start MongoDB
Write-Host "[...] Starting MongoDB Server (Port 27018)..." -ForegroundColor Yellow
$MongoProcess = Start-Process -FilePath "$MongoDir\bin\mongod.exe" -ArgumentList "--dbpath `"$DataDir`" --port 27018 --bind_ip 127.0.0.1" -PassThru -WindowStyle Minimized
if ($MongoProcess.Id) {
    Write-Host "[OK] MongoDB is running (PID: $($MongoProcess.Id))." -ForegroundColor Green
} else {
    Write-Host "[ERROR] Failed to start MongoDB." -ForegroundColor Red
    exit
}

# 4. Check/Install Node.js Dependencies
Write-Host "[...] Checking Backend Dependencies..." -ForegroundColor Yellow
Set-Location "$ProjectRoot\server"
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing npm packages..."
    npm install
}
Write-Host "[OK] Dependencies ready." -ForegroundColor Green

# 5. Configure Backend to use Local MongoDB
$ConfigFile = "$ProjectRoot\server\index.js"
$ConfigContent = Get-Content $ConfigFile
# Ensure it connects to our local port 27018 without auth
$NewConfig = $ConfigContent -replace "mongodb://admin:password@localhost:27018", "mongodb://localhost:27018"
$NewConfig = $NewConfig -replace "global.useMockDB = true", "global.useMockDB = false"
$NewConfig | Set-Content $ConfigFile
Write-Host "[OK] Backend configured for local MongoDB." -ForegroundColor Green

# 6. Start Backend
Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "   SYSTEM READY! STARTING SERVER...          " -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "MongoDB is running in background."
Write-Host "Backend API starting now..."
Write-Host ""

npm start





