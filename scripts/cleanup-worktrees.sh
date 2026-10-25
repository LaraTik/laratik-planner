#!/usr/bin/env bash
#
# cleanup-worktrees.sh — remove local worktrees and branches whose content is
# already contained in the base ref.
#
# Why this exists: this repository squash-merges (see AGENTS.md § Conventions).
# A squash-merge rewrites every commit SHA, so a squash-merged branch is never
# an *ancestor* of main — it is only *patch-equivalent* to it. That makes
# `git branch -d` refuse branches that are safely merged, and makes
# ancestry-only checks ("is this branch merged?") unreliable. This script
# therefore checks ancestry first and then falls back to patch equivalence plus
# a per-file content comparison, so it is correct for both merge styles.
# See docs/audits/RELEASE_PROCESS_REVIEW_2026-10-25.md §3.
#
# Usage:
#   ./scripts/cleanup-worktrees.sh                 # report only (read-only, default)
#   ./scripts/cleanup-worktrees.sh --apply         # remove what is already in main
#   ./scripts/cleanup-worktrees.sh --apply --branch feat/x   # also remove a specific
#                                                            # branch with unmerged work
#
# Options:
#   --apply        perform the removals. Without it, nothing is modified.
#   --discard-stale  also remove a dirty worktree whose uncommitted content is
#                   already present in the base ref (identical, or differing
#                   only in whitespace). Unique work is never discarded.
#   --branch NAME  additionally target NAME even if it carries unmerged commits.
#   --base REF     base ref to compare against (default: main)
#   -h, --help     show this help
#
# Safety rules, all enforced below:
#   * `main` (the base ref) is never removed.
#   * The branch checked out in the repository root is never removed.
#   * A worktree with uncommitted changes is never removed, unless every dirty
#     file's content is already in the base ref AND --discard-stale is given.
#   * A branch is never removed unless its content is already in the base ref,
#     or the operator named it explicitly with --branch.
#   * Report mode changes nothing.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

BASE_REF="main"
APPLY=0
DISCARD_STALE=0
EXTRA_BRANCH=""

usage() {
  sed -n '3,40p' "$0" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --apply)
      APPLY=1
      shift
      ;;
    --discard-stale)
      DISCARD_STALE=1
      shift
      ;;
    --branch)
      EXTRA_BRANCH="${2:-}"
      if [ -z "$EXTRA_BRANCH" ]; then
        echo "error: --branch needs a branch name" >&2
        exit 2
      fi
      shift 2
      ;;
    --base)
      BASE_REF="${2:-}"
      if [ -z "$BASE_REF" ]; then
        echo "error: --base needs a ref" >&2
        exit 2
      fi
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! git rev-parse --verify --quiet "$BASE_REF" >/dev/null; then
  echo "error: base ref '$BASE_REF' does not exist in this repository" >&2
  exit 2
fi

ROOT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$ROOT_BRANCH" = "HEAD" ]; then
  ROOT_BRANCH=""
fi

# --- helpers -----------------------------------------------------------------

# is_contained <commit-ish> — true when the ref's content is already in the
# base ref.
#
# Ancestry is checked first: if the ref is an ancestor of the base ref, its
# content is in the base by definition. Ancestry alone is not sufficient in a
# squash-merging repository, where a merged branch is only *patch-equivalent*
# to the base and `git branch -d` refuses it. So the fallback is patch
# equivalence (`git cherry`) PLUS a per-file content comparison, because
# patch-ids ignore surrounding context and can hide a later revert.
is_contained() {
  local ref="$1"
  local unmerged mb f

  if git merge-base --is-ancestor "$ref" "$BASE_REF" 2>/dev/null; then
    return 0
  fi

  unmerged="$(git cherry "$BASE_REF" "$ref" 2>/dev/null | grep -c '^+' || true)"
  if [ "$unmerged" -ne 0 ]; then
    return 1
  fi

  mb="$(git merge-base "$BASE_REF" "$ref" 2>/dev/null || true)"
  if [ -z "$mb" ]; then
    return 1
  fi

  while IFS= read -r f; do
    [ -n "$f" ] || continue
    if ! git diff --quiet "$ref" "$BASE_REF" -- "$f" 2>/dev/null; then
      return 1
    fi
  done < <(git diff --name-only "$mb" "$ref")

  return 0
}

# unmerged_commits <commit-ish> — count of commits in <commit-ish> that are not
# patch-equivalent in the base ref.
unmerged_commits() {
  git cherry "$BASE_REF" "$1" 2>/dev/null | grep -c '^+' || true
}

worktree_is_dirty() {
  local path="$1"
  [ -n "$(git -C "$path" status --porcelain 2>/dev/null || true)" ]
}

