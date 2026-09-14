use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewData {
    pub repository_root: String,
    pub commit: CommitSummary,
    pub comparison: ComparisonSummary,
    pub commits: Vec<CommitSummary>,
    pub selected_commit_ids: Vec<String>,
    pub files: Vec<FileDiff>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComparisonSummary {
    pub base_ref: String,
    pub base_id: Option<String>,
    pub merge_base_id: Option<String>,
    pub head_id: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitSummary {
    pub id: String,
    pub short_id: String,
    pub parent_id: Option<String>,
    pub summary: String,
    pub message: String,
    pub author: String,
    pub authored_at: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FileStatus {
    Added,
    Deleted,
    Modified,
    Renamed,
    Copied,
    TypeChanged,
    Other,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub id: String,
    pub old_path: Option<String>,
    pub new_path: Option<String>,
    pub display_path: String,
    pub status: FileStatus,
    pub old_mode: String,
    pub new_mode: String,
    pub old_oid: String,
    pub new_oid: String,
    pub binary: bool,
    pub additions: u32,
    pub deletions: u32,
    pub source_commit: Option<FileSourceCommit>,
    pub hunks: Vec<DiffHunk>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSourceCommit {
    pub id: String,
    pub short_id: String,
    pub summary: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffHunk {
    pub id: String,
    pub header: String,
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub lines: Vec<DiffLine>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LineKind {
    Context,
    Addition,
    Deletion,
    Marker,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    pub id: String,
    pub kind: LineKind,
    pub old_line: Option<u32>,
    pub new_line: Option<u32>,
    pub text: String,
    pub lossy: bool,
}

impl DiffLine {
    pub fn commentable(&self) -> bool {
        self.kind != LineKind::Marker
    }

    pub fn anchor(&self) -> Option<(CommentSide, u32)> {
        match self.kind {
            LineKind::Deletion => self.old_line.map(|line| (CommentSide::Old, line)),
            LineKind::Context | LineKind::Addition => {
                self.new_line.map(|line| (CommentSide::New, line))
            }
            LineKind::Marker => None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommentSide {
    Old,
    New,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewComment {
    pub file_id: String,
    pub line_id: String,
    pub body: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewOutcome {
    Approve,
    Share,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmittedReview {
    pub outcome: ReviewOutcome,
    pub comments: Vec<ReviewComment>,
}

impl ReviewData {
    pub fn find_line(&self, file_id: &str, line_id: &str) -> Option<(&FileDiff, &DiffLine)> {
        let file = self.files.iter().find(|file| file.id == file_id)?;
        let line = file
            .hunks
            .iter()
            .flat_map(|hunk| &hunk.lines)
            .find(|line| line.id == line_id)?;
        Some((file, line))
    }
}
