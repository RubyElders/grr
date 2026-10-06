use std::cell::RefCell;

use dispatch2::MainThreadBound;
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, ProtocolObject};
use objc2::{
    AnyThread, DefinedClass, MainThreadMarker, MainThreadOnly, define_class, msg_send, sel,
};
use objc2_app_kit::{
    NSBezelStyle, NSButton, NSColor, NSFont, NSFontAttributeName, NSForegroundColorAttributeName,
    NSImage, NSToolbar, NSToolbarDelegate, NSToolbarDisplayMode,
    NSToolbarFlexibleSpaceItemIdentifier, NSToolbarItem, NSView, NSWindow, NSWindowTitleVisibility,
    NSWindowToolbarStyle,
};
use objc2_foundation::{
    NSArray, NSAttributedString, NSDictionary, NSMutableAttributedString, NSObject,
    NSObjectProtocol, NSPoint, NSRect, NSSize, NSString, ns_string,
};
use tauri::{Emitter, WebviewWindow};

use super::{WindowChromeAction, WindowChromeUpdate};

const NAVIGATION_WIDTH: f64 = 440.0;

pub struct Header {
    native: MainThreadBound<NativeHeader>,
}

struct NativeHeader {
    window: Retained<NSWindow>,
    delegate: Retained<ToolbarDelegate>,
}

struct Navigation {
    newer: Retained<NSButton>,
    picker: Retained<NSButton>,
    older: Retained<NSButton>,
}

struct ToolbarIvars {
    window: WebviewWindow,
    navigation: RefCell<Option<Navigation>>,
}

define_class!(
    #[unsafe(super = NSObject)]
    #[thread_kind = MainThreadOnly]
    #[ivars = ToolbarIvars]
    struct ToolbarDelegate;

    unsafe impl NSObjectProtocol for ToolbarDelegate {}

    unsafe impl NSToolbarDelegate for ToolbarDelegate {
        #[unsafe(method_id(toolbarDefaultItemIdentifiers:))]
        #[unsafe(method_family = none)]
        fn default_items(&self, _toolbar: &NSToolbar) -> Retained<NSArray<NSString>> {
            item_identifiers()
        }

        #[unsafe(method_id(toolbarAllowedItemIdentifiers:))]
        #[unsafe(method_family = none)]
        fn allowed_items(&self, _toolbar: &NSToolbar) -> Retained<NSArray<NSString>> {
            item_identifiers()
        }

        #[unsafe(method_id(toolbar:itemForItemIdentifier:willBeInsertedIntoToolbar:))]
        #[unsafe(method_family = none)]
        fn item(&self, _toolbar: &NSToolbar, identifier: &NSString, inserted: bool) -> Option<Retained<NSToolbarItem>> {
            self.make_item(identifier, inserted)
        }
    }

    impl ToolbarDelegate {
        #[unsafe(method(sidebar:))]
        fn sidebar(&self, _sender: &AnyObject) { self.emit(WindowChromeAction::Sidebar); }

        #[unsafe(method(help:))]
        fn help(&self, _sender: &AnyObject) { self.emit(WindowChromeAction::Help); }

        #[unsafe(method(picker:))]
        fn picker(&self, _sender: &AnyObject) { self.emit(WindowChromeAction::Picker); }

        #[unsafe(method(newer:))]
        fn newer(&self, _sender: &AnyObject) { self.emit(WindowChromeAction::Newer); }

        #[unsafe(method(older:))]
        fn older(&self, _sender: &AnyObject) { self.emit(WindowChromeAction::Older); }
    }
);

impl ToolbarDelegate {
    fn make_item(&self, identifier: &NSString, inserted: bool) -> Option<Retained<NSToolbarItem>> {
        let item =
            NSToolbarItem::initWithItemIdentifier(NSToolbarItem::alloc(self.mtm()), identifier);
        item.setAutovalidates(false);
        match identifier.to_string().as_str() {
            "sidebar" => {
                item.setLabel(ns_string!("File sidebar"));
                item.setView(Some(&self.button(
                    "sidebar.left",
                    "Toggle file sidebar (⌘B)",
                    sel!(sidebar:),
                )));
            }
            "help" => {
                item.setLabel(ns_string!("Keyboard shortcuts"));
                item.setView(Some(&self.button(
                    "questionmark.circle",
                    "Keyboard shortcuts (?)",
                    sel!(help:),
                )));
            }
            "navigation" => {
                item.setLabel(ns_string!("Commits"));
                let view = NSView::initWithFrame(
                    NSView::alloc(self.mtm()),
                    frame(0.0, NAVIGATION_WIDTH, 38.0),
                );
                let newer = self.button("chevron.left", "Show newer commit", sel!(newer:));
                let older = self.button("chevron.right", "Show older commit", sel!(older:));
                let picker = self.button("", "Choose commits to review (C)", sel!(picker:));
                newer.setFrame(frame(0.0, 32.0, 38.0));
                picker.setFrame(frame(36.0, NAVIGATION_WIDTH - 72.0, 38.0));
                older.setFrame(frame(NAVIGATION_WIDTH - 32.0, 32.0, 38.0));
                picker.setAttributedTitle(&commit_title("grr", "Loading commit diff..."));
                newer.setEnabled(false);
                picker.setEnabled(false);
                older.setEnabled(false);
                view.addSubview(&newer);
                view.addSubview(&picker);
                view.addSubview(&older);
                item.setView(Some(&view));
                if inserted {
                    *self.ivars().navigation.borrow_mut() = Some(Navigation {
                        newer,
                        picker,
                        older,
                    });
                }
            }
            _ => return None,
        }
        Some(item)
    }

