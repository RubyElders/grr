use std::fs;
use std::path::Path;

use git2::{Commit, Repository, Signature};
use grr::{
    FileStatus, ReviewData, ReviewLoadError, WORKTREE_COMMIT_ID, load_history, load_history_files,
    load_initial_review, load_review, load_review_selection,
};

fn commit_file<'repo>(
    repository: &'repo Repository,
    relative_path: &str,
    contents: &[u8],
    message: &str,
) -> Commit<'repo> {
    let workdir = repository.workdir().unwrap();
    let path = workdir.join(relative_path);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(&path, contents).unwrap();
    let mut index = repository.index().unwrap();
    index.add_path(Path::new(relative_path)).unwrap();
    index.write().unwrap();
    let tree_id = index.write_tree().unwrap();
    let tree = repository.find_tree(tree_id).unwrap();
    let signature = Signature::now("Test User", "test@example.com").unwrap();
    let parent = repository
        .head()
        .ok()
        .and_then(|head| head.peel_to_commit().ok());
    let parents = parent.iter().collect::<Vec<_>>();
    let id = repository
        .commit(
            Some("HEAD"),
            &signature,
            &signature,
            message,
            &tree,
            &parents,
        )
        .unwrap();
    repository.find_commit(id).unwrap()
}

#[test]
fn loads_root_commit_as_an_addition() {
    let directory = tempfile::tempdir().unwrap();
    let repository = Repository::init(directory.path()).unwrap();
    commit_file(
        &repository,
        "src/main.rs",
        b"fn main() {}\n",
        "Initial commit\n\nExplain why this fixture exists.\nKeep the full message.",
    );

    let review = load_review(directory.path()).unwrap();
    assert_eq!(review.commit.summary, "Initial commit");
    assert_eq!(
        review.commit.message,
        "Initial commit\n\nExplain why this fixture exists.\nKeep the full message."
    );
    assert_eq!(review.commit.parent_id, None);
    assert_eq!(review.files.len(), 1);
    assert_eq!(review.files[0].status, FileStatus::Added);
    assert_eq!(review.files[0].additions, 1);
    assert_eq!(review.files[0].hunks[0].lines[0].new_line, Some(1));
}

#[test]
fn discovers_from_nested_path_and_reports_structured_lines() {
    let directory = tempfile::tempdir().unwrap();
    let repository = Repository::init(directory.path()).unwrap();
    commit_file(&repository, "src/lib.rs", b"one\ntwo\n", "base");
    commit_file(
        &repository,
        "src/lib.rs",
        b"one\nchanged\nthree\n",
        "change",
    );

    let review = load_review(directory.path().join("src")).unwrap();
    let file = &review.files[0];
    assert_eq!(file.status, FileStatus::Modified);
    assert_eq!((file.additions, file.deletions), (2, 1));
    let lines = &file.hunks[0].lines;
    assert!(
        lines
            .iter()
            .any(|line| line.old_line == Some(2) && line.new_line.is_none())
    );
    assert!(
        lines
            .iter()
            .any(|line| line.new_line == Some(2) && line.old_line.is_none())
    );
}

#[test]
fn detects_renames_and_binary_files() {
    let directory = tempfile::tempdir().unwrap();
    let repository = Repository::init(directory.path()).unwrap();
    commit_file(&repository, "old.txt", b"same content\n", "base");

    fs::rename(
        directory.path().join("old.txt"),
        directory.path().join("new.txt"),
    )
    .unwrap();
    fs::write(directory.path().join("image.bin"), b"\0\x01\x02\x03").unwrap();
    let mut index = repository.index().unwrap();
    index.remove_path(Path::new("old.txt")).unwrap();
    index.add_path(Path::new("new.txt")).unwrap();
    index.add_path(Path::new("image.bin")).unwrap();
    index.write().unwrap();
    let tree_id = index.write_tree().unwrap();
    let tree = repository.find_tree(tree_id).unwrap();
    let parent = repository.head().unwrap().peel_to_commit().unwrap();
    let signature = Signature::now("Test User", "test@example.com").unwrap();
    repository
        .commit(
            Some("HEAD"),
            &signature,
            &signature,
            "rename",
            &tree,
            &[&parent],
        )
        .unwrap();

    let review = load_review(directory.path()).unwrap();
    let renamed = review
        .files
        .iter()
        .find(|file| file.status == FileStatus::Renamed)
        .unwrap();
    assert_eq!(renamed.old_path.as_deref(), Some("old.txt"));
    assert_eq!(renamed.new_path.as_deref(), Some("new.txt"));
    assert_eq!(renamed.old_mode, renamed.new_mode);
    assert_eq!(renamed.old_oid, renamed.new_oid);
    let binary = review
        .files
        .iter()
        .find(|file| file.display_path == "image.bin")
        .unwrap();
    assert!(binary.binary);
    assert!(binary.hunks.is_empty());
}

