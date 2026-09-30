//! Product-owned Windows entry. Process setup follows the existing launcher;
//! installation, extraction and uninstall are exclusively owned by NSIS.
const std = @import("std");
const windows_spawn = @import("windows_spawn.zig");
const data_service = @import("data_service.zig");
const win = std.os.windows;

const ProcessInformation = extern struct { process: win.HANDLE, thread: win.HANDLE, pid: u32, thread_id: u32 };
const StartupInfo = extern struct {
    cb: u32 = @sizeOf(StartupInfo), reserved: ?win.LPWSTR = null, desktop: ?win.LPWSTR = null, title: ?win.LPWSTR = null,
    x: u32 = 0, y: u32 = 0, width: u32 = 0, height: u32 = 0, x_chars: u32 = 0, y_chars: u32 = 0,
    fill: u32 = 0, flags: u32 = 0, show: u16 = 0, reserved_size: u16 = 0, reserved_data: ?*u8 = null,
    stdin: ?win.HANDLE = null, stdout: ?win.HANDLE = null, stderr: ?win.HANDLE = null,
};
extern "kernel32" fn CreateProcessW(?[*:0]const u16, [*:0]u16, ?*anyopaque, ?*anyopaque, win.BOOL, u32, ?*anyopaque, ?[*:0]const u16, *StartupInfo, *ProcessInformation) callconv(.winapi) win.BOOL;
extern "kernel32" fn WaitForSingleObject(win.HANDLE, u32) callconv(.winapi) u32;
extern "kernel32" fn GetExitCodeProcess(win.HANDLE, *u32) callconv(.winapi) win.BOOL;
extern "kernel32" fn GetCurrentProcessId() callconv(.winapi) u32;
extern "kernel32" fn GetStdHandle(u32) callconv(.winapi) ?win.HANDLE;
extern "kernel32" fn CloseHandle(win.HANDLE) callconv(.winapi) win.BOOL;
extern "kernel32" fn ExitProcess(u32) callconv(.winapi) noreturn;
extern "kernel32" fn OpenMutexW(u32, win.BOOL, [*:0]const u16) callconv(.winapi) ?win.HANDLE;
extern "user32" fn MessageBoxW(?win.HWND, [*:0]const u16, [*:0]const u16, u32) callconv(.winapi) i32;
extern "user32" fn AllowSetForegroundWindow(u32) callconv(.winapi) win.BOOL;
extern "shell32" fn SetCurrentProcessExplicitAppUserModelID([*:0]const u16) callconv(.winapi) i32;

fn equal(value: []const u8, expected: []const u8) bool { return std.mem.eql(u8, value, expected); }

