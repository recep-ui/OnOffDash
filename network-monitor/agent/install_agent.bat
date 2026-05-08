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
echo OnOffDash Agent - Gizli Servis Kurulum Sihirbazi
echo ===================================================
echo.

set TARGET_DIR=C:\Program Files\OnOffDash_Agent
set EXE_NAME=OnOffDash_Agent.exe
set TASK_NAME=OnOffDash_Agent_Service

:: 1. Klasoru olustur
if not exist "%TARGET_DIR%" (
    echo [1/4] Kurulum dizini olusturuluyor: %TARGET_DIR%
    mkdir "%TARGET_DIR%"
) else (
    echo [1/4] Kurulum dizini zaten mevcut.
)

:: 2. Exe dosyasini kopyala
if exist "%~dp0%EXE_NAME%" (
    echo [2/4] Ajan dosyasi kopyalaniyor...
    copy /Y "%~dp0%EXE_NAME%" "%TARGET_DIR%\%EXE_NAME%" >nul
) else (
    echo [HATA] %EXE_NAME% ayni klasorde bulunamadi! Lutfen once pkg ile exe'yi olusturdugunuzdan emin olun.
    pause
    exit /b 1
)

:: 3. Eski gorev varsa sil
schtasks /query /tn "%TASK_NAME%" >nul 2>&1
if %errorLevel% equ 0 (
    echo [3/4] Eski servis kaydi temizleniyor...
    schtasks /delete /tn "%TASK_NAME%" /f >nul
) else (
    echo [3/4] Yeni servis kaydi hazirlaniyor...
)

:: 4. Zamanlanmis gorev (Scheduled Task) ekle
:: /ru "SYSTEM" parametresi sayesinde kullanici ekraninda hicbir sey gozukmez (Tamamen gizli calisir).
:: /sc ONSTART sayesinde bilgisayar her acildiginda otomatik baslar.
echo [4/4] Arka plan servisi Windows'a kaydediliyor...
set FULL_EXE_PATH=%TARGET_DIR%\%EXE_NAME%
schtasks /create /tn "%TASK_NAME%" /tr "\"!FULL_EXE_PATH!\"" /sc onstart /ru "SYSTEM" /rl HIGHEST /f >nul

:: Servisi hemen baslat
echo.
echo Servis su anda baslatiliyor...
schtasks /run /tn "%TASK_NAME%" >nul

echo.
echo ===================================================
echo [BASARILI] Kurulum tamamlandi!
echo Artik "OnOffDash_Agent" arka planda SYSTEM yetkisiyle,
echo kullanicilardan tamamen gizli bir sekilde calisacaktir.
echo Bilgisayar yeniden baslatilsa dahi otomatik devreye girecektir.
echo ===================================================
pause