# dirty_file_verdict <worktree-path> <relative-file> — prints one of:
#   identical     the worktree copy is byte-identical to the base ref copy
#   equivalent    identical once whitespace is ignored (formatting only)
#   diverges      the content genuinely differs from the base ref
#   untracked     the file is new in the worktree and absent from the base ref
#
# Used to tell a *stale snapshot* (dirty, but everything already landed) apart
# from *unique work* (dirty, and something is only here).
dirty_file_verdict() {
  local path="$1" file="$2"
  local base_content work_content

  if ! git cat-file -e "$BASE_REF:$file" 2>/dev/null; then
    echo "untracked"
    return
  fi

  base_content="$(git show "$BASE_REF:$file" 2>/dev/null || true)"
  work_content="$(cat "$path/$file" 2>/dev/null || true)"

  if [ "$base_content" = "$work_content" ]; then
    echo "identical"
    return
  fi

  if [ "$(printf '%s' "$base_content" | tr -d '[:space:]')" = "$(printf '%s' "$work_content" | tr -d '[:space:]')" ]; then
    echo "equivalent"
    return
  fi

  echo "diverges"
}

# worktree_is_stale <worktree-path> — true when every uncommitted change in the
# worktree is already present in the base ref (identical or whitespace-only).
# Prints the diverging files to stdout for the report.
worktree_is_stale() {
  local path="$1"
  local file verdict diverging=""

  while IFS= read -r file; do
    [ -n "$file" ] || continue
    case "$file" in
      next-env.d.ts) continue ;; # generated by the Next.js toolchain
    esac
    verdict="$(dirty_file_verdict "$path" "$file")"
    case "$verdict" in
      diverges | untracked) diverging="$diverging $file" ;;
    esac
  done < <(git -C "$path" status --porcelain 2>/dev/null | sed 's/^...//' | sed 's/.* -> //')

  if [ -z "$diverging" ]; then
    return 0
  fi

  printf '%s\n' "$diverging" | tr ' ' '\n' | grep -v '^$' || true
  return 1
}

# --- collect state -----------------------------------------------------------

WORKTREE_PATHS=()
WORKTREE_BRANCH=()
WORKTREE_HEAD=()
WORKTREE_DETACHED=()

while IFS='|' read -r wt_path wt_head wt_branch wt_detached; do
  [ -n "$wt_path" ] || continue
  WORKTREE_PATHS+=("$wt_path")
  WORKTREE_HEAD+=("$wt_head")
  WORKTREE_BRANCH+=("$wt_branch")
  WORKTREE_DETACHED+=("$wt_detached")
done < <(
  git worktree list --porcelain | awk '
    /^worktree /   { path = substr($0, 10); next }
    /^HEAD /       { head = substr($0, 6); next }
    /^branch /     { branch = substr($0, 8); sub("^refs/heads/", "", branch); next }
    /^detached$/   { detached = "yes"; next }
    /^$/ {
      if (path != "") {
        printf "%s|%s|%s|%s\n", path, head, (branch == "" ? "" : branch), (detached == "" ? "no" : "yes")
      }
      path = ""; head = ""; branch = ""; detached = ""
      next
    }
    END {
      if (path != "") {
        printf "%s|%s|%s|%s\n", path, head, (branch == "" ? "" : branch), (detached == "" ? "no" : "yes")
      }
    }
  '
)

LOCAL_BRANCHES=()
while IFS= read -r b; do
  LOCAL_BRANCHES+=("$b")
done < <(git for-each-ref --format='%(refname:short)' refs/heads/)

# --- classify ----------------------------------------------------------------

REMOVE_WORKTREES=()
REMOVE_BRANCHES=()
SKIPPED=()

for i in "${!WORKTREE_PATHS[@]}"; do
  path="${WORKTREE_PATHS[$i]}"
  head="${WORKTREE_HEAD[$i]}"
  branch="${WORKTREE_BRANCH[$i]}"
  detached="${WORKTREE_DETACHED[$i]}"

  [ "$path" = "$REPO_ROOT" ] && continue

  if worktree_is_dirty "$path"; then
    diverging="$(worktree_is_stale "$path" || true)"
    if [ -z "$diverging" ]; then
      # Every uncommitted change here is already in the base ref: a stale
      # snapshot of work that has since landed, not unique work.
      if [ "$DISCARD_STALE" -eq 1 ]; then
        REMOVE_WORKTREES+=("$path")
        [ -n "$branch" ] && REMOVE_BRANCHES+=("$branch")
      else
        SKIPPED+=("worktree  $path  — stale snapshot: uncommitted content already in $BASE_REF (re-run with --discard-stale to remove)")
      fi
    else
      SKIPPED+=("worktree  $path  — uncommitted changes not in $BASE_REF:$diverging")
    fi
    continue
  fi

  if [ "$detached" = "yes" ]; then
    if is_contained "$head"; then
      REMOVE_WORKTREES+=("$path")
      [ -n "$branch" ] && REMOVE_BRANCHES+=("$branch")
    else
      SKIPPED+=("worktree  $path  — detached HEAD $head not contained in $BASE_REF")
    fi
    continue
  fi

  if [ -z "$branch" ]; then
    SKIPPED+=("worktree  $path  — no branch, left untouched")
    continue
  fi

  if [ "$branch" = "$BASE_REF" ] || [ "$branch" = "$ROOT_BRANCH" ]; then
    SKIPPED+=("worktree  $path  — protected branch '$branch'")
    continue
  fi

  if is_contained "$branch"; then
    REMOVE_WORKTREES+=("$path")
    REMOVE_BRANCHES+=("$branch")
  else
    SKIPPED+=("worktree  $path  — branch '$branch' carries unmerged work")
  fi
