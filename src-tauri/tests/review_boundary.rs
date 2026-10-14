use git2::{Oid, Repository, Signature, Time};
use grr::{
    WORKTREE_COMMIT_ID, load_history, load_initial_review, load_review_history,
    load_review_history_files, load_review_snapshot_selection,
};
use std::collections::HashSet;

struct Fixture {
    directory: tempfile::TempDir,
    repo: Repository,
}

impl Fixture {
    fn new() -> Self {
        let directory = tempfile::tempdir().unwrap();
        let repo = Repository::init_opts(
            directory.path(),
            git2::RepositoryInitOptions::new().initial_head("feature"),
        )
        .unwrap();
        Self { directory, repo }
    }

    fn commit(&self, parents: &[Oid], time: i64, message: &str) -> Oid {
        let tree_id = self.repo.index().unwrap().write_tree().unwrap();
        let tree = self.repo.find_tree(tree_id).unwrap();
        let parents = parents
            .iter()
            .map(|id| self.repo.find_commit(*id).unwrap())
            .collect::<Vec<_>>();
        let signature =
            Signature::new("Review author", "review@example.com", &Time::new(time, 0)).unwrap();
        self.repo
            .commit(
                None,
                &signature,
                &signature,
                message,
                &tree,
                &parents.iter().collect::<Vec<_>>(),
            )
            .unwrap()
    }

    fn reference(&self, name: &str, id: Oid) {
        self.repo.reference(name, id, true, "").unwrap();
    }

    fn head(&self, id: Oid) {
        self.reference("refs/heads/feature", id);
        self.repo.set_head("refs/heads/feature").unwrap();
    }

    fn dirty(&self) {
        std::fs::write(self.directory.path().join("note.txt"), "uncommitted\n").unwrap();
    }
}

#[test]
fn orders_reviewed_merge_paths_before_the_base_across_pages() {
    for dirty in [false, true] {
        let fixture = Fixture::new();
        let root = fixture.commit(&[], 1, "root");
        let side = fixture.commit(&[root], 2, "side");
        let base = fixture.commit(&[root], 3, "base");
        let feature = fixture.commit(&[base], 4, "feature");
        let merge = fixture.commit(&[feature, side], 5, "merge");
        fixture.head(merge);
        fixture.reference("refs/remotes/origin/main", base);
        if dirty {
            fixture.dirty();
        }
        let snapshot = load_initial_review(fixture.directory.path(), None).unwrap();
        let natural = load_history(fixture.directory.path(), 0, 200).unwrap();
        let position = |id: Oid| {
            natural
                .commits
                .iter()
                .position(|commit| commit.commit.id == id.to_string())
                .unwrap()
        };
        assert!(position(base) < position(side));
        let mut commits = Vec::new();
        loop {
            let page =
                load_review_history(fixture.directory.path(), &snapshot, commits.len(), 2).unwrap();
            commits.extend(page.commits);
            if !page.has_more {
                break;
            }
        }
        let reviewed = snapshot
            .commits
            .iter()
            .map(|commit| commit.id.as_str())
            .collect::<HashSet<_>>();
        assert!(
            commits[..reviewed.len()]
                .iter()
                .all(|commit| reviewed.contains(commit.commit.id.as_str()))
        );
        assert_eq!(commits[reviewed.len()].commit.id, base.to_string());
        assert_eq!(commits.len(), 5 + usize::from(dirty));
        for (index, commit) in commits.iter().enumerate() {
            for parent in &commit.parent_ids {
                assert!(
                    commits
                        .iter()
                        .position(|commit| &commit.commit.id == parent)
                        .unwrap()
                        > index
                );
            }
        }
    }
}

#[test]
fn pins_the_comparison_and_catalog_until_an_explicit_reload() {
    let fixture = Fixture::new();
    let root = fixture.commit(&[], 1, "root");
    let first = fixture.commit(&[root], 2, "first");
    let head = fixture.commit(&[first], 3, "head");
    fixture.head(head);
    fixture.reference("refs/remotes/origin/main", root);
    let snapshot = load_initial_review(fixture.directory.path(), None).unwrap();
    fixture.reference("refs/remotes/origin/main", first);
    fixture
        .repo
        .config()
        .unwrap()
        .set_str("grr.base", "HEAD^")
        .unwrap();
    let selected =
        load_review_snapshot_selection(fixture.directory.path(), &snapshot, &[first.to_string()])
            .unwrap();
    assert_eq!(selected.comparison, snapshot.comparison);
    assert_eq!(selected.commits, snapshot.commits);
    let page = load_review_history(fixture.directory.path(), &selected, 0, 200).unwrap();
    assert_eq!(page.commits[2].commit.id, root.to_string());
    let reloaded = load_initial_review(fixture.directory.path(), None).unwrap();
    assert_eq!(reloaded.comparison.merge_base_id, Some(first.to_string()));
    assert_eq!(reloaded.comparison.base_ref, "HEAD^");
    assert_eq!(reloaded.commits.len(), 1);
}

