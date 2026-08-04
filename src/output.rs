use std::collections::HashSet;

use crate::model::{ReviewData, ReviewOutcome, SubmittedReview};

pub fn validate_submission(data: &ReviewData, review: &SubmittedReview) -> Result<(), String> {
    match review.outcome {
        ReviewOutcome::Approve if !review.comments.is_empty() => {
            return Err("approval cannot contain draft comments".to_owned());
        }
        ReviewOutcome::Share if review.comments.is_empty() => {
            return Err("sharing requires at least one comment".to_owned());
        }
        _ => {}
    }

    let mut anchors = HashSet::new();
    for comment in &review.comments {
        let body = comment.body.trim();
        if body.is_empty() {
            return Err("comments cannot be blank".to_owned());
        }
        if body.chars().count() > 10_000 {
            return Err("comments cannot exceed 10,000 characters".to_owned());
        }
        let Some((_, line)) = data.find_line(&comment.file_id, &comment.line_id) else {
            return Err("a comment refers to a line outside this review".to_owned());
        };
        if !line.commentable() || line.anchor().is_none() {
            return Err("a comment refers to a non-commentable line".to_owned());
        }
        if !anchors.insert((&comment.file_id, &comment.line_id)) {
            return Err("only one comment is allowed per line".to_owned());
        }
    }
    Ok(())
}

pub fn format_review_result(data: &ReviewData, review: &SubmittedReview) -> Result<String, String> {
    validate_submission(data, review)?;
    if review.outcome == ReviewOutcome::Approve {
        return Ok("Review result: APPROVED — all good, approved by user.\n".to_owned());
    }

    let mut ordered = review.comments.iter().collect::<Vec<_>>();
    ordered.sort_by_key(|comment| {
        data.files
            .iter()
            .enumerate()
            .find_map(|(file_index, file)| {
                if file.id != comment.file_id {
                    return None;
                }
                file.hunks
                    .iter()
                    .enumerate()
                    .find_map(|(hunk_index, hunk)| {
                        hunk.lines
                            .iter()
                            .position(|line| line.id == comment.line_id)
                            .map(|line_index| (file_index, hunk_index, line_index))
                    })
            })
            .unwrap_or((usize::MAX, usize::MAX, usize::MAX))
    });

    let mut output = String::from("Review result: CHANGES REQUESTED\n");
    for (index, comment) in ordered.into_iter().enumerate() {
        let (file, line) = data
            .find_line(&comment.file_id, &comment.line_id)
            .expect("validated comment anchor");
        let (side, number) = line.anchor().expect("validated commentable line");
        let side = match side {
            crate::model::CommentSide::Old => "old",
            crate::model::CommentSide::New => "new",
        };
        let source_commit = file
            .source_commit
            .as_ref()
            .map_or_else(String::new, |commit| {
                format!(" · commit {}", markdown_code_span(&commit.short_id))
            });
        output.push_str(&format!(
            "\n### {}. {}:{} ({side}){source_commit}\n\n",
            index + 1,
            markdown_code_span(&file.display_path),
            number
        ));

        let snippet = snippet_for(file, &line.id);
        let fence = markdown_fence(&snippet);
        output.push_str(&format!("{fence}text\n{snippet}\n{fence}\n\n"));
        output.push_str(comment.body.trim());
        output.push('\n');
    }
    Ok(output)
}

fn snippet_for(file: &crate::model::FileDiff, line_id: &str) -> String {
    for hunk in &file.hunks {
        if let Some(index) = hunk.lines.iter().position(|line| line.id == line_id) {
            let start = index.saturating_sub(2);
            let end = (index + 3).min(hunk.lines.len());
            return hunk.lines[start..end]
                .iter()
                .map(|line| {
                    let marker = match line.kind {
                        crate::model::LineKind::Addition => '+',
                        crate::model::LineKind::Deletion => '-',
                        crate::model::LineKind::Context => ' ',
                        crate::model::LineKind::Marker => '\\',
                    };
                    let number = line
                        .new_line
                        .or(line.old_line)
                        .map_or_else(|| "    ".to_owned(), |number| format!("{number:>4}"));
                    format!("{number} {marker} {}", line.text)
                })
                .collect::<Vec<_>>()
                .join("\n");
        }
    }
    String::new()
}

