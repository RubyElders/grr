use std::io::{self, Write};

pub fn exit(code: i32) -> ! {
    let code = flush_output(&mut io::stdout(), &mut io::stderr(), code);
    #[cfg(target_os = "linux")]
    unsafe {
        libc::_exit(code);
    }
    #[cfg(not(target_os = "linux"))]
    std::process::exit(code);
}

fn flush_output(stdout: &mut impl Write, stderr: &mut impl Write, code: i32) -> i32 {
    let stdout = stdout.flush();
    let stderr = stderr.flush();
    if stdout.is_err() || stderr.is_err() {
        1
    } else {
        code
    }
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use std::io::{self, Write};
    use std::process::Command;

    #[test]
    fn flushes_both_streams_and_reports_failures() {
        for (stdout_fails, stderr_fails, expected) in [
            (false, false, 7),
            (true, false, 1),
            (false, true, 1),
            (true, true, 1),
        ] {
            let mut stdout = FlushWriter {
                fails: stdout_fails,
                flushed: false,
            };
            let mut stderr = FlushWriter {
                fails: stderr_fails,
                flushed: false,
            };
            assert_eq!(super::flush_output(&mut stdout, &mut stderr, 7), expected);
            assert!(stdout.flushed);
            assert!(stderr.flushed);
        }
    }

    struct FlushWriter {
        fails: bool,
        flushed: bool,
    }

    impl Write for FlushWriter {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            Ok(bytes.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            self.flushed = true;
            if self.fails {
                Err(io::Error::other("flush failed"))
            } else {
                Ok(())
            }
        }
    }

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
