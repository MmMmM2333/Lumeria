param(
    [Parameter(Mandatory = $true)][ValidateSet('Snapshot', 'Assert', 'AssertRuntime', 'Restore')][string]$Action,
    [Parameter(Mandatory = $true)][string]$TestRoot,
    [string]$InstallDirectory,
    [string]$Version,
    [int]$RuntimeProcessId
)
$ErrorActionPreference = 'Stop'
$testWorkspace = (Get-Location).Path
$testAllowed = [IO.Path]::GetFullPath((Join-Path $testWorkspace '.codex-dev')) + [IO.Path]::DirectorySeparatorChar
$testResolved = (Resolve-Path -LiteralPath $TestRoot).Path
if (-not $testResolved.StartsWith($testAllowed, [StringComparison]::OrdinalIgnoreCase)) { throw 'Installer test state must remain inside the workspace .codex-dev directory.' }
$testStatePath = Join-Path $testResolved 'system-state.json'
$productRegistryPaths = @('Software\com.lumeria.app', 'Software\Microsoft\Windows\CurrentVersion\Uninstall\com.lumeria.app')
$startupRegistryPaths = @('Software\Microsoft\Windows\CurrentVersion\Run', 'Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run')
$shortcutPaths = @(
    (Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'Lumeria.lnk'),
    (Join-Path ([Environment]::GetFolderPath('Programs')) 'Lumeria.lnk')
)
$registryRoot = [Microsoft.Win32.Registry]::CurrentUser

