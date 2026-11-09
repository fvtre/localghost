$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $projectRoot '.localghost-logs'
New-Item -ItemType Directory -Path $logs -Force | Out-Null

function Test-LocalPort([int]$Port) {
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $client.Connect('127.0.0.1', $Port)
    return $client.Connected
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

if (-not (Test-Path (Join-Path $projectRoot 'node_modules/next/dist/bin/next'))) {
  throw 'Faltan dependencias de Node. Ejecuta pnpm install desde la carpeta de LocalGhost.'
}
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  throw 'Python no está instalado o no está en PATH.'
}

if (-not (Test-LocalPort 11434)) {
  $ollama = (Get-Command ollama -ErrorAction SilentlyContinue).Source
  if (-not $ollama) { throw 'Instala Ollama desde https://ollama.com/download.' }
  Start-Process -FilePath $ollama -ArgumentList 'serve' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'ollama.log') -RedirectStandardError (Join-Path $logs 'ollama-error.log') | Out-Null
}

if (-not (Test-LocalPort 8000)) {
  Start-Process -FilePath (Get-Command python).Source -ArgumentList 'services/whisper_cpu/server.py' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'whisper.log') -RedirectStandardError (Join-Path $logs 'whisper-error.log') | Out-Null
}

if (-not (Test-LocalPort 3000)) {
  Start-Process -FilePath (Get-Command node).Source -ArgumentList @('node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3000') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'next.log') -RedirectStandardError (Join-Path $logs 'next-error.log') | Out-Null
}

for ($attempt = 0; $attempt -lt 40; $attempt++) {
  if ((Test-LocalPort 11434) -and (Test-LocalPort 8000) -and (Test-LocalPort 3000)) { break }
  Start-Sleep -Seconds 1
}

if (-not (Test-LocalPort 11434)) { throw 'Ollama no respondió en 127.0.0.1:11434.' }
if (-not (Test-LocalPort 8000)) { throw 'Whisper no respondió en 127.0.0.1:8000. Revisa .localghost-logs/whisper-error.log.' }
if (-not (Test-LocalPort 3000)) { throw 'LocalGhost no respondió en 127.0.0.1:3000. Revisa .localghost-logs/next-error.log.' }

Write-Host 'LocalGhost Ligero está listo: http://127.0.0.1:3000' -ForegroundColor Cyan
try {
  Start-Process 'http://127.0.0.1:3000'
} catch {
  Write-Host 'Abre la URL anterior en tu navegador.' -ForegroundColor Yellow
}
