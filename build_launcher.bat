@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ============================================
echo   Family Health Platform — 打包启动器为 .exe
echo ============================================
echo.

REM 1. 确保 PyInstaller 已安装
pip show pyinstaller >nul 2>&1
if errorlevel 1 (
    echo [INSTALL] 正在安装 PyInstaller …
    pip install pyinstaller
)

REM 2. 打包（用 python -m 调用，避免 Scripts 不在 PATH 的问题）
echo [BUILD] 正在打包 launcher.py → FamilyHealth.exe …
python -m PyInstaller --onefile --noconsole --name FamilyHealth --clean launcher.py

echo.
if exist "dist\FamilyHealth.exe" (
    echo [OK] 打包成功！
    echo     输出文件: dist\FamilyHealth.exe
    echo.
    echo     使用方法:
    echo       把 FamilyHealth.exe 复制到项目根目录，双击即可启动。
    echo       也可以把整个项目目录打包给其他用户，只要双击 .exe 即可。
) else (
    echo [ERROR] 打包失败，请检查上方日志。
)

echo.
pause
endlocal
