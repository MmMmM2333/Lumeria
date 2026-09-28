//! Own the pipe-only data sidecar before starting the JavaScript runtime.
const std = @import("std");
const win = std.os.windows;
const quote = @import("windows_spawn.zig").commandLine;
const PI = extern struct { process: win.HANDLE, thread: win.HANDLE, pid: u32, thread_id: u32 };
const SI = extern struct {
    cb: u32 = @sizeOf(SI), reserved: ?win.LPWSTR = null, desktop: ?win.LPWSTR = null, title: ?win.LPWSTR = null,
    x: u32 = 0, y: u32 = 0, width: u32 = 0, height: u32 = 0, xc: u32 = 0, yc: u32 = 0,
    fill: u32 = 0, flags: u32 = 0, show: u16 = 0, reserved_size: u16 = 0, reserved_data: ?*u8 = null,
    stdin: ?win.HANDLE = null, stdout: ?win.HANDLE = null, stderr: ?win.HANDLE = null,
};
extern "kernel32" fn CreateProcessW(?[*:0]const u16, [*:0]u16, ?*anyopaque, ?*anyopaque, win.BOOL, u32, ?*anyopaque, ?[*:0]const u16, *SI, *PI) callconv(.winapi) win.BOOL;
extern "kernel32" fn CreateJobObjectW(?*anyopaque, ?[*:0]const u16) callconv(.winapi) ?win.HANDLE;
extern "kernel32" fn SetInformationJobObject(win.HANDLE, u32, *const anyopaque, u32) callconv(.winapi) win.BOOL;
extern "kernel32" fn AssignProcessToJobObject(win.HANDLE, win.HANDLE) callconv(.winapi) win.BOOL;
extern "kernel32" fn ResumeThread(win.HANDLE) callconv(.winapi) u32;
extern "kernel32" fn WaitForSingleObject(win.HANDLE, u32) callconv(.winapi) u32;
extern "kernel32" fn TerminateProcess(win.HANDLE, u32) callconv(.winapi) win.BOOL;
extern "kernel32" fn CloseHandle(win.HANDLE) callconv(.winapi) win.BOOL;
extern "kernel32" fn GetCurrentProcessId() callconv(.winapi) u32;
extern "advapi32" fn SystemFunction036([*]u8, u32) callconv(.winapi) u8;

pub const Service = struct {
    process: win.HANDLE,
    job: win.HANDLE,
    pub fn close(self: Service) void {
        // Normal clients close the pipe after queued writes and saves drain.
        if (WaitForSingleObject(self.process, 5000) != 0) {
            _ = TerminateProcess(self.process, 1);
            _ = WaitForSingleObject(self.process, 5000);
        }
        _ = CloseHandle(self.process);
        _ = CloseHandle(self.job);
    }
};

pub fn start(allocator: std.mem.Allocator, env: *std.process.Environ.Map, executable: []const u8) !Service {
    var nonce: [16]u8 = undefined;
    if (SystemFunction036(&nonce, nonce.len) == 0) return error.RandomUnavailable;
    const pipe = try std.fmt.allocPrint(allocator, "\\\\.\\pipe\\lumeria-data-{d}-{s}", .{ GetCurrentProcessId(), std.fmt.bytesToHex(nonce, .lower) });
    _ = env.swapRemove("LUMERIA_DATA_PIPE");
    const environment = try env.createWindowsBlock(allocator, .{});
    const command = try quote(allocator, &.{ executable, "--pipe", pipe });
    const wide_command = try std.unicode.wtf8ToWtf16LeAllocZ(allocator, command);
    const wide_executable = try std.unicode.wtf8ToWtf16LeAllocZ(allocator, executable);
    const job = CreateJobObjectW(null, null) orelse return error.DataJobUnavailable;
    errdefer _ = CloseHandle(job);
    // JOBOBJECT_EXTENDED_LIMIT_INFORMATION (Windows x64).
    var limits: [144]u8 align(8) = @splat(0);
    std.mem.writeInt(u32, limits[16..20], 0x2000, .little); // KILL_ON_JOB_CLOSE
    if (!SetInformationJobObject(job, 9, &limits, limits.len).toBool()) return error.DataJobConfigurationFailed;
    var si: SI = .{};
    var child: PI = undefined;
    if (!CreateProcessW(wide_executable.ptr, wide_command.ptr, null, null, .FALSE, 0x08000404,
        @ptrCast(@constCast(environment.slice.ptr)), null, &si, &child).toBool()) return error.DataServiceCouldNotStart;
    defer _ = CloseHandle(child.thread);
    errdefer { _ = TerminateProcess(child.process, 1); _ = CloseHandle(child.process); }
    if (!AssignProcessToJobObject(job, child.process).toBool()) return error.DataJobAssignmentFailed;
    if (ResumeThread(child.thread) == 0xffffffff) return error.DataServiceResumeFailed;
    try env.put("LUMERIA_DATA_PIPE", pipe);
    try env.put("LUMERIA_DATA_PID", try std.fmt.allocPrint(allocator,"{d}",.{child.pid}));
    return .{ .process = child.process, .job = job };
}
