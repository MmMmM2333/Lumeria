use super::*;

#[link(name = "user32")]
unsafe extern "system" {
    fn CreateWindowExW(ex: u32, class: *const u16, title: *const u16, style: u32,
        x: i32, y: i32, width: i32, height: i32, parent: Handle, menu: Handle,
        instance: Handle, param: *mut c_void) -> Handle;
    fn DestroyWindow(window: Handle) -> i32;
    fn GetCursor() -> Handle;
}

struct Windows { root: Handle, child: Handle, route: u64 }
impl Windows {
    unsafe fn new(route: u64) -> Self {
        let class: Vec<u16> = "STATIC\0".encode_utf16().collect();
        let root = unsafe { CreateWindowExW(0, class.as_ptr(), class.as_ptr(), 0,
            0, 0, 300, 200, null_mut(), null_mut(), null_mut(), null_mut()) };
        assert!(!root.is_null());
        let child = unsafe { CreateWindowExW(0, class.as_ptr(), class.as_ptr(), 0x40000000,
            17, 23, 100, 100, root, null_mut(), null_mut(), null_mut()) };
        assert!(!child.is_null());
        assert_eq!(unsafe { pixi_attach_input(root, route) }, 1);
        assert_eq!(unsafe { pixi_attach_input(child, route) }, 1);
        Self { root, child, route }
    }
    unsafe fn activate_text(&self) -> *mut WindowInputState {
        let state = unsafe { attached_input_state(self.root).unwrap() };
        unsafe { (*state).text_active = true; }
        state
    }
    fn text(&self) -> String {
        let mut output = String::new();
        let mut events = text_events().lock().unwrap();
        events.retain(|event| {
            if event.meta.route_id == self.route && event.meta.kind == TEXT_COMMIT {
                output.push_str(&String::from_utf16_lossy(&event.text));
            }
            event.meta.route_id != self.route
        });
        output
    }
}
impl Drop for Windows {
    fn drop(&mut self) { unsafe { DestroyWindow(self.root); } }
}

#[test]
fn child_character_messages_reach_the_root_text_session_once() {
    unsafe {
        let windows = Windows::new(880001);
        windows.activate_text();
        for unit in "word中文😀".encode_utf16() {
            SendMessageW(windows.child, 0x0102, unit as usize, 0);
        }
        assert_eq!(windows.text(), "word中文😀");
        SendMessageW(windows.root, 0x0102, '!' as usize, 0);
        assert_eq!(windows.text(), "!");
    }
}

#[test]
fn moving_focus_to_same_route_child_preserves_text_but_leaving_ends_it() {
    unsafe {
        let windows = Windows::new(880002);
        let state = windows.activate_text();
        SendMessageW(windows.root, 0x0008, windows.child as usize, 0);
        assert!((*state).text_active, "internal focus movement must retain the editor session");
        SendMessageW(windows.child, 0x0102, 'o' as usize, 0);
        assert_eq!(windows.text(), "o");
        SendMessageW(windows.child, 0x0008, 0, 0);
        assert!(!(*state).text_active, "leaving the child must stop the root session");
        SendMessageW(windows.child, 0x0102, 'x' as usize, 0);
        assert_eq!(windows.text(), "");
    }
}

#[test]
fn child_ime_uses_shared_composition_state_and_result_suppression() {
    unsafe {
        let windows = Windows::new(880003);
        let state = windows.activate_text();
        SendMessageW(windows.child, 0x010d, 0, 0);
        assert!((*state).ime_composing);
        SendMessageW(windows.child, 0x0100, 0x41, 0);
        let composing_key = input_events().lock().unwrap().iter()
            .find(|event| event.route_id == windows.route && event.kind == INPUT_KEY_DOWN).copied().unwrap();
        assert_ne!(composing_key.modifiers & (1 << 4), 0);
        (*state).suppressed_result_chars.extend("中文".encode_utf16());
        push_text_event(state, TEXT_COMMIT, 0, 0, "中文".encode_utf16().collect());
        for unit in "中文".encode_utf16() { SendMessageW(windows.child, 0x0102, unit as usize, 0); }
        SendMessageW(windows.child, 0x010e, 0, 0);
        assert!(!(*state).ime_composing);
        assert_eq!(windows.text(), "中文", "IME result WM_CHAR messages must not duplicate committed text");
    }
}

