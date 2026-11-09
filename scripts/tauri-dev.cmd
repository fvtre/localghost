@echo off
setlocal
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" (
  echo No se encontro Visual Studio Build Tools. Instala la carga "Desarrollo para el escritorio con C++".
  exit /b 1
)
for /f "usebackq tokens=*" %%I in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VS_INSTALL=%%I"
if not defined VS_INSTALL (
  echo No se encontro MSVC x64. Modifica Visual Studio Build Tools e instala MSVC y Windows SDK.
  exit /b 1
)
call "%VS_INSTALL%\Common7\Tools\VsDevCmd.bat" -arch=x64
if errorlevel 1 exit /b %errorlevel%
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
set "PROJECT_ROOT=%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -Command "$listener = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue; if (-not $listener) { if (-not (Get-Command python -ErrorAction SilentlyContinue)) { Write-Host 'Whisper local requiere Python en PATH.' -ForegroundColor Yellow } else { $logDir = Join-Path '%PROJECT_ROOT%' '.localghost-logs'; New-Item -ItemType Directory -Path $logDir -Force | Out-Null; Start-Process -FilePath (Get-Command python).Source -ArgumentList 'services/whisper_cpu/server.py' -WorkingDirectory '%PROJECT_ROOT%' -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'whisper.log') -RedirectStandardError (Join-Path $logDir 'whisper-error.log') } }"
"%~dp0..\node_modules\.bin\tauri.CMD" dev
exit /b %errorlevel%
