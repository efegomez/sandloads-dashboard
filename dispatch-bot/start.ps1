# Mata procesos viejos
Get-Process node,chrome,chromium -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3

# Arranca el bot
npm start
