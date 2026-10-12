$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$originalDir = Get-Location
try {
    Set-Location -LiteralPath $projectDir
    $pidPath = Join-Path $projectDir '.runtime\ngrok.pid'
    if (Test-Path -LiteralPath $pidPath) {
        $savedId = [int]([IO.File]::ReadAllText($pidPath).Trim())
        $savedProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$savedId" -ErrorAction SilentlyContinue
        $expectedLog = Join-Path $projectDir '.runtime\ngrok.log'
        if ($savedProcess -and $savedProcess.Name -eq 'ngrok.exe' -and $savedProcess.CommandLine -and $savedProcess.CommandLine.Contains($expectedLog)) {
            Stop-Process -Id $savedId
        }
        Remove-Item -LiteralPath $pidPath
    }
    & docker compose -f docker-compose.yml -f docker-compose.desktop.yml --profile desktop stop desktop-gateway lab-desktop lab-target
    if ($LASTEXITCODE -ne 0) { throw 'Gagal menghentikan desktop.' }
    Write-Host 'Desktop dan tunnel milik proyek dihentikan. Berkas praktikum tetap tersimpan.'
} finally { Set-Location -LiteralPath $originalDir }