#[test]
fn requires_reload_if_head_changes() {
    let fixture = Fixture::new();
    let root = fixture.commit(&[], 1, "root");
    fixture.head(root);
    let snapshot = load_initial_review(fixture.directory.path(), None).unwrap();
    let next = fixture.commit(&[root], 2, "next");
    fixture.head(next);
    let error =
        load_review_snapshot_selection(fixture.directory.path(), &snapshot, &[]).unwrap_err();
    assert_eq!(
        error.to_string(),
        "Repository HEAD changed; reload the review"
    );
    assert_eq!(
        load_review_history(fixture.directory.path(), &snapshot, 0, 200)
            .unwrap_err()
            .to_string(),
        error.to_string()
    );
    let reloaded = load_initial_review(fixture.directory.path(), None).unwrap();
    assert_eq!(reloaded.comparison.head_id, next.to_string());
    assert_eq!(
        load_review_history_files(fixture.directory.path(), &snapshot, &[root.to_string()])
            .unwrap_err()
            .to_string(),
        error.to_string()
    );
    assert!(load_review_history(fixture.directory.path(), &reloaded, 0, 200).is_ok());
}

#[test]
fn keeps_worktree_membership_stable_until_reload() {
    for initially_dirty in [false, true] {
        let fixture = Fixture::new();
        let root = fixture.commit(&[], 1, "root");
        fixture.head(root);
        fixture.reference("refs/remotes/origin/main", root);
        if initially_dirty {
            fixture.dirty();
        }
        let snapshot = load_initial_review(fixture.directory.path(), None).unwrap();
        if initially_dirty {
            std::fs::remove_file(fixture.directory.path().join("note.txt")).unwrap();
            let selected = load_review_snapshot_selection(
                fixture.directory.path(),
                &snapshot,
                &[WORKTREE_COMMIT_ID.to_owned()],
            )
            .unwrap();
            assert!(selected.files.is_empty());
            assert_eq!(selected.commits, snapshot.commits);
        } else {
            fixture.dirty();
            let selected =
                load_review_snapshot_selection(fixture.directory.path(), &snapshot, &[]).unwrap();
            assert!(selected.files.is_empty());
            assert_eq!(selected.commits, snapshot.commits);
            assert!(
                load_review_snapshot_selection(
                    fixture.directory.path(),
                    &snapshot,
                    &[WORKTREE_COMMIT_ID.to_owned()]
                )
                .is_err()
            );
        }
        let page = load_review_history(fixture.directory.path(), &snapshot, 0, 200).unwrap();
        assert_eq!(
            page.commits[0].commit.id == WORKTREE_COMMIT_ID,
            initially_dirty
        );
        let reloaded = load_initial_review(fixture.directory.path(), None).unwrap();
        assert_eq!(
            reloaded
                .commits
                .iter()
                .any(|commit| commit.id == WORKTREE_COMMIT_ID),
            !initially_dirty
        );
    }
}

#[test]
fn accepts_known_local_bases_at_head_including_root_repositories() {
    for branch in ["main", "master"] {
        for root_only in [false, true] {
            for dirty in [false, true] {
                let fixture = Fixture::new();
                let root = fixture.commit(&[], 1, "root");
                let head = if root_only {
                    root
                } else {
                    fixture.commit(&[root], 2, "head")
                };
                fixture.reference(&format!("refs/heads/{branch}"), head);
                fixture
                    .repo
                    .set_head(&format!("refs/heads/{branch}"))
                    .unwrap();
                if dirty {
                    fixture.dirty();
                }
                let review = load_initial_review(fixture.directory.path(), None).unwrap();
                assert_eq!(review.comparison.base_ref, branch);
                assert_eq!(review.comparison.merge_base_id, Some(head.to_string()));
                assert_eq!(review.commits.len(), usize::from(dirty));
            }
        }
    }
}

#[test]
fn resolves_remote_bases_ahead_behind_equal_and_diverged_from_head() {
    for relation in ["ahead", "behind", "equal", "diverged"] {
        for dirty in [false, true] {
            let fixture = Fixture::new();
            let root = fixture.commit(&[], 1, "root");
            let head = fixture.commit(&[root], 2, "head");
            fixture.head(head);
            let base = match relation {
                "ahead" => fixture.commit(&[head], 3, "ahead"),
                "behind" => root,
                "equal" => head,
                _ => fixture.commit(&[root], 3, "diverged"),
            };
            fixture.reference("refs/remotes/origin/main", base);
            if dirty {
                fixture.dirty();
            }
            let review = load_initial_review(fixture.directory.path(), None).unwrap();
            let reviewed_head = relation == "behind" || relation == "diverged";
            assert_eq!(review.comparison.base_id, Some(base.to_string()));
            assert_eq!(
                review.comparison.merge_base_id,
                Some(if reviewed_head { root } else { head }.to_string())
            );
            assert_eq!(
                review.commits.len(),
                usize::from(reviewed_head) + usize::from(dirty)
            );
        }
    }
}

