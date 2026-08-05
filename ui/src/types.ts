export type FileStatus =
  | "added"
  | "deleted"
  | "modified"
  | "renamed"
  | "copied"
  | "type_changed"
  | "other";

export type LineKind = "context" | "addition" | "deletion" | "marker";

export interface CommitSummary {
  id: string;
  shortId: string;
  parentId: string | null;
  summary: string;
  message: string;
  author: string;
  authoredAt: number;
}

export interface DiffLine {
  id: string;
  kind: LineKind;
  oldLine: number | null;
  newLine: number | null;
  text: string;
  lossy: boolean;
}

export interface DiffHunk {
  id: string;
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface FileDiff {
  id: string;
  oldPath: string | null;
  newPath: string | null;
  displayPath: string;
  status: FileStatus;
  oldMode: string;
  newMode: string;
  oldOid: string;
  newOid: string;
  binary: boolean;
  additions: number;
  deletions: number;
  sourceCommit: CommitSummary | null;
  hunks: DiffHunk[];
}

export interface ComparisonSummary {
  baseRef: string;
  baseId: string | null;
  mergeBaseId: string | null;
  headId: string;
}

export interface ReviewData {
  repositoryRoot: string;
  commit: CommitSummary;
  comparison: ComparisonSummary;
  commits: CommitSummary[];
  selectedCommitIds: string[];
  files: FileDiff[];
}

export interface ReviewComment {
  fileId: string;
  lineId: string;
  body: string;
}

export interface SubmittedReview {
  outcome: "approve" | "share";
  comments: ReviewComment[];
}
