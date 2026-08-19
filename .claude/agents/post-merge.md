---
name: post-merge
description: Post-merge completion work for a LoreBridge feature PR. Run this after the repository owner confirms a PR is merged and its branch is deleted.
---

# Post-merge completion

The owner has confirmed a PR was merged and its branch deleted. Work through the following steps in order and report completion of each.

## Step 1 — Re-read the merged work

Read the merged PR, its linked issue, and the final changed-file list so you have an accurate picture of what was delivered.

```
gh pr view <PR-number> --comments
gh issue view <issue-number>
```

## Step 2 — Update the issue

Ensure the issue documents the complete delivered scope:

- Update the checklist or body if anything is missing.
- Add a concise completion comment that covers:
  - The merged PR number and title.
  - What was implemented (one or two sentences per significant item).
  - Important design or safety decisions.
  - Validation and live acceptance results that were actually reported — do **not** claim a live test passed if it was not confirmed.
  - Documentation changes made as part of the PR.
  - Any explicit follow-up work or known limitations.

If live acceptance has not been confirmed, record what remains and keep the issue open until it is.

## Step 3 — Mark ROADMAP.md complete

Once the merged change has passed its required live acceptance test:

- Mark the issue complete (checkmark) in `ROADMAP.md`.
- Commit this directly to `main` using the Markdown-only direct-main exception (only `.md` files change).

## Step 4 — Close the GitHub issue

Close the issue after it has been marked complete in the roadmap.

```
gh issue close <issue-number>
```

## Step 5 — Verify consistency

Confirm that the roadmap, issue, PR, and milestone all agree: the issue is closed, the roadmap has a checkmark, and the PR is merged under the correct milestone.

## Step 6 — Check milestone completeness

Inspect every other issue assigned to the same milestone:

```
gh issue list --milestone "<milestone-name>" --state open
```

- If open issues remain: report which ones remain and **stop here** — do not begin milestone closeout.
- If all issues are now closed: report this and note that `/milestone-closeout` can be run next.

---

*Uses the Markdown-only direct-main exception from `AGENTS.md` for `.md`-only commits.*
