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
                .write_all(text.as_bytes())
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
        assert!(copy_with_command("false", &[], "review result\n").is_err());
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
