"""Inspect and exercise only a release-test process owned by this workspace.

Uses the same Win32 message approach as the project's existing Native smoke
helpers. It has no desktop-wide input or terminal automation entry point.
"""
import argparse
import ctypes as c
from ctypes import wintypes as w
import json
import os
from pathlib import Path
import re
import time

u = c.WinDLL("user32", use_last_error=True)
k = c.WinDLL("kernel32", use_last_error=True)
callback_type = c.WINFUNCTYPE(w.BOOL, w.HWND, w.LPARAM)
u.EnumWindows.argtypes = [callback_type, w.LPARAM]
u.EnumChildWindows.argtypes = [w.HWND, callback_type, w.LPARAM]
u.GetWindowThreadProcessId.argtypes = [w.HWND, c.POINTER(w.DWORD)]
u.GetWindowTextW.argtypes = [w.HWND, w.LPWSTR, c.c_int]
u.GetClassNameW.argtypes = [w.HWND, w.LPWSTR, c.c_int]
u.GetWindowRect.argtypes = [w.HWND, c.POINTER(w.RECT)]
u.IsWindowVisible.argtypes = [w.HWND]
u.IsWindowEnabled.argtypes = [w.HWND]
u.GetDlgCtrlID.argtypes = [w.HWND]
u.PostMessageW.argtypes = [w.HWND, w.UINT, w.WPARAM, w.LPARAM]
u.SendMessageW.argtypes = [w.HWND, w.UINT, w.WPARAM, w.LPARAM]
u.SendMessageW.restype = w.LPARAM
u.SetForegroundWindow.argtypes = [w.HWND]
u.ShowWindow.argtypes = [w.HWND, c.c_int]
u.FindWindowExW.argtypes = [w.HWND, w.HWND, w.LPCWSTR, w.LPCWSTR]
u.FindWindowExW.restype = w.HWND
u.EnumThreadWindows.argtypes = [w.DWORD, callback_type, w.LPARAM]
u.GetMenuItemCount.argtypes = [w.HMENU]
u.GetMenuItemID.argtypes = [w.HMENU, c.c_int]
u.GetMenuItemID.restype = w.UINT
u.GetMenuStringW.argtypes = [w.HMENU, w.UINT, w.LPWSTR, c.c_int, w.UINT]
k.OpenProcess.argtypes = [w.DWORD, w.BOOL, w.DWORD]
k.OpenProcess.restype = w.HANDLE
k.QueryFullProcessImageNameW.argtypes = [w.HANDLE, w.DWORD, w.LPWSTR, c.POINTER(w.DWORD)]
k.CloseHandle.argtypes = [w.HANDLE]
try:
    u.SetProcessDpiAwarenessContext.argtypes = [c.c_void_p]
    u.SetProcessDpiAwarenessContext(c.c_void_p(-4))
except AttributeError:
    pass


def assert_owned_process(pid):
    handle = k.OpenProcess(0x1000, False, pid)
    if not handle:
        raise c.WinError(c.get_last_error())
    try:
        buffer = c.create_unicode_buffer(32768)
        size = w.DWORD(len(buffer))
        if not k.QueryFullProcessImageNameW(handle, 0, buffer, c.byref(size)):
            raise c.WinError(c.get_last_error())
        workspace = os.path.normcase(str(Path.cwd().resolve()))
        executable = os.path.normcase(buffer.value)
        if os.path.commonpath([workspace, executable]) != workspace:
            raise RuntimeError("UI target is not an executable in this workspace")
    finally:
        k.CloseHandle(handle)


def describe(handle):
    text = c.create_unicode_buffer(2048)
    name = c.create_unicode_buffer(256)
    rectangle = w.RECT()
    u.GetWindowTextW(handle, text, len(text))
    u.GetClassNameW(handle, name, len(name))
    if name.value == "Edit":
        # GetWindowText cannot retrieve another process's edit contents.
        u.SendMessageW(handle, 0x000D, len(text), c.cast(text, c.c_void_p).value)
    u.GetWindowRect(handle, c.byref(rectangle))
    return {
        "handle": int(handle), "title": text.value, "class": name.value,
        "visible": bool(u.IsWindowVisible(handle)), "enabled": bool(u.IsWindowEnabled(handle)),
        "rect": [rectangle.left, rectangle.top, rectangle.right, rectangle.bottom],
    }


