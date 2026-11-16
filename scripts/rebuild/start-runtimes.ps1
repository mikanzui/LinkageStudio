$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$runtimePath = Join-Path $workspace '.rebuild.local/runtimes.json'
$runtimes = Get-Content -Raw -LiteralPath $runtimePath | ConvertFrom-Json
$logDir = Join-Path $workspace '.rebuild.local/server-logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$nodeExecutable = (Get-Command node).Source
$started = @()
foreach ($target in $runtimes.targets) {
    $listener = Get-NetTCPConnection -State Listen -LocalPort $target.port -ErrorAction SilentlyContinue
    if ($listener) { throw "Port $($target.port) is already occupied. No server was replaced." }
    $vite = Join-Path $target.path 'node_modules/vite/bin/vite.js'
    $proc = Start-Process -FilePath $nodeExecutable -WorkingDirectory $target.path -WindowStyle Hidden -PassThru `
        -ArgumentList @("`"$vite`"", '--config', "`"$($target.config)`"") `
        -RedirectStandardOutput (Join-Path $logDir "$($target.id).stdout.log") `
        -RedirectStandardError (Join-Path $logDir "$($target.id).stderr.log")
    $started += [PSCustomObject]@{ id = $target.id; processId = $proc.Id; url = $target.url; config = $target.config }
}
$started | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $logDir 'processes.json')
$started | Format-Table -AutoSize