done

for branch in "${LOCAL_BRANCHES[@]}"; do
  [ "$branch" = "$BASE_REF" ] && continue
  [ "$branch" = "$ROOT_BRANCH" ] && continue

  # Skip branches already handled as attached worktrees.
  attached=0
  for i in "${!WORKTREE_BRANCH[@]}"; do
    if [ "${WORKTREE_BRANCH[$i]}" = "$branch" ] && [ "${WORKTREE_PATHS[$i]}" != "$REPO_ROOT" ]; then
      attached=1
      break
    fi
  done
  [ "$attached" -eq 1 ] && continue

  if is_contained "$branch"; then
    REMOVE_BRANCHES+=("$branch")
  elif [ "$branch" = "$EXTRA_BRANCH" ]; then
    REMOVE_BRANCHES+=("$branch")
    SKIPPED+=("branch    $branch  — named with --branch, carries $(unmerged_commits "$branch") unmerged commit(s)")
  fi
done

if [ -n "$EXTRA_BRANCH" ] && [ "$EXTRA_BRANCH" != "$BASE_REF" ] && [ "$EXTRA_BRANCH" != "$ROOT_BRANCH" ]; then
  found=0
  for b in "${REMOVE_BRANCHES[@]:-}"; do
    [ "$b" = "$EXTRA_BRANCH" ] && found=1
  done
  if [ "$found" -eq 0 ]; then
    git rev-parse --verify --quiet "$EXTRA_BRANCH" >/dev/null || {
      echo "error: branch '$EXTRA_BRANCH' does not exist" >&2
      exit 2
    }
    REMOVE_BRANCHES+=("$EXTRA_BRANCH")
    SKIPPED+=("branch    $EXTRA_BRANCH  — named with --branch, carries $(unmerged_commits "$EXTRA_BRANCH") unmerged commit(s)")
  fi
fi

# --- report ------------------------------------------------------------------

echo "Cleanup report — base ref: $BASE_REF   mode: $([ "$APPLY" -eq 1 ] && echo APPLY || echo report-only)   discard-stale: $([ "$DISCARD_STALE" -eq 1 ] && echo yes || echo no)"
echo

if [ "${#REMOVE_WORKTREES[@]}" -gt 0 ]; then
  echo "Worktrees to remove:"
  for p in "${REMOVE_WORKTREES[@]}"; do
    echo "  - $p"
  done
  echo
fi

if [ "${#REMOVE_BRANCHES[@]}" -gt 0 ]; then
  echo "Branches to remove:"
  for b in "${REMOVE_BRANCHES[@]}"; do
    echo "  - $b"
  done
  echo
fi

if [ "${#SKIPPED[@]}" -gt 0 ]; then
  echo "Left alone:"
  for s in "${SKIPPED[@]}"; do
    echo "  - $s"
  done
  echo
fi

if [ "${#REMOVE_WORKTREES[@]}" -eq 0 ] && [ "${#REMOVE_BRANCHES[@]}" -eq 0 ]; then
  echo "Nothing to clean up."
  echo
fi

if [ "$APPLY" -eq 0 ]; then
  echo "Report only — nothing was changed. Re-run with --apply to remove the items above."
  exit 0
fi

# --- apply -------------------------------------------------------------------

echo "Applying..."

for p in "${REMOVE_WORKTREES[@]:-}"; do
  [ -n "$p" ] || continue
  if git worktree remove "$p" 2>/dev/null; then
    echo "  removed worktree  $p"
  else
    echo "  FAILED to remove worktree  $p  (left in place)" >&2
  fi
done

git worktree prune

for b in "${REMOVE_BRANCHES[@]:-}"; do
  [ -n "$b" ] || continue
  if git branch -D "$b" >/dev/null 2>&1; then
    echo "  removed branch    $b"
  else
    echo "  FAILED to remove branch  $b  (left in place)" >&2
  fi
done

echo
echo "Remaining worktrees:"
git worktree list
