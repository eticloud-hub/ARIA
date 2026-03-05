# ============================================================================
# ARIA — Development Startup Script
# Starts all infrastructure + backend in the correct order.
# Usage: .\start-dev.ps1
# ============================================================================

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ARIA Development Environment Startup  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# --- Step 1: Start Docker services ---
Write-Host "[1/3] Starting Docker services (PostgreSQL, Redis, MinIO)..." -ForegroundColor Yellow

try {
    docker compose up -d
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: Docker Compose failed. Is Docker Desktop running?" -ForegroundColor Red
        exit 1
    }
    Write-Host "  OK: Docker services started." -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Docker not found. Install Docker Desktop first." -ForegroundColor Red
    exit 1
}

# --- Step 2: Wait for services to be ready ---
Write-Host ""
Write-Host "[2/3] Waiting 3 seconds for services to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 3
Write-Host "  OK: Services should be ready." -ForegroundColor Green

# --- Step 3: Start backend ---
Write-Host ""
Write-Host "[3/3] Starting Express backend on port 3001..." -ForegroundColor Yellow
Write-Host ""

Set-Location -Path "$PSScriptRoot\backend"
npm run dev
