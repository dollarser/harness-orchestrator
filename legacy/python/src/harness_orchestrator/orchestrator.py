from __future__ import annotations

import datetime as dt
import os
import uuid
from pathlib import Path

from .artifacts import parse_json_object, write_json, write_text
from .git import diff, ensure_git_repo, status_porcelain
from .models import AgentSpec, Policy, RunContext, Stage
from .process import run_agent, run_command
from .prompts import fixer_prompt, planner_prompt, reviewer_prompt, worker_prompt


class OrchestrationError(RuntimeError):
    pass


class Orchestrator:
    def __init__(self, agents: dict[str, AgentSpec], policy: Policy):
        self.agents = agents
        self.policy = policy

    def _set_state(self, ctx: RunContext, state: Stage) -> None:
        ctx.state = state
        write_json(ctx.run_dir / "state.json", ctx.snapshot())

    def _invoke(self, ctx: RunContext, name: str, prompt: str, artifact_stem: str) -> str:
        if name == "codex":
            if ctx.codex_calls >= self.policy.max_codex_calls:
                raise OrchestrationError("Codex call budget exhausted")
            ctx.codex_calls += 1
        spec = self.agents[name]
        text, raw = run_agent(spec, prompt=prompt, workspace=ctx.workspace)
        write_text(ctx.run_dir / f"{artifact_stem}.txt", text)
        write_json(ctx.run_dir / f"{artifact_stem}.process.json", raw.to_dict())
        write_json(ctx.run_dir / "state.json", ctx.snapshot())
        return text

    def _verify(self, ctx: RunContext) -> list[dict]:
        results: list[dict] = []
        for argv in self.policy.verify_commands:
            result = run_command(argv, cwd=ctx.workspace, timeout=1800)
            results.append(result.to_dict())
        write_json(ctx.run_dir / "verification.json", results)
        return results

    def run(self, task: str, workspace: Path, runs_dir: Path | None = None) -> RunContext:
        workspace = workspace.resolve()
        ensure_git_repo(workspace)
        if self.policy.require_clean_worktree and status_porcelain(workspace).strip():
            raise OrchestrationError("workspace is not clean; commit/stash changes or disable require_clean_worktree")

        default_state = Path(os.environ.get("XDG_STATE_HOME", Path.home() / ".local" / "state"))
        root = (runs_dir or default_state / "harness-orchestrator" / "runs").resolve()
        stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        run_id = f"{stamp}-{uuid.uuid4().hex[:8]}"
        ctx = RunContext(
            run_id=run_id,
            task=task,
            workspace=workspace,
            run_dir=root / run_id,
        )
        ctx.run_dir.mkdir(parents=True, exist_ok=True)
        write_text(ctx.run_dir / "task.md", task)
        write_json(ctx.run_dir / "state.json", ctx.snapshot())

        try:
            self._set_state(ctx, Stage.PLAN)
            plan_text = self._invoke(ctx, self.policy.planner, planner_prompt(task), "plan.raw")
            plan = parse_json_object(plan_text)
            write_json(ctx.run_dir / "plan.json", plan)

            self._set_state(ctx, Stage.EXECUTE)
            self._invoke(ctx, self.policy.worker, worker_prompt(task, plan), "execution.raw")
            write_text(ctx.run_dir / "diff.after-execute.patch", diff(workspace))

            while True:
                self._set_state(ctx, Stage.VERIFY)
                verification = self._verify(ctx)
                verify_ok = all(item["returncode"] == 0 for item in verification)

                self._set_state(ctx, Stage.REVIEW)
                review_text = self._invoke(
                    ctx,
                    self.policy.reviewer,
                    reviewer_prompt(task, plan, diff(workspace), verification),
                    f"review.{ctx.fix_rounds}.raw",
                )
                review = parse_json_object(review_text)
                review["verification_passed"] = verify_ok
                write_json(ctx.run_dir / f"review.{ctx.fix_rounds}.json", review)

                if verify_ok and review.get("decision") == "PASS":
                    self._set_state(ctx, Stage.DONE)
                    write_text(ctx.run_dir / "final.patch", diff(workspace))
                    return ctx

                if ctx.fix_rounds >= self.policy.max_fix_rounds:
                    raise OrchestrationError("fix round budget exhausted")

                self._set_state(ctx, Stage.FIX)
                ctx.fix_rounds += 1
                self._invoke(ctx, self.policy.fixer, fixer_prompt(task, plan, review), f"fix.{ctx.fix_rounds}.raw")
                write_text(ctx.run_dir / f"diff.after-fix.{ctx.fix_rounds}.patch", diff(workspace))

        except Exception as exc:
            self._set_state(ctx, Stage.FAILED)
            write_text(ctx.run_dir / "error.txt", f"{type(exc).__name__}: {exc}")
            raise
