#[cfg(target_os = "linux")]
mod linux;

use serde::{Deserialize, Serialize};
use tauri::{State, WebviewWindow};

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum WindowChromeKind {
    GtkNative,
    Html,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowChromeUpdate {
    title: String,
    subtitle: String,
    can_navigate_newer: bool,
    can_navigate_older: bool,
    commit_selection_enabled: bool,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
#[cfg(any(target_os = "linux", test))]
pub enum WindowChromeAction {
    Sidebar,
    Help,
    Picker,
    Newer,
    Older,
}

pub struct WindowChromeState {
    #[cfg(target_os = "linux")]
    header: linux::Header,
}

pub fn prepare(identifier: &str) {
    #[cfg(target_os = "linux")]
    gtk::glib::set_prgname(Some(identifier));
    #[cfg(not(target_os = "linux"))]
    let _ = identifier;
}

#[tauri::command]
pub fn get_window_chrome() -> WindowChromeKind {
    if cfg!(target_os = "linux") {
        WindowChromeKind::GtkNative
    } else {
        WindowChromeKind::Html
    }
}

#[tauri::command]
pub fn update_window_chrome(
    update: WindowChromeUpdate,
    state: State<'_, WindowChromeState>,
) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    return state.header.update(update);
    #[cfg(not(target_os = "linux"))]
    {
        let WindowChromeUpdate {
            title,
            subtitle,
            can_navigate_newer,
            can_navigate_older,
            commit_selection_enabled,
        } = update;
        let _ = (
            title,
            subtitle,
            can_navigate_newer,
            can_navigate_older,
            commit_selection_enabled,
            state,
        );
        Ok(())
    }
}

pub fn install(window: &WebviewWindow) -> Result<WindowChromeState, String> {
    #[cfg(target_os = "linux")]
    return Ok(WindowChromeState {
        header: linux::install(window)?,
    });
    #[cfg(not(target_os = "linux"))]
    {
        let _ = window;
        Ok(WindowChromeState {})
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_os = "linux")]
    #[test]
    fn uses_the_desktop_identifier_as_the_gtk_program_name() {
        prepare("com.rubyelders.grr");
        assert_eq!(gtk::glib::prgname().as_deref(), Some("com.rubyelders.grr"));
    }

    #[test]
    fn serializes_platform_and_actions_for_the_frontend() {
        assert_eq!(
            serde_json::to_string(&WindowChromeKind::GtkNative).unwrap(),
            "\"gtk-native\""
        );
        assert_eq!(
            serde_json::to_string(&WindowChromeKind::Html).unwrap(),
            "\"html\""
        );
        for (action, name) in [
            (WindowChromeAction::Sidebar, "sidebar"),
            (WindowChromeAction::Help, "help"),
            (WindowChromeAction::Picker, "picker"),
            (WindowChromeAction::Newer, "newer"),
            (WindowChromeAction::Older, "older"),
        ] {
            assert_eq!(serde_json::to_value(action).unwrap(), name);
        }
    }

    #[test]
    fn accepts_the_shared_header_state() {
        let update: WindowChromeUpdate = serde_json::from_value(serde_json::json!({
            "title": "Review", "subtitle": "abc by Author",
            "canNavigateNewer": false, "canNavigateOlder": true,
            "commitSelectionEnabled": true
        }))
        .unwrap();
        assert_eq!(update.title, "Review");
        assert_eq!(update.subtitle, "abc by Author");
        assert!(!update.can_navigate_newer);
        assert!(update.can_navigate_older);
        assert!(update.commit_selection_enabled);
    }
}