fn run(init: std.process.Init) !u32 {
    const io = init.io;
    var arena = std.heap.ArenaAllocator.init(init.gpa);
    defer arena.deinit();
    const allocator = arena.allocator();
    const executable = try std.process.executablePathAlloc(io, allocator);
    const root = std.fs.path.dirname(executable) orelse return error.InvalidExecutablePath;
    const manifest_path = try std.fs.path.join(allocator, &.{ root, "lumeria.json" });
    const source = try std.Io.Dir.cwd().readFileAlloc(io, manifest_path, allocator, .limited(64 * 1024));
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, source, .{});
    if (parsed.value != .object) return error.InvalidProductManifest;
    const manifest = parsed.value.object;
    const schema = manifest.get("schemaVersion") orelse return error.InvalidProductManifest;
    if (schema != .integer or schema.integer != 1) return error.IncompatibleProductManifest;
    inline for (.{ .{ "identifier", "com.lumeria.app" }, .{ "platform", "win32" }, .{ "arch", "x64" } }) |field| {
        const value = manifest.get(field[0]) orelse return error.InvalidProductManifest;
        if (value != .string or !equal(value.string, field[1])) return error.IncompatibleProductManifest;
    }
    var args: std.ArrayList([]const u8) = .empty;
    var iterator = try std.process.Args.Iterator.initAllocator(init.minimal.args, allocator);
    _ = iterator.next();
    while (iterator.next()) |arg| try args.append(allocator, arg);
    const control = args.items.len > 0 and (equal(args.items[0], "--lumeria-shutdown") or equal(args.items[0], "--lumeria-status"));
    if (control and args.items.len != 1) return error.InvalidArguments;
    const login = args.items.len == 1 and equal(args.items[0], "--lumeria-autostart");
    if (!control and args.items.len > 0 and !login) return error.InvalidArguments;
    if (!control) {
        if (OpenMutexW(0x00100000, .FALSE, std.unicode.utf8ToUtf16LeStringLiteral("Local\\com.lumeria.app.installer"))) |installation| {
            _ = CloseHandle(installation);
            return error.InstallationInProgress;
        }
    }
    const bin = try std.fs.path.join(allocator, &.{ root, "runtime", "bin" });
    const runtime = try std.fs.path.join(allocator, &.{ bin, "LumeriaRuntime.exe" });
    const script = try std.fs.path.join(allocator, if (control) &.{ root, "runtime", "control.js" } else &.{ root, "runtime", "Resources", "main.js" });
    var argv: std.ArrayList([]const u8) = .empty;
    try argv.appendSlice(allocator, &.{ runtime, script });
    try argv.appendSlice(allocator, args.items);
    const env = init.environ_map;
    try env.put("LUMERIA_PRODUCT_ROOT", root);
    try env.put("LUMERIA_LAUNCH_ORIGIN", if (login) "login" else "manual");
    try env.put("LUMERIA_LAUNCH_ARGUMENTS", try std.json.Stringify.valueAlloc(allocator, args.items, .{}));
    const pid = try std.fmt.allocPrint(allocator, "{d}", .{GetCurrentProcessId()});
    try env.put("LUMERIA_LAUNCHER_PID", pid);
    // The SDK still uses this for runtime shutdown; it is not an install identity.
    try env.put("ELECTROBUN_LAUNCHER_PID", pid);
    _ = env.swapRemove("ELECTROBUN_INSTALL_ROOT_NAME");
    try env.put("ICU_DATA", bin);
    // Native libraries create app.log relative to cwd. Keep the installed
    // payload immutable; all resource and DLL paths still use the runtime exe.
    const working_directory = if (control) bin else blk: {
        const data = env.get("LUMERIA_NATIVE_DATA_DIR") orelse try std.fs.path.join(allocator, &.{
            env.get("APPDATA") orelse return error.AppDataUnavailable, "com.lumeria.app",
        });
        if (!std.fs.path.isAbsolute(data)) return error.InvalidDataDirectory;
        const logs = try std.fs.path.join(allocator, &.{ data, "logs" });
        try std.Io.Dir.cwd().createDirPath(io, logs);
        break :blk logs;
    };
    _ = env.swapRemove("LUMERIA_DATA_PIPE");
    _ = env.swapRemove("LUMERIA_DATA_PID");
    const data = if (!control) try data_service.start(allocator, env,
        try std.fs.path.join(allocator, &.{ root, "runtime", "Resources", "app", "bun", "lumeria-native-data.exe" })) else null;
    defer if (data) |service| service.close();
    const environment = try env.createWindowsBlock(allocator, .{});
    const command_line = try windows_spawn.commandLine(allocator, argv.items);
    const wide_command = try std.unicode.wtf8ToWtf16LeAllocZ(allocator, command_line);
    const wide_runtime = try std.unicode.wtf8ToWtf16LeAllocZ(allocator, runtime);
    const wide_cwd = try std.unicode.wtf8ToWtf16LeAllocZ(allocator, working_directory);
    const app_id = std.unicode.utf8ToUtf16LeStringLiteral("com.lumeria.app");
    _ = SetCurrentProcessExplicitAppUserModelID(app_id);
    if (!control and !login) _ = AllowSetForegroundWindow(0xffffffff);
    var startup: StartupInfo = .{};
    startup.stdin = GetStdHandle(0xfffffff6);
    startup.stdout = GetStdHandle(0xfffffff5);
    startup.stderr = GetStdHandle(0xfffffff4);
    const inherit = startup.stdout != null and startup.stdout != win.INVALID_HANDLE_VALUE;
    if (inherit) startup.flags = 0x100;
    var child: ProcessInformation = undefined;
    if (!CreateProcessW(wide_runtime.ptr, wide_command.ptr, null, null, if (inherit) .TRUE else .FALSE,
        0x08000000 | 0x00000400, @ptrCast(@constCast(environment.slice.ptr)), wide_cwd.ptr, &startup, &child).toBool()) {
        return error.RuntimeCouldNotStart;
    }
    defer _ = CloseHandle(child.process);
    defer _ = CloseHandle(child.thread);
    if (WaitForSingleObject(child.process, 0xffffffff) != 0) return error.RuntimeWaitFailed;
    var code: u32 = 0;
    if (!GetExitCodeProcess(child.process, &code).toBool()) return error.RuntimeExitCodeUnavailable;
    return code;
}

pub fn main(init: std.process.Init) void {
    var args = std.process.Args.Iterator.initAllocator(init.minimal.args, init.gpa) catch ExitProcess(1);
    _ = args.next();
    const automatic = args.next() != null;
    var installation_in_progress = false;
    const code = run(init) catch |err| blk: {
        installation_in_progress = err == error.InstallationInProgress;
        std.debug.print("Lumeria startup failed: {s}\n", .{@errorName(err)});
        break :blk @as(u32, 1);
    };
    if (code != 0 and !automatic and init.environ_map.get("LUMERIA_NATIVE_DATA_DIR") == null and init.environ_map.get("ELECTROBUN_CONSOLE") == null) {
        const message: [*:0]const u16 = if (installation_in_progress)
            std.unicode.utf8ToUtf16LeStringLiteral("Lumeria is being installed or uninstalled. Try again after the installer has finished.")
        else std.unicode.utf8ToUtf16LeStringLiteral("Lumeria could not start. See the logs in AppData\\Roaming\\com.lumeria.app\\logs. If installation files are missing, reinstall Lumeria; your application data will be kept.");
        _ = MessageBoxW(null, message, std.unicode.utf8ToUtf16LeStringLiteral("Lumeria"), 0x10);
    }
    ExitProcess(code);
}
