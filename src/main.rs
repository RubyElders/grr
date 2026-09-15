use std::env;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use grr::{
    ReviewData, SubmittedReview, format_review_result, load_initial_review, load_review_selection,
    validate_submission,
};
#[cfg(target_os = "linux")]
use tauri::Manager;
use tauri::{State, Window};

mod clipboard;

struct AppState {
    repository: PathBuf,
    requested_base: Option<String>,
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
fn select_commits(
    commit_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<Arc<ReviewData>, String> {
    let review = Arc::new(
        load_review_selection(
            &state.repository,
            state.requested_base.as_deref(),
            &commit_ids,
        )
        .map_err(|error| error.to_string())?,
    );
    *state
        .data
        .lock()
        .map_err(|_| "review data lock was poisoned".to_owned())? = Arc::clone(&review);
    Ok(review)
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

fn main() {
    let options = match parse_args() {
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
            std::process::exit(1);
        }
    };

    let submitted = Arc::new(Mutex::new(None));
    let review_data = Arc::new(Mutex::new(Arc::new(review)));
    let app = tauri::Builder::default()
        .setup(|_app| {
            #[cfg(target_os = "linux")]
            enable_wayland_titlebar_controls(_app)?;
            Ok(())
        })
        .manage(AppState {
            repository: options.repository,
            requested_base: options.requested_base,
            data: Arc::clone(&review_data),
            submitted: Arc::clone(&submitted),
        })
        .invoke_handler(tauri::generate_handler![
            get_review,
            select_commits,
            finish_review,
            cancel_review
        ])
        .build(tauri::generate_context!())
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
                std::process::exit(1);
            }
        },
        None => {
            eprintln!("grr: review cancelled; draft comments were discarded");
            std::process::exit(2);
        }
    }
    std::process::exit(exit_code);
}

#[cfg(target_os = "linux")]
fn enable_wayland_titlebar_controls(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use gtk::prelude::*;

    let window = app
        .get_webview_window("main")
        .ok_or("main window was not created")?;
    let gtk_window = window.gtk_window()?;
    if let Some(titlebar) = gtk_window.titlebar()
        && let Ok(event_box) = titlebar.downcast::<gtk::EventBox>()
    {
        event_box.set_above_child(false);
    }
    Ok(())
}

struct CliOptions {
    repository: PathBuf,
    requested_base: Option<String>,
}

fn parse_args() -> Result<Option<CliOptions>, String> {
    let mut arguments = env::args_os();
    let _program = arguments.next();
    let mut repository = None;
    let mut requested_base = None;
    while let Some(argument) = arguments.next() {
        if argument == "--help" || argument == "-h" {
            println!(
                "Usage: grr [--base REF] [REPOSITORY]\n\nReview branch changes at HEAD in a local GUI."
            );
            return Ok(None);
        }
        if argument == "--version" || argument == "-V" {
            println!("grr {}", env!("CARGO_PKG_VERSION"));
            return Ok(None);
        }
        if argument == "--base" {
            let value = arguments
                .next()
                .ok_or_else(|| "--base requires a Git reference".to_owned())?;
            requested_base = Some(value.to_string_lossy().into_owned());
            continue;
        }
        if argument.to_string_lossy().starts_with('-') {
            return Err(format!(
                "unknown option {}; try --help",
                argument.to_string_lossy()
            ));
        }
        if repository.replace(PathBuf::from(argument)).is_some() {
            return Err("expected at most one repository path; try --help".to_owned());
        }
    }
    Ok(Some(CliOptions {
        repository: repository.unwrap_or_else(|| PathBuf::from(".")),
        requested_base,
    }))
}
