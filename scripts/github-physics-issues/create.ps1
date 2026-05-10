#Requires -Version 5.1
<#
  Bulk-create GitHub issues from issues.json (physics engine release review).

  Prerequisites:
    - GitHub CLI: https://cli.github.com/
    - Authenticated: gh auth login

  Usage (from anywhere):
    powershell -NoProfile -File scripts/github-physics-issues/create.ps1
    powershell -NoProfile -File scripts/github-physics-issues/create.ps1 -Repo mikanzui/LinkageStudio
    powershell -NoProfile -File scripts/github-physics-issues/create.ps1 -DryRun

  Default -Repo is detected via `gh repo view` from the linkage-studio git root.
#>
param(
  [string]$Repo = "",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$gh = $null
foreach ($c in @(
    "${env:ProgramFiles}\GitHub CLI\gh.exe",
    "${env:ProgramFiles(x86)}\GitHub CLI\gh.exe"
  )) {
  if (Test-Path $c) { $gh = $c; break }
}
if (-not $gh) {
  $cmd = Get-Command gh -ErrorAction SilentlyContinue
  if ($cmd) { $gh = $cmd.Source }
}
if (-not $gh) {
  throw "GitHub CLI (gh) not found. Install it, then run: gh auth login"
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path (Join-Path $scriptDir "..") "..")).Path
$jsonPath = Join-Path $scriptDir "issues.json"

if (-not (Test-Path $jsonPath)) {
  throw "Missing issues.json at $jsonPath"
}

$issues = Get-Content $jsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($issues -isnot [array]) { $issues = @($issues) }

Push-Location $repoRoot
try {
  if (-not $Repo) {
    $Repo = & $gh repo view --json nameWithOwner -q .nameWithOwner 2>$null
    if (-not $Repo) {
      throw "Could not detect default repo. Pass -Repo owner/name (e.g. mikanzui/LinkageStudio)."
    }
  }

  Write-Host "Target repo: $Repo" -ForegroundColor Cyan
  if ($DryRun) {
    Write-Host "Dry run: $($issues.Count) issues (no API calls)." -ForegroundColor Yellow
  }

  $i = 0
  foreach ($issue in $issues) {
    $i++
    if ($DryRun) {
      Write-Host ("[$i/{0}] {1}" -f $issues.Count, $issue.title)
      continue
    }

    $tmp = Join-Path $env:TEMP ("gh-issue-" + [Guid]::NewGuid().ToString("n") + ".md")
    try {
      $utf8NoBom = New-Object System.Text.UTF8Encoding $false
      [System.IO.File]::WriteAllText($tmp, $issue.body, $utf8NoBom)

      Write-Host ("Creating [$i/{0}] {1}" -f $issues.Count, $issue.title) -ForegroundColor Gray
      # Use argument array so titles with embedded quotes/spaces are one argv (not split by gh)
      & $gh @('issue', 'create', '--repo', $Repo, '--title', [string]$issue.title, '--body-file', $tmp)
    }
    finally {
      Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    }

    Start-Sleep -Milliseconds 450
  }
}
finally {
  Pop-Location
}

Write-Host "Done." -ForegroundColor Green