#[test]
fn detects_an_unstaged_file_move() {
    let directory = tempfile::tempdir().unwrap();
    let repository = Repository::init(directory.path()).unwrap();
    commit_file(&repository, "old.txt", b"same content\n", "base");

    fs::rename(
        directory.path().join("old.txt"),
        directory.path().join("new.txt"),
    )
    .unwrap();

    let review = load_review(directory.path()).unwrap();
    assert_eq!(review.selected_commit_ids, [WORKTREE_COMMIT_ID]);
    assert_eq!(review.files.len(), 1);
    let moved = &review.files[0];
    assert_eq!(moved.status, FileStatus::Renamed);
    assert_eq!(moved.old_path.as_deref(), Some("old.txt"));
    assert_eq!(moved.new_path.as_deref(), Some("new.txt"));
    assert_eq!(moved.old_mode, moved.new_mode);
    assert_eq!(moved.old_oid, moved.new_oid);
}

#[test]
fn uses_first_parent_for_merge_commit() {
    let directory = tempfile::tempdir().unwrap();
    let repository = Repository::init(directory.path()).unwrap();
    let root = commit_file(&repository, "a.txt", b"a\n", "root");
    let first_parent = commit_file(&repository, "a.txt", b"b\n", "first parent");
    let tree = first_parent.tree().unwrap();
    let signature = Signature::now("Test User", "test@example.com").unwrap();
    let merge_id = repository
        .commit(
            Some("HEAD"),
            &signature,
            &signature,
            "merge",
            &tree,
            &[&first_parent, &root],
        )
        .unwrap();

    let review = load_review(directory.path()).unwrap();
    assert_eq!(review.commit.id, merge_id.to_string());
    assert_eq!(review.commit.parent_id, Some(first_parent.id().to_string()));
    assert!(review.files.is_empty());
}

#[test]
fn reports_unborn_repository() {
    let directory = tempfile::tempdir().unwrap();
    Repository::init(directory.path()).unwrap();
    let error = load_review(directory.path()).unwrap_err();
    assert!(matches!(error, ReviewLoadError::NoHead));
    assert_eq!(error.to_string(), "the repository has no commit at HEAD");
}

#[test]
fn reports_a_missing_repository() {
    let directory = tempfile::tempdir().unwrap();
    let error = load_review(directory.path()).unwrap_err();
    assert!(matches!(error, ReviewLoadError::Git(_)));
    assert!(error.to_string().starts_with("Git repository error: "));
}

#[test]
fn detects_base_branch_and_loads_cumulative_or_selected_commits() {
    let directory = tempfile::tempdir().unwrap();
    let repository = Repository::init_opts(
        directory.path(),
        git2::RepositoryInitOptions::new().initial_head("main"),
    )
    .unwrap();
    let root = commit_file(&repository, "a.txt", b"one\n", "base");
    repository.branch("feature", &root, true).unwrap();
    repository.set_head("refs/heads/feature").unwrap();
    repository.checkout_head(None).unwrap();

    let first = commit_file(&repository, "a.txt", b"two\n", "change a");
    let second = commit_file(&repository, "b.txt", b"new\n", "add b");

    let cumulative = load_review(directory.path()).unwrap();
    assert_eq!(cumulative.comparison.base_ref, "main");
    assert_eq!(
        cumulative.comparison.merge_base_id,
        Some(root.id().to_string())
    );
    assert_eq!(
        cumulative
            .commits
            .iter()
            .map(|commit| commit.id.as_str())
            .collect::<Vec<_>>(),
        vec![second.id().to_string(), first.id().to_string()]
    );
    assert!(cumulative.selected_commit_ids.is_empty());
    assert_eq!(cumulative.files.len(), 2);
    assert!(
        cumulative
            .files
            .iter()
            .all(|file| file.source_commit.is_none())
    );

    let selected =
        load_review_selection(directory.path(), Some("main"), &[first.id().to_string()]).unwrap();
    assert_eq!(selected.selected_commit_ids, vec![first.id().to_string()]);
    assert_eq!(selected.files.len(), 1);
    assert_eq!(selected.files[0].display_path, "a.txt");
    assert_eq!(
        selected.files[0].source_commit.as_ref().unwrap().id,
        first.id().to_string()
    );

    let error = load_review_selection(directory.path(), Some("main"), &[root.id().to_string()])
        .unwrap_err();
    assert!(matches!(error, ReviewLoadError::InvalidSelection(_)));
    assert_eq!(
        error.to_string(),
        format!(
            "commit {} is outside the current base comparison",
            root.id()
        )
    );

    repository
        .config()
        .unwrap()
        .set_str("grr.base", "feature~1")
        .unwrap();
    let configured = load_review(directory.path()).unwrap();
    assert_eq!(configured.comparison.base_ref, "feature~1");
    assert_eq!(
        configured.comparison.merge_base_id,
        Some(first.id().to_string())
    );
}

