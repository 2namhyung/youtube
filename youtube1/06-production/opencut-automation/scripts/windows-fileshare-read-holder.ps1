param([Parameter(Mandatory = $true)][string]$Request)
$ErrorActionPreference = 'Stop'
$requestPath = [IO.Path]::GetFullPath($Request)
$payload = Get-Content -LiteralPath $requestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ([string]$payload.schema -ne 'newsroom-windows-locked-spawn-v2') { throw 'Locked spawn request schema is invalid' }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class NewsroomJob {
  [StructLayout(LayoutKind.Sequential)] public struct BASIC { public long PerProcessUserTimeLimit, PerJobUserTimeLimit; public uint LimitFlags; public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize; public uint ActiveProcessLimit; public long Affinity; public uint PriorityClass, SchedulingClass; }
  [StructLayout(LayoutKind.Sequential)] public struct IO { public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount, ReadTransferCount, WriteTransferCount, OtherTransferCount; }
  [StructLayout(LayoutKind.Sequential)] public struct EXTENDED { public BASIC BasicLimitInformation; public IO IoInfo; public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed; }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
  [DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref EXTENDED info, uint length);
  [DllImport("kernel32.dll")] public static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
  public static IntPtr CreateKillOnClose() { var job=CreateJobObject(IntPtr.Zero, null); if(job==IntPtr.Zero) throw new System.ComponentModel.Win32Exception(); var info=new EXTENDED(); info.BasicLimitInformation.LimitFlags=0x2000; if(!SetInformationJobObject(job,9,ref info,(uint)Marshal.SizeOf(info))) { CloseHandle(job); throw new System.ComponentModel.Win32Exception(); } return job; }
}
'@
function Quote-WindowsArgument([string]$Value) {
  if ($Value.Length -gt 0 -and $Value -notmatch '[\s"]') { return $Value }
  $builder = [Text.StringBuilder]::new(); [void]$builder.Append('"'); $slashes = 0
  foreach ($character in $Value.ToCharArray()) {
    if ($character -eq '\') { $slashes += 1; continue }
    if ($character -eq '"') { [void]$builder.Append(('\' * ($slashes * 2 + 1))); [void]$builder.Append('"'); $slashes = 0; continue }
    if ($slashes) { [void]$builder.Append(('\' * $slashes)); $slashes = 0 }; [void]$builder.Append($character)
  }
  if ($slashes) { [void]$builder.Append(('\' * ($slashes * 2))) }; [void]$builder.Append('"'); return $builder.ToString()
}
$handles = [Collections.Generic.List[IDisposable]]::new()
$job = [IntPtr]::Zero
$parentProcess = $null
try {
  foreach ($entry in $payload.lockEntries) {
    $file = [IO.Path]::GetFullPath([string]$entry.path); $handle = [IO.File]::Open($file, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read); $handles.Add($handle)
    if ($handle.Length -ne [int64]$entry.bytes) { throw "Locked file size changed" }
    $digest = [Security.Cryptography.SHA256]::Create(); try { $actual = ([BitConverter]::ToString($digest.ComputeHash($handle))).Replace('-', '').ToLowerInvariant() } finally { $digest.Dispose(); $handle.Position = 0 }
    if ($actual -ne [string]$entry.sha256) { throw "Locked file hash changed" }
  }
  if ($payload.holdOnly) {
    $parentPid = [int]$payload.parentAuthority.parentPid; $expectedStart = [string]$payload.parentAuthority.processStartedAt
    if ($parentPid -le 0 -or $expectedStart -notmatch '^\d+$') { throw 'Hold-only parent authority is invalid' }
    $parentProcess = [Diagnostics.Process]::GetProcessById($parentPid); $null = $parentProcess.Handle
    if ([string]$parentProcess.StartTime.ToUniversalTime().Ticks -ne $expectedStart) { throw 'Hold-only parent process birth identity mismatch' }
  }
  if ($payload.holdOnly) {
    [IO.File]::Delete($requestPath); [Console]::Out.WriteLine('NEWSROOM_OUTER_LOCK_READY'); [Console]::Out.Flush()
    while (-not [IO.File]::Exists([string]$payload.releasePath)) {
      try { if ($parentProcess.HasExited -or [string]$parentProcess.StartTime.ToUniversalTime().Ticks -ne $expectedStart) { break } } catch { break }
      Start-Sleep -Milliseconds 20
    }
  }
  if (-not $payload.holdOnly) {
  [IO.File]::WriteAllText([string]$payload.readyPath, 'locked', [Text.UTF8Encoding]::new($false))
  $start = [Diagnostics.ProcessStartInfo]::new(); $start.FileName = [string]$payload.command; $start.WorkingDirectory = [string]$payload.cwd; $start.UseShellExecute = $false; $start.CreateNoWindow = $true; $start.RedirectStandardOutput = $true; $start.RedirectStandardError = $true
  $start.Arguments = (($payload.args | ForEach-Object { Quote-WindowsArgument ([string]$_) }) -join ' ')
  $job = [NewsroomJob]::CreateKillOnClose(); $process = [Diagnostics.Process]::new(); $process.StartInfo = $start; if (-not $process.Start()) { throw 'Locked child did not start' }; if (-not [NewsroomJob]::AssignProcessToJobObject($job, $process.Handle)) { $process.Kill(); throw 'Locked child could not be assigned to kill-on-close job' }
  if ($payload.binaryStdout) {
    $stdoutMemory = [IO.MemoryStream]::new(); $stdoutTask = $process.StandardOutput.BaseStream.CopyToAsync($stdoutMemory); $stderrTask = $process.StandardError.ReadToEndAsync(); $process.WaitForExit(); $stdoutTask.Wait(); $stdoutBytes = $stdoutMemory.ToArray(); $stdoutMemory.Dispose(); $stderr = $stderrTask.Result
    if ($stdoutBytes.Length -gt [int64]$payload.maxStdoutBytes) { throw 'Locked child binary stdout exceeded maximum' }; if ($stderr.Length -gt 20000) { throw 'Locked child stderr exceeded maximum' }
    [IO.File]::WriteAllText([string]$payload.resultPath, (@{ code = $process.ExitCode; stdoutBase64 = [Convert]::ToBase64String($stdoutBytes); stderr = $stderr } | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false)); exit 0
  }
  $stdoutTask = $process.StandardOutput.ReadToEndAsync(); $stderrTask = $process.StandardError.ReadToEndAsync(); $process.WaitForExit(); $stdout = $stdoutTask.Result; $stderr = $stderrTask.Result
  if ($stdout.Length -gt 1000000) { $stdout = $stdout.Substring($stdout.Length - 1000000) }; if ($stderr.Length -gt 20000) { $stderr = $stderr.Substring($stderr.Length - 20000) }
  [IO.File]::WriteAllText([string]$payload.resultPath, (@{ code = $process.ExitCode; stdout = $stdout; stderr = $stderr } | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false)); exit 0
  }
} finally {
  foreach ($handle in $handles) { $handle.Dispose() }; if ($job -ne [IntPtr]::Zero) { [void][NewsroomJob]::CloseHandle($job) }; if ($null -ne $parentProcess) { $parentProcess.Dispose() }
  if ($payload.holdOnly) { foreach ($control in @([string]$payload.requestPath, [string]$payload.resultPath, [string]$payload.readyPath, [string]$payload.releasePath)) { if ($control -and [IO.File]::Exists($control)) { [IO.File]::Delete($control) } } }
}
