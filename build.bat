@echo off
echo Building SAP Integration Automation MTA...

echo.
echo [1/6] Installing root dependencies...
call npm install
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo [2/6] Building client...
cd client
call npm install
call npm run build
cd ..
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo [3/6] Installing server dependencies...
cd server
call npm install
cd ..
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo [4/6] Installing approuter dependencies...
cd approuter
call npm install
cd ..
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo [5/6] Copying client dist to approuter resources...
if not exist "approuter\resources" mkdir "approuter\resources"
xcopy /E /I /Y "client\dist\*" "approuter\resources\"
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo [6/6] Building database...
cd db
call npm install
cd ..
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ============================================
echo Build completed successfully!
echo.
echo Now deploy using:
echo   cf deploy
echo or install make and run:
echo   mbt build
echo ============================================
