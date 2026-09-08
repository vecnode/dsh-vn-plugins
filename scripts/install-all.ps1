#Requires -Version 5.1
<#
.SYNOPSIS
    Installs the dsh-plugins bundle set into DeepSeek Harness profiles on this
    Windows machine.

.DESCRIPTION
    Targets:
      - cli     : the raw install profile used by "npx @deepseek-ai/dsh web"
                  (DSH_HOME or %USERPROFILE%\.dsh, profile "web" by default).
      - desktop : dsh-desktop's own harness home under its Electron user data
                  (%APPDATA%\<app>\harness\profiles\<normal profile>).

    With -Target all (the default) a machine without dsh-desktop is fine: the
    desktop target is skipped with a warning and the run still succeeds. Only
    an explicit "-Target desktop" fails when no desktop profile can be found.

    pnpm handling: each harness profile stores its pnpm layout in
    node_modules\.modules.yaml. The CLI installs and dsh-desktop use different
    pnpm majors and virtual-store-dir-max-length values, so the matching local
    pnpm is bootstrapped under .\tools and invoked with the profile's own
    settings.

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
                        Name    = $json.name
                        Version = $json.version
                        Folder  = $dir.FullName
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

# ---------------------------------------------------------------------------
# pnpm helpers
# ---------------------------------------------------------------------------
function Get-PnpmStoreInfo {
    # Reads node_modules\.modules.yaml for the pnpm major (store vN) and the
    # virtual-store-dir-max-length the profile was created with.
    param([string]$ProfileDir)
    $info = @{ Major = 9; MaxLength = $null }
    $yaml = Join-Path $ProfileDir 'node_modules\.modules.yaml'
    if (-not (Test-Path $yaml)) { return $info }
    $text = Get-Content $yaml -Raw -ErrorAction SilentlyContinue
    if (-not $text) { return $info }
    $m = [regex]::Match($text, 'store[\\/]+v(\d+)')
    if ($m.Success) {
        $major = 0
        if ([int]::TryParse($m.Groups[1].Value, [ref]$major) -and $major -ge 10) { $info.Major = $major }
    }
    $len = [regex]::Match($text, 'virtualStoreDirMaxLength["\s:]+(\d+)')
    if ($len.Success) { $info.MaxLength = $len.Groups[1].Value }
    return $info
}

function Ensure-PnpmForMajor {
    # Bootstraps a local pnpm of the requested major under .\tools (no admin).
    param([int]$Major)
    $existing = Get-Command pnpm -ErrorAction SilentlyContinue
    if ($existing) {
        # System pnpm is fine when it is new enough for the requested major.
        $vText = (& $existing.Source --version 2>$null)
        $v = 0
        if ($vText -and [int]::TryParse(($vText -split '\.')[0], [ref]$v) -and $v -ge $Major) {
            return Split-Path $existing.Source
        }
    }
    $prefix = Join-Path $repoRoot ("tools\pnpm" + $Major)
    $binDir = Join-Path $prefix 'node_modules\.bin'
    $local = Join-Path $binDir 'pnpm.cmd'
    if (-not (Test-Path $local)) {
        Write-Step "Bootstrapping local pnpm@$Major under .\tools (no admin needed)..."
        $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
        if (-not $npmCmd) { $npmCmd = Get-Command npm -ErrorAction SilentlyContinue }
        if (-not $npmCmd) { throw 'npm was not found (install Node.js first).' }
        & $npmCmd.Source install --prefix $prefix "pnpm@$Major" --no-audit --no-fund 2>&1 | Out-Host
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path $local)) { throw "Failed to bootstrap pnpm@$Major into .\tools." }
    }
    return $binDir
}

# ---------------------------------------------------------------------------
# Target resolution
# ---------------------------------------------------------------------------
function Resolve-CliTarget {
    param([string]$HomeDir, [string]$Profile)
    if (-not $HomeDir) {
        $HomeDir = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
    }
    if (-not $Profile) { $Profile = 'web' }
    $profileDir = Join-Path $HomeDir "profiles\$Profile"
    return [pscustomobject]@{
        Label      = 'cli'
        DshHome    = $HomeDir
        Profile    = $Profile
        ProfileDir = $profileDir
    }
}

