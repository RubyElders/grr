use std::env;
use std::ffi::OsString;
use std::io::{self, IsTerminal};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use grr::{
    FileDiff, HistoryPage, ReviewData, SubmittedReview, format_review_result, load_initial_review,
    load_review_history, load_review_history_files, load_review_snapshot_selection,
    validate_submission,
};
use tauri::{Manager, State, Window};

mod clipboard;
mod shutdown;
mod window_chrome;
use window_chrome::{ReviewView, get_window_chrome, show_window_menu, update_window_chrome};

struct AppState {
    repository: PathBuf,
    requested_base: Option<String>,
    initial_view: ReviewView,
    data: Arc<Mutex<Arc<ReviewData>>>,
    submitted: Arc<Mutex<Option<SubmittedReview>>>,
}

#[tauri::command]
fn get_review(state: State<'_, AppState>) -> Result<Arc<ReviewData>, String> {
    state
        .data
        .lock()
        .map(|data| Arc::clone(&data))
        .map_err(|_| "review data lock was poisoned".to_owned())
}

#[tauri::command]
fn get_initial_view(state: State<'_, AppState>) -> ReviewView {
    state.initial_view
}

#[tauri::command]
async fn reload_review(state: State<'_, AppState>) -> Result<Arc<ReviewData>, String> {
    let repository = state.repository.clone();
    let requested_base = state.requested_base.clone();
    let review = tauri::async_runtime::spawn_blocking(move || {
        load_initial_review(repository, requested_base.as_deref())
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())?;
    let review = Arc::new(review);
    *state
        .data
        .lock()
        .map_err(|_| "review data lock was poisoned".to_owned())? = Arc::clone(&review);
    Ok(review)
}

#[tauri::command]
fn select_commits(
    commit_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<Arc<ReviewData>, String> {
    let snapshot = get_review(state.clone())?;
    let review = Arc::new(
        load_review_snapshot_selection(&state.repository, &snapshot, &commit_ids)
            .map_err(|error| error.to_string())?,
    );
    *state
        .data
        .lock()
        .map_err(|_| "review data lock was poisoned".to_owned())? = Arc::clone(&review);
    Ok(review)
}

#[tauri::command]
async fn get_history(
    offset: usize,
    limit: usize,
    state: State<'_, AppState>,
) -> Result<HistoryPage, String> {
    let repository = state.repository.clone();
    let snapshot = get_review(state)?;
    tauri::async_runtime::spawn_blocking(move || {
        load_review_history(repository, &snapshot, offset, limit)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

#[tauri::command]
async fn get_history_files(
    commit_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<Vec<FileDiff>, String> {
    let repository = state.repository.clone();
    let snapshot = get_review(state)?;
    tauri::async_runtime::spawn_blocking(move || {
        load_review_history_files(repository, &snapshot, &commit_ids)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

#[tauri::command]
async fn finish_review(
    review: SubmittedReview,
    copy_to_clipboard: bool,
    state: State<'_, AppState>,
    window: Window,
) -> Result<(), String> {
    let output = {
        let data = state
            .data
            .lock()
            .map_err(|_| "review data lock was poisoned".to_owned())?;
        validate_submission(&data, &review)?;
        copy_to_clipboard
            .then(|| format_review_result(&data, &review))
            .transpose()?
    };
    if let Some(output) = output {
        tauri::async_runtime::spawn_blocking(move || clipboard::copy(&output))
            .await
            .map_err(|error| format!("clipboard task failed: {error}"))??;
    }
    *state
        .submitted
        .lock()
        .map_err(|_| "review state lock was poisoned".to_owned())? = Some(review);
    window.close().map_err(|error| error.to_string())
}

#[tauri::command]
fn cancel_review(window: Window) -> Result<(), String> {
    window.close().map_err(|error| error.to_string())
}

#[tauri::command]
async fn open_author_website() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        #[cfg(target_os = "macos")]
        let mut command = std::process::Command::new("open");
        #[cfg(target_os = "linux")]
        let mut command = std::process::Command::new("xdg-open");
        #[cfg(target_os = "windows")]
        let mut command = {
            let mut command = std::process::Command::new("rundll32");
            command.arg("url.dll,FileProtocolHandler");
            command
        };
        let status = command
            .arg("https://rubyelders.com")
            .status()
            .map_err(|error| format!("could not open browser: {error}"))?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("browser launcher exited with {status}"))
        }
    })
    .await
    .map_err(|error| format!("browser task failed: {error}"))?
}

fn main() {
    let options = match parse_args(env::args_os().skip(1)) {
        Ok(Some(options)) => options,
        Ok(None) => return,
        Err(message) => {
            eprintln!("grr: {message}");
            std::process::exit(1);
        }
    };
    let review = match load_initial_review(&options.repository, options.requested_base.as_deref()) {
        Ok(review) => review,
        Err(error) => {
            eprintln!("grr: {error}");
            if let Some(base) = options
                .requested_base
                .filter(|base| Path::new(base).is_dir())
            {
                eprintln!("grr: to open the repository in {base}, use grr -C {base}");
            }
            std::process::exit(1);
        }
    };

    let context = tauri::generate_context!();
    window_chrome::prepare(&context.config().identifier);
    let submitted = Arc::new(Mutex::new(None));
    let review_data = Arc::new(Mutex::new(Arc::new(review)));
    let app = tauri::Builder::default()
        .manage(AppState {
            repository: options.repository,
            requested_base: options.requested_base,
            initial_view: options.view,
            data: Arc::clone(&review_data),
            submitted: Arc::clone(&submitted),
        })
        .setup(|app| {
            let window = app
                .get_webview_window("main")
                .ok_or("main review window was not created")?;
            app.manage(window_chrome::install(&window)?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_review,
            get_initial_view,
            reload_review,
            select_commits,
            get_history,
            get_history_files,
            finish_review,
            cancel_review,
            open_author_website,
            get_window_chrome,
            show_window_menu,
            update_window_chrome
        ])
        .build(context)
        .unwrap_or_else(|error| {
            eprintln!("grr: could not start the review window: {error}");
            std::process::exit(1);
        });

    let exit_code = app.run_return(|_, _| {});
    let submitted = submitted
        .lock()
        .ok()
        .and_then(|submitted| submitted.clone());
    let output_data = review_data.lock().ok().map(|data| Arc::clone(&data));
    match submitted {
        Some(review) => match output_data
            .ok_or_else(|| "review data lock was poisoned".to_owned())
            .and_then(|data| format_review_result(&data, &review))
        {
            Ok(output) => print!("{output}"),
            Err(error) => {
                eprintln!("grr: could not format review: {error}");
                shutdown::exit(1);
            }
        },
        None => {
            eprintln!("grr: review cancelled; draft comments were discarded");
            shutdown::exit(2);
        }
    }
    shutdown::exit(exit_code);
}

struct CliOptions {
    view: ReviewView,
    repository: PathBuf,
    requested_base: Option<String>,
}

fn parse_args(arguments: impl IntoIterator<Item = OsString>) -> Result<Option<CliOptions>, String> {
    let mut arguments = arguments.into_iter();
    let mut command = None;
    let mut repository: Option<PathBuf> = None;
    let mut requested_base = None;
    let mut revision = None;
    while let Some(argument) = arguments.next() {
        let argument = argument.to_string_lossy().into_owned();
        let (flag, inline) = match argument.split_once('=') {
            Some((flag, value)) if flag.starts_with("--") => (flag, Some(value.to_owned())),
            _ => (argument.as_str(), None),
        };
        let starts = command.is_none() && revision.is_none();
        match flag {
            "-h" | "--help" => {
                print_help();
                return Ok(None);
            }
            "-V" | "--version" => {
                println!("grr {}", env!("CARGO_PKG_VERSION"));
                return Ok(None);
            }
            "-C" | "--directory" => {
                let path = PathBuf::from(option_value(flag, inline, &mut arguments)?);
                repository = Some(match repository {
                    Some(current) => current.join(path),
                    None => path,
                });
            }
            "--merge-base" | "--base" => {
                requested_base = Some(option_value(flag, inline, &mut arguments)?);
            }
            _ if flag.starts_with('-') => {
                return Err(format!("unknown option {flag}; try --help"));
            }
            "help" if starts => {
                print_help();
                return Ok(None);
            }
            "diff" if starts => command = Some(ReviewView::Changes),
            "log" if starts => command = Some(ReviewView::History),
            _ if revision.is_none() => revision = Some(argument),
            _ => return Err("expected at most one revision; try --help".to_owned()),
        }
    }
    let view = command.unwrap_or_default();
    if let Some(revision) = revision {
        if view == ReviewView::History {
            return Err(format!(
                "log does not take a revision yet; use --merge-base {revision} to set the review base"
            ));
        }
        if requested_base.is_some() {
            return Err("give the base either as a revision or with --merge-base".to_owned());
        }
        requested_base = Some(revision);
    }
    Ok(Some(CliOptions {
        view,
        repository: repository.unwrap_or_else(|| PathBuf::from(".")),
        requested_base,
    }))
}

fn option_value(
    flag: &str,
    inline: Option<String>,
    arguments: &mut impl Iterator<Item = OsString>,
) -> Result<String, String> {
    inline
        .or_else(|| {
            arguments
                .next()
                .map(|value| value.to_string_lossy().into_owned())
        })
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("{flag} requires a value; try --help"))
}

fn print_help() {
    let color = io::stdout().is_terminal() && env::var_os("NO_COLOR").is_none();
    print!("{}", help_text(color));
}

fn help_text(color: bool) -> String {
    let paint = |code: &str, text: &str| {
        if color && !text.is_empty() {
            format!("\x1b[{code}m{text}\x1b[0m")
        } else {
            text.to_owned()
        }
    };
    let heading = |text: &str| paint("1;32", text);
    let row = |width: usize, name: &str, placeholder: &str, description: &str| {
        let padding = width - name.len() - placeholder.len();
        format!(
            "  {}{}{}  {description}\n",
            paint("1;36", name),
            paint("36", placeholder),
            " ".repeat(padding),
        )
    };
    [
        "Review Git changes and history in a local GUI.\n\n".to_owned(),
        format!(
            "{} {} {} {} {}\n\n",
            heading("Usage:"),
            paint("1;36", "grr"),
            paint("36", "[OPTIONS]"),
            paint("36", "[COMMAND]"),
            paint("36", "[REVISION]"),
        ),
        format!("{}\n", heading("Commands:")),
        row(4, "diff", "", "Review changes since the fork point (default)"),
        row(4, "log", "", "Browse the commit history"),
        row(4, "help", "", "Show this help"),
        format!("\n{}\n", heading("Arguments:")),
        row(10, "", "[REVISION]", "Base to compare against, like --merge-base"),
        format!("\n{}\n", heading("Options:")),
        row(22, "-C, --directory", " <PATH>", "Run as if grr was started in PATH"),
        row(22, "    --merge-base", " <REF>", "Compare against the fork point with REF"),
        row(22, "    --base", " <REF>", "Same as --merge-base"),
        row(22, "-h, --help", "", "Show this help"),
        row(22, "-V, --version", "", "Show the version"),
        "\nThe base is detected automatically when not given. The review result is\nprinted to stdout when the window closes.\n".to_owned(),
    ]
    .concat()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(arguments: &[&str]) -> Result<Option<CliOptions>, String> {
        parse_args(arguments.iter().map(OsString::from))
    }

    #[test]
    fn opens_changes_by_default_and_history_for_log() {
        let options = parse(&[]).unwrap().unwrap();
        assert_eq!(options.view, ReviewView::Changes);
        assert_eq!(options.repository, PathBuf::from("."));
        assert_eq!(options.requested_base, None);

        let options = parse(&["-C", "../project", "log", "--base=main"])
            .unwrap()
            .unwrap();
        assert_eq!(options.view, ReviewView::History);
        assert_eq!(options.requested_base.as_deref(), Some("main"));
        assert_eq!(options.repository, PathBuf::from("../project"));
    }

    #[test]
    fn takes_the_base_like_git() {
        for arguments in [
            &["main"][..],
            &["diff", "main"],
            &["--merge-base", "main"],
            &["diff", "--merge-base=main"],
            &["--base", "main"],
        ] {
            let options = parse(arguments).unwrap().unwrap();
            assert_eq!(options.view, ReviewView::Changes, "{arguments:?}");
            assert_eq!(
                options.requested_base.as_deref(),
                Some("main"),
                "{arguments:?}"
            );
        }
        let options = parse(&["diff", "log"]).unwrap().unwrap();
        assert_eq!(options.requested_base.as_deref(), Some("log"));
        assert!(parse(&["log", "main"]).is_err());
        assert!(parse(&["main", "--base", "main"]).is_err());
        assert!(parse(&["main", "other"]).is_err());
    }

    #[test]
    fn changes_directory_like_git() {
        let options = parse(&["-C", "/work", "-C", "grr", "--directory", "ui"])
            .unwrap()
            .unwrap();
        assert_eq!(options.repository, PathBuf::from("/work/grr/ui"));
        let options = parse(&["--directory=../project"]).unwrap().unwrap();
        assert_eq!(options.repository, PathBuf::from("../project"));
        assert!(parse(&["-C"]).is_err());
        assert!(parse(&["--directory="]).is_err());
    }

    #[test]
    fn colors_help_only_when_asked() {
        let plain = help_text(false);
        assert!(plain.contains("Usage: grr [OPTIONS] [COMMAND] [REVISION]"));
        assert!(plain.contains("  log   Browse the commit history"));
        assert!(plain.contains("  -C, --directory <PATH>  Run as if"));
        assert!(!plain.contains('\x1b'));
        assert!(help_text(true).contains("\x1b[1;32mUsage:\x1b[0m"));
    }

    #[test]
    fn stops_for_help() {
        assert!(parse(&["help"]).unwrap().is_none());
        assert!(parse(&["log", "--help"]).unwrap().is_none());
    }

    #[test]
    fn rejects_unknown_options() {
        assert!(parse(&["log", "--nope"]).is_err());
    }
}