    fn new(window: WebviewWindow, mtm: MainThreadMarker) -> Retained<Self> {
        let this = Self::alloc(mtm).set_ivars(ToolbarIvars {
            window,
            navigation: RefCell::new(None),
        });
        unsafe { msg_send![super(this), init] }
    }

    fn emit(&self, action: WindowChromeAction) {
        let _ = self.ivars().window.emit("window-chrome-action", action);
    }

    fn button(
        &self,
        symbol: &str,
        tooltip: &str,
        action: objc2::runtime::Sel,
    ) -> Retained<NSButton> {
        let button = NSButton::initWithFrame(NSButton::alloc(self.mtm()), frame(0.0, 32.0, 32.0));
        button.setBezelStyle(NSBezelStyle::Toolbar);
        button.setBordered(false);
        button.setTitle(ns_string!(""));
        let description = NSString::from_str(tooltip);
        button.setToolTip(Some(&description));
        if !symbol.is_empty() {
            let image = NSImage::imageWithSystemSymbolName_accessibilityDescription(
                &NSString::from_str(symbol),
                Some(&description),
            );
            button.setImage(image.as_deref());
        }
        unsafe {
            button.setTarget(Some(self));
            button.setAction(Some(action));
        }
        button
    }
}

impl Header {
    pub fn update(&self, update: WindowChromeUpdate) -> Result<(), String> {
        self.native.get_on_main(move |native| {
            let navigation = native.delegate.ivars().navigation.borrow();
            let navigation = navigation.as_ref().ok_or("native header is unavailable")?;
            native.window.setTitle(&NSString::from_str(&update.title));
            navigation
                .picker
                .setAttributedTitle(&commit_title(&update.title, &update.subtitle));
            navigation
                .picker
                .setToolTip(Some(&NSString::from_str(&format!(
                    "{}\n{}\nChoose commits to review (C)",
                    update.title, update.subtitle,
                ))));
            navigation.newer.setEnabled(update.can_navigate_newer);
            navigation.older.setEnabled(update.can_navigate_older);
            navigation
                .picker
                .setEnabled(update.commit_selection_enabled);
            Ok(())
        })
    }
}

pub fn install(window: &WebviewWindow) -> Result<Header, String> {
    let mtm =
        MainThreadMarker::new().ok_or("native header must be installed on the main thread")?;
    let pointer = window.ns_window().map_err(|error| error.to_string())?;
    let native_window = unsafe { Retained::retain(pointer.cast::<NSWindow>()) }
        .ok_or("native window is unavailable")?;
    let delegate = ToolbarDelegate::new(window.clone(), mtm);
    let toolbar = NSToolbar::initWithIdentifier(
        NSToolbar::alloc(mtm),
        ns_string!("com.rubyelders.grr.header"),
    );
    toolbar.setAllowsUserCustomization(false);
    toolbar.setDisplayMode(NSToolbarDisplayMode::IconOnly);
    toolbar.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
    #[allow(deprecated)]
    toolbar.setCenteredItemIdentifier(Some(ns_string!("navigation")));
    native_window.setTitleVisibility(NSWindowTitleVisibility::Hidden);
    native_window.setToolbarStyle(NSWindowToolbarStyle::Unified);
    native_window.setToolbar(Some(&toolbar));
    Ok(Header {
        native: MainThreadBound::new(
            NativeHeader {
                window: native_window,
                delegate,
            },
            mtm,
        ),
    })
}

fn item_identifiers() -> Retained<NSArray<NSString>> {
    NSArray::from_slice(&[
        ns_string!("sidebar"),
        unsafe { NSToolbarFlexibleSpaceItemIdentifier },
        ns_string!("navigation"),
        unsafe { NSToolbarFlexibleSpaceItemIdentifier },
        ns_string!("help"),
    ])
}

fn frame(x: f64, width: f64, height: f64) -> NSRect {
    NSRect::new(NSPoint::new(x, 0.0), NSSize::new(width, height))
}

fn commit_title(title: &str, subtitle: &str) -> Retained<NSMutableAttributedString> {
    let title = truncate(title, 48);
    let subtitle = truncate(subtitle, 60);
    let font = NSFont::boldSystemFontOfSize(13.0);
    let color = NSColor::labelColor();
    let attributes = NSDictionary::from_slices(
        &[unsafe { NSFontAttributeName }, unsafe {
            NSForegroundColorAttributeName
        }],
        &[&*font as &AnyObject, &*color as &AnyObject],
    );
    let text = unsafe {
        NSMutableAttributedString::initWithString_attributes(
            NSMutableAttributedString::alloc(),
            &NSString::from_str(&title),
            Some(&attributes),
        )
    };
    let font = NSFont::systemFontOfSize(11.0);
    let color = NSColor::secondaryLabelColor();
    let attributes = NSDictionary::from_slices(
        &[unsafe { NSFontAttributeName }, unsafe {
            NSForegroundColorAttributeName
        }],
        &[&*font as &AnyObject, &*color as &AnyObject],
    );
    let subtitle = unsafe {
        NSAttributedString::initWithString_attributes(
            NSAttributedString::alloc(),
            &NSString::from_str(&format!("\n{subtitle}")),
            Some(&attributes),
        )
    };
    text.appendAttributedString(&subtitle);
    text
}

fn truncate(text: &str, limit: usize) -> String {
    if text.chars().count() <= limit {
        text.to_owned()
    } else {
        format!("{}...", text.chars().take(limit - 3).collect::<String>())
    }
}