<#
    Find dsh-desktop harness profiles. AllowMissing controls the failure mode:
      - AllowMissing:false  -> throws when nothing/ambiguous is found
                                (used when desktop was explicitly requested).
      - AllowMissing:true   -> returns @() when nothing/ambiguous is found
                                (used by -Target all; the caller warns + skips).
#>
function Resolve-DesktopTargets {
    param([string]$HomeDir, [string]$Profile, [switch]$AllowMissing)

    $candidateHomes = @()
    if ($HomeDir) {
        $candidateHomes += $HomeDir
    }
    else {
        foreach ($root in @($env:APPDATA, $env:LOCALAPPDATA)) {
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
            if ($pdir.Name -eq 'node_modules' -or $pdir.Name -match 'safe|rescue|recovery') { continue }
            $pkgJson = Join-Path $pdir.FullName 'package.json'
            if (-not (Test-Path $pkgJson)) { continue }
            $json = Get-Content $pkgJson -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json
            # A harness profile carries dsh.profile.bundles. Desktop profiles keep
            # their dependencies empty (in-box bundles resolve from the desktop
            # installation's own fallback), so do NOT require any dependency here.
            $isProfile = $json.dsh -and $json.dsh.profile -and @($json.dsh.profile.bundles).Count -gt 0
            if ($isProfile) {
                $hits += [pscustomobject]@{
                    Label      = 'desktop'
                    DshHome    = $candidate
                    Profile    = $pdir.Name
                    ProfileDir = $pdir.FullName
                }
            }
        }
    }

    if ($hits.Count -eq 0) {
        if ($AllowMissing) { return @() }
        throw 'No dsh-desktop harness profile was found. Install/run dsh-desktop once, then retry. Pass -DshHome "<userData>\harness" -ProfileName "<profile>" if detection missed it.'
    }
    if ($Profile) {
        $filtered = @($hits | Where-Object { $_.Profile -eq $Profile })
        if ($filtered.Count -eq 0) {
            if ($AllowMissing) { return @() }
            throw "Profile '$Profile' not found under detected desktop homes. Found: $(($hits | ForEach-Object { $_.Profile }) -join ', ')"
        }
        $hits = $filtered
    }
    if ($hits.Count -gt 1) {
        if ($AllowMissing) { return @() }
        $list = ($hits | ForEach-Object { "  $($_.Profile)  @  $($_.DshHome)" }) -join "`n"
        throw "Multiple desktop profiles found:`n$list`nPass -ProfileName to choose one."
    }
    return @($hits)
}

# ---------------------------------------------------------------------------
# dsh invocation
# ---------------------------------------------------------------------------
function Get-DshInvoker {
    $npx = Get-Command npx.cmd -ErrorAction SilentlyContinue
    if (-not $npx) { $npx = Get-Command npx -ErrorAction SilentlyContinue }
    if (-not $npx) { throw 'npx was not found (is Node.js installed?).' }
    return $npx.Source
}

