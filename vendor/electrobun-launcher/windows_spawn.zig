const std = @import("std");

/// Quote arguments using the Windows CRT rules, including quotes and trailing
/// backslashes. Product arguments must survive the launcher unchanged.
pub fn commandLine(allocator: std.mem.Allocator, argv: []const []const u8) ![:0]u8 {
    if (argv.len == 0) return error.InvalidArguments;
    var result: std.ArrayList(u8) = .empty;
    errdefer result.deinit(allocator);
    for (argv, 0..) |arg, index| {
        if (std.mem.indexOfScalar(u8, arg, 0) != null) return error.InvalidArguments;
        if (index != 0) try result.append(allocator, ' ');
        try result.append(allocator, '"');
        var backslashes: usize = 0;
        for (arg) |char| {
            if (char == '\\') { backslashes += 1; continue; }
            try result.appendNTimes(allocator, '\\', if (char == '"') backslashes * 2 + 1 else backslashes);
            try result.append(allocator, char);
            backslashes = 0;
        }
        try result.appendNTimes(allocator, '\\', backslashes * 2);
        try result.append(allocator, '"');
    }
    return result.toOwnedSliceSentinel(allocator, 0);
}

test "Windows command line supports native and script main processes" {
    const allocator = std.testing.allocator;
    const native = try commandLine(allocator, &.{"C:\\Program Files\\Example\\main.exe"});
    defer allocator.free(native);
    try std.testing.expectEqualStrings("\"C:\\Program Files\\Example\\main.exe\"", native);

    const script = try commandLine(allocator, &.{
        "C:\\Program Files\\Example\\cottontail.exe",
        "C:\\Program Files\\Example\\Resources\\main.js",
    });
    defer allocator.free(script);
    try std.testing.expectEqualStrings(
        "\"C:\\Program Files\\Example\\cottontail.exe\" \"C:\\Program Files\\Example\\Resources\\main.js\"",
        script,
    );

    try std.testing.expectError(error.InvalidArguments, commandLine(allocator, &.{}));
    try std.testing.expectError(error.InvalidArguments, commandLine(allocator, &.{"bad\x00argument"}));
}

test "Windows arguments retain empty values, quotes and final backslashes" {
    const allocator = std.testing.allocator;
    const command = try commandLine(allocator, &.{ "", "a\"b", "C:\\space dir\\" });
    defer allocator.free(command);
    try std.testing.expectEqualStrings("\"\" \"a\\\"b\" \"C:\\space dir\\\\\"", command);
}
