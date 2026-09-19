param(
    [Parameter(Mandatory = $true)]
    [ValidateRange(1, 2147483647)] [int] $ProcessId,
    [ValidateRange(1, 86400)] [int] $DurationSeconds = 900,
    [ValidateRange(1, 60)] [int] $IntervalSeconds = 5,
    [string] $OutputDirectory = [Environment]::GetFolderPath('Desktop'),
    [switch] $ClassifyVirtualMemory
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
$classificationAvailable = $false
if ($ClassifyVirtualMemory) {
    try {
        Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class LumeriaVirtualMemory {
    [StructLayout(LayoutKind.Sequential)] struct Region {
        public UIntPtr BaseAddress, AllocationBase;
        public uint AllocationProtect;
        public UIntPtr RegionSize;
        public uint State, Protect, Type;
    }
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll", SetLastError=true)] static extern UIntPtr VirtualQueryEx(IntPtr process, UIntPtr address, out Region region, UIntPtr size);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    public static object Sample(int pid) {
        if (IntPtr.Size != 8) throw new Exception("Virtual memory classification requires 64-bit PowerShell");
        IntPtr handle = OpenProcess(0x0400, false, pid);
        if (handle == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
        ulong address=0, privateBytes=0, wc=0, rw=0, other=0, mapped=0, image=0;
        int regions=0, wcRegions=0;
        try {
            for (;;) {
                Region r;
                if (VirtualQueryEx(handle,new UIntPtr(address),out r,new UIntPtr((uint)Marshal.SizeOf(typeof(Region))))==UIntPtr.Zero) {
                    int error=Marshal.GetLastWin32Error();
                    if (error==87 && regions>0) break; // End of user address space.
                    throw new Win32Exception(error);
                }
                regions++;
                ulong size=r.RegionSize.ToUInt64();
                if(r.State==0x1000) {
                    if(r.Type==0x20000) {
                        privateBytes+=size;
                        if((r.Protect & 0x400)!=0){wc+=size;wcRegions++;}
                        else if((r.Protect & 0xff)==0x04)rw+=size;
                        else other+=size;
                    } else if(r.Type==0x40000)mapped+=size;
                    else if(r.Type==0x1000000)image+=size;
                }
                ulong next=r.BaseAddress.ToUInt64()+size;
                if(next<=address)throw new Exception("VirtualQueryEx did not advance");
                address=next;
            }
        } finally { CloseHandle(handle); }
        return new { privateCommittedBytes=privateBytes, writeCombineCommittedBytes=wc,
            readWriteCommittedBytes=rw, otherPrivateCommittedBytes=other, mappedCommittedBytes=mapped,
            imageCommittedBytes=image, queriedRegions=regions, writeCombineRegions=wcRegions };
    }
}
'@
        $classificationAvailable = $true
    } catch {
        $writer.WriteLine((@{ timeUtc = [DateTime]::UtcNow.ToString('o'); event = 'virtual-memory-unavailable'; detail = $_.Exception.Message } | ConvertTo-Json -Compress))
    }
}
$nextClassification = 0
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
        if ($classificationAvailable -and $watch.Elapsed.TotalSeconds -ge $nextClassification) {
            try {
                $sample.virtualMemory = [LumeriaVirtualMemory]::Sample($ProcessId)
                $sample.virtualMemoryTimeUtc = [DateTime]::UtcNow.ToString('o')
            } catch { $sample.virtualMemoryError = $_.Exception.Message; $classificationAvailable = $false }
            $nextClassification = $watch.Elapsed.TotalSeconds + 5
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