function Test-OwnInstall([string]$Path) {
    return $Path -and [IO.Path]::GetFullPath($Path).StartsWith($testResolved + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
}

if ($Action -eq 'Snapshot') {
    if (Test-Path -LiteralPath $testStatePath) { throw 'A test snapshot already exists.' }
    foreach ($registryPath in $productRegistryPaths) {
        $key = $registryRoot.OpenSubKey($registryPath)
        if ($key) { $key.Dispose(); throw "An independent Lumeria installation is already registered at $registryPath; use a clean test user instead." }
    }
    $values = foreach ($registryPath in $startupRegistryPaths) {
        $key = $registryRoot.OpenSubKey($registryPath)
        try {
            $present = $key -and ($key.GetValueNames() -contains 'Lumeria')
            [pscustomobject]@{
                Path = $registryPath
                Present = [bool]$present
                Kind = $(if ($present) { $key.GetValueKind('Lumeria').ToString() } else { $null })
                Value = $(if ($present) { $key.GetValue('Lumeria', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) } else { $null })
            }
        } finally { if ($key) { $key.Dispose() } }
    }
    $shortcuts = for ($index = 0; $index -lt $shortcutPaths.Count; $index++) {
        $path = $shortcutPaths[$index]
        $backup = Join-Path $testResolved "original-shortcut-$index.lnk"
        $present = Test-Path -LiteralPath $path
        if ($present) { Copy-Item -LiteralPath $path -Destination $backup }
        [pscustomobject]@{ Path = $path; Present = $present; Backup = $backup }
    }
    [pscustomobject]@{ Schema = 1; Root = $testResolved; Values = @($values); Shortcuts = @($shortcuts) } |
        ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $testStatePath -Encoding UTF8
    Write-Output 'Installer test system state saved.'
    exit 0
}

if ($Action -eq 'AssertRuntime') {
    if (-not (Test-OwnInstall $InstallDirectory) -or $RuntimeProcessId -le 0) { throw 'Invalid runtime test target.' }
    $runtime = Get-Process -Id $RuntimeProcessId
    $runtimeBin = Join-Path $InstallDirectory 'runtime\bin'
    if ($runtime.Path -ne (Join-Path $runtimeBin 'LumeriaRuntime.exe')) { throw 'The runtime belongs to another installation.' }
    $libraries = @($runtime.Modules | Where-Object { $_.ModuleName -match '^(msvcp140|vcruntime140)' })
    if ($libraries.Count -lt 4) { throw 'Expected the application-local Visual C++ runtime components to be loaded.' }
    foreach ($library in $libraries) {
        if ([IO.Path]::GetDirectoryName($library.FileName) -ne $runtimeBin) { throw "The runtime relies on a system-installed CRT: $($library.FileName)" }
    }
    $hosts = @(Get-CimInstance -ClassName Win32_Process -Filter "ParentProcessId = $RuntimeProcessId AND Name = 'lumeria-native-data.exe'")
    if ($hosts.Count -ne 1) { throw 'Expected exactly one bundled data service.' }
    $dataHostDirectory = Join-Path $InstallDirectory 'runtime\Resources\app\bun'
    $hostProcess = Get-Process -Id $hosts[0].ProcessId
    if ($hostProcess.Path -ne (Join-Path $dataHostDirectory 'lumeria-native-data.exe')) { throw 'The data service is not the bundled executable.' }
    $hostLibraries = @($hostProcess.Modules | Where-Object { $_.ModuleName -match '^vcruntime140' })
    if ($hostLibraries.Count -eq 0) { throw 'The data service CRT is not loaded.' }
    foreach ($library in $hostLibraries) {
        if ([IO.Path]::GetDirectoryName($library.FileName) -ne $dataHostDirectory) { throw 'The data service relies on a system-installed CRT.' }
    }
    Write-Output 'Runtime and data service use their bundled Visual C++ libraries.'
    exit 0
}

if ($Action -eq 'Assert') {
    if (-not (Test-OwnInstall $InstallDirectory)) { throw 'The expected installation is outside this test.' }
    foreach ($registryPath in $productRegistryPaths) {
        $key = $registryRoot.OpenSubKey($registryPath)
        if (-not $key) { throw "Missing installation record: $registryPath" }
        try {
            if ($key.GetValue('InstallLocation') -ne $InstallDirectory) { throw 'Installation record points to the wrong directory.' }
            $versionValue = if ($registryPath -eq $productRegistryPaths[0]) { 'Version' } else { 'DisplayVersion' }
            if ($key.GetValue($versionValue) -ne $Version) { throw 'The registered version is incorrect.' }
        } finally { $key.Dispose() }
    }
    $shortcutShell = New-Object -ComObject WScript.Shell
    foreach ($path in $shortcutPaths) {
        if (-not (Test-Path -LiteralPath $path)) { throw "Missing product shortcut: $path" }
        if ($shortcutShell.CreateShortcut($path).TargetPath -ne (Join-Path $InstallDirectory 'Lumeria.exe')) { throw 'A shortcut does not target the stable product entry.' }
    }
    Write-Output 'Installer registry and shortcuts verified.'
    exit 0
}

$snapshot = Get-Content -LiteralPath $testStatePath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($snapshot.Schema -ne 1 -or $snapshot.Root -ne $testResolved) { throw 'Invalid installer test snapshot.' }
foreach ($registryPath in $productRegistryPaths) {
    $key = $registryRoot.OpenSubKey($registryPath)
    if ($key) {
        try { $location = $key.GetValue('InstallLocation') } finally { $key.Dispose() }
        if (-not (Test-OwnInstall $location)) { throw "A registration was changed outside this test: $registryPath" }
        $registryRoot.DeleteSubKeyTree($registryPath, $false)
    }
}
foreach ($saved in $snapshot.Values) {
    if ($startupRegistryPaths -notcontains $saved.Path) { throw 'Unexpected registry path in the test snapshot.' }
    $key = $registryRoot.OpenSubKey($saved.Path, $true)
    if (-not $key -and $saved.Present) { $key = $registryRoot.CreateSubKey($saved.Path) }
    if ($key) {
        try {
            if ($saved.Present) {
                $kind = [Microsoft.Win32.RegistryValueKind]$saved.Kind
                $value = switch ($saved.Kind) {
                    'Binary' { [byte[]]$saved.Value }
                    'DWord' { [int]$saved.Value }
                    'QWord' { [long]$saved.Value }
                    'MultiString' { [string[]]$saved.Value }
                    default { [string]$saved.Value }
                }
                $key.SetValue('Lumeria', $value, $kind)
            } else { $key.DeleteValue('Lumeria', $false) }
        } finally { $key.Dispose() }
    }
}
foreach ($saved in $snapshot.Shortcuts) {
    if ($shortcutPaths -notcontains $saved.Path) { throw 'Unexpected shortcut path in the test snapshot.' }
    if ($saved.Present) {
        if (-not (Test-OwnInstall $saved.Backup)) { throw 'The shortcut backup is outside the test directory.' }
        Copy-Item -LiteralPath $saved.Backup -Destination $saved.Path -Force
    } elseif (Test-Path -LiteralPath $saved.Path) { Remove-Item -LiteralPath $saved.Path -Force }
}
Write-Output 'Original Lumeria startup values and shortcuts restored; test registration removed.'
