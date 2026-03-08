@echo off
echo Starting Destini Guide Backend Server...
echo.
echo Make sure you have set your GOOGLE_API_KEY environment variable for full functionality:
echo PowerShell: $env:GOOGLE_API_KEY = "AIzaSyAl9oaNveCHXXX7KJnZ64G31GDW3PEaSXo"
echo Command Prompt: set GOOGLE_API_KEY=AIzaSyAl9oaNveCHXXX7KJnZ64G31GDW3PEaSXo
echo.
echo Server will be available at http://127.0.0.1:8000
echo Frontend is in frontend.html
echo.
uvicorn server_fastapi:app --reload