fn markdown_fence(content: &str) -> String {
    let longest = content
        .split(|character| character != '`')
        .map(str::len)
        .max()
        .unwrap_or(0);
    "`".repeat((longest + 1).max(3))
}

fn markdown_code_span(content: &str) -> String {
    let fence = markdown_fence(content);
    format!("{fence}{content}{fence}")
}

#[cfg(test)]
mod tests {
    use crate::model::*;

    use super::{format_review_result, validate_submission};

    fn fixture() -> ReviewData {
        ReviewData {
            repository_root: "/tmp/repo".to_owned(),
            comparison: ComparisonSummary {
                base_ref: "HEAD^".to_owned(),
                base_id: None,
                merge_base_id: None,
                head_id: "abc".to_owned(),
            },
            commits: vec![],
            selected_commit_ids: vec![],
            commit: CommitSummary {
                id: "abc".to_owned(),
                short_id: "abc".to_owned(),
                parent_id: None,
                summary: "initial".to_owned(),
                author: "User".to_owned(),
                authored_at: 0,
            },
            files: vec![FileDiff {
                id: "f0".to_owned(),
                old_path: None,
                new_path: Some("src/`odd`.rs".to_owned()),
                display_path: "src/`odd`.rs".to_owned(),
                status: FileStatus::Added,
                old_mode: "000000".to_owned(),
                new_mode: "100644".to_owned(),
                old_oid: "0".repeat(40),
                new_oid: "1".repeat(40),
                binary: false,
                additions: 1,
                deletions: 0,
                source_commit: None,
                hunks: vec![DiffHunk {
                    id: "f0:h0".to_owned(),
                    header: "@@ -0,0 +1 @@".to_owned(),
                    old_start: 0,
                    old_lines: 0,
                    new_start: 1,
                    new_lines: 1,
                    lines: vec![DiffLine {
                        id: "f0:h0:l0".to_owned(),
                        kind: LineKind::Addition,
                        old_line: None,
                        new_line: Some(1),
                        text: "let ticks = ```;".to_owned(),
                        lossy: false,
                    }],
                }],
            }],
        }
    }

    #[test]
    fn rejects_invalid_submission_shapes() {
        let data = fixture();
        let approval = SubmittedReview {
            outcome: ReviewOutcome::Approve,
            comments: vec![ReviewComment {
                file_id: "f0".to_owned(),
                line_id: "f0:h0:l0".to_owned(),
                body: "No".to_owned(),
            }],
        };
        assert!(validate_submission(&data, &approval).is_err());
    }

    #[test]
    fn validates_every_comment_constraint() {
        let mut data = fixture();
        data.files[0].hunks[0].lines.push(DiffLine {
            id: "f0:h0:l1".to_owned(),
            kind: LineKind::Marker,
            old_line: None,
            new_line: None,
            text: "No newline at end of file".to_owned(),
            lossy: false,
        });

        let review = |file_id: &str, line_id: &str, body: String| SubmittedReview {
            outcome: ReviewOutcome::Share,
            comments: vec![ReviewComment {
                file_id: file_id.to_owned(),
                line_id: line_id.to_owned(),
                body,
            }],
        };

        assert_eq!(
            validate_submission(
                &data,
                &SubmittedReview {
                    outcome: ReviewOutcome::Share,
                    comments: vec![],
                }
            ),
            Err("sharing requires at least one comment".to_owned())
        );
        assert_eq!(
            validate_submission(&data, &review("f0", "f0:h0:l0", "  ".to_owned())),
            Err("comments cannot be blank".to_owned())
        );
        assert_eq!(
            validate_submission(&data, &review("f0", "f0:h0:l0", "x".repeat(10_001))),
            Err("comments cannot exceed 10,000 characters".to_owned())
        );
        assert_eq!(
            validate_submission(&data, &review("missing", "f0:h0:l0", "note".to_owned())),
            Err("a comment refers to a line outside this review".to_owned())
        );
        assert_eq!(
            validate_submission(&data, &review("f0", "f0:h0:l1", "note".to_owned())),
            Err("a comment refers to a non-commentable line".to_owned())
        );

        let duplicate = SubmittedReview {
            outcome: ReviewOutcome::Share,
            comments: vec![
                ReviewComment {
                    file_id: "f0".to_owned(),
                    line_id: "f0:h0:l0".to_owned(),
                    body: "first".to_owned(),
                },
                ReviewComment {
                    file_id: "f0".to_owned(),
                    line_id: "f0:h0:l0".to_owned(),
                    body: "second".to_owned(),
                },
            ],
        };
        assert_eq!(
            validate_submission(&data, &duplicate),
            Err("only one comment is allowed per line".to_owned())
        );
    }

