param(
    [Parameter(Mandatory = $true)]
    [ValidateRange(1, 2147483647)] [int] $ProcessId,
    [ValidateRange(1, 86400)] [int] $DurationSeconds = 900,
    [ValidateRange(1, 60)] [int] $IntervalSeconds = 5,
    [string] $OutputDirectory = [Environment]::GetFolderPath('Desktop')
)

# Read-only process sampling. No heap walk, GC, working-set trim or dump capture.
$ErrorActionPreference = 'Stop'
$target = Get-Process -Id $ProcessId
$started = $target.StartTime.ToUniversalTime()
$captureDirectory = Join-Path $OutputDirectory ('Lumeria-memory-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $captureDirectory -Force | Out-Null
$samplesPath = Join-Path $captureDirectory 'samples.jsonl'
$metadata = [ordered]@{
    schemaVersion = 1
    processId = $ProcessId
    processName = $target.ProcessName
    processStartedUtc = $started.ToString('o')
    captureStartedUtc = [DateTime]::UtcNow.ToString('o')
    durationSeconds = $DurationSeconds
    intervalSeconds = $IntervalSeconds
    units = 'bytes; cpuSeconds is cumulative process CPU time'
}
try { $metadata.executable = $target.Path } catch { $metadata.executableError = $_.Exception.Message }
try {
    $metadata.videoControllers = @(Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion)
} catch { $metadata.videoControllerError = $_.Exception.Message }
$metadata | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $captureDirectory 'metadata.json') -Encoding UTF8
$writer = [System.IO.StreamWriter]::new($samplesPath, $false, [System.Text.UTF8Encoding]::new($false))
$writer.AutoFlush = $true
$watch = [System.Diagnostics.Stopwatch]::StartNew()
Write-Host "Sampling PID $ProcessId. Keep this window open; Ctrl+C stops sampling."
Write-Host "Output: $captureDirectory"
$counterAvailable = $true
try {
    do {
        try {
            $target = Get-Process -Id $ProcessId
            if ($target.StartTime.ToUniversalTime() -ne $started) { throw 'PID was reused by another process.' }
        } catch {
            $writer.WriteLine((@{ timeUtc = [DateTime]::UtcNow.ToString('o'); event = 'process-unavailable'; detail = $_.Exception.Message } | ConvertTo-Json -Compress))
            break
        }
        $sample = [ordered]@{
            timeUtc = [DateTime]::UtcNow.ToString('o')
            elapsedSeconds = [Math]::Round($watch.Elapsed.TotalSeconds, 3)
            processId = $ProcessId
            privateBytes = $target.PrivateMemorySize64
            workingSetBytes = $target.WorkingSet64
            virtualBytes = $target.VirtualMemorySize64
            cpuSeconds = $target.TotalProcessorTime.TotalSeconds
            handles = $target.HandleCount
            threads = $target.Threads.Count
            privateWorkingSetBytes = $null
        }
        if ($counterAvailable) {
            try {
                $counter = Get-CimInstance Win32_PerfRawData_PerfProc_Process -Filter "IDProcess = $ProcessId"
                if ($null -eq $counter -or $null -eq $counter.WorkingSetPrivate) { throw 'Private working-set counter unavailable.' }
                $sample.privateWorkingSetBytes = [long] $counter.WorkingSetPrivate
            } catch {
                $sample.counterError = $_.Exception.Message
                $counterAvailable = $false
            }
        }
        $writer.WriteLine(($sample | ConvertTo-Json -Compress))
        Write-Host ('{0,5:N0}s  Private {1,8:N1} MiB  Working set {2,8:N1} MiB' -f $sample.elapsedSeconds, ($sample.privateBytes / 1MB), ($sample.workingSetBytes / 1MB))
        $remaining = $DurationSeconds - $watch.Elapsed.TotalSeconds
        if ($remaining -le 0) { break }
        Start-Sleep -Milliseconds ([int] [Math]::Min($IntervalSeconds * 1000, $remaining * 1000))
    } while ($true)
} finally {
    $writer.Dispose()
    Write-Host "Saved: $captureDirectory"
}
