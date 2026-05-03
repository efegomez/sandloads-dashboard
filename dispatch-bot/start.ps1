# Mata procesos viejos
Write-Host "Deteniendo procesos..."
Get-Process node,chrome,chromium -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 4

# Arranca el bot
Write-Host "Iniciando bot..."
npm start
