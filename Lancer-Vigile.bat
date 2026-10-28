@echo off
rem Vigile — lancement local en un clic (Windows).
rem Ouvre le jeu dans le navigateur par defaut, servi par server.py.
setlocal
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
    echo Python 3 est introuvable.
    echo Installez-le depuis https://www.python.org/downloads/ ou servez ce dossier
    echo avec n'importe quel serveur statique, puis ouvrez http://127.0.0.1:8131/
    pause
    exit /b 1
)

start "Vigile — serveur" /min cmd /c python server.py 8131
timeout /t 2 >nul
start "" http://127.0.0.1:8131/
echo Vigile tourne sur http://127.0.0.1:8131/ — fermez la fenetre "Vigile - serveur" pour arreter.
