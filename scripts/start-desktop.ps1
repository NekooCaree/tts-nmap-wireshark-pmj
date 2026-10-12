[CmdletBinding()]
param([switch]$NoBuild)
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$originalDir = Get-Location
try {
    Set-Location -LiteralPath $projectDir
    & docker info --format '{{.OSType}}' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Jalankan Docker Desktop dan tunggu Linux engine siap.' }
    $configPath = Join-Path $projectDir '.env'
    if (!(Test-Path -LiteralPath $configPath)) {
        Copy-Item -LiteralPath (Join-Path $projectDir '.env.example') -Destination $configPath
    }
    $configText = [IO.File]::ReadAllText($configPath)
    $userMatch = [regex]::Match($configText, '(?m)^DESKTOP_USER=([^\r\n]*)')
    $desktopUser = if ($userMatch.Success) { $userMatch.Groups[1].Value.Trim() } else { 'praktikum' }
    if ($desktopUser -notmatch '^[a-zA-Z0-9_-]+$') { throw 'DESKTOP_USER harus huruf, angka, _ atau -.' }
    if (!$userMatch.Success) { $configText += "`nDESKTOP_USER=$desktopUser`n" }
    $passwordMatch = [regex]::Match($configText, '(?m)^DESKTOP_PASSWORD=([^\r\n]*)')
    $desktopPassword = if ($passwordMatch.Success) { $passwordMatch.Groups[1].Value.Trim() } else { '' }
    if (!$desktopPassword) {
        $randomBytes = New-Object byte[] 18
        $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $generator.GetBytes($randomBytes) } finally { $generator.Dispose() }
        $desktopPassword = [Convert]::ToBase64String($randomBytes).Replace('+','-').Replace('/','_').TrimEnd('=')
        if ($passwordMatch.Success) {
            $configText = [regex]::Replace($configText, '(?m)^DESKTOP_PASSWORD=[^\r\n]*', "DESKTOP_PASSWORD=$desktopPassword")
        } else { $configText += "`nDESKTOP_PASSWORD=$desktopPassword`n" }
    }
    [IO.File]::WriteAllText($configPath, $configText, (New-Object Text.UTF8Encoding $false))
    $runtimeDir = Join-Path $projectDir '.runtime'
    New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
    $portMatch = [regex]::Match($configText, '(?m)^DESKTOP_PORT=(\d+)')
    $desktopPort = if ($portMatch.Success) { $portMatch.Groups[1].Value } else { '6080' }
    $accessText = "DESKTOP PRAKTIKUM (satu layar bersama)`r`nURL lokal: http://127.0.0.1:$desktopPort`r`nUsername: $desktopUser`r`nPassword: $desktopPassword`r`nTarget di dalam desktop: 172.31.250.10`r`n"
    [IO.File]::WriteAllText((Join-Path $runtimeDir 'akses-desktop.txt'), $accessText, (New-Object Text.UTF8Encoding $false))
    $composeArgs = @('compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.desktop.yml', '--profile', 'desktop', 'up', '-d', '--wait', '--wait-timeout', '180')
    if (!$NoBuild) { $composeArgs += '--build' }
    & docker @composeArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'Desktop gagal siap. Log terakhir desktop dan gateway:'
        & docker compose -f docker-compose.yml -f docker-compose.desktop.yml --profile desktop logs --tail 35 lab-desktop desktop-gateway
        throw 'Desktop gagal siap. Penyebab dari container ditampilkan pada log di atas.'
    }
    Write-Host $accessText
    Write-Host 'Untuk link internet: powershell -ExecutionPolicy Bypass -File .\scripts\start-ngrok.ps1'
} finally { Set-Location -LiteralPath $originalDir }
