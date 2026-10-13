use std::collections::HashSet;

use git2::{Diff, Repository, Sort, Tree};

use super::{ReviewLoadError, WORKTREE_COMMIT_ID, diff_options, diff_tree_files, parse_diff};
use crate::model::FileDiff;

pub(super) fn consecutive_ids(
    repository: &Repository,
    ids: &[String],
) -> Result<Vec<String>, ReviewLoadError> {
    let mut remaining: HashSet<_> = ids.iter().map(String::as_str).collect();
    let worktree = remaining.remove(WORKTREE_COMMIT_ID);
    if remaining.is_empty() {
        return Ok(if worktree {
            vec![WORKTREE_COMMIT_ID.to_owned()]
        } else {
            Vec::new()
        });
    }
    let mut commit = if worktree {
        repository.head()?.peel_to_commit()?
    } else {
        let mut walk = repository.revwalk()?;
        walk.set_sorting(Sort::TOPOLOGICAL)?;
        for id in &remaining {
            walk.push(git2::Oid::from_str(id)?)?;
        }
        repository.find_commit(walk.next().transpose()?.ok_or(ReviewLoadError::NoHead)?)?
    };
    let mut result = Vec::new();
    if worktree {
        result.push(WORKTREE_COMMIT_ID.to_owned());
    }
    loop {
        let id = commit.id().to_string();
        remaining.remove(id.as_str());
        result.push(id);
        if remaining.is_empty() {
            return Ok(result);
        }
        if commit.parent_count() == 0 {
            return Err(ReviewLoadError::InvalidSelection(
                "Select a consecutive range on one first-parent history".to_owned(),
            ));
        }
        commit = commit.parent(0)?;
    }
}

pub(super) fn range_files(
    repository: &Repository,
    ids: &[String],
) -> Result<Vec<FileDiff>, ReviewLoadError> {
    let Some(oldest_id) = ids.last() else {
        return Ok(Vec::new());
    };
    let worktree = ids[0] == WORKTREE_COMMIT_ID;
    let oldest = if oldest_id == WORKTREE_COMMIT_ID {
        repository.head()?.peel_to_commit()?
    } else {
        repository.find_commit(git2::Oid::from_str(oldest_id)?)?
    };
    let old_tree = if oldest_id == WORKTREE_COMMIT_ID {
        Some(oldest.tree()?)
    } else if oldest.parent_count() > 0 {
        Some(oldest.parent(0)?.tree()?)
    } else {
        None
    };
    if worktree {
        worktree_range_files(repository, old_tree.as_ref())
    } else {
        let newest = repository.find_commit(git2::Oid::from_str(&ids[0])?)?;
        let source = if ids.len() == 1 {
            Some(super::commit_summary(&newest)?)
        } else {
            None
        };
        diff_tree_files(
            repository,
            old_tree.as_ref(),
            &newest.tree()?,
            "selection",
            source,
        )
    }
}

fn worktree_range_files(
    repository: &Repository,
    old_tree: Option<&Tree<'_>>,
) -> Result<Vec<FileDiff>, ReviewLoadError> {
    let mut options = diff_options();
    options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .show_untracked_content(true);
    let mut diff = repository.diff_tree_to_workdir(old_tree, Some(&mut options))?;
    include_staged_additions(repository, old_tree, &mut diff)?;
    let mut files = parse_diff(&mut diff, "selection", None)?;
    files.retain(|file| {
        file.old_path != file.new_path
            || file.old_mode != file.new_mode
            || file.old_oid != file.new_oid
    });
    Ok(files)
}

fn include_staged_additions<'repo>(
    repository: &'repo Repository,
    old_tree: Option<&Tree<'_>>,
    diff: &mut Diff<'repo>,
) -> Result<(), ReviewLoadError> {
    let present = diff
        .deltas()
        .filter_map(|delta| delta.new_file().path_bytes().map(Vec::from))
        .collect::<HashSet<_>>();
    let staged = repository.diff_tree_to_index(old_tree, None, None)?;
    let added = staged
        .deltas()
        .filter(|delta| delta.status() == git2::Delta::Added)
        .filter_map(|delta| delta.new_file().path_bytes().map(Vec::from))
        .filter(|path| !present.contains(path))
        .collect::<Vec<_>>();
    if added.is_empty() {
        return Ok(());
    }
    let mut options = diff_options();
    options
        .include_untracked(true)
        .show_untracked_content(true)
        .disable_pathspec_match(true);
    for path in added {
        options.pathspec(path);
    }
    diff.merge(&repository.diff_tree_to_workdir_with_index(old_tree, Some(&mut options))?)?;
    Ok(())
}
