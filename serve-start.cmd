@echo off
rem Start the tree-d dev server (port 8137) and open the app in the browser.
rem Safe to run when already started: the duplicate instance exits on its own
rem and the browser just opens the running server.
cd /d "%~dp0"
start "tree-d server" /min cmd /c "node tools\serve.mjs 8137"
ping -n 2 127.0.0.1 >nul
start "" http://127.0.0.1:8137/index.html
