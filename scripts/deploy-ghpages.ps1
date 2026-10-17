# Deploy dist/ to gh-pages branch
param(
    [string]$Message = "Deploy OPAC GitHub Pages with academic library search index"
)

$ErrorActionPreference = "Stop"

$opacRoot = Split-Path -Parent $PSScriptRoot
Set-Location $opacRoot

$distDir = Join-Path $opacRoot "dist"
if (-not (Test-Path $distDir)) {
    Write-Error "dist directory not found at $distDir"
    exit 1
}

$remoteUrl = git config --get remote.origin.url
if (-not $remoteUrl) {
    Write-Error "Git remote origin url not found."
    exit 1
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "opac-ghpages-$timestamp"

Write-Host "[1/5] Creating temporary deployment directory: $tempDir"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

Write-Host "[2/5] Fast-copying dist/ files to temporary workspace..."
robocopy $distDir $tempDir /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null

Write-Host "[3/5] Initializing gh-pages git branch..."
git -C $tempDir init -b gh-pages | Out-Null
$userName = git config user.name
$userEmail = git config user.email
if ($userName) { git -C $tempDir config user.name $userName }
if ($userEmail) { git -C $tempDir config user.email $userEmail }

Write-Host "[4/5] Staging and committing static files and search index..."
git -C $tempDir add -A
git -C $tempDir commit -m "$Message [$timestamp]"

Write-Host "[5/5] Force-pushing to origin gh-pages..."
git -C $tempDir remote add origin $remoteUrl
git -C $tempDir push origin gh-pages --force

Write-Host "Cleaning up temporary directory..."
Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "`n✅ Successfully deployed to origin/gh-pages! OPAC portal and search index are live on GitHub Pages."
