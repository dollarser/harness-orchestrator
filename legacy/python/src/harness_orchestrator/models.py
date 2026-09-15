from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import StrEnum
from pathlib import Path
from typing import Any


class Stage(StrEnum):
    CLASSIFY = "classify"
    PLAN = "plan"
    EXECUTE = "execute"
    VERIFY = "verify"
    REVIEW = "review"
    FIX = "fix"
    DONE = "done"
    FAILED = "failed"


@dataclass(slots=True)
class CommandResult:
    argv: list[str]
    returncode: int
    stdout: str
    stderr: str
    duration_seconds: float

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class AgentSpec:
    name: str
    command: list[str]
    timeout_seconds: int = 1800
    env: dict[str, str] = field(default_factory=dict)
    result_mode: str = "text"  # text | claude-json | codex-jsonl


@dataclass(slots=True)
class Policy:
    max_codex_calls: int = 2
    max_fix_rounds: int = 2
    require_clean_worktree: bool = True
    reviewer_write: bool = False
    planner: str = "codex"
    worker: str = "dsh"
    reviewer: str = "codex"
    fixer: str = "dsh"
    verify_commands: list[list[str]] = field(default_factory=list)


@dataclass(slots=True)
class RunContext:
    run_id: str
    task: str
    workspace: Path
    run_dir: Path
    state: Stage = Stage.CLASSIFY
    codex_calls: int = 0
    fix_rounds: int = 0

    def snapshot(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "task": self.task,
            "workspace": str(self.workspace),
            "run_dir": str(self.run_dir),
            "state": self.state.value,
            "codex_calls": self.codex_calls,
            "fix_rounds": self.fix_rounds,
        }
