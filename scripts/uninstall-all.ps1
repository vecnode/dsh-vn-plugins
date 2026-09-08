#Requires -Version 5.1
<#
.SYNOPSIS
 Removes the dsh-plugins bundle set from DeepSeek Harness profiles
 (cli and/or dsh-desktop). Removing a bundle also removes its patch layer,
 so the file-reference override shipped by dsh-focus is reverted too.
#>
[CmdletBinding()]
param(
 [ValidateSet('all', 'cli', 'desktop')]
 [string]$Target = 'all',
 [string]$Plugin = '',
 [string]$DshHome = '',
 [string]$ProfileName = '',
 [string]$DshVersion = '',
 [switch]$Force
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Write-Step($msg) { Write-Host "[dsh-plugins] $msg" -ForegroundColor Yellow }
function Get-DshPin {
 $manifest = Join-Path $repoRoot '.dsh-version.json'
 if (-not (Test-Path $manifest)) { throw "Missing $manifest" }
 $json = Get-Content $manifest -Raw | ConvertFrom-Json
 return $json.dsh
}
function Get-Packages {
 $packagesDir = Join-Path $repoRoot 'packages'
 $found = @()
 if (Test-Path $packagesDir) {
 foreach ($dir in (Get-ChildItem $packagesDir -Directory | Sort-Object Name)) {
 $pkgJson = Join-Path $dir.FullName 'package.json'
 if (Test-Path $pkgJson) {
 $json = Get-Content $pkgJson -Raw | ConvertFrom-Json
 if ($json.dsh -and $json.dsh.bundle) {
 $found += [pscustomobject]@{ Name = $json.name; Version = $json.version; Folder = $dir.FullName }
 }
 }
 }
 }
 if ($Plugin) {
 $filtered = @($found | Where-Object { $_.Name -like "*$Plugin*" })
 if ($filtered.Count -eq 0) { throw "No bundle matches '$Plugin'." }
 $found = $filtered
 }
 return $found
}
function Assert-Tool($name) {
 if (-not (Get-Command $name -ErrorAction SilentlyContinue)) { throw "Required tool '$name' not found on PATH." }
}
function Ensure-Pnpm {
 $existing = Get-Command pnpm -ErrorAction SilentlyContinue
 if ($existing) { return }
 $local = Join-Path $repoRoot 'tools\node_modules\.bin\pnpm.cmd'
 if (-not (Test-Path $local)) { throw 'pnpm is not on PATH and no local copy exists under .\tools. Run install-all.ps1 once first.' }
 $env:PATH = (Join-Path $repoRoot 'tools\node_modules\.bin') + ';' + $env:PATH
}
function Get-DshInvoker {
 $npx = Get-Command npx.cmd -ErrorAction SilentlyContinue
 if (-not $npx) { $npx = Get-Command npx -ErrorAction SilentlyContinue }
 if (-not $npx) { throw 'npx was not found.' }
 return $npx.Source
}
function Invoke-Dsh {
 param([string]$DshHome, [string[]]$Arguments)
 $npx = Get-DshInvoker
 $spec = "@deepseek-ai/dsh@$DshVersion"
 $oldHome = $env:DSH_HOME
 # dsh profiles are pnpm workspace roots ("packages: [.]"); pnpm >= 9 refuses
 # a bare `add`/`remove` there unless the root-check is opted out.
 $oldRootCheck = $env:npm_config_ignore_workspace_root_check
 $env:DSH_HOME = $DshHome
 $env:npm_config_ignore_workspace_root_check = 'true'
 try {
 & $npx --yes $spec @Arguments 2>&1 | Out-Host
 if ($LASTEXITCODE -ne 0) { throw "dsh exited with code $LASTEXITCODE (command: $spec $($Arguments -join ' '))" }
 }
 finally {
 $env:DSH_HOME = $oldHome
 $env:npm_config_ignore_workspace_root_check = $oldRootCheck
 }
}
function Get-InstalledBundles {
 param([string]$ProfileDir)
 $pkgJson = Join-Path $ProfileDir 'package.json'
 if (-not (Test-Path $pkgJson)) { return @() }
 $json = Get-Content $pkgJson -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json
 if (-not $json.dsh -or -not $json.dsh.profile -or -not $json.dsh.profile.bundles) { return @() }
 return @($json.dsh.profile.bundles)
}
function Resolve-CliTarget {
 param([string]$HomeDir, [string]$Profile)
 if (-not $HomeDir) { $HomeDir = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' } }
 if (-not $Profile) { $Profile = 'web' }
 return [pscustomobject]@{ Label = 'cli'; DshHome = $HomeDir; Profile = $Profile; ProfileDir = (Join-Path $HomeDir "profiles\$Profile") }
}
function Resolve-DesktopTargets {
 param([string]$HomeDir, [string]$Profile)
 $candidateHomes = @()
 if ($HomeDir) { $candidateHomes += $HomeDir }
 else {
 foreach ($root in @($env:APPDATA)) {
 if (-not $root -or -not (Test-Path $root)) { continue }
 foreach ($dir in (Get-ChildItem $root -Directory -ErrorAction SilentlyContinue)) {
 $harness = Join-Path $dir.FullName 'harness'
 if (Test-Path (Join-Path $harness 'profiles')) { $candidateHomes += $harness }
 }
 }
 }
 $hits = @()
 foreach ($candidate in ($candidateHomes | Select-Object -Unique)) {
 $profilesRoot = Join-Path $candidate 'profiles'
 if (-not (Test-Path $profilesRoot)) { continue }
 foreach ($pdir in (Get-ChildItem $profilesRoot -Directory -ErrorAction SilentlyContinue)) {
 if ($pdir.Name -match 'safe|rescue|recovery') { continue }
 $pkgJson = Join-Path $pdir.FullName 'package.json'
 if (-not (Test-Path $pkgJson)) { continue }
 $json = Get-Content $pkgJson -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json
 $isProfile = $json.dsh -and $json.dsh.profile -and $json.dsh.profile.bundles
 $hasBase = ($json.dependencies.PSObject.Properties.Name -contains '@deepseek-ai/dsh-base')
 if ($isProfile -and $hasBase) {
 $hits += [pscustomobject]@{ Label = 'desktop'; DshHome = $candidate; Profile = $pdir.Name; ProfileDir = $pdir.FullName }
 }
 }
 }
 if ($Profile) {
 $filtered = @($hits | Where-Object { $_.Profile -eq $Profile })
 if ($filtered.Count -eq 0) { throw "Profile '$Profile' not found. Found: $(($hits | ForEach-Object { $_.Profile }) -join ', ')" }
 $hits = $filtered
 }
 if ($hits.Count -gt 1) {
 throw "Multiple desktop profiles found; pass -ProfileName to choose one.`n$(($hits | ForEach-Object { " $($_.Profile) @ $($_.DshHome)" }) -join "`n")"
 }
 return @($hits)
}
function Remove-From-Profile {
 param($Target, $Packages)
 $installed = Get-InstalledBundles -ProfileDir $Target.ProfileDir
 Write-Host ''
 Write-Step "Target: $($Target.Label) profile '$($Target.Profile)' at $($Target.ProfileDir)"
 if (-not (Test-Path $Target.ProfileDir)) { Write-Host ' (profile not present nothing to do)'; return }
 foreach ($pkg in $Packages) {
 if ($installed -notcontains $pkg.Name) {
 Write-Host " - $($pkg.Name): not installed (skip)"
 continue
 }
 Write-Host " - removing $($pkg.Name) ..."
 Invoke-Dsh -DshHome $Target.DshHome -Arguments @('plugin', '--profile', $Target.Profile, 'remove', $pkg.Name)
 Write-Host " - removed $($pkg.Name)"
 }
}

Write-Step 'DeepSeek Harness plugin pack uninstaller'
$DshVersion = if ($DshVersion) { $DshVersion } else { Get-DshPin }
Assert-Tool 'node'
Assert-Tool 'npm'
Ensure-Pnpm
$packages = Get-Packages

if ($Target -in @('all', 'cli')) {
 $cli = Resolve-CliTarget -HomeDir $DshHome -Profile $ProfileName
 Remove-From-Profile -Target $cli -Packages $packages
}
if ($Target -in @('all', 'desktop')) {
 Write-Warning 'dsh-desktop: make sure the desktop app is closed while uninstalling.'
 foreach ($desktop in (Resolve-DesktopTargets -HomeDir $DshHome -Profile $ProfileName)) {
 Remove-From-Profile -Target $desktop -Packages $packages
 }
}
Write-Host ''
Write-Step 'Uninstall finished. Restart the CLI/desktop app afterwards.'
