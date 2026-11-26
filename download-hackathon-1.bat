@echo off
REM Downloads the Hack-A-Thon 1.0 Instagram posts (photos + videos) into assets\hackathon-1
REM Run from the origin-site folder: double-click this file, or run it from cmd.
cd /d "%~dp0"
if not exist "assets\hackathon-1" mkdir "assets\hackathon-1"

echo Installing / updating gallery-dl and yt-dlp...
python -m pip install -U gallery-dl yt-dlp

REM Instagram needs you signed in. Log in to instagram.com in the browser below first.
REM If Chrome gives a cookie error, change BROWSER to firefox or edge.
set BROWSER=chrome

set URLS=https://www.instagram.com/p/DQGgivVk3LV/ https://www.instagram.com/p/DQRjGPEE6Df/ https://www.instagram.com/p/DQwVwnjE2qC/ https://www.instagram.com/p/DRUgNX5Ex6X/ https://www.instagram.com/p/DRpIkr4k7I4/ https://www.instagram.com/p/DRw3745k0q_/ https://www.instagram.com/p/DR4XUOdkwwy/ https://www.instagram.com/p/DTSc_eBEy36/

echo.
echo [1/2] gallery-dl: every photo and video in each post, carousels included
python -m gallery_dl --cookies-from-browser %BROWSER% -D "assets\hackathon-1" %URLS%

echo.
echo [2/2] yt-dlp: catches any video gallery-dl missed (skips files already there)
python -m yt_dlp --cookies-from-browser %BROWSER% --no-overwrites --ignore-errors -o "assets\hackathon-1\%%(id)s_%%(autonumber)s.%%(ext)s" %URLS%

echo.
echo Done. Files are in assets\hackathon-1
dir /b "assets\hackathon-1"
pause
