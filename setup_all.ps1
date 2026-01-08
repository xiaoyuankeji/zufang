# Lierzufang Full Auto Setup Script
# Run this script as Administrator for best results

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   Lierzufang Full Auto Setup Protocol    " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check & Install Node.js
Write-Host "[1/4] Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node -v
    Write-Host "Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "Node.js NOT found. Downloading LTS version..." -ForegroundColor Red
    $nodeUrl = "https://nodejs.org/dist/v18.16.0/node-v18.16.0-x64.msi"
    $nodeInstaller = "$env:TEMP\node_install.msi"
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeInstaller
    Write-Host "Installing Node.js... (Please verify UAC)" -ForegroundColor Yellow
    Start-Process msiexec.exe -ArgumentList "/i $nodeInstaller /quiet" -Wait
    Write-Host "Node.js installed. You may need to restart script." -ForegroundColor Green
}

# 2. Check & Install Docker (Simplified check)
Write-Host "[2/4] Checking Docker..." -ForegroundColor Yellow
try {
    $dockerVersion = docker -v
    Write-Host "Docker found: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "Docker NOT found." -ForegroundColor Red
    Write-Host "Docker Desktop requires manual installation due to complexity and restart requirements."
    Write-Host "Please download from: https://www.docker.com/products/docker-desktop/"
    Write-Host "Continuing without Docker (Database might fail)..." -ForegroundColor Gray
}

# 3. Install Project Dependencies
Write-Host "[3/4] Installing Project Dependencies..." -ForegroundColor Yellow
if (Test-Path ".\server") {
    Push-Location ".\server"
    if (!(Test-Path "node_modules")) {
        Write-Host "Installing npm packages for server..."
        npm install
    } else {
        Write-Host "Dependencies already installed."
    }
    Pop-Location
} else {
    Write-Host "Error: 'server' directory not found!" -ForegroundColor Red
    exit
}

# 4. Start Everything
Write-Host "[4/4] Starting Services..." -ForegroundColor Yellow

# Start Database (if Docker exists)
try {
    docker ps > $null 2>&1
    if ($?) {
        Write-Host "Starting MongoDB via Docker..."
        docker-compose up -d
        Write-Host " > MongoDB: port 27018" -ForegroundColor Green
        Write-Host " > Admin UI: http://localhost:8081 (admin/password)" -ForegroundColor Green
    } else {
        Write-Host "Docker daemon not running. Skipping DB start." -ForegroundColor Red
    }
} catch {
    Write-Host "Docker check failed." -ForegroundColor Red
}

# Start Backend Server in a new window
Write-Host "Starting Backend Server..."
Start-Process "cmd.exe" -ArgumentList "/c cd server && npm start"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   ALL SYSTEMS GO!                        " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "1. Backend API running in new window."
Write-Host "2. Frontend available at index.html."
Write-Host "3. Landlord Admin at landlord.html."
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")





