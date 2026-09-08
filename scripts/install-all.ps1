#Requires -Version 5.1
<#
.SYNOPSIS
 Installs the dsh-plugins bundle set into DeepSeek Harness profiles on this
 Windows machine.

.DESCRIPTION
 Targets:
 - cli : the raw install profile used by "npx @deepseek-ai/dsh web"
 (DSH_HOME or %USERPROFILE%\.dsh, profile "web" by default).
 - desktop : dsh-desktop's own harness home under its Electron user data
 (%APPDATA%\<app>\harness\profiles\<normal profile>).

 It pins the dsh CLI version from .dsh-version.json, bootstraps pnpm into
 .\tools when pnpm is missing, then runs "dsh plugin --profile <p> add
 <bundle folder>" for every bundle under .\packages (idempotent).

.PARAMETER Target
 Which install target(s): all | cli | desktop.

.PARAMETER Plugin
 Only install bundles whose package name matches this substring.

.PARAMETER DshHome
 Override the CLI DSH_HOME (default: $env:DSH_HOME or %USERPROFILE%\.dsh).

.PARAMETER ProfileName
 Override the profile name for the CLI target (default: web).

.PARAMETER DshVersion
 Override the pinned dsh version from .dsh-version.json.

.PARAMETER Force
 Re-run "add" even for bundles already listed in the profile.

.EXAMPLE
 .\install-all.ps1 -Target all
.EXAMPLE
 .\install-all.ps1 -Target desktop -ProfileName desktop -Verbose
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
$toolsBin = Join-Path $repoRoot 'tools\node_modules\.bin'

function Write-Step($msg) { Write-Host "[dsh-plugins] $msg" -ForegroundColor Cyan }

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
 $found += [pscustomobject]@{
 Name = $json.name
 Version = $json.version
 Folder = $dir.FullName
 }
 }
 }
 }
 }
 if ($Plugin) {
 $filtered = @($found | Where-Object { $_.Name -like "*$Plugin*" })
 if ($filtered.Count -eq 0) {
 throw "No bundle under packages/ matches '$Plugin'. Available: $(($found | ForEach-Object Name) -join ', ')"
 }
 $found = $filtered
 }
 if ($found.Count -eq 0) { throw 'No dsh bundles found under packages/ (package.json with dsh.bundle).' }
 return $found
}

function Assert-Tool($name) {
 if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
 throw "Required tool '$name' was not found on PATH. Install Node.js >= 22 first (https://nodejs.org)."
 }
}

function Ensure-Pnpm {
 $existing = Get-Command pnpm -ErrorAction SilentlyContinue
 if ($existing) { Write-Verbose "Using pnpm from PATH: $($existing.Source)"; return }

 $local = Join-Path $toolsBin 'pnpm.cmd'
 if (-not (Test-Path $local)) {
 Write-Step 'pnpm not found bootstrapping a local copy under .\tools (no admin needed)...'
 Assert-Tool 'npm'
 & npm install --prefix (Join-Path $repoRoot 'tools') pnpm@9.15.9 --no-audit --no-fund 2>&1 | Out-Host
 if ($LASTEXITCODE -ne 0 -or -not (Test-Path $local)) { throw 'Failed to bootstrap pnpm into .\tools.' }
 }
 # Expose the local pnpm shim to child processes (dsh spawns "pnpm" by name).
 $env:PATH = (Join-Path $repoRoot 'tools\node_modules\.bin') + ';' + $env:PATH
 Write-Verbose "Using local pnpm: $local"
}

function Resolve-CliTarget {
 param([string]$HomeDir, [string]$Profile)
 if (-not $HomeDir) {
 $HomeDir = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
 }
 if (-not $Profile) { $Profile = 'web' }
 $profileDir = Join-Path $HomeDir "profiles\$Profile"
 return [pscustomobject]@{
 Label = 'cli'
 DshHome = $HomeDir
 Profile = $Profile
 ProfileDir = $profileDir
 }
}

