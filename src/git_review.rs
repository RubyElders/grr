use std::collections::HashSet;
use std::error::Error;
use std::fmt;
use std::path::Path;

use git2::{
    Commit, Delta, DiffFindOptions, DiffLineType, DiffOptions, FileMode, Patch, Repository, Sort,
    Tree,
};

use crate::model::{
    CommitSummary, ComparisonSummary, DiffHunk, DiffLine, FileDiff, FileStatus, LineKind,
    ReviewData,
};

#[derive(Debug)]
pub enum ReviewLoadError {
    Git(git2::Error),
    NoHead,
    InvalidSelection(String),
}

impl fmt::Display for ReviewLoadError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Git(error) => write!(formatter, "Git repository error: {error}"),
            Self::NoHead => write!(formatter, "the repository has no commit at HEAD"),
            Self::InvalidSelection(message) => formatter.write_str(message),
        }
    }
}

impl Error for ReviewLoadError {}

impl From<git2::Error> for ReviewLoadError {
    fn from(error: git2::Error) -> Self {
        Self::Git(error)
    }
}

pub fn load_review(path: impl AsRef<Path>) -> Result<ReviewData, ReviewLoadError> {
    load_review_selection(path, None, &[])
}

pub fn load_review_selection(
    path: impl AsRef<Path>,
    requested_base: Option<&str>,
    selected_commit_ids: &[String],
) -> Result<ReviewData, ReviewLoadError> {
    let repository = Repository::discover(path)?;
    let head = repository
        .head()
        .map_err(|error| {
            if error.code() == git2::ErrorCode::UnbornBranch
                || error.code() == git2::ErrorCode::NotFound
            {
                ReviewLoadError::NoHead
            } else {
                ReviewLoadError::Git(error)
            }
        })?
        .peel_to_commit()?;
    let base = resolve_base(&repository, &head, requested_base)?;
    let commits = commits_since(&repository, &head, base.merge_base_id)?;
    let known_ids = commits
        .iter()
        .map(|commit| commit.id.as_str())
        .collect::<HashSet<_>>();
    if let Some(unknown) = selected_commit_ids
        .iter()
        .find(|id| !known_ids.contains(id.as_str()))
    {
        return Err(ReviewLoadError::InvalidSelection(format!(
            "commit {unknown} is outside the current base comparison"
        )));
    }

    let selected = selected_commit_ids
        .iter()
        .map(String::as_str)
        .collect::<HashSet<_>>();
    let mut files = Vec::new();
    if selected.is_empty() {
        let new_tree = head.tree()?;
        let merge_base = base
            .merge_base_id
            .map(|id| repository.find_commit(id))
            .transpose()?;
        let old_tree = merge_base.as_ref().map(Commit::tree).transpose()?;
        files = diff_files(&repository, old_tree.as_ref(), &new_tree, "all", None)?;
    } else {
        for (section_index, summary) in commits
            .iter()
            .rev()
            .filter(|commit| selected.contains(commit.id.as_str()))
            .enumerate()
        {
            let commit = repository.find_commit(git2::Oid::from_str(&summary.id)?)?;
            let parent = commit.parent(0).ok();
            let old_tree = parent.as_ref().map(Commit::tree).transpose()?;
            let new_tree = commit.tree()?;
            files.extend(diff_files(
                &repository,
                old_tree.as_ref(),
                &new_tree,
                &format!("s{section_index}"),
                Some(summary.clone()),
            )?);
        }
    }

    let root = repository
        .workdir()
        .unwrap_or_else(|| repository.path())
        .as_os_str()
        .as_encoded_bytes();
    let head_summary = commit_summary(&head)?;
    Ok(ReviewData {
        repository_root: escape_path(root),
        comparison: ComparisonSummary {
            base_ref: base.label,
            base_id: base.base_id.map(|id| id.to_string()),
            merge_base_id: base.merge_base_id.map(|id| id.to_string()),
            head_id: head.id().to_string(),
        },
        commit: head_summary,
        commits,
        selected_commit_ids: selected_commit_ids.to_vec(),
        files,
    })
}

struct ResolvedBase {
    label: String,
    base_id: Option<git2::Oid>,
    merge_base_id: Option<git2::Oid>,
}

