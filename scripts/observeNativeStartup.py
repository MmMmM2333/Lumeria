"""Read-only WinEvent observer for BasicWindowClass visibility of one runtime image."""
import ctypes as c
from ctypes import wintypes as w
import json, os, sys, time

image_path, output, stop = sys.argv[1:4]
user = c.WinDLL("user32", use_last_error=True)
kernel = c.WinDLL("kernel32", use_last_error=True)
user.GetWindowThreadProcessId.argtypes = [w.HWND, c.POINTER(w.DWORD)]
user.GetClassNameW.argtypes = [w.HWND, w.LPWSTR, c.c_int]
kernel.OpenProcess.argtypes = [w.DWORD, w.BOOL, w.DWORD]
kernel.OpenProcess.restype = w.HANDLE
kernel.QueryFullProcessImageNameW.argtypes = [w.HANDLE, w.DWORD, w.LPWSTR, c.POINTER(w.DWORD)]
kernel.CloseHandle.argtypes = [w.HANDLE]
callback_type = c.WINFUNCTYPE(None, w.HANDLE, w.DWORD, w.HWND, c.c_long, c.c_long, w.DWORD, w.DWORD)

@callback_type
def callback(hook, event, hwnd, object_id, child_id, thread, timestamp):
    if object_id != 0 or child_id != 0 or not hwnd:
        return
    name = c.create_unicode_buffer(128)
    user.GetClassNameW(hwnd, name, len(name))
    if name.value != "BasicWindowClass":
        return
    pid = w.DWORD()
    user.GetWindowThreadProcessId(hwnd, c.byref(pid))
    process = kernel.OpenProcess(0x1000, False, pid.value)
    if not process:
        return
    try:
        path = c.create_unicode_buffer(32768)
        length = w.DWORD(len(path))
        if not kernel.QueryFullProcessImageNameW(process, 0, path, c.byref(length)):
            return
        if os.path.normcase(path.value) != os.path.normcase(image_path):
            return
        with open(output, "a", encoding="utf8") as stream:
            stream.write(json.dumps({"time": time.time() * 1000, "pid": pid.value, "event": "show" if event == 0x8002 else "hide"}) + "\n")
    finally:
        kernel.CloseHandle(process)

user.SetWinEventHook.argtypes = [w.DWORD, w.DWORD, w.HMODULE, callback_type, w.DWORD, w.DWORD, w.DWORD]
user.SetWinEventHook.restype = w.HANDLE
user.UnhookWinEvent.argtypes = [w.HANDLE]
hook = user.SetWinEventHook(0x8002, 0x8003, None, callback, 0, 0, 0)
if not hook:
    raise c.WinError(c.get_last_error())
open(output + ".ready", "w").close()
message = w.MSG()
try:
    deadline = time.monotonic() + 600
    while not os.path.exists(stop) and time.monotonic() < deadline:
        while user.PeekMessageW(c.byref(message), None, 0, 0, 1):
            user.TranslateMessage(c.byref(message))
            user.DispatchMessageW(c.byref(message))
        time.sleep(0.002)
finally:
    user.UnhookWinEvent(hook)
