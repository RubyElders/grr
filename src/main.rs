use std::env;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use grr::{
    ReviewData, SubmittedReview, format_review_result, load_review_selection, validate_submission,
};
use tauri::{State, Window};

struct AppState {
    repository: PathBuf,
    requested_base: Option<String>,
    data: Arc<Mutex<ReviewData>>,
    submitted: Arc<Mutex<Option<SubmittedReview>>>,
}

#[tauri::command]
fn get_review(state: State<'_, AppState>) -> Result<ReviewData, String> {
    state
        .data
        .lock()
        .map(|data| data.clone())
        .map_err(|_| "review data lock was poisoned".to_owned())
}

#[tauri::command]
fn select_commits(
    commit_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<ReviewData, String> {
    let review = load_review_selection(
        &state.repository,
        state.requested_base.as_deref(),
        &commit_ids,
    )
    .map_err(|error| error.to_string())?;
    *state
        .data
        .lock()
        .map_err(|_| "review data lock was poisoned".to_owned())? = review.clone();
    Ok(review)
}

#[tauri::command]
fn finish_review(
    review: SubmittedReview,
    state: State<'_, AppState>,
    window: Window,
) -> Result<(), String> {
    let data = state
        .data
        .lock()
        .map_err(|_| "review data lock was poisoned".to_owned())?;
    validate_submission(&data, &review)?;
    drop(data);
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
    let review =
        match load_review_selection(&options.repository, options.requested_base.as_deref(), &[]) {
            Ok(review) => review,
            Err(error) => {
                eprintln!("grr: {error}");
                std::process::exit(1);
            }
        };

    let submitted = Arc::new(Mutex::new(None));
    let review_data = Arc::new(Mutex::new(review));
    let app = tauri::Builder::default()
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
    let output_data = review_data.lock().ok().map(|data| data.clone());
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