fn resolve_base(
    repository: &Repository,
    head: &Commit<'_>,
    requested_base: Option<&str>,
) -> Result<ResolvedBase, ReviewLoadError> {
    if let Some(name) = requested_base {
        let commit = repository.revparse_single(name)?.peel_to_commit()?;
        return Ok(ResolvedBase {
            label: name.to_owned(),
            base_id: Some(commit.id()),
            merge_base_id: Some(repository.merge_base(commit.id(), head.id())?),
        });
    }

    if let Ok(name) = repository
        .config()
        .and_then(|config| config.get_string("grr.base"))
    {
        let commit = repository.revparse_single(&name)?.peel_to_commit()?;
        return Ok(ResolvedBase {
            label: name,
            base_id: Some(commit.id()),
            merge_base_id: Some(repository.merge_base(commit.id(), head.id())?),
        });
    }

    let mut candidates = Vec::new();
    if let Ok(reference) = repository.head()
        && let Ok(refname) = reference.name()
        && let Ok(remote) = repository.branch_upstream_remote(refname)
        && let Ok(remote) = remote.as_str()
    {
        candidates.extend([
            format!("refs/remotes/{remote}/HEAD"),
            format!("refs/remotes/{remote}/main"),
            format!("refs/remotes/{remote}/master"),
        ]);
    }
    candidates.extend([
        "refs/remotes/origin/HEAD".to_owned(),
        "refs/remotes/origin/main".to_owned(),
        "refs/remotes/origin/master".to_owned(),
        "refs/heads/main".to_owned(),
        "refs/heads/master".to_owned(),
    ]);

    let mut seen = HashSet::new();
    for name in candidates
        .into_iter()
        .filter(|name| seen.insert(name.clone()))
    {
        let Ok(commit) = repository
            .revparse_single(&name)
            .and_then(|object| object.peel_to_commit())
        else {
            continue;
        };
        if commit.id() == head.id() {
            continue;
        }
        let Ok(merge_base) = repository.merge_base(commit.id(), head.id()) else {
            continue;
        };
        if merge_base != head.id() {
            return Ok(ResolvedBase {
                label: short_ref_name(&name),
                base_id: Some(commit.id()),
                merge_base_id: Some(merge_base),
            });
        }
    }

    let parent = head.parent_id(0).ok();
    Ok(ResolvedBase {
        label: if parent.is_some() {
            "HEAD^"
        } else {
            "empty tree"
        }
        .to_owned(),
        base_id: parent,
        merge_base_id: parent,
    })
}

fn short_ref_name(name: &str) -> String {
    name.strip_prefix("refs/remotes/")
        .or_else(|| name.strip_prefix("refs/heads/"))
        .unwrap_or(name)
        .to_owned()
}

fn commits_since(
    repository: &Repository,
    head: &Commit<'_>,
    merge_base_id: Option<git2::Oid>,
) -> Result<Vec<CommitSummary>, ReviewLoadError> {
    let mut walk = repository.revwalk()?;
    walk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)?;
    walk.push(head.id())?;
    if let Some(base) = merge_base_id {
        walk.hide(base)?;
    }
    walk.map(|id| Ok(commit_summary(&repository.find_commit(id?)?)?))
        .collect()
}

fn commit_summary(commit: &Commit<'_>) -> Result<CommitSummary, git2::Error> {
    let id = commit.id().to_string();
    let author = commit.author();
    let summary = commit
        .summary()?
        .unwrap_or("(no commit message)")
        .to_owned();
    let message = String::from_utf8_lossy(commit.message_bytes())
        .replace("\r\n", "\n")
        .trim_end_matches(['\r', '\n'])
        .to_owned();
    Ok(CommitSummary {
        short_id: id.chars().take(8).collect(),
        id,
        parent_id: commit.parent_id(0).ok().map(|id| id.to_string()),
        message: if message.is_empty() {
            summary.clone()
        } else {
            message
        },
        summary,
        author: author.name().unwrap_or("Unknown author").to_owned(),
        authored_at: author.when().seconds(),
    })
}