#[test]
fn exposes_staged_unstaged_deleted_and_untracked_changes_as_a_virtual_commit() {
    let directory = tempfile::tempdir().unwrap();
    let repository = Repository::init(directory.path()).unwrap();
    let head = commit_file(&repository, "tracked.txt", b"old tracked\n", "base");
    commit_file(
        &repository,
        "deleted.txt",
        b"remove me\n",
        "add deletion target",
    );
    commit_file(
        &repository,
        ".gitignore",
        b"ignored.txt\n",
        "ignore fixture",
    );

    fs::write(directory.path().join("tracked.txt"), b"new tracked\n").unwrap();
    fs::remove_file(directory.path().join("deleted.txt")).unwrap();
    fs::write(directory.path().join("staged.txt"), b"staged content\n").unwrap();
    let mut index = repository.index().unwrap();
    index.add_path(Path::new("staged.txt")).unwrap();
    index.write().unwrap();
    fs::write(
        directory.path().join("untracked.txt"),
        b"untracked content\n",
    )
    .unwrap();
    fs::write(directory.path().join("ignored.txt"), b"ignored content\n").unwrap();

    let initial = load_initial_review(directory.path(), Some("HEAD~2")).unwrap();
    let worktree = initial
        .commits
        .iter()
        .find(|commit| commit.id == WORKTREE_COMMIT_ID)
        .unwrap();
    assert_eq!(worktree.summary, "Uncommitted changes");
    assert_eq!(
        worktree.parent_id,
        Some(repository.head().unwrap().target().unwrap().to_string())
    );
    assert_ne!(
        head.id().to_string(),
        worktree.parent_id.as_deref().unwrap()
    );
    assert_eq!(initial.selected_commit_ids, [WORKTREE_COMMIT_ID]);
    assert_eq!(initial.comparison.base_ref, "HEAD~2");
    assert!(initial.files.iter().all(|file| {
        file.source_commit.as_ref().map(|commit| commit.id.as_str()) == Some(WORKTREE_COMMIT_ID)
    }));

    let cumulative = load_review_selection(directory.path(), None, &[]).unwrap();
    let cumulative_paths = cumulative
        .files
        .iter()
        .map(|file| file.display_path.as_str())
        .collect::<Vec<_>>();
    assert!(cumulative_paths.contains(&"tracked.txt"));
    assert!(cumulative_paths.contains(&"deleted.txt"));
    assert!(cumulative_paths.contains(&"staged.txt"));
    assert!(cumulative_paths.contains(&"untracked.txt"));
    assert!(!cumulative_paths.contains(&"ignored.txt"));

    let selected =
        load_review_selection(directory.path(), None, &[WORKTREE_COMMIT_ID.to_owned()]).unwrap();
    assert_eq!(selected.selected_commit_ids, [WORKTREE_COMMIT_ID]);
    assert!(selected.files.iter().all(|file| {
        file.source_commit.as_ref().map(|commit| commit.id.as_str()) == Some(WORKTREE_COMMIT_ID)
    }));
    let untracked = selected
        .files
        .iter()
        .find(|file| file.display_path == "untracked.txt")
        .unwrap();
    assert_eq!(untracked.status, FileStatus::Added);
    assert_eq!(untracked.new_mode, "100644");
    assert_eq!(untracked.additions, 1);
}

#[test]
fn omits_the_virtual_commit_for_a_clean_worktree() {
    let directory = tempfile::tempdir().unwrap();
    let repository = Repository::init(directory.path()).unwrap();
    commit_file(&repository, "clean.txt", b"clean\n", "clean");
    let review = load_review(directory.path()).unwrap();
    assert!(
        review
            .commits
            .iter()
            .all(|commit| commit.id != WORKTREE_COMMIT_ID)
    );
}