function Invoke-Dsh {
    param([string]$DshHome, [string]$ProfileDir, [string[]]$Arguments)
    $npx = Get-DshInvoker
    $spec = "@deepseek-ai/dsh@$DshVersion"

    # Use the pnpm major + virtual-store length the profile was created with.
    $storeInfo = Get-PnpmStoreInfo -ProfileDir $ProfileDir
    $pnpmBin = Ensure-PnpmForMajor -Major $storeInfo.Major
    $oldPath = $env:PATH
    $oldHome = $env:DSH_HOME
    $oldLen = $env:npm_config_virtual_store_dir_max_length
    # dsh profiles are pnpm workspace roots ("packages: [.]"); pnpm >= 9 refuses
    # a bare `add` there unless the root-check is opted out.
    $oldRootCheck = $env:npm_config_ignore_workspace_root_check

    $env:PATH = $pnpmBin + ';' + $oldPath
    $env:DSH_HOME = $DshHome
    if ($storeInfo.MaxLength) { $env:npm_config_virtual_store_dir_max_length = $storeInfo.MaxLength }
    $env:npm_config_ignore_workspace_root_check = 'true'
    Write-Verbose "DSH_HOME=$DshHome"
    Write-Verbose "pnpm=$pnpmBin  storeMajor=$($storeInfo.Major) maxLen=$($storeInfo.MaxLength)"
    Write-Verbose "dsh $($Arguments -join ' ')"
    try {
        & $npx --yes $spec @Arguments 2>&1 | Out-Host
        if ($LASTEXITCODE -ne 0) { throw "dsh exited with code $LASTEXITCODE (command: $spec $($Arguments -join ' '))" }
    }
    finally {
        $env:PATH = $oldPath
        $env:DSH_HOME = $oldHome
        $env:npm_config_virtual_store_dir_max_length = $oldLen
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
    Write-Step "Target: $($Target.Label) - profile '$($Target.Profile)' at $($Target.ProfileDir)"
    if (-not (Test-Path $Target.ProfileDir)) { Write-Host "  (profile directory does not exist yet; 'dsh plugin add' initializes it)" }

    foreach ($pkg in $Packages) {
        $already = $installed -contains $pkg.Name
        if ($already -and -not $Force) {
            Write-Host "  - $($pkg.Name) $($pkg.Version): already installed (skip; use -Force to re-add)"
            continue
        }
        Write-Host "  - adding $($pkg.Name) $($pkg.Version) ..."
        Invoke-Dsh -DshHome $Target.DshHome -ProfileDir $Target.ProfileDir -Arguments @('plugin', '--profile', $Target.Profile, 'add', $pkg.Folder)
        Write-Host "  - added $($pkg.Name)"
    }
}

# ---------------------------------------------------------------------------

Write-Step 'DeepSeek Harness plugin pack installer'
Write-Step "Repo: $repoRoot"

$DshVersion = if ($DshVersion) { $DshVersion } else { Get-DshPin }
Write-Step "Pinned dsh version: $DshVersion"

Assert-Tool 'node'
Assert-Tool 'npm'
$packages = Get-Packages
Write-Step ("Bundles to install: " + (($packages | ForEach-Object { $_.Name + '@' + $_.Version }) -join ', '))

$processed = @()
if ($Target -in @('all', 'cli')) {
    $cli = Resolve-CliTarget -HomeDir $DshHome -Profile $ProfileName
    Install-To-Profile -Target $cli -Packages $packages
    $processed += 'cli'
}
if ($Target -in @('all', 'desktop')) {
    # Explicit desktop requests must find a profile; a bundled "-Target all"
    # run simply skips machines that have no dsh-desktop yet.
    $desktops = Resolve-DesktopTargets -HomeDir $DshHome -Profile $ProfileName -AllowMissing:($Target -eq 'all')
    if ($desktops.Count -eq 0) {
        Write-Host ''
        Write-Warning 'dsh-desktop was not detected (no harness profile found), so the desktop target was skipped.'
        if ($Target -eq 'all') {
            Write-Warning 'Install/run dsh-desktop once, then re-run "install.bat -Target desktop" to add the plugins there too.'
        }
    }
    else {
        Write-Host ''
        Write-Warning 'dsh-desktop: make sure the desktop app is closed while installing.'
        foreach ($desktop in $desktops) {
            Install-To-Profile -Target $desktop -Packages $packages
        }
        $processed += 'desktop'
    }
}

if ($processed.Count -gt 0) {
    Write-Host ''
    Write-Step "Done. Targets processed: $($processed -join ', ')"
    Write-Host ''
    Write-Host 'Next steps:'
    if ($processed -contains 'cli') {
        Write-Host '  - CLI      : start with "npx @deepseek-ai/dsh web" and open the Focus panel (right side, next to the chat).'
    }
    if ($processed -contains 'desktop') {
        Write-Host '  - Desktop  : relaunch dsh-desktop; the plugin is loaded from its normal profile (Safe Mode blocks it on purpose).'
    }
    if ($Target -eq 'all' -and $processed -notcontains 'desktop') {
        Write-Host '  - Desktop  : skipped - not installed on this machine yet.'
    }
    Write-Host '  - API keys are never touched by this installer - add your key in Settings > Models.'
}
else {
    throw 'Nothing was installed. See the messages above.'
}