#[test]
fn keeps_the_boundary_in_detached_head_history() {
    let fixture = Fixture::new();
    let root = fixture.commit(&[], 1, "root");
    let head = fixture.commit(&[root], 2, "head");
    fixture.repo.set_head_detached(head).unwrap();
    fixture.reference("refs/remotes/origin/main", root);
    let snapshot = load_initial_review(fixture.directory.path(), None).unwrap();
    let page = load_review_history(fixture.directory.path(), &snapshot, 0, 200).unwrap();
    assert_eq!(page.head_ref, "HEAD");
    assert_eq!(page.commits[0].commit.id, head.to_string());
    assert_eq!(page.commits[1].commit.id, root.to_string());
}

#[test]
fn skips_broken_or_unrelated_automatic_refs_but_rejects_explicit_ones() {
    let fixture = Fixture::new();
    let root = fixture.commit(&[], 1, "root");
    let head = fixture.commit(&[root], 2, "head");
    let unrelated = fixture.commit(&[], 3, "unrelated");
    fixture.head(head);
    fixture.reference("refs/remotes/origin/main", root);
    fixture
        .repo
        .reference_symbolic(
            "refs/remotes/origin/HEAD",
            "refs/remotes/origin/missing",
            true,
            "",
        )
        .unwrap();
    assert_eq!(
        load_initial_review(fixture.directory.path(), None)
            .unwrap()
            .comparison
            .base_ref,
        "origin/main"
    );
    fixture.reference("refs/remotes/origin/missing", unrelated);
    assert_eq!(
        load_initial_review(fixture.directory.path(), None)
            .unwrap()
            .comparison
            .base_ref,
        "origin/main"
    );
    assert!(load_initial_review(fixture.directory.path(), Some("origin/HEAD")).is_err());
    fixture
        .repo
        .config()
        .unwrap()
        .set_str("grr.base", "origin/HEAD")
        .unwrap();
    assert!(load_initial_review(fixture.directory.path(), None).is_err());
}

#[test]
fn uses_last_commit_or_empty_tree_only_without_a_detectable_base() {
    let fixture = Fixture::new();
    let root = fixture.commit(&[], 1, "root");
    fixture.head(root);
    let root_review = load_initial_review(fixture.directory.path(), None).unwrap();
    assert_eq!(root_review.comparison.base_ref, "empty tree");
    assert_eq!(root_review.comparison.merge_base_id, None);
    assert_eq!(
        load_review_history(fixture.directory.path(), &root_review, 0, 200)
            .unwrap()
            .commits
            .len(),
        1
    );
    let head = fixture.commit(&[root], 2, "head");
    fixture.head(head);
    let review = load_initial_review(fixture.directory.path(), None).unwrap();
    assert_eq!(review.comparison.base_ref, "HEAD^");
    assert_eq!(review.comparison.merge_base_id, Some(root.to_string()));
}

#[test]
fn respects_explicit_configured_and_upstream_remote_base_priority() {
    let fixture = Fixture::new();
    let root = fixture.commit(&[], 1, "root");
    let first = fixture.commit(&[root], 2, "first");
    let head = fixture.commit(&[first], 3, "head");
    fixture.head(head);
    fixture.reference("refs/remotes/origin/main", first);
    fixture.reference("refs/remotes/upstream/develop", root);
    fixture
        .repo
        .reference_symbolic(
            "refs/remotes/upstream/HEAD",
            "refs/remotes/upstream/develop",
            true,
            "",
        )
        .unwrap();
    fixture
        .repo
        .remote("upstream", "https://example.invalid/repository")
        .unwrap();
    let mut config = fixture.repo.config().unwrap();
    config.set_str("branch.feature.remote", "upstream").unwrap();
    config
        .set_str("branch.feature.merge", "refs/heads/develop")
        .unwrap();
    let automatic = load_initial_review(fixture.directory.path(), None).unwrap();
    assert_eq!(automatic.comparison.base_ref, "upstream/HEAD");
    config.set_str("grr.base", "HEAD^").unwrap();
    assert_eq!(
        load_initial_review(fixture.directory.path(), None)
            .unwrap()
            .comparison
            .base_ref,
        "HEAD^"
    );
    let explicit = load_initial_review(fixture.directory.path(), Some(&root.to_string())).unwrap();
    assert_eq!(explicit.comparison.base_ref, root.to_string());
    assert_eq!(explicit.comparison.merge_base_id, Some(root.to_string()));
}
