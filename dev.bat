@echo off
echo Starting FinSight AI...
echo.
echo Backend  -^> http://localhost:8000
echo Frontend -^> http://localhost:3000
echo Docs     -^> http://localhost:8000/docs
echo.
start "FinSight Backend" cmd /k "uvicorn app:app --host 0.0.0.0 --port 8000 --reload"
timeout /t 3 /nobreak >nul
start "FinSight Frontend" cmd /k "cd nivesh-frontend && npm run dev"
echo Both servers started in separate windows.
