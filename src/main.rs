use std::env;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use grr::{ReviewData, SubmittedReview, format_review_result, load_review, validate_submission};
use tauri::{State, Window};

struct AppState {
    data: ReviewData,
    submitted: Arc<Mutex<Option<SubmittedReview>>>,
}

#[tauri::command]
fn get_review(state: State<'_, AppState>) -> ReviewData {
    state.data.clone()
}

#[tauri::command]
fn finish_review(
    review: SubmittedReview,
    state: State<'_, AppState>,
    window: Window,
) -> Result<(), String> {
    validate_submission(&state.data, &review)?;
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
    let repository = match parse_args() {
        Ok(Some(path)) => path,
        Ok(None) => return,
        Err(message) => {
            eprintln!("grr: {message}");
            std::process::exit(1);
        }
    };
    let review = match load_review(&repository) {
        Ok(review) => review,
        Err(error) => {
            eprintln!("grr: {error}");
            std::process::exit(1);
        }
    };

    let submitted = Arc::new(Mutex::new(None));
    let output_data = review.clone();
    let app = tauri::Builder::default()
        .manage(AppState {
            data: review,
            submitted: Arc::clone(&submitted),
        })
        .invoke_handler(tauri::generate_handler![
            get_review,
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
    match submitted {
        Some(review) => match format_review_result(&output_data, &review) {
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

fn parse_args() -> Result<Option<PathBuf>, String> {
    let mut arguments = env::args_os();
    let _program = arguments.next();
    let Some(first) = arguments.next() else {
        return Ok(Some(PathBuf::from(".")));
    };
    if first == "--help" || first == "-h" {
        println!("Usage: grr [REPOSITORY]\n\nReview the commit at HEAD in a local GUI.");
        return Ok(None);
    }
    if first == "--version" || first == "-V" {
        println!("grr {}", env!("CARGO_PKG_VERSION"));
        return Ok(None);
    }
    if arguments.next().is_some() {
        return Err("expected at most one repository path; try --help".to_owned());
    }
    Ok(Some(PathBuf::from(first)))
}
