#!/usr/bin/env python3
"""
Daily planning report across the LaraTik workspaces.

Read-only. Calls the Planner MCP endpoint and prints a markdown report to
stdout, then appends the same report to a rolling log under
`tmp/daily-report/`. A small state file next to the log carries yesterday's
headline numbers so each run can print a day-over-day delta.

The report answers one question per person: *what should I do today?* — so it
is scoped to actionable items only, grouped by the person who is next in the
workflow rather than by every person who is merely cc'd.

Buckets (per person)
  still planning   draft | content_review | approved_for_design   -> planner
  still designing  in_design | changes_requested                   -> designer
  date passed      publish date has passed, not yet published      -> designer
                   if one is assigned, else the planner
  in review        creative_review | ready_to_publish              -> nobody; this is
                   an informational count, it does not appear in any
                   person's action list

Window
  Only items whose `plannedPublishAt` is on or after REPORT_FROM (default
  2026-10-01). Earlier items are excluded on purpose: this report tracks
  forward work, not the backlog that has already slipped.

Names
  Resolved with `laratik_planner_list_workspace_members` where the tool
  exists. On a deployment that predates that tool the report still runs and
  falls back to a short UUID, so the first morning's report is readable in
  shape even before names are live.

Usage
  PLANNER_TOKEN=<read-only token> python3 scripts/daily-report.py
  PLANNER_TOKEN=... python3 scripts/daily-report.py --now 2026-10-05T09:00:00Z

Requires a token with the `content:read` scope. It never writes to the
planner: the report is a snapshot, not an actor.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ENDPOINT = os.environ.get("PLANNER_ENDPOINT", "https://planner.laratik.com/api/mcp")
REPORT_FROM = os.environ.get("REPORT_FROM", "2026-10-01T00:00:00.000Z")
LOG_DIR = Path(os.environ.get("REPORT_LOG_DIR", "tmp/daily-report"))

# The six LaraTik workspaces. Studio30 is deliberately absent: it belongs to a
# different agency (agencyId aa1f7cd4-...) and is not part of the LaraTik board.
WORKSPACES = {
    "Just Halal TR": "fccaa889-4456-4e80-b45f-050c0aa2d873",
    "Just Halal AR": "314b4e32-3214-46a2-8786-020a6e3cd24e",
    "Food Game": "30bd97bd-15e4-4b01-b0b7-0c9e94297ae0",
    "Dr Reem Reda": "edc7f364-a43d-41d5-94d1-cf606edca37a",
    "Hekaya Shamyah": "2d26d5ef-1b19-492a-a4d5-eaac0e6d6336",
    "test": "a75d09b6-daac-4a2c-ba06-6e22a6ba6030",
}
SANDBOX = {"test"}

# Statuses that mean the item no longer needs anyone's action.
CLOSED = {"published", "partially_published", "cancelled"}
PLANNING = {"draft", "content_review", "approved_for_design"}
DESIGNING = {"in_design", "changes_requested"}
IN_REVIEW = {"creative_review", "ready_to_publish"}
OPEN = PLANNING | DESIGNING | IN_REVIEW | {"blocked"}

UNASSIGNED = "(unassigned)"
NO_OWNER = "(no owner)"


class PlannerError(RuntimeError):
    pass


# ─── MCP transport ────────────────────────────────────────────────────────


class Planner:
    """Minimal JSON-RPC client for the Planner MCP endpoint."""

    def __init__(self, token: str) -> None:
        self._token = token
        self._id = 0

    def call(self, tool: str, **arguments: object) -> object:
        self._id += 1
        payload = json.dumps(
            {
                "jsonrpc": "2.0",
                "id": self._id,
                "method": "tools/call",
                "params": {"name": tool, "arguments": arguments},
            }
        )
        request = urllib.request.Request(
            ENDPOINT,
            data=payload.encode(),
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream",
                "Authorization": f"Bearer {self._token}",
                # The endpoint sits behind Cloudflare, which rejects the default
                # `Python-urllib/3.x` agent with 403 before the request reaches
                # the app. Identifying the client honestly is all that is needed.
                "User-Agent": "laratik-planner-daily-report/1.0",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                body = json.loads(response.read())
        except urllib.error.HTTPError as exc:
            raise PlannerError(f"{tool}: HTTP {exc.code} {exc.reason}") from exc
        except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as exc:
            raise PlannerError(f"{tool}: {exc}") from exc
        if "error" in body:
            raise PlannerError(f"{tool}: {json.dumps(body['error'])[:200]}")
        text = body["result"]["content"][0]["text"]
        try:
            return json.loads(text)
        except json.JSONDecodeError as exc:
            # The server reports domain failures as plain text, not JSON.
            raise PlannerError(f"{tool}: {text[:200]}") from exc

    def list_content(self, workspace_id: str) -> list[dict]:
        """Every non-archived item in one workspace, following pagination."""
        items: list[dict] = []
        offset = 0
        while True:
            page = self.call(
                "laratik_planner_list_content",
                workspace_id=workspace_id,
                month_start=REPORT_FROM,
                month_end="2027-12-31",
                limit=100,
                offset=offset,
            )
            batch = page.get("items", [])
            items.extend(batch)
            offset += 100
            if not page.get("has_more") or not batch:
                return items

    def list_members(self, workspace_id: str) -> list[dict] | None:
        """Members of a workspace, or None when the tool is not deployed yet."""
        try:
            return self.call(
                "laratik_planner_list_workspace_members", workspace_id=workspace_id
            )
        except PlannerError:
            return None


# ─── helpers ──────────────────────────────────────────────────────────────


def parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def short_uid(user_id: str | None) -> str:
    return f"{user_id[:8]}…" if user_id else UNASSIGNED


def classify(item: dict, now: datetime) -> tuple[str, str] | None:
    """Return (bucket, routed_to) for an item, or None when it needs no one.

    Order is the report's own priority order: an item is counted in exactly one
    bucket. The date check deliberately precedes the review check — an item
    sitting in `creative_review` / `ready_to_publish` whose publish date has
    already passed is a miss, and belongs in "date passed, not published",
    not in the informational review line. The review line therefore only ever
    holds work that is *not yet* late.
    """
    status = item.get("status")
    if status in CLOSED or item.get("archivedAt"):
        return None
    designer = item.get("designerId")
    owner = item.get("contentOwnerId")
    if status in PLANNING:
        return "planning", owner or NO_OWNER
    if status in DESIGNING:
        return "designing", designer or UNASSIGNED
    if parse_ts(item["plannedPublishAt"]) < now:
        # The report routes each overdue item to a designer or a planner. Which
        # one depends on how far the item actually got: while it is still being
        # designed the designer is the one who can move it, but once it reaches
        # `ready_to_publish` the design is finished and the next action is
        # `record_published`, which the workflow restricts to a manager or
        # publisher (`WORKFLOW_RULES`, src/lib/content/workflow.ts). Routing a
        # finished design to the designer would send them to chase work they
        # already completed.
        if status in IN_REVIEW:
            return "date_passed", owner or NO_OWNER
        return "date_passed", designer or owner or NO_OWNER
    if status in IN_REVIEW:
        return "review", ""
    return None


def load_names(planner: Planner) -> dict[str, str]:
    """userId -> display name, across every workspace. Empty if unavailable."""
    names: dict[str, str] = {}
    for workspace_id in WORKSPACES.values():
        members = planner.list_members(workspace_id)
        if not members:
            continue
        for member in members:
            display = (member.get("displayName") or "").strip()
            if display:
                names[member["userId"]] = display
    return names


# ─── rendering ────────────────────────────────────────────────────────────


def render(
    now: datetime,
    rows: list[dict],
    names: dict[str, str],
    previous: dict,
) -> tuple[str, dict]:
    buckets: dict[tuple[str, str], list[dict]] = defaultdict(list)
    totals: Counter = Counter()
    for item in rows:
        verdict = classify(item, now)
        if verdict is None:
            continue
        bucket, routed_to = verdict
        rows_for = buckets[(bucket, routed_to)]
        rows_for.append(item)
        totals[bucket] += 1
        if routed_to in (UNASSIGNED, NO_OWNER):
            totals["unowned"] += 1

    def label(user_id: str) -> str:
        if user_id in (UNASSIGNED, NO_OWNER):
            return user_id
        return names.get(user_id) or short_uid(user_id)

    def sort_key(item: dict) -> tuple:
        return (item["plannedPublishAt"], item["title"])

    lines: list[str] = []
    day = now.astimezone().strftime("%Y-%m-%d (%a)")
    lines.append(f"# Daily planning report — {day}")
    lines.append("")
    lines.append(
        f"Window: items dated **on or after {REPORT_FROM[:10]}** across "
        f"{len(WORKSPACES)} workspaces. Read-only snapshot; nothing was changed."
    )
    if not names:
        lines.append("")
        lines.append(
            "> Names unavailable — `list_workspace_members` is not live on this "
            "deployment yet. People show as short IDs until it is deployed."
        )
    lines.append("")

    def delta(metric: str) -> str:
        before = previous.get(metric)
        current = totals.get(metric, 0)
        if before is None:
            return "first run"
        change = current - before
        if change == 0:
            return "no change"
        return f"{'+' if change > 0 else ''}{change}"

    lines.append("## Where the work stands")
    lines.append("")
    lines.append("| Metric | Today | vs last run |")
    lines.append("| --- | ---: | --- |")
    for metric, label_text in (
        ("planning", "Still planning (planner)"),
        ("designing", "Still designing (designer)"),
        ("date_passed", "Publish date passed, not published"),
        ("unowned", "…of which nobody is assigned"),
        ("review", "In review (informational)"),
    ):
        lines.append(
            f"| {label_text} | {totals.get(metric, 0)} | {delta(metric)} |"
        )
    lines.append("")

    def emit_section(bucket: str, routed_people: list[str]) -> None:
        heading = {
            "planning": "Still planning — planner",
            "designing": "Still designing — designer",
            "date_passed": "Publish date passed, not published",
        }[bucket]
        lines.append(f"## {heading}")
        lines.append("")
        any_row = False
        for person in routed_people:
            group = sorted(buckets[(bucket, person)], key=sort_key)
            if not group:
                continue
            any_row = True
            lines.append(f"### {label(person)} — {len(group)}")
            lines.append("")
            for item in group:
                date = item["plannedPublishAt"][:10]
                overdue_days = (now - parse_ts(item["plannedPublishAt"])).days
                late = f" · **{overdue_days}d late**" if overdue_days > 0 else ""
                # Only meaningful once the content is approved and a designer is
                # genuinely the next step. A draft having no designer is the
                # normal state, not a finding, so it is not flagged.
                note = (
                    " · **no designer assigned**"
                    if item["status"] == "approved_for_design"
                    and not item.get("designerId")
                    else ""
                )
                sandbox = " · *(sandbox)*" if item["_ws"] in SANDBOX else ""
                lines.append(
                    f"- `{date}`{late} · {item['_ws']}{sandbox} · "
                    f"**{item['title']}**{note} · `{item['id'][:8]}`"
                )
            lines.append("")
        if not any_row:
            lines.append("_Nothing in this bucket._")
            lines.append("")

    unowned_ids = [UNASSIGNED, NO_OWNER]
    emit_section("planning", [p for (b, p) in buckets if b == "planning"])
    emit_section("designing", [p for (b, p) in buckets if b == "designing"])
    emit_section("date_passed", [p for (b, p) in buckets if b == "date_passed"])

    review = sorted(buckets[("review", "")], key=sort_key)
    lines.append("## In review — nobody's action today")
    lines.append("")
    if review:
        for item in review:
            lines.append(
                f"- `{item['plannedPublishAt'][:10]}` · {item['_ws']} · "
                f"**{item['title']}** · {item['status']} · `{item['id'][:8]}`"
            )
    else:
        lines.append("_Nothing waiting on a reviewer._")
    lines.append("")

    state = {k: totals.get(k, 0) for k in
             ("planning", "designing", "date_passed", "unowned", "review")}
    return "\n".join(lines), state


# ─── entry point ──────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--now",
        help="ISO-8601 instant to treat as the report time (default: now, UTC).",
    )
    parser.add_argument(
        "--no-log", action="store_true", help="Print without touching the log."
    )
    args = parser.parse_args()

    token = os.environ.get("PLANNER_TOKEN", "").strip()
    if not token:
        print(
            "PLANNER_TOKEN is not set. Use a read-only planner token "
            "(content:read scope).",
            file=sys.stderr,
        )
        return 2

    now = parse_ts(args.now) if args.now else datetime.now(timezone.utc)
    planner = Planner(token)

    rows: list[dict] = []
    for name, workspace_id in WORKSPACES.items():
        try:
            for item in planner.list_content(workspace_id):
                item["_ws"] = name
                rows.append(item)
        except PlannerError as exc:
            print(f"warning: could not read {name}: {exc}", file=sys.stderr)
    if not rows:
        print("error: no items read from any workspace", file=sys.stderr)
        return 1

    names = load_names(planner)
    state_path = LOG_DIR / "state.json"
    previous: dict = {}
    if state_path.exists():
        try:
            previous = json.loads(state_path.read_text()).get("counts", {})
        except (json.JSONDecodeError, OSError):
            previous = {}

    report, state = render(now, rows, names, previous)
    print(report)

    if not args.no_log:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        stamp = now.astimezone().strftime("%Y-%m-%d")
        history = LOG_DIR / "history.md"
        if not history.exists():
            history.write_text("# Daily planning report log\n")
        with history.open("a") as handle:
            handle.write(f"\n---\n\n{report}")
        state_path.write_text(
            json.dumps(
                {
                    "generatedAt": now.isoformat(),
                    "windowFrom": REPORT_FROM,
                    "counts": state,
                    "itemTotal": len(rows),
                },
                indent=2,
            )
            + "\n"
        )
        print(f"\n<!-- logged to {history} and {state_path} for {stamp} -->")
    return 0


if __name__ == "__main__":
    sys.exit(main())
