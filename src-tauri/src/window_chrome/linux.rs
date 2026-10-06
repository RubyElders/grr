use std::sync::Mutex;

use gtk::glib::{self, ControlFlow};
use gtk::prelude::*;
use tauri::{Emitter, WebviewWindow};

use super::{WindowChromeAction, WindowChromeUpdate};

pub(super) use super::unsupported_window_menu as show_system_menu;

pub fn prepare(identifier: &str) {
    gtk::glib::set_prgname(Some(identifier));
}

pub struct Header {
    sender: Mutex<glib::Sender<WindowChromeUpdate>>,
}

impl Header {
    pub fn update(&self, update: WindowChromeUpdate) -> Result<(), String> {
        self.sender
            .lock()
            .map_err(|_| "native header lock was poisoned".to_owned())?
            .send(update)
            .map_err(|_| "native header is unavailable".to_owned())
    }
}

pub fn install(window: &WebviewWindow) -> Result<Header, String> {
    let gtk_window = window.gtk_window().map_err(|error| error.to_string())?;
    let header = gtk::HeaderBar::builder()
        .show_close_button(true)
        .has_subtitle(false)
        .build();

    let sidebar = icon_button("sidebar-show-symbolic", "Toggle file sidebar");
    emit_action(&sidebar, window, WindowChromeAction::Sidebar);
    header.pack_start(&sidebar);

    let help = icon_button("help-about-symbolic", "Keyboard shortcuts");
    emit_action(&help, window, WindowChromeAction::Help);
    header.pack_end(&help);

    let navigation = gtk::Box::new(gtk::Orientation::Horizontal, 4);
    let newer = icon_button("go-previous-symbolic", "Show newer commit");
    emit_action(&newer, window, WindowChromeAction::Newer);
    navigation.pack_start(&newer, false, false, 0);

    let title = gtk::Label::new(Some("grr"));
    title.set_ellipsize(gtk::pango::EllipsizeMode::End);
    title.set_max_width_chars(52);
    title.style_context().add_class("title");
    let subtitle = gtk::Label::new(Some("Loading commit diff..."));
    subtitle.set_ellipsize(gtk::pango::EllipsizeMode::End);
    subtitle.set_max_width_chars(64);
    subtitle.style_context().add_class("subtitle");
    let labels = gtk::Box::new(gtk::Orientation::Vertical, 0);
    labels.pack_start(&title, false, false, 0);
    labels.pack_start(&subtitle, false, false, 0);

    let selector = gtk::Button::new();
    selector.set_relief(gtk::ReliefStyle::None);
    selector.set_tooltip_text(Some("Choose commits to review"));
    selector.add(&labels);
    emit_action(&selector, window, WindowChromeAction::Picker);
    navigation.pack_start(&selector, true, true, 0);

    let older = icon_button("go-next-symbolic", "Show older commit");
    emit_action(&older, window, WindowChromeAction::Older);
    navigation.pack_start(&older, false, false, 0);
    header.set_custom_title(Some(&navigation));

    #[allow(deprecated)]
    let (sender, receiver) =
        glib::MainContext::channel::<WindowChromeUpdate>(glib::Priority::DEFAULT);
    receiver.attach(None, move |update| {
        title.set_text(&update.title);
        subtitle.set_text(&update.subtitle);
        newer.set_sensitive(update.can_navigate_newer);
        older.set_sensitive(update.can_navigate_older);
        selector.set_sensitive(update.commit_selection_enabled);
        sidebar.set_tooltip_text(update.tooltips.get("sidebar").map(String::as_str));
        help.set_tooltip_text(update.tooltips.get("help").map(String::as_str));
        selector.set_tooltip_text(update.tooltips.get("picker").map(String::as_str));
        newer.set_tooltip_text(update.tooltips.get("newer").map(String::as_str));
        older.set_tooltip_text(update.tooltips.get("older").map(String::as_str));
        ControlFlow::Continue
    });

    gtk_window.set_titlebar(Some(&header));
    header.show_all();
    Ok(Header {
        sender: Mutex::new(sender),
    })
}

fn icon_button(icon: &str, tooltip: &str) -> gtk::Button {
    let button = gtk::Button::from_icon_name(Some(icon), gtk::IconSize::Button);
    button.set_relief(gtk::ReliefStyle::None);
    button.set_tooltip_text(Some(tooltip));
    button
}

fn emit_action(button: &gtk::Button, window: &WebviewWindow, action: WindowChromeAction) {
    let window = window.clone();
    button.connect_clicked(move |_| {
        let _ = window.emit("window-chrome-action", action);
    });
}
