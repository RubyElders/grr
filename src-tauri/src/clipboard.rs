use std::io::Write;
use std::process::{Command, Stdio};

#[cfg(target_os = "linux")]
const CLIPBOARD_COMMAND: &str = "wl-copy";
#[cfg(target_os = "macos")]
const CLIPBOARD_COMMAND: &str = "pbcopy";
#[cfg(target_os = "windows")]
const CLIPBOARD_COMMAND: &str = "clip.exe";

pub fn copy(text: &str) -> Result<(), String> {
    copy_with_command(CLIPBOARD_COMMAND, &[], text)
}

fn copy_with_command(program: &str, arguments: &[&str], text: &str) -> Result<(), String> {
    let mut child = Command::new(program)
        .args(arguments)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("could not start {program}: {error}"))?;
    let write_result = child
        .stdin
        .take()
        .ok_or_else(|| format!("could not open {program} input"))
        .and_then(|mut stdin| {
            stdin
                .write_all(&clipboard_input(text))
                .map_err(|error| format!("could not write to {program}: {error}"))
        });
    let status = child
        .wait()
        .map_err(|error| format!("could not wait for {program}: {error}"))?;
    write_result?;
    if status.success() {
        return Ok(());
    }
    Err(format!("{program} failed with {status}"))
}

#[cfg(target_os = "windows")]
fn clipboard_input(text: &str) -> Vec<u8> {
    text.encode_utf16().flat_map(u16::to_le_bytes).collect()
}

#[cfg(not(target_os = "windows"))]
fn clipboard_input(text: &str) -> Vec<u8> {
    text.as_bytes().to_vec()
}

#[cfg(all(test, target_os = "windows"))]
mod windows_tests {
    #[test]
    fn sends_utf16_text_to_clip() {
        assert_eq!(
            super::clipboard_input("Š…\n"),
            [0x60, 0x01, 0x26, 0x20, 0x0a, 0x00]
        );
    }
}

#[cfg(all(test, unix))]
mod tests {
    use std::fs;
    use std::time::{Duration, Instant};

    use tempfile::NamedTempFile;

    use super::copy_with_command;

    #[test]
    fn sends_the_complete_text_to_a_clipboard_command() {
        let output = NamedTempFile::new().unwrap();
        let path = output.path().to_str().unwrap();
        copy_with_command("tee", &[path], "review result\n").unwrap();
        assert_eq!(fs::read_to_string(path).unwrap(), "review result\n");
    }

    #[test]
    fn reports_clipboard_command_failures() {
        let error = copy_with_command("sh", &["-c", "cat >/dev/null; exit 1"], "review result\n")
            .unwrap_err();
        assert!(error.contains("failed with"));
    }

    #[test]
    fn reports_clipboard_command_start_failures() {
        let command = NamedTempFile::new().unwrap();
        let error = copy_with_command(command.path().to_str().unwrap(), &[], "review result\n")
            .unwrap_err();
        assert!(error.contains("could not start"));
    }

    #[test]
    fn reports_clipboard_command_write_failures() {
        let text = "x".repeat(4 * 1024 * 1024);
        let error = copy_with_command("sh", &["-c", "exec 0<&-; exit 0"], &text).unwrap_err();
        assert!(error.contains("could not write"));
    }

    #[test]
    fn does_not_wait_for_background_processes_that_inherit_standard_error() {
        let started = Instant::now();
        copy_with_command(
            "sh",
            &["-c", "cat >/dev/null; (sleep 3) &"],
            "review result\n",
        )
        .unwrap();
        assert!(started.elapsed() < Duration::from_secs(2));
    }
}