#[test]
fn loads_and_selects_one_hundred_commits_with_compact_file_attribution() {
    let directory = tempfile::tempdir().unwrap();
    let repository = Repository::init(directory.path()).unwrap();
    let root = commit_file(&repository, "base.txt", b"base\n", "base");
    let base = root.id().to_string();
    let mut commit_ids = Vec::new();
    for index in 0..100 {
        let path = format!("changes/file-{index:03}.txt");
        let message = format!(
            "Add file {index:03}\n\n{}",
            "Detailed commit body. ".repeat(50)
        );
        commit_ids.push(
            commit_file(&repository, &path, b"changed\n", &message)
                .id()
                .to_string(),
        );
    }

    let cumulative = load_review_selection(directory.path(), Some(&base), &[]).unwrap();
    assert_eq!(cumulative.commits.len(), 100);
    assert_eq!(cumulative.files.len(), 100);

    let selected = load_review_selection(directory.path(), Some(&base), &commit_ids).unwrap();
    assert_eq!(selected.files.len(), 100);
    assert!(
        selected
            .files
            .iter()
            .all(|file| file.source_commit.is_some())
    );
    let encoded = serde_json::to_value(selected).unwrap();
    let attribution = encoded["files"][0]["sourceCommit"].as_object().unwrap();
    assert_eq!(attribution.len(), 3);
    assert!(attribution.contains_key("id"));
    assert!(attribution.contains_key("shortId"));
    assert!(attribution.contains_key("summary"));
}

#[test]
fn canonical_frontend_fixture_matches_rust_contract() {
    let fixture = include_str!("../../ui/src/__fixtures__/review.json");
    let review: ReviewData = serde_json::from_str(fixture).unwrap();
    assert_eq!(review.files.len(), 2);
    assert_eq!(review.files[0].hunks[0].lines[2].new_line, Some(26));
}

#[test]
fn pages_history_with_refs_and_the_worktree_entry() {
    let directory = tempfile::tempdir().unwrap();
    let repository = Repository::init(directory.path()).unwrap();
    let first = commit_file(&repository, "a.txt", b"one\n", "First");
    repository
        .tag_lightweight("v1", first.as_object(), false)
        .unwrap();
    repository
        .reference_symbolic("refs/remotes/origin/HEAD", "refs/heads/main", false, "")
        .unwrap();
    commit_file(&repository, "a.txt", b"two\n", "Second");
    let third = commit_file(&repository, "a.txt", b"three\n", "Third").id();
    fs::write(directory.path().join("a.txt"), b"four\n").unwrap();

    let page = load_history(directory.path(), 0, 2).unwrap();
    assert!(page.has_more);
    assert_eq!(page.commits[0].commit.id, WORKTREE_COMMIT_ID);
    assert_eq!(page.commits[0].parent_ids, vec![third.to_string()]);
    assert_eq!(page.commits[1].commit.summary, "Third");
    assert!(page.commits[1].refs.contains(&page.head_ref));

    let rest = load_history(directory.path(), 2, 10).unwrap();
    assert!(!rest.has_more);
    let summaries = rest
        .commits
        .iter()
        .map(|commit| commit.commit.summary.as_str())
        .collect::<Vec<_>>();
    assert_eq!(summaries, ["Second", "First"]);
    assert_eq!(rest.commits[1].refs, ["v1"]);
    assert!(rest.commits[1].parent_ids.is_empty());
}

#[test]
fn loads_history_files_without_a_base_comparison() {
    let directory = tempfile::tempdir().unwrap();
    let repository = Repository::init(directory.path()).unwrap();
    let first = commit_file(&repository, "a.txt", b"one\n", "First")
        .id()
        .to_string();
    let second = commit_file(&repository, "b.txt", b"two\n", "Second")
        .id()
        .to_string();
    fs::write(directory.path().join("c.txt"), b"three\n").unwrap();

    let single = load_history_files(directory.path(), std::slice::from_ref(&first)).unwrap();
    assert_eq!(single.len(), 1);
    assert_eq!(single[0].status, FileStatus::Added);
    assert!(single[0].source_commit.is_none());

    let range = load_history_files(
        directory.path(),
        &[WORKTREE_COMMIT_ID.to_owned(), second, first],
    )
    .unwrap();
    let paths = range
        .iter()
        .map(|file| file.display_path.as_str())
        .collect::<Vec<_>>();
    assert_eq!(paths, ["a.txt", "b.txt", "c.txt"]);
    assert!(range.iter().all(|file| file.source_commit.is_some()));

    assert!(load_history_files(directory.path(), &["nope".to_owned()]).is_err());
}
