param(
    [Parameter(Mandatory = $true)][string]$SourceDirectory
)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourceRoot = (Resolve-Path -LiteralPath $SourceDirectory).Path
$sourceRelative = [IO.Path]::GetRelativePath($projectRoot, $sourceRoot).Replace('\', '/')
if (!($sourceRelative.StartsWith('build/') -or $sourceRelative.StartsWith('.codex-dev/')) -or $sourceRelative.Split('/') -contains '..') {
    throw 'Use a dedicated upstream checkout under this project build/ or .codex-dev/; upstream builds clean their own output directories.'
}
for ($current = Get-Item -LiteralPath $sourceRoot; $current.FullName -ne $projectRoot; $current = $current.Parent) {
    if ($current.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'The source checkout must not traverse directory links.' }
}
$starter = Join-Path $projectRoot 'vendor/electrobun-pixi-native-starter'
$lock = Get-Content -Raw -LiteralPath (Join-Path $starter 'native-toolchain.lock.json') | ConvertFrom-Json
$head = & git -C $sourceRoot rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $head -ne $lock.provenance.upstreamCommit) { throw 'Upstream checkout must be at the commit in native-toolchain.lock.json.' }
$oldPath = $env:PATH
$oldActions = $env:GITHUB_ACTIONS
$oldDevkit = $env:HUTCH_ELECTROBUN_DEVKIT_ROOT
try {
    if (!(Get-Command cmake -ErrorAction SilentlyContinue)) {
        $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
        if (!(Test-Path -LiteralPath $vswhere)) { throw 'Install MSVC C++ Build Tools and CMake before rebuilding the SDK.' }
        $installation = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
        if ($LASTEXITCODE -ne 0 -or !$installation) { throw 'MSVC C++ Build Tools were not found.' }
        $cmakeDirectory = Join-Path $installation 'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin'
        if (!(Test-Path -LiteralPath (Join-Path $cmakeDirectory 'cmake.exe'))) { throw 'CMake must be installed or present on PATH.' }
        $env:PATH = $cmakeDirectory + [IO.Path]::PathSeparator + $env:PATH
    }
    $cmakeVersion = & cmake --version
    if ($LASTEXITCODE -ne 0) { throw 'CMake preflight failed.' }
    $bunVersion = & bun --version
    if ($LASTEXITCODE -ne 0 -or $bunVersion -notmatch '^1\.4\.[0-9]+$') { throw 'Use Bun 1.4.x to run the pinned upstream build.ts (the shipped app runtime is independently pinned to 1.4.2).' }
    & node (Join-Path $starter 'tools/electrobun-dcomp-patch.mjs') --apply $sourceRoot
    if ($LASTEXITCODE -ne 0) { throw 'Pinned upstream patch failed.' }
    Push-Location (Join-Path $sourceRoot 'package')
    try {
        & npm ci --ignore-scripts --no-audit
        if ($LASTEXITCODE -ne 0) { throw 'Upstream locked npm installation failed.' }
        # Upstream checks this flag before its interactive/admin dependency installer.
        # Prerequisites are checked above; this script never installs system tools.
        $env:GITHUB_ACTIONS = 'true'
        & bun build.ts
        if ($LASTEXITCODE -ne 0) { throw 'Upstream SDK build failed; no installed Lumeria toolchain has been changed.' }
    } finally { Pop-Location }
    $env:HUTCH_ELECTROBUN_DEVKIT_ROOT = Join-Path $sourceRoot 'package/dist'
    & node (Join-Path $starter 'tools/patch-electrobun.mjs') --consumer-root $projectRoot --sdk-only
    if ($LASTEXITCODE -ne 0) { throw 'SDK projection patches failed.' }
    $zigVersion = & (Join-Path $sourceRoot 'package/vendors/zig/zig.exe') version
    if ($LASTEXITCODE -ne 0) { throw 'Unable to record the source build Zig version.' }
    [ordered]@{
        schemaVersion = 1
        upstreamCommit = $head
        buildCommand = 'bun build.ts'
        bunBuildHostVersion = $bunVersion
        applicationBunVersion = $lock.bun
        zigVersion = $zigVersion
        cmakeVersion = ($cmakeVersion | Select-Object -First 1)
        operatingSystem = [Environment]::OSVersion.Version.ToString()
        sourcePatchSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $starter 'patches/electrobun-2.0.1-dcomp-atomic-resize.patch')).Hash.ToLowerInvariant()
        builtAtUtc = [DateTime]::UtcNow.ToString('o')
    } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $sourceRoot 'lumeria-build-environment.json') -Encoding utf8
    Write-Output 'SDK built in package/dist. This build step did not change the installed SDK or repository lock. native:prepare:source will verify and select the local build automatically; native:toolchain:pack remains available for distribution candidates.'
} finally {
    $env:PATH = $oldPath
    $env:GITHUB_ACTIONS = $oldActions
    $env:HUTCH_ELECTROBUN_DEVKIT_ROOT = $oldDevkit
}
