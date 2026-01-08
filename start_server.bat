@echo off
echo ==========================================
echo    Lierzufang Landlord System Launcher
echo ==========================================

echo.
echo [1/3] Checking Docker Environment...
docker -v >nul 2>&1
if %errorlevel% neq 0 (
    echo Warning: Docker is NOT installed or not in PATH.
    echo Database will not start automatically.
    echo Please install Docker Desktop if you want data persistence.
) else (
    echo Docker found. Starting MongoDB containers...
    docker-compose up -d
    if %errorlevel% neq 0 (
        echo Failed to start Docker containers.
        echo Try running 'docker-compose up -d' manually to see errors.
    ) else (
        echo MongoDB started on port 27018.
        echo Mongo-Express (Admin GUI) started on http://localhost:8081
        echo   User: admin
        echo   Pass: password
    )
)

echo.
echo [2/3] Installing Backend Dependencies...
cd server
if not exist node_modules (
    call npm install
)

echo.
echo [3/3] Starting Backend Server...
echo API will run at http://localhost:3001
echo.
echo Press Ctrl+C to stop the server.
echo.

npm start
pause
