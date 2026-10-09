#include <Windows.h>
#include <shellapi.h>
#include <cassert>
#include <iostream>
#include <vector>

static HWND window = reinterpret_cast<HWND>(0x1234);
static bool ready = true, registered = false, timer = false, timerAvailable = true;
static unsigned cancellations = 0;
static std::vector<DWORD> notifications;

static BOOL WINAPI notify(DWORD action, PNOTIFYICONDATAW icon) {
    assert(icon->hWnd == window);
    notifications.push_back(action);
    if (!ready) return FALSE;
    if (action == NIM_ADD) {
        if (registered) return FALSE;
        registered = true;
        return TRUE;
    }
    assert(action == NIM_MODIFY);
    return registered ? TRUE : FALSE;
}
static UINT_PTR WINAPI schedule(HWND hwnd, UINT_PTR id, UINT interval, TIMERPROC callback) {
    assert(hwnd == window && id == 1 && interval == 1000 && callback == nullptr);
    timer = timerAvailable;
    return timer ? id : 0;
}
static BOOL WINAPI cancel(HWND hwnd, UINT_PTR id) {
    assert(hwnd == window && id == 1);
    timer = false;
    ++cancellations;
    return TRUE;
}
#define Shell_NotifyIconW notify
#define SetTimer schedule
#define KillTimer cancel
#include "native_tray.h"

int main() {
    using namespace electrobun;
    NOTIFYICONDATAW icon = {};
    icon.cbSize = sizeof(icon);
    icon.hWnd = window;
    assert(restoreTrayIcon(window, icon) == TrayRestoreResult::restored);
    assert(registered && !timer && cancellations == 1);
    assert((notifications == std::vector<DWORD>{NIM_ADD}));

    notifications.clear();
    assert(restoreTrayIcon(window, icon) == TrayRestoreResult::restored);
    assert((notifications == std::vector<DWORD>{NIM_ADD, NIM_MODIFY}));
    assert(registered && !timer);

    ready = false;
    registered = false;
    assert(restoreTrayIcon(window, icon) == TrayRestoreResult::retryScheduled);
    assert(timer && !registered);
    for (unsigned i = 0; i < 3; ++i) {
        assert(restoreTrayIcon(window, icon) == TrayRestoreResult::retryScheduled);
        assert(timer && !registered);
    }
    ready = true;
    assert(restoreTrayIcon(window, icon) == TrayRestoreResult::restored);
    assert(registered && !timer);

    ready = false;
    registered = false;
    timerAvailable = false;
    assert(restoreTrayIcon(window, icon) == TrayRestoreResult::retryUnavailable);
    assert(!timer && !registered);
    std::cout << "PASS: initial add, duplicate notification, unavailable shell, repeated retry, recovery cancels timer, timer failure\n";
}
