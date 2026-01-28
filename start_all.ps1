$root = "c:\Users\HP\Documents\15market"

Write-Host "Starting Keeper (Solana + Backend)..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\keeper'; npm start"

# Wait for LogBridge (Backend) to be ready
Start-Sleep -Seconds 5

Write-Host "Starting Arc Keeper..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\arc_keeper'; npm start"

Write-Host "Starting Admin Portal..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\15market-admin'; npm run dev"

Write-Host "Starting User UI..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\15market-ui'; npm run dev"

Write-Host "All services started."