#[test]
fn child_ime_caret_is_converted_from_owner_client_coordinates() {
    unsafe {
        let windows = Windows::new(880004);
        let state = windows.activate_text();
        (*state).caret = Rect { left: 30, top: 40, right: 32, bottom: 60 };
        let caret = ime_caret(windows.child, windows.root, state).unwrap();
        assert_eq!((caret.left, caret.top, caret.right, caret.bottom), (13, 17, 15, 37));
    }
}

#[test]
fn different_child_route_cannot_read_or_preserve_root_text_session() {
    unsafe {
        let windows = Windows::new(880005);
        let state = windows.activate_text();
        (*attached_input_state(windows.child).unwrap()).route_id = 880006;
        SendMessageW(windows.child, 0x0102, 'x' as usize, 0);
        assert_eq!(windows.text(), "");
        SendMessageW(windows.root, 0x0008, windows.child as usize, 0);
        assert!(!(*state).text_active);
    }
}

#[test]
fn caret_update_after_native_blur_reports_inactive_without_restarting_input() {
    unsafe {
        let windows = Windows::new(880007);
        assert!(pixi_begin_text_input(windows.root, 30, 40, 2, 20) > 0);
        assert!(pixi_update_caret_rect(windows.root, 31, 40, 2, 20) > 0);
        SendMessageW(windows.root, 0x0008, windows.child as usize, 0);
        assert!(pixi_update_caret_rect(windows.root, 32, 40, 2, 20) > 0);
        SendMessageW(windows.child, 0x0008, 0, 0);
        let state = attached_input_state(windows.root).unwrap();
        for _ in 0..3 {
            assert_eq!(pixi_update_caret_rect(windows.root, 33, 40, 2, 20), 0);
            assert!(!(*state).text_active);
        }
        assert_eq!(pixi_update_caret_rect(windows.root, 0, 0, -1, 20), -4);
        assert_eq!(pixi_update_caret_rect(windows.root, i32::MAX, 0, 2, 20), -4);
        SendMessageW(windows.child, 0x0102, 'x' as usize, 0);
        assert_eq!(windows.text(), "", "late updates must not restart text capture");
        assert_eq!(pixi_end_text_input(windows.root), 0);
        assert!(pixi_begin_text_input(windows.root, 30, 40, 2, 20) > 0);
        SendMessageW(windows.child, 0x0102, 'y' as usize, 0);
        assert_eq!(windows.text(), "y", "an explicit new session must accept input");
    }
}


#[test]
fn child_cursor_retains_the_same_route_root_cursor() {
    unsafe {
        let windows = Windows::new(880008);
        for kind in [0, 1, 2, 4, 5, 9, 10] {
            assert_eq!(pixi_set_cursor(windows.root, kind), 1);
            for _ in 0..3 {
                SendMessageW(windows.child, 0x0020, windows.child as usize, 1 | (0x0200 << 16));
                assert_eq!(GetCursor(), cursor_handle(kind), "child WM_SETCURSOR must retain the root's resize cursor");
            }
        }
    }
}

#[test]
fn different_route_child_keeps_its_own_cursor() {
    unsafe {
        let windows = Windows::new(880009);
        (*attached_input_state(windows.child).unwrap()).route_id = 880010;
        assert_eq!(pixi_set_cursor(windows.child, 5), 1);
        assert_eq!(pixi_set_cursor(windows.root, 4), 1);
        SendMessageW(windows.child, 0x0020, windows.child as usize, 1 | (0x0200 << 16));
        assert_eq!(GetCursor(), cursor_handle(5));
    }
}