function Resolve-DesktopTargets {
 param([string]$HomeDir, [string]$Profile)
 $candidateHomes = @()
 if ($HomeDir) {
 $candidateHomes += $HomeDir
 }
 else {
 $roots = @($env:APPDATA)
 foreach ($root in $roots) {
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
 $hits += [pscustomobject]@{
 Label = 'desktop'
 DshHome = $candidate
 Profile = $pdir.Name
 ProfileDir = $pdir.FullName
 }
 }
 }
 }

 if ($hits.Count -eq 0) {
 throw 'No dsh-desktop harness profile was found. Install/run dsh-desktop once, then retry. Pass -DshHome "<userData>\harness" -ProfileName "<profile>" if detection missed it.'
 }
 if ($Profile) {
 $filtered = @($hits | Where-Object { $_.Profile -eq $Profile })
 if ($filtered.Count -eq 0) {
 throw "Profile '$Profile' not found under detected desktop homes. Found: $(($hits | ForEach-Object { $_.Profile }) -join ', ')"
 }
 $hits = $filtered
 }
 if ($hits.Count -gt 1) {
 $list = ($hits | ForEach-Object { " $($_.Profile) @ $($_.DshHome)" }) -join "`n"
 throw "Multiple desktop profiles found:`n$list`nPass -ProfileName to choose one."
 }
 return @($hits)
}

function Get-DshInvoker {
 $npx = Get-Command npx.cmd -ErrorAction SilentlyContinue
 if (-not $npx) { $npx = Get-Command npx -ErrorAction SilentlyContinue }
 if (-not $npx) { throw 'npx was not found (is Node.js installed?).' }
 return $npx.Source
}

function Invoke-Dsh {
 param([string]$DshHome, [string[]]$Arguments)
 $npx = Get-DshInvoker
 $spec = "@deepseek-ai/dsh@$DshVersion"
 Write-Verbose "DSH_HOME=$DshHome"
 Write-Verbose "dsh $($Arguments -join ' ')"
 $oldHome = $env:DSH_HOME
 # dsh profiles are pnpm workspace roots ("packages: [.]"); pnpm >= 9 refuses
 # a bare `add` there unless the root-check is opted out.
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

function Install-To-Profile {
 param($Target, $Packages)
 $installed = Get-InstalledBundles -ProfileDir $Target.ProfileDir
 Write-Host ''
 Write-Step "Target: $($Target.Label) profile '$($Target.Profile)' at $($Target.ProfileDir)"
 if (-not (Test-Path $Target.ProfileDir)) { Write-Host " (profile directory does not exist yet; 'dsh plugin add' initializes it)" }

 foreach ($pkg in $Packages) {
 $already = $installed -contains $pkg.Name
 if ($already -and -not $Force) {
 Write-Host " - $($pkg.Name) $($pkg.Version): already installed (skip; use -Force to re-add)"
 continue
 }
 Write-Host " - adding $($pkg.Name) $($pkg.Version) ..."
 Invoke-Dsh -DshHome $Target.DshHome -Arguments @('plugin', '--profile', $Target.Profile, 'add', $pkg.Folder)
 Write-Host " - added $($pkg.Name)"
 }
}

# ---------------------------------------------------------------------------

Write-Step "DeepSeek Harness plugin pack installer"
Write-Step "Repo: $repoRoot"

$DshVersion = if ($DshVersion) { $DshVersion } else { Get-DshPin }
Write-Step "Pinned dsh version: $DshVersion"

Assert-Tool 'node'
Assert-Tool 'npm'
Ensure-Pnpm
$packages = Get-Packages
Write-Step ("Bundles to install: " + (($packages | ForEach-Object { $_.Name + '@' + $_.Version }) -join ', '))

$didWork = $false
if ($Target -in @('all', 'cli')) {
 $cli = Resolve-CliTarget -HomeDir $DshHome -Profile $ProfileName
 Install-To-Profile -Target $cli -Packages $packages
 $didWork = $true
}
if ($Target -in @('all', 'desktop')) {
 $desktops = Resolve-DesktopTargets -HomeDir $DshHome -Profile $ProfileName
 Write-Host ''
 Write-Warning 'dsh-desktop: make sure the desktop app is closed while installing.'
 foreach ($desktop in $desktops) {
 Install-To-Profile -Target $desktop -Packages $packages
 }
 $didWork = $true
}

if ($didWork) {
 Write-Host ''
 Write-Step 'Done.'
 Write-Host ''
 Write-Host 'Next steps:'
 if ($Target -in @('all', 'cli')) {
 Write-Host ' - CLI : start with "npx @deepseek-ai/dsh web" and open the Focus dock (right edge of the window).'
 }
 if ($Target -in @('all', 'desktop')) {
 Write-Host ' - Desktop : relaunch dsh-desktop; the plugin is loaded from its normal profile (Safe Mode blocks it on purpose).'
 }
 Write-Host ' - API keys are never touched by this installer add your key in Settings > Models.'
}