def windows(pid):
    found = []

    @callback_type
    def visit(handle, _):
        owner = w.DWORD()
        u.GetWindowThreadProcessId(handle, c.byref(owner))
        if owner.value == pid:
            item = describe(handle)
            controls = []

            @callback_type
            def child(control, _):
                value = describe(control)
                value["id"] = u.GetDlgCtrlID(control)
                if value["class"] == "Button":
                    value["checked"] = int(u.SendMessageW(control, 0x00F0, 0, 0))
                controls.append(value)
                return True

            u.EnumChildWindows(handle, child, 0)
            item["controls"] = controls
            found.append(item)
        return True

    u.EnumWindows(visit, 0)
    return found


def unique_visible(items):
    choices = [item for item in items if item["visible"] and item["enabled"] and item["title"]]
    if len(choices) != 1:
        raise RuntimeError("Expected one visible test window: " + json.dumps(choices, ensure_ascii=False))
    return choices[0]


def tray_action(pid, tray_id, action):
    candidates = []
    handle = None
    while True:
        handle = u.FindWindowExW(w.HWND(-3), handle, "TrayWindowClass", None)
        if not handle:
            break
        owner = w.DWORD()
        thread = u.GetWindowThreadProcessId(handle, c.byref(owner))
        if owner.value == pid:
            candidates.append((handle, thread))
    if len(candidates) != 1:
        raise RuntimeError("Expected one tray owned by the test runtime")
    handle, thread = candidates[0]
    if not u.PostMessageW(handle, 0x464, tray_id, 0x205):
        raise c.WinError(c.get_last_error())
    deadline = time.monotonic() + 4
    menus = []

    @callback_type
    def menu_window(window, _):
        item = describe(window)
        if item["class"] == "#32768" and item["visible"]:
            menus.append(window)
        return True

    while not menus:
        u.EnumThreadWindows(thread, menu_window, 0)
        if time.monotonic() > deadline:
            raise RuntimeError("The test runtime's tray menu did not open")
        time.sleep(0.01)
    menu = u.SendMessageW(menus[0], 0x1E1, 0, 0)
    entries = []
    for index in range(u.GetMenuItemCount(menu)):
        title = c.create_unicode_buffer(512)
        u.GetMenuStringW(menu, index, title, len(title), 0x400)
        entries.append({"title": title.value, "command": int(u.GetMenuItemID(menu, index))})
    pattern = r"重启|重新启动|restart" if action == "restart" else r"设置|settings"
    selected = [entry for entry in entries if re.search(pattern, entry["title"], re.I)]
    if len(selected) != 1 or selected[0]["command"] == 0xFFFFFFFF:
        u.PostMessageW(handle, 0x1F, 0, 0)
        raise RuntimeError("Tray action is ambiguous: " + json.dumps(entries, ensure_ascii=False))
    u.PostMessageW(handle, 0x111, selected[0]["command"], 0)
    u.PostMessageW(handle, 0x1F, 0, 0)
    return {"menu": entries, "selected": selected[0]}


parser = argparse.ArgumentParser()
parser.add_argument("action", choices=["state", "capture", "click", "close", "tray"])
parser.add_argument("pid", type=int)
parser.add_argument("value", nargs="?")
parser.add_argument("extra", nargs="?")
args = parser.parse_args()
assert_owned_process(args.pid)
current = windows(args.pid)
result = {}
if args.action == "capture":
    from PIL import ImageGrab
    target = unique_visible(current)
    u.SetForegroundWindow(target["handle"])
    time.sleep(0.25)
    refreshed = unique_visible(windows(args.pid))
    output = Path(args.value).resolve()
    if Path.cwd().resolve() not in output.parents:
        raise RuntimeError("Screenshot output must remain in the workspace")
    ImageGrab.grab(bbox=tuple(refreshed["rect"]), all_screens=True).save(output)
    result["screenshot"] = str(output)
elif args.action == "click":
    controls = [control for window in current if window["visible"] and window["enabled"]
                for control in window["controls"] if control["visible"] and control["enabled"]
                and control["class"] == "Button" and control["id"] == int(args.value)]
    if len(controls) != 1:
        raise RuntimeError("Expected one observed enabled button: " + json.dumps(controls, ensure_ascii=False))
    u.PostMessageW(controls[0]["handle"], 0x00F5, 0, 0)
    result["clicked"] = controls[0]["title"]
    time.sleep(0.2)
elif args.action == "close":
    target = unique_visible(current)
    u.PostMessageW(target["handle"], 0x0010, 0, 0)
    time.sleep(0.2)
elif args.action == "tray":
    result.update(tray_action(args.pid, int(args.value), args.extra))
    time.sleep(0.2)
result["windows"] = windows(args.pid)
print(json.dumps(result, ensure_ascii=False))
