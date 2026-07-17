@echo off
rem Stop the tree-d dev server started by serve-start.cmd.
cd /d "%~dp0"
if not exist tools\.serve.pid goto byport
set /p SPID=<tools\.serve.pid
taskkill /pid %SPID% /f >nul 2>&1
del tools\.serve.pid >nul 2>&1
echo tree-d server stopped (pid %SPID%).
goto :eof

:byport
echo No pid file - looking for a listener on port 8137...
set FOUND=
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8137 " ^| findstr LISTENING') do (
    taskkill /pid %%p /f >nul 2>&1
    set FOUND=%%p
)
if defined FOUND (echo Stopped listener pid %FOUND%.) else (echo Nothing running on 8137.)
