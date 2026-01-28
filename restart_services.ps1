Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   15MARKET GLOBAL RESET PROTOCOL" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

Write-Host "🛑 Terminating all Node.js processes..." -ForegroundColor Yellow
Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "🧹 Verifying port release..." -ForegroundColor Yellow
# Optional: netstat check could go here, but killing node usually suffices

Write-Host "🚀 Launching Services Sequence..." -ForegroundColor Green

# 1. Keeper Service (Port 8080)
Write-Host "   [1/4] Starting General Keeper (Port 8080)..." -ForegroundColor White
Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", "& {cd keeper; node src/index.js}" -WindowStyle Minimized
Start-Sleep -Seconds 5

# 2. Arc Keeper Service (RPC Worker)
Write-Host "   [2/4] Starting Arc Keeper..." -ForegroundColor White
Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", "& {cd arc_keeper; npm start}" -WindowStyle Minimized
Start-Sleep -Seconds 5

# 3. User Interface (Port 3000)
Write-Host "   [3/4] Starting User App (Port 3000)..." -ForegroundColor White
Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", "& {cd 15market-ui; npm run dev}" -WindowStyle Normal

# 4. Admin Portal (Port 3001)
Write-Host "   [4/4] Starting Admin Portal (Port 3001)..." -ForegroundColor White
Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", "& {cd 15market-admin; npm run dev}" -WindowStyle Normal

Write-Host "✅ SYSTEM RESTART COMPLETE" -ForegroundColor Green
Write-Host "   - Monitor the opened windows for logs"
Write-Host "   - Access Admin at http://localhost:3001"
