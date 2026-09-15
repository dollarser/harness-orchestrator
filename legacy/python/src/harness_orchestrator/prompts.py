from __future__ import annotations

import json


def planner_prompt(task: str) -> str:
    return f"""You are the architect for a coding task. Do not modify files.
Return ONLY one JSON object with this shape:
{{
  "summary": "...",
  "risk": "low|medium|high",
  "tasks": [{{"id":"T1","description":"...","files":[],"acceptance":[]}}],
  "verification": []
}}

User task:\n{task}
"""


def worker_prompt(task: str, plan: dict) -> str:
    return f"""Implement the requested task in the current workspace.
You are the sole writer. Inspect the repository, edit files, and run focused checks when useful.
Do not merely describe changes: make them.

User task:\n{task}

Approved plan:\n{json.dumps(plan, ensure_ascii=False, indent=2)}

When finished, summarize files changed and checks performed.
"""


def reviewer_prompt(task: str, plan: dict, git_diff: str, verification: list[dict]) -> str:
    return f"""You are a read-only senior code reviewer. Do NOT modify files.
Judge correctness, architecture, regressions, missing tests, and whether acceptance criteria are met.
Return ONLY one JSON object:
{{
  "decision": "PASS|NEEDS_FIX",
  "issues": [{{"severity":"critical|high|medium|low","file":"...","line":null,"problem":"...","suggestion":"..."}}],
  "summary": "..."
}}

User task:\n{task}

Plan:\n{json.dumps(plan, ensure_ascii=False, indent=2)}

Verification results:\n{json.dumps(verification, ensure_ascii=False, indent=2)}

Current git diff:\n{git_diff[:120000]}
"""


def fixer_prompt(task: str, plan: dict, review: dict) -> str:
    return f"""Fix the current workspace according to the review findings. You are allowed to edit files.
Do not broaden scope beyond the task and review. Run focused checks after fixing.

User task:\n{task}

Plan:\n{json.dumps(plan, ensure_ascii=False, indent=2)}

Review:\n{json.dumps(review, ensure_ascii=False, indent=2)}
"""
