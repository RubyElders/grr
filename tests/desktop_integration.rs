use serde_json::Value;

#[test]
fn linux_desktop_identity_matches_the_tauri_application_id() {
    let config: Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    let identifier = config["identifier"].as_str().unwrap();
    let desktop = include_str!("../packaging/com.rubyelders.grr.desktop");

    assert_eq!(identifier, "com.rubyelders.grr");
    assert_eq!(config["app"]["enableGTKAppId"], false);
    assert_eq!(desktop_value(desktop, "Icon"), Some(identifier));
    assert_eq!(desktop_value(desktop, "StartupWMClass"), Some(identifier));
    assert_eq!(config["bundle"]["icon"][0], "icons/icon.png");
}

fn desktop_value<'a>(desktop: &'a str, key: &str) -> Option<&'a str> {
    desktop.lines().find_map(|line| {
        line.split_once('=')
            .filter(|(candidate, _)| *candidate == key)
            .map(|(_, value)| value)
    })
}
