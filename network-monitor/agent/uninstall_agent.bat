@echo off
setlocal EnableDelayedExpansion

:: Administrator yetkisi kontrolü
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [HATA] Bu scriptin calisabilmesi icin Yonetici ^(Administrator^) yetkisine sahip olmasi gerekiyor!
    echo Lutfen dosyaya sag tiklayip "Yonetici olarak calistir" secenegini secin.
    pause
    exit /b 1
)

echo ===================================================
echo OnOffDash Agent - Servis Kaldirma Araci
echo ===================================================
echo.

set TARGET_DIR=C:\Program Files\OnOffDash_Agent
set TASK_NAME=OnOffDash_Agent_Service

:: 1. Gorevi (Servisi) Durdur ve Sil
echo [1/2] Arka plan servisi durduruluyor ve siliniyor...
schtasks /end /tn "%TASK_NAME%" >nul 2>&1
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

:: 2. Klasoru Sil
if exist "%TARGET_DIR%" (
    echo [2/2] Ajan dosyalari sistemden kaldiriliyor...
    rmdir /S /Q "%TARGET_DIR%" >nul 2>&1
) else (
    echo [2/2] Hedef klasor zaten mevcut degil.
)

echo.
echo ===================================================
echo [BASARILI] OnOffDash Agent bilgisayardan tamamen kaldirildi!
echo ===================================================
pause
