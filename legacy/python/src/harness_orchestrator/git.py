from __future__ import annotations

from pathlib import Path

from .process import run_command


def ensure_git_repo(workspace: Path) -> None:
    result = run_command(["git", "rev-parse", "--is-inside-work-tree"], cwd=workspace, timeout=30)
    if result.returncode != 0 or result.stdout.strip() != "true":
        raise RuntimeError(f"not a git worktree: {workspace}")


def status_porcelain(workspace: Path) -> str:
    return run_command(["git", "status", "--porcelain=v1"], cwd=workspace, timeout=30).stdout


def diff(workspace: Path) -> str:
    tracked = run_command(["git", "diff", "--no-ext-diff"], cwd=workspace, timeout=60).stdout
    staged = run_command(["git", "diff", "--cached", "--no-ext-diff"], cwd=workspace, timeout=60).stdout
    return "\n".join(part for part in (tracked, staged) if part.strip())
