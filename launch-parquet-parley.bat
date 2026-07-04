@echo off
setlocal

cd /d "%~dp0"

echo Starting Parquet Parley...
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on PATH.
  echo Install Node.js, then run this launcher again.
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm.cmd was not found on PATH.
  echo Install Node.js with npm, then run this launcher again.
  pause
  exit /b 1
)

where cargo >nul 2>nul
if errorlevel 1 (
  echo Rust/Cargo was not found on PATH.
  echo Install Rust, then run this launcher again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing app dependencies...
  call npm.cmd install --cache "%CD%\.npm-cache"
  if errorlevel 1 (
    echo.
    echo Dependency installation failed.
    pause
    exit /b 1
  )
  echo.
)

set "CARGO_HOME=%CD%\cargo-home-root"
set "CARGO_TARGET_DIR=%CD%\src-tauri\target"

rem Helps some Windows setups where Git/Cargo fail through the default certificate backend.
set "CARGO_REGISTRIES_CRATES_IO_PROTOCOL=git"
set "CARGO_NET_GIT_FETCH_WITH_CLI=true"
set "GIT_CONFIG_COUNT=1"
set "GIT_CONFIG_KEY_0=http.sslBackend"
set "GIT_CONFIG_VALUE_0=openssl"

echo Launching desktop app...
echo.
call npm.cmd run tauri dev

if errorlevel 1 (
  echo.
  echo Parquet Parley did not launch successfully.
  echo If Cargo reports a certificate or credentials error, try running this file from a normal terminal session.
  pause
  exit /b 1
)

endlocal
