use std::ptr;

use tauri::WebviewWindow;
use windows_sys::Win32::Foundation::{HWND, POINT};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    EnableMenuItem, GetCursorPos, GetSystemMenu, IsZoomed, MF_BYCOMMAND, MF_ENABLED, MF_GRAYED,
    PostMessageW, SC_CLOSE, SC_MAXIMIZE, SC_MINIMIZE, SC_MOVE, SC_RESTORE, SC_SIZE, TPM_RETURNCMD,
    TPM_RIGHTBUTTON, TrackPopupMenu, WM_SYSCOMMAND,
};

pub fn install(window: &WebviewWindow) -> Result<(), String> {
    window
        .set_decorations(false)
        .and_then(|()| window.set_shadow(true))
        .map_err(|error| error.to_string())
}

pub fn show_system_menu(window: &WebviewWindow) -> Result<(), String> {
    let hwnd = window.hwnd().map_err(|error| error.to_string())?.0 as usize;
    window
        .run_on_main_thread(move || unsafe { track_system_menu(hwnd as HWND) })
        .map_err(|error| error.to_string())
}

unsafe fn track_system_menu(hwnd: HWND) {
    unsafe {
        let menu = GetSystemMenu(hwnd, 0);
        if menu.is_null() {
            return;
        }
        let maximized = IsZoomed(hwnd) != 0;
        for (command, enabled) in [
            (SC_RESTORE, maximized),
            (SC_MOVE, !maximized),
            (SC_SIZE, !maximized),
            (SC_MINIMIZE, true),
            (SC_MAXIMIZE, !maximized),
            (SC_CLOSE, true),
        ] {
            let state = if enabled { MF_ENABLED } else { MF_GRAYED };
            EnableMenuItem(menu, command, MF_BYCOMMAND | state);
        }
        let mut cursor = POINT { x: 0, y: 0 };
        if GetCursorPos(&mut cursor) == 0 {
            return;
        }
        let command = TrackPopupMenu(
            menu,
            TPM_RETURNCMD | TPM_RIGHTBUTTON,
            cursor.x,
            cursor.y,
            0,
            hwnd,
            ptr::null(),
        );
        if command != 0 {
            PostMessageW(hwnd, WM_SYSCOMMAND, command as usize, 0);
        }
    }
}