    #[test]
    fn formats_approval_for_the_terminal() {
        let result = format_review_result(
            &fixture(),
            &SubmittedReview {
                outcome: ReviewOutcome::Approve,
                comments: vec![],
            },
        )
        .unwrap();
        assert_eq!(
            result,
            "Review result: APPROVED — all good, approved by user.\n"
        );
    }

    #[test]
    fn formats_safe_markdown_for_shared_comments() {
        let mut data = fixture();
        data.files[0].source_commit = Some(CommitSummary {
            id: "1234567890abcdef".to_owned(),
            short_id: "12345678".to_owned(),
            parent_id: None,
            summary: "selected change".to_owned(),
            author: "User".to_owned(),
            authored_at: 0,
        });
        let review = SubmittedReview {
            outcome: ReviewOutcome::Share,
            comments: vec![ReviewComment {
                file_id: "f0".to_owned(),
                line_id: "f0:h0:l0".to_owned(),
                body: "Please explain this.".to_owned(),
            }],
        };
        let result = format_review_result(&data, &review).unwrap();
        assert!(result.contains("CHANGES REQUESTED"));
        assert!(result.contains("src/`odd`.rs"));
        assert!(result.contains("commit ```12345678```"));
        assert!(result.contains("````text"));
        assert!(result.contains("Please explain this."));
    }

    #[test]
    fn orders_comments_by_diff_position_and_anchors_deletions_to_old_lines() {
        let mut data = fixture();
        data.files[0].hunks[0].lines.insert(
            0,
            DiffLine {
                id: "f0:h0:deleted".to_owned(),
                kind: LineKind::Deletion,
                old_line: Some(7),
                new_line: None,
                text: "removed".to_owned(),
                lossy: false,
            },
        );
        data.files.push(FileDiff {
            id: "f1".to_owned(),
            display_path: "README.md".to_owned(),
            old_path: Some("README.md".to_owned()),
            new_path: Some("README.md".to_owned()),
            status: FileStatus::Modified,
            old_mode: "100644".to_owned(),
            new_mode: "100644".to_owned(),
            old_oid: "2".repeat(40),
            new_oid: "3".repeat(40),
            binary: false,
            additions: 1,
            deletions: 0,
            source_commit: None,
            hunks: vec![DiffHunk {
                id: "f1:h0".to_owned(),
                header: "@@ -1 +1 @@".to_owned(),
                old_start: 1,
                old_lines: 1,
                new_start: 1,
                new_lines: 1,
                lines: vec![DiffLine {
                    id: "f1:h0:l0".to_owned(),
                    kind: LineKind::Context,
                    old_line: Some(1),
                    new_line: Some(1),
                    text: "heading".to_owned(),
                    lossy: false,
                }],
            }],
        });

        let result = format_review_result(
            &data,
            &SubmittedReview {
                outcome: ReviewOutcome::Share,
                comments: vec![
                    ReviewComment {
                        file_id: "f1".to_owned(),
                        line_id: "f1:h0:l0".to_owned(),
                        body: "later".to_owned(),
                    },
                    ReviewComment {
                        file_id: "f0".to_owned(),
                        line_id: "f0:h0:deleted".to_owned(),
                        body: "first".to_owned(),
                    },
                ],
            },
        )
        .unwrap();

        assert!(result.contains("src/`odd`.rs```:7 (old)"));
        assert!(result.find("first").unwrap() < result.find("later").unwrap());
        assert!(result.contains("   7 - removed"));
    }
}
