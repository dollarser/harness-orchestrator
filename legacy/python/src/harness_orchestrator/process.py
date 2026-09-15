from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path
from typing import Any

from .models import AgentSpec, CommandResult


class ProcessError(RuntimeError):
    pass


def render_argv(template: list[str], *, prompt: str, workspace: Path) -> list[str]:
    values = {"prompt": prompt, "workspace": str(workspace)}
    return [part.format_map(values) for part in template]


def run_command(argv: list[str], *, cwd: Path, timeout: int, env: dict[str, str] | None = None) -> CommandResult:
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)
    started = time.monotonic()
    proc = subprocess.run(
        argv,
        cwd=cwd,
        env=merged_env,
        text=True,
        capture_output=True,
        timeout=timeout,
        check=False,
    )
    return CommandResult(
        argv=argv,
        returncode=proc.returncode,
        stdout=proc.stdout,
        stderr=proc.stderr,
        duration_seconds=round(time.monotonic() - started, 3),
    )


def extract_agent_text(spec: AgentSpec, result: CommandResult) -> str:
    if result.returncode != 0:
        raise ProcessError(
            f"agent {spec.name} failed ({result.returncode})\nSTDERR:\n{result.stderr[-4000:]}"
        )
    text = result.stdout.strip()
    if spec.result_mode == "text":
        return text
    if spec.result_mode == "claude-json":
        payload = json.loads(text)
        structured = payload.get("structured_output")
        if structured is not None:
            return json.dumps(structured, ensure_ascii=False)
        return str(payload.get("result", ""))
    if spec.result_mode == "codex-jsonl":
        final_text = ""
        for line in text.splitlines():
            try:
                event: dict[str, Any] = json.loads(line)
            except json.JSONDecodeError:
                continue
            item = event.get("item") or {}
            if isinstance(item, dict) and item.get("type") == "agent_message":
                final_text = str(item.get("text", final_text))
            if event.get("type") in {"message", "assistant_message"}:
                final_text = str(event.get("text") or event.get("message") or final_text)
        return final_text or text
    raise ProcessError(f"unknown result_mode: {spec.result_mode}")


def run_agent(spec: AgentSpec, *, prompt: str, workspace: Path) -> tuple[str, CommandResult]:
    argv = render_argv(spec.command, prompt=prompt, workspace=workspace)
    result = run_command(argv, cwd=workspace, timeout=spec.timeout_seconds, env=spec.env)
    return extract_agent_text(spec, result), result
