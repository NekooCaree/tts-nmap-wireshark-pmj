[CmdletBinding()]
param([string]$ConfigPath = (Join-Path $env:LOCALAPPDATA 'ngrok\ngrok.yml'))
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectDir '.env'
if (!(Test-Path -LiteralPath $envPath)) { throw 'Jalankan scripts/start-desktop.ps1 dahulu.' }
$configText = [IO.File]::ReadAllText($envPath)
$portMatch = [regex]::Match($configText, '(?m)^DESKTOP_PORT=(\d+)')
$desktopPort = if ($portMatch.Success) { $portMatch.Groups[1].Value } else { '6080' }
$localAddress = "http://127.0.0.1:$desktopPort"
try { Invoke-WebRequest -Uri $localAddress -UseBasicParsing -TimeoutSec 5 | Out-Null }
catch {
    if (!$_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 401) {
        throw 'Gateway desktop belum berjalan. Jalankan scripts/start-desktop.ps1 dahulu.'
    }
}
$tunnelState = $null
try { $tunnelState = Invoke-RestMethod 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 2 } catch {}
if ($tunnelState) {
    $matching = @($tunnelState.tunnels | Where-Object { $_.config.addr -eq $localAddress -and $_.public_url -like 'https://*' })
    if ($matching.Count) {
        Write-Host "Link mahasiswa: $($matching[0].public_url)"
        Write-Host "Login kelas tersimpan di: $(Join-Path $projectDir '.runtime\akses-desktop.txt')"
        exit 0
    }
    throw 'Ngrok lain sedang aktif. Hentikan tunnel lama di terminalnya, lalu jalankan script ini lagi (ERR_NGROK_334).'
}
if (!(Test-Path -LiteralPath $ConfigPath)) { throw 'Konfigurasi ngrok belum tersedia. Jalankan ngrok config add-authtoken TOKEN_AKUN dahulu.' }
$ngrokCommand = Get-Command ngrok.exe -ErrorAction SilentlyContinue
$ngrokPath = if ($ngrokCommand) { $ngrokCommand.Source } else { Join-Path $env:USERPROFILE 'bin\ngrok.exe' }
if (!(Test-Path -LiteralPath $ngrokPath)) { throw 'ngrok.exe belum ditemukan. Install ngrok lalu masukkan ke PATH.' }
$runtimeDir = Join-Path $projectDir '.runtime'
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$logPath = Join-Path $runtimeDir 'ngrok.log'
$arguments = @('http', $localAddress, '--config', ('"' + $ConfigPath + '"'), '--log', ('"' + $logPath + '"'), '--log-format', 'json')
$ngrokProcess = Start-Process -FilePath $ngrokPath -ArgumentList $arguments -WindowStyle Hidden -PassThru
[IO.File]::WriteAllText((Join-Path $runtimeDir 'ngrok.pid'), [string]$ngrokProcess.Id)
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Seconds 1
    $ngrokProcess.Refresh()
    if ($ngrokProcess.HasExited) {
        if (Test-Path -LiteralPath $logPath) { Get-Content -LiteralPath $logPath -Tail 8 }
        throw 'Ngrok berhenti. Bila ERR_NGROK_334, hentikan endpoint lama terlebih dahulu; jangan jalankan dua tunnel domain yang sama.'
    }
    try {
        $state = Invoke-RestMethod 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 2
        $tunnel = @($state.tunnels | Where-Object { $_.public_url -like 'https://*' })
        if ($tunnel.Count) {
            $url = $tunnel[0].public_url
            [IO.File]::WriteAllText((Join-Path $runtimeDir 'link-mahasiswa.txt'), $url)
            Write-Host "Link mahasiswa: $url"
            Write-Host "Login kelas tersimpan di: $(Join-Path $runtimeDir 'akses-desktop.txt')"
            exit 0
        }
    } catch {}
}
throw 'Ngrok belum mengembalikan URL. Lihat .runtime/ngrok.log.'
