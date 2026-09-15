from __future__ import annotations

import tomllib
from pathlib import Path

from .models import AgentSpec, Policy


class ConfigError(ValueError):
    pass


def load_config(path: Path) -> tuple[dict[str, AgentSpec], Policy]:
    with path.open("rb") as f:
        raw = tomllib.load(f)

    agents: dict[str, AgentSpec] = {}
    for name, cfg in raw.get("agents", {}).items():
        command = cfg.get("command")
        if not isinstance(command, list) or not command:
            raise ConfigError(f"agents.{name}.command must be a non-empty array")
        agents[name] = AgentSpec(
            name=name,
            command=[str(x) for x in command],
            timeout_seconds=int(cfg.get("timeout_seconds", 1800)),
            env={str(k): str(v) for k, v in cfg.get("env", {}).items()},
            result_mode=str(cfg.get("result_mode", "text")),
        )

    p = raw.get("policy", {})
    policy = Policy(
        max_codex_calls=int(p.get("max_codex_calls", 2)),
        max_fix_rounds=int(p.get("max_fix_rounds", 2)),
        require_clean_worktree=bool(p.get("require_clean_worktree", True)),
        reviewer_write=bool(p.get("reviewer_write", False)),
        planner=str(p.get("planner", "codex")),
        worker=str(p.get("worker", "dsh")),
        reviewer=str(p.get("reviewer", "codex")),
        fixer=str(p.get("fixer", "dsh")),
        verify_commands=[[str(x) for x in cmd] for cmd in p.get("verify_commands", [])],
    )

    for role in (policy.planner, policy.worker, policy.reviewer, policy.fixer):
        if role not in agents:
            raise ConfigError(f"policy references missing agent: {role}")
    return agents, policy
