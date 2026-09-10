#Requires -Version 5.1
<#
.SYNOPSIS
    Removes the dsh-vn-plugins bundle set from the DeepSeek Harness web profile,
    together with any retired bundle name this pack shipped before (dsh-focus,
    dsh-files). Removing a bundle also removes its patch layer.

.DESCRIPTION
    One target only: the raw CLI/web install used by "npx @deepseek-ai/dsh web"
    (DSH_HOME or %USERPROFILE%\.dsh, profile "web" by default). DSH Desktop is
    not supported by this pack.

    pnpm handling: the harness profile stores its pnpm layout in
    node_modules\.modules.yaml. The matching local pnpm major is bootstrapped
    under .\tools and invoked with the profile's own virtual-store settings.
#>
[CmdletBinding()]
param(
    [ValidateSet('web', 'cli')]
    [string]$Target = 'web',
    [string]$Plugin = '',
    [string]$DshHome = '',
    [string]$ProfileName = '',
    [string]$DshVersion = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Write-Step($msg) { Write-Host "[dsh-vn-plugins] $msg" -ForegroundColor Yellow }

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

function Get-PnpmStoreInfo {
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
    param([int]$Major)
    $existing = Get-Command pnpm -ErrorAction SilentlyContinue
    if ($existing) {
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

function Resolve-WebTarget {
    param([string]$HomeDir, [string]$Profile)
    if (-not $HomeDir) { $HomeDir = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' } }
    if (-not $Profile) { $Profile = 'web' }
    return [pscustomobject]@{
        Label      = 'web'
        DshHome    = $HomeDir
        Profile    = $Profile
        ProfileDir = (Join-Path $HomeDir "profiles\$Profile")
    }
}

function Get-DshInvoker {
    $npx = Get-Command npx.cmd -ErrorAction SilentlyContinue
    if (-not $npx) { $npx = Get-Command npx -ErrorAction SilentlyContinue }
    if (-not $npx) { throw 'npx was not found.' }
    return $npx.Source
}

function Invoke-Dsh {
    param([string]$DshHome, [string]$ProfileDir, [string[]]$Arguments)
    $npx = Get-DshInvoker
    $spec = "@deepseek-ai/dsh@$DshVersion"

    $storeInfo = Get-PnpmStoreInfo -ProfileDir $ProfileDir
    $pnpmBin = Ensure-PnpmForMajor -Major $storeInfo.Major
    $oldPath = $env:PATH
    $oldHome = $env:DSH_HOME
    $oldLen = $env:npm_config_virtual_store_dir_max_length
    $oldRootCheck = $env:npm_config_ignore_workspace_root_check

    $env:PATH = $pnpmBin + ';' + $oldPath
    $env:DSH_HOME = $DshHome
    if ($storeInfo.MaxLength) { $env:npm_config_virtual_store_dir_max_length = $storeInfo.MaxLength }
    $env:npm_config_ignore_workspace_root_check = 'true'
    Write-Verbose "DSH_HOME=$DshHome pnpm=$pnpmBin storeMajor=$($storeInfo.Major) maxLen=$($storeInfo.MaxLength)"
    # See install-all.ps1: stderr from a native command would otherwise become a
    # terminating NativeCommandError under $ErrorActionPreference 'Stop'.
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $exitCode = 0
    try {
        & $npx --yes $spec @Arguments 2>&1 | Out-Host
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $prevEap
        $env:PATH = $oldPath
        $env:DSH_HOME = $oldHome
        $env:npm_config_virtual_store_dir_max_length = $oldLen
        $env:npm_config_ignore_workspace_root_check = $oldRootCheck
    }
    if ($exitCode -ne 0) { throw "dsh exited with code $exitCode (command: $spec $($Arguments -join ' '))" }
}

function Get-InstalledBundles {
    param([string]$ProfileDir)
    $pkgJson = Join-Path $ProfileDir 'package.json'
    if (-not (Test-Path $pkgJson)) { return @() }
    $json = Get-Content $pkgJson -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json
    if (-not $json.dsh -or -not $json.dsh.profile -or -not $json.dsh.profile.bundles) { return @() }
    return @($json.dsh.profile.bundles)
}

function Remove-From-Profile {
    param($Target, $Packages)
    $installed = Get-InstalledBundles -ProfileDir $Target.ProfileDir
    Write-Host ''
    Write-Step "Target: $($Target.Label) - profile '$($Target.Profile)' at $($Target.ProfileDir)"
    if (-not (Test-Path $Target.ProfileDir)) { Write-Host '  (profile not present - nothing to do)'; return }
    # Retired bundles: this pack shipped the panel as 'dsh-focus' (renamed to
    # 'dsh-files' in alpha.10) and later as 'dsh-files', which the GUI now ships
    # natively; remove any stale retired name too.
    $legacyNames = @('dsh-focus', 'dsh-files')
    foreach ($legacy in $legacyNames) {
        if ($installed -contains $legacy) {
            Write-Host "  - removing retired bundle '$legacy' ..."
            Invoke-Dsh -DshHome $Target.DshHome -ProfileDir $Target.ProfileDir -Arguments @('plugin', '--profile', $Target.Profile, 'remove', $legacy)
            Write-Host "  - removed retired bundle '$legacy'"
        }
    }
    foreach ($pkg in $Packages) {
        if ($installed -notcontains $pkg.Name) {
            Write-Host "  - $($pkg.Name): not installed (skip)"
            continue
        }
        Write-Host "  - removing $($pkg.Name) ..."
        Invoke-Dsh -DshHome $Target.DshHome -ProfileDir $Target.ProfileDir -Arguments @('plugin', '--profile', $Target.Profile, 'remove', $pkg.Name)
        Write-Host "  - removed $($pkg.Name)"
    }
}

# ---------------------------------------------------------------------------

Write-Step 'DeepSeek Harness plugin pack uninstaller (web profile)'
$DshVersion = if ($DshVersion) { $DshVersion } else { Get-DshPin }
Assert-Tool 'node'
Assert-Tool 'npm'
$packages = Get-Packages

$web = Resolve-WebTarget -HomeDir $DshHome -Profile $ProfileName
Remove-From-Profile -Target $web -Packages $packages

Write-Host ''
Write-Step 'Uninstall finished. Restart the CLI app afterwards.'