fn diff_files(
    repository: &Repository,
    old_tree: Option<&Tree<'_>>,
    new_tree: &Tree<'_>,
    id_prefix: &str,
    source_commit: Option<CommitSummary>,
) -> Result<Vec<FileDiff>, ReviewLoadError> {
    let mut options = DiffOptions::new();
    options
        .context_lines(3)
        .include_typechange(true)
        .indent_heuristic(true);
    let mut diff = repository.diff_tree_to_tree(old_tree, Some(new_tree), Some(&mut options))?;
    let mut find = DiffFindOptions::new();
    find.renames(true);
    diff.find_similar(Some(&mut find))?;

    let mut files = Vec::with_capacity(diff.deltas().len());
    for (file_index, delta) in diff.deltas().enumerate() {
        let old_file = delta.old_file();
        let new_file = delta.new_file();
        let old_path = old_file.path_bytes().map(escape_path);
        let new_path = new_file.path_bytes().map(escape_path);
        let display_path = new_path
            .as_ref()
            .or(old_path.as_ref())
            .cloned()
            .unwrap_or_else(|| "(unknown path)".to_owned());
        let file_id = format!("{id_prefix}:f{file_index}");
        let mut hunks = Vec::new();
        let mut additions = 0;
        let mut deletions = 0;

        if let Some(patch) = Patch::from_diff(&diff, file_index)? {
            for hunk_index in 0..patch.num_hunks() {
                let (hunk, line_count) = patch.hunk(hunk_index)?;
                let mut lines = Vec::with_capacity(line_count);
                for line_index in 0..line_count {
                    let line = patch.line_in_hunk(hunk_index, line_index)?;
                    let kind = match line.origin_value() {
                        DiffLineType::Context => LineKind::Context,
                        DiffLineType::Addition => {
                            additions += 1;
                            LineKind::Addition
                        }
                        DiffLineType::Deletion => {
                            deletions += 1;
                            LineKind::Deletion
                        }
                        DiffLineType::ContextEOFNL
                        | DiffLineType::AddEOFNL
                        | DiffLineType::DeleteEOFNL
                        | DiffLineType::FileHeader
                        | DiffLineType::HunkHeader
                        | DiffLineType::Binary => LineKind::Marker,
                    };
                    let (text, lossy) = display_bytes(line.content());
                    lines.push(DiffLine {
                        id: format!("{file_id}:h{hunk_index}:l{line_index}"),
                        kind,
                        old_line: line.old_lineno(),
                        new_line: line.new_lineno(),
                        text,
                        lossy,
                    });
                }
                let header = display_hunk_header(hunk.header());
                hunks.push(DiffHunk {
                    id: format!("{file_id}:h{hunk_index}"),
                    header,
                    old_start: hunk.old_start(),
                    old_lines: hunk.old_lines(),
                    new_start: hunk.new_start(),
                    new_lines: hunk.new_lines(),
                    lines,
                });
            }
        }

        files.push(FileDiff {
            id: file_id,
            old_path,
            new_path,
            display_path,
            status: map_status(delta.status()),
            old_mode: mode_name(old_file.mode()),
            new_mode: mode_name(new_file.mode()),
            old_oid: old_file.id().to_string(),
            new_oid: new_file.id().to_string(),
            binary: old_file.is_binary() || new_file.is_binary(),
            additions,
            deletions,
            source_commit: source_commit.clone(),
            hunks,
        });
    }
    Ok(files)
}

fn display_bytes(bytes: &[u8]) -> (String, bool) {
    let bytes = bytes.strip_suffix(b"\n").unwrap_or(bytes);
    let bytes = bytes.strip_suffix(b"\r").unwrap_or(bytes);
    match std::str::from_utf8(bytes) {
        Ok(text) => (text.to_owned(), false),
        Err(_) => (String::from_utf8_lossy(bytes).into_owned(), true),
    }
}

fn display_hunk_header(bytes: &[u8]) -> String {
    let (header, _) = display_bytes(bytes);
    header.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn escape_path(bytes: &[u8]) -> String {
    let mut output = String::new();
    for &byte in bytes {
        match byte {
            b'\\' => output.push_str("\\\\"),
            b'\n' => output.push_str("\\n"),
            b'\r' => output.push_str("\\r"),
            b'\t' => output.push_str("\\t"),
            0x20..=0x7e => output.push(char::from(byte)),
            _ => output.push_str(&format!("\\x{byte:02x}")),
        }
    }
    output
}

fn mode_name(mode: FileMode) -> String {
    format!("{:06o}", mode as i32)
}

fn map_status(delta: Delta) -> FileStatus {
    match delta {
        Delta::Added => FileStatus::Added,
        Delta::Deleted => FileStatus::Deleted,
        Delta::Modified => FileStatus::Modified,
        Delta::Renamed => FileStatus::Renamed,
        Delta::Copied => FileStatus::Copied,
        Delta::Typechange => FileStatus::TypeChanged,
        _ => FileStatus::Other,
    }
}

#[cfg(test)]
mod tests {
    use super::{display_bytes, display_hunk_header, escape_path};

    #[test]
    fn escapes_non_utf8_paths_without_losing_identity() {
        assert_eq!(escape_path(b"src/a\xff\n.rs"), "src/a\\xff\\n.rs");
    }

    #[test]
    fn strips_line_endings_and_marks_lossy_content() {
        assert_eq!(display_bytes(b"hello\r\n"), ("hello".to_owned(), false));
        assert_eq!(display_bytes(b"a\xff\n"), ("a�".to_owned(), true));
    }

    #[test]
    fn normalizes_long_hunk_headers_to_one_line() {
        assert_eq!(
            display_hunk_header(
                b"@@ -1054,20 +1054,25 @@ void\nAISubgroup::DeleteCommand(NetworkId\tid)\n",
            ),
            "@@ -1054,20 +1054,25 @@ void AISubgroup::DeleteCommand(NetworkId id)"
        );
    }
}
