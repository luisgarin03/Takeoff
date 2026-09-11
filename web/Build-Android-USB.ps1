param(
    [string]$DeviceSerial,
    [switch]$CheckOnly,
    [switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Checked {
    param(
        [string]$Executable,
        [string[]]$Arguments
    )

    & $Executable @Arguments

    if ($LASTEXITCODE -ne 0) {
        throw "$Executable failed (exit $LASTEXITCODE). See the output above."
    }
}

Push-Location $PSScriptRoot

try {
    #
    # Locate Node / npm
    #
    $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
    $node = (Get-Command node.exe -ErrorAction Stop).Source

    #
    # Project tools
    #
    $gradle = Join-Path $PSScriptRoot 'android\gradlew.bat'
    $capacitor = Join-Path $PSScriptRoot 'node_modules\.bin\cap.cmd'

    foreach ($required in @($gradle, $capacitor)) {
        if (-not (Test-Path -LiteralPath $required)) {
            throw "Required file missing: $required. Install the project's dependencies and Android platform first."
        }
    }

    #
    # Java / JDK
    #
    # Always prefer Android Studio's bundled JDK.
    # This avoids Windows falling back to an older system Java installation.
    #
    $studioJava = Join-Path $env:ProgramFiles 'Android\Android Studio\jbr'
    $studioJavaExe = Join-Path $studioJava 'bin\java.exe'

    if (Test-Path -LiteralPath $studioJavaExe) {
        $env:JAVA_HOME = $studioJava

        $javaBin = Join-Path $studioJava 'bin'

        if (-not (($env:Path -split ';') -contains $javaBin)) {
            $env:Path = "$javaBin;$env:Path"
        }

        $java = $studioJavaExe

        Write-Host 'Using Android Studio JDK:' -ForegroundColor Cyan
        Write-Host "  $env:JAVA_HOME" -ForegroundColor Green
    }
    elseif ($env:JAVA_HOME) {
        $java = Join-Path $env:JAVA_HOME 'bin\java.exe'

        if (-not (Test-Path -LiteralPath $java)) {
            throw "JAVA_HOME is invalid: $env:JAVA_HOME"
        }

        Write-Host 'Android Studio JDK not found. Using JAVA_HOME:' -ForegroundColor Yellow
        Write-Host "  $env:JAVA_HOME"
    }
    else {
        $java = (Get-Command java.exe -ErrorAction Stop).Source

        Write-Host 'Android Studio JDK and JAVA_HOME were not found. Using Java from PATH:' -ForegroundColor Yellow
        Write-Host "  $java"
    }

    #
    # Find Android SDK / ADB
    #
    $sdkCandidates = @(
        $env:ANDROID_HOME,
        $env:ANDROID_SDK_ROOT,
        (Join-Path $env:LOCALAPPDATA 'Android\Sdk')
    )

    $adb = $null

    foreach ($sdk in $sdkCandidates) {
        if ($sdk) {
            $candidate = Join-Path $sdk 'platform-tools\adb.exe'

            if (Test-Path -LiteralPath $candidate) {
                $adb = $candidate
                break
            }
        }
    }

    if (-not $adb) {
        $adb = (Get-Command adb.exe -ErrorAction Stop).Source
    }

    #
    # Tool checks
    #
    Write-Host ''
    Write-Host 'Checking build tools...' -ForegroundColor Cyan

    Write-Host 'Node:'
    Invoke-Checked $node @('--version')

    Write-Host 'npm:'
    Invoke-Checked $npm @('--version')

    Write-Host 'Java:'
    Invoke-Checked $java @('-version')

    Write-Host ''
    Write-Host 'Starting ADB...' -ForegroundColor Cyan
    Invoke-Checked $adb @('start-server')

    Write-Host ''
    Write-Host 'Connected Android devices:' -ForegroundColor Cyan
    Invoke-Checked $adb @('devices', '-l')

    #
    # Select USB-connected Android device
    #
    # -d selects a USB device and rejects ambiguous emulator/device situations.
    #
    $selector = @('-d')

    if ($DeviceSerial) {
        $selector = @('-s', $DeviceSerial)
    }

    $serialOutput = & $adb @selector get-serialno 2>&1

    if (
        $LASTEXITCODE -ne 0 -or
        "$serialOutput".Trim() -eq 'unknown' -or
        [string]::IsNullOrWhiteSpace("$serialOutput")
    ) {
        throw "No unique authorized phone was found. Connect a USB data cable, enable USB debugging, unlock the phone and accept its authorization prompt. For multiple phones, rerun with -DeviceSerial SERIAL. Details: $serialOutput"
    }

    $connectedSerial = "$serialOutput".Trim()
    $selector = @('-s', $connectedSerial)

    $state = & $adb @selector get-state 2>&1

    if ($LASTEXITCODE -ne 0 -or "$state".Trim() -ne 'device') {
        throw "Phone $connectedSerial is not ready: $state"
    }

    Write-Host ''
    Write-Host "Target phone: $connectedSerial" -ForegroundColor Green

    #
    # Check-only mode
    #
    if ($CheckOnly) {
        Write-Host ''
        Write-Host 'Checks passed. No build, sync, or installation performed.' -ForegroundColor Green
        return
    }

    #
    # Build web application
    #
    Write-Host ''
    Write-Host 'Building web application...' -ForegroundColor Cyan
    Invoke-Checked $npm @('run', 'build')

    #
    # Sync Capacitor Android project
    #
    Write-Host ''
    Write-Host 'Syncing Capacitor Android...' -ForegroundColor Cyan
    Invoke-Checked $capacitor @('sync', 'android')

    #
    # Build Android debug APK
    #
    Write-Host ''
    Write-Host 'Building debug APK...' -ForegroundColor Cyan

    Push-Location (Join-Path $PSScriptRoot 'android')

    try {
        Invoke-Checked $gradle @(
            'assembleDebug',
            '--console=plain'
        )
    }
    finally {
        Pop-Location
    }

    #
    # Locate generated APK
    #
    $apk = Join-Path $PSScriptRoot 'android\app\build\outputs\apk\debug\app-debug.apk'

    if (-not (Test-Path -LiteralPath $apk)) {
        throw "Build finished but APK was not found: $apk"
    }

    #
    # Install APK on connected phone
    #
    Write-Host ''
    Write-Host 'Installing APK on the phone...' -ForegroundColor Cyan

    & $adb @selector install -r $apk

    if ($LASTEXITCODE -ne 0) {
        throw 'APK installation failed. If Android reports a signing-key or version conflict, this script will not uninstall the existing app or erase its data. Resolve the conflict before retrying.'
    }

    #
    # Launch application
    #
    if (-not $NoLaunch) {
        Write-Host ''
        Write-Host 'Launching application...' -ForegroundColor Cyan

        $nativeConfigPath = Join-Path $PSScriptRoot 'android\app\src\main\assets\capacitor.config.json'

        if (-not (Test-Path -LiteralPath $nativeConfigPath)) {
            throw "Capacitor native config was not found: $nativeConfigPath"
        }

        $nativeConfig = Get-Content `
            -Raw `
            -LiteralPath $nativeConfigPath |
            ConvertFrom-Json

        if (-not $nativeConfig.appId) {
            throw "No appId was found in $nativeConfigPath"
        }

        Invoke-Checked $adb (
            $selector + @(
                'shell',
                'monkey',
                '-p',
                $nativeConfig.appId,
                '-c',
                'android.intent.category.LAUNCHER',
                '1'
            )
        )
    }

    #
    # Success
    #
    Write-Host ''
    Write-Host '=========================================' -ForegroundColor Green
    Write-Host 'BUILD + INSTALL COMPLETE' -ForegroundColor Green
    Write-Host '=========================================' -ForegroundColor Green
    Write-Host "Phone: $connectedSerial"
    Write-Host "APK:   $apk"
    Write-Host "Java:  $env:JAVA_HOME"
}
catch {
    Write-Host ''
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
finally {
    Pop-Location
}