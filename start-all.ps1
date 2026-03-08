# ============================================================================
# ARIA — Full Stack Startup Script
# Start Docker infrastructure, Backend API, Frontend App, and Celery Worker
# ============================================================================

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "    ARIA Full Stack Startup Script      " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# --- Step 1: Start Docker Infrastructure ---
Write-Host "[1/4] Starting Docker infrastructure (PostgreSQL, PgBouncer, Redis)..." -ForegroundColor Yellow
try {
    docker compose up -d
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: Docker Compose failed. Make sure Docker is running." -ForegroundColor Red
        exit 1
    }
    Write-Host "  OK: Docker services started/already running." -ForegroundColor Green
}
catch {
    Write-Host "  ERROR: Docker command failed." -ForegroundColor Red
    exit 1
}

# --- Step 2: Start Backend ---
Write-Host ""
Write-Host "[2/4] Starting Backend (Express API) in a new window..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "$host.UI.RawUI.WindowTitle = 'ARIA Backend'; cd backend; npm run dev"

# Wait a moment for the backend migrations to run before frontend hits it
Start-Sleep -Seconds 5

# --- Step 3: Start Frontend ---
Write-Host ""
Write-Host "[3/4] Starting Frontend (Vite/React) in a new window..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "$host.UI.RawUI.WindowTitle = 'ARIA Frontend'; cd frontend; npm run dev"

# --- Step 4: Start Celery Worker ---
Write-Host ""
Write-Host "[4/4] Starting Celery Worker (Python) in a new window..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "$host.UI.RawUI.WindowTitle = 'ARIA Celery Worker'; cd worker; celery -A aria_worker worker -l INFO -E"

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  ✅ All ARIA services have been launched!" -ForegroundColor Green
Write-Host "  - Backend (Port 3001)"
Write-Host "  - Frontend (Port 5173)"
Write-Host "  - Celery Worker (Task Consumer)"
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
