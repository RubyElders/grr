use std::io::{self, Write};

pub fn exit(code: i32) -> ! {
    let stdout = io::stdout().flush();
    let stderr = io::stderr().flush();
    let code = if stdout.is_err() || stderr.is_err() {
        1
    } else {
        code
    };
    #[cfg(target_os = "linux")]
    unsafe {
        libc::_exit(code);
    }
    #[cfg(not(target_os = "linux"))]
    std::process::exit(code);
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use std::process::Command;

    #[test]
    fn flushes_output_without_running_native_exit_handlers() {
        let output = Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "shutdown::tests::exit_child", "--nocapture"])
            .env("GRR_SHUTDOWN_TEST", "1")
            .output()
            .unwrap();
        assert_eq!(output.status.code(), Some(7));
        assert!(
            output
                .stdout
                .ends_with("review result".repeat(4096).as_bytes())
        );
        assert!(output.stderr.ends_with(b"review diagnostic"));
    }

    #[test]
    fn exit_child() {
        if std::env::var_os("GRR_SHUTDOWN_TEST").is_none() {
            return;
        }
        extern "C" fn fail_on_native_cleanup() {
            std::process::abort();
        }
        assert_eq!(unsafe { libc::atexit(fail_on_native_cleanup) }, 0);
        print!("{}", "review result".repeat(4096));
        eprint!("review diagnostic");
        super::exit(7);
    }
}
