use tauri::WebviewWindow;

use super::WindowChromeUpdate;

pub(super) use super::unsupported_window_menu as show_system_menu;

pub struct Header;

impl Header {
    pub fn update(&self, _update: WindowChromeUpdate) -> Result<(), String> {
        Ok(())
    }
}

pub fn prepare(_identifier: &str) {}

pub fn install(_window: &WebviewWindow) -> Result<Header, String> {
    Ok(Header)
}
