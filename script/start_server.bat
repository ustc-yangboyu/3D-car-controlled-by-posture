@echo off
chcp 65001 >nul
echo ========================================
echo   VR Driving Game Server
echo ========================================
echo.

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%.."

echo [Tips] Activating conda environment pytorch_py_3.13...
call D:\Programs\Miniconda3\Scripts\activate.bat pytorch_py_3.13

python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Can't find Python, please install Python 3.8+
    pause
    exit /b 1
)

echo [1/3] Checking dependencies...
pip show fastapi >nul 2>&1
if errorlevel 1 (
    echo [Tips] Installing dependencies for Python...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies, please check your network or try again later.
        pause
        exit /b 1
    )
)

echo [2/3] Dependencise check done.

if not exist "model" (
    mkdir model
    echo [Tips] Created model directory.
)

echo [3/3] Starting server...
echo.
echo Access http://localhost:8000 to start the game.
echo Press Ctrl+C to stop the server.
echo.

uvicorn src.game_server:app --host 127.0.0.1 --port 8000

pause