#[test]
fn both_diagonal_resize_cursor_shapes_are_supported() {
    unsafe {
        let windows = Windows::new(880011);
        assert_eq!(pixi_set_cursor(windows.root, 10), 1);
        assert!(!cursor_handle(10).is_null());
        assert_ne!(cursor_handle(9), cursor_handle(10));
        assert_eq!(GetCursor(), LoadCursorW(null_mut(), 32643usize as *const u16));
        assert_eq!(pixi_set_cursor(windows.root, 11), -4);
    }
}

#[link(name = "user32")]
unsafe extern "system" { fn ShowWindow(window: Handle, command: i32) -> i32; }

#[test]
fn fullscreen_layer_follows_activation_visibility_and_mode() {
    unsafe {
        let windows = Windows::new(880014);
        let topmost = || GetWindowLongPtrW(windows.root, -20) & 8 != 0;
        assert_eq!(pixi_set_fullscreen_layer(windows.child, 1), -4);
        assert_eq!(pixi_set_fullscreen_layer(windows.root, 2), -4);
        assert_eq!(pixi_set_fullscreen_layer(windows.root, 1), 1);
        assert!(!topmost(), "hidden fullscreen must not elevate");
        FULLSCREEN_LAYER_HOOKS.with(|cell| {
            let hooks = cell.borrow();
            assert!(hooks.windows.contains(&(windows.root as usize)));
            assert!(!hooks.foreground.is_null() && !hooks.reorder.is_null());
        });
        ShowWindow(windows.root, 4); // Show without activating another app.
        SendMessageW(windows.root, 0x0006, 1, 0);
        assert!(topmost(), "active fullscreen must cover the taskbar");
        SendMessageW(windows.root, 0x0006, 0, 0);
        assert!(!topmost(), "inactive fullscreen must release the layer");
        SendMessageW(windows.root, 0x0006, 1, 0);
        SendMessageW(windows.root, 0x0005, 1, 0);
        assert!(!topmost(), "minimize must release the layer");
        SendMessageW(windows.root, 0x0006, 1, 0);
        ShowWindow(windows.root, 0);
        assert!(!topmost(), "hide must release the layer");
        ShowWindow(windows.root, 4);
        SendMessageW(windows.root, 0x0006, 1, 0);
        assert_eq!(pixi_set_fullscreen_layer(windows.root, 0), 1);
        assert!(!topmost(), "windowed mode must release the layer");
        SendMessageW(windows.root, 0x0006, 1, 0);
        assert!(!topmost(), "later windowed activation must not elevate");
        assert_eq!(pixi_set_fullscreen_layer(windows.root, 1), 1);
        SendMessageW(windows.root, 0x0006, 1, 0);
        assert_eq!(pixi_detach_input(windows.root), 1);
        assert!(!topmost(), "detach must restore the previous layer");
        FULLSCREEN_LAYER_HOOKS.with(|cell| {
            let hooks = cell.borrow();
            assert!(hooks.windows.is_empty());
            assert!(hooks.foreground.is_null() && hooks.reorder.is_null());
        });
    }
}

#[test]
fn fullscreen_layer_preserves_an_existing_topmost_policy() {
    unsafe {
        let windows = Windows::new(880015);
        ShowWindow(windows.root, 4);
        assert_ne!(SetWindowPos(windows.root, -1isize as Handle, 0, 0, 0, 0, 0x213), 0);
        assert_ne!(GetWindowLongPtrW(windows.root, -20) & 8, 0, "initial topmost");
        assert_eq!(pixi_set_fullscreen_layer(windows.root, 1), 1);
        assert_eq!((*attached_input_state(windows.root).unwrap()).fullscreen_restore_topmost, Some(true));
        SendMessageW(windows.root, 0x0006, 0, 0);
        assert_eq!(pixi_set_fullscreen_layer(windows.root, 0), 1);
        assert_ne!(GetWindowLongPtrW(windows.root, -20) & 8, 0);
    }
}
