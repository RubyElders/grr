use serde_json::Value;

#[test]
fn release_versions_match() {
    let config: Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    let package: Value = serde_json::from_str(include_str!("../../package.json")).unwrap();
    let lock: Value = serde_json::from_str(include_str!("../../package-lock.json")).unwrap();
    let version = env!("CARGO_PKG_VERSION");

    assert_eq!(config["version"], version);
    assert_eq!(package["version"], version);
    assert_eq!(lock["version"], version);
    assert_eq!(lock["packages"][""]["version"], version);
    assert!(include_str!("../../CHANGELOG.md").contains(&format!("## {version} - ")));
}

#[test]
fn standard_tauri_layout_matches_the_frontend_tooling() {
    let config: Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    let package: Value = serde_json::from_str(include_str!("../../package.json")).unwrap();

    assert_eq!(config["build"]["frontendDist"], "../dist");
    assert_eq!(package["scripts"]["tauri"], "tauri");
    let runtime_version: Vec<_> = tauri::VERSION.split('.').take(2).collect();
    for version in [
        &package["dependencies"]["@tauri-apps/api"],
        &package["devDependencies"]["@tauri-apps/cli"],
    ] {
        assert_eq!(
            version
                .as_str()
                .unwrap()
                .split('.')
                .take(2)
                .collect::<Vec<_>>(),
            runtime_version
        );
    }
}

#[test]
fn linux_desktop_identity_matches_the_tauri_application_id() {
    let config: Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    let identifier = config["identifier"].as_str().unwrap();
    let desktop = include_str!("../../packaging/com.rubyelders.grr.desktop");

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
