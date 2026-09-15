> **已冻结的外部编排原型。** 当前主实现为 [DSH 原生插件](../../README.md)。以下原型说明仅保留历史用途；其默认两次 Codex 预算无法完成修复后复核，验证集允许为空，只读仅由提示词约束，不作为当前验收实现。

# harness-orchestrator

A small, cost-aware orchestrator for coding-agent harnesses. The MVP implements the workflow discussed for Route 1:

```text
Codex planner -> cheap/local worker -> deterministic verification -> Codex reviewer
                                                        ^                |
                                                        |---- fixer <----|
```

The orchestrator owns the **state machine and budgets**. Agents own reasoning and code changes.

## MVP goals

- Use Codex only for planning/review by default.
- Use DeepSeek Harness + local model, or Claude Code + local model, as the writer.
- Persist `plan.json`, verification results, review artifacts, raw process metadata, and patches for every run.
- Enforce `max_codex_calls` and `max_fix_rounds`.
- Refuse a dirty Git worktree by default to avoid mixing unrelated changes.
- Keep agent invocation configurable rather than hard-coding one provider stack.

## Install

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

Python 3.11+ is required. The package itself has no runtime third-party dependencies.

## Configure

Edit `configs/default.toml` for your local commands. The shipped defaults expect:

- `codex` CLI
- `dsh --profile headless`
- optionally `claude`

The default roles are:

```toml
[policy]
planner = "codex"
worker = "dsh"
reviewer = "codex"
fixer = "dsh"
max_codex_calls = 2
max_fix_rounds = 1
```

Add deterministic verification for the target repository, for example:

```toml
verify_commands = [
  ["python", "-m", "pytest", "-q"],
  ["ruff", "check", "."]
]
```

## Run

From this repository:

```bash
harness-orchestrator run \
  --workspace /path/to/target/repo \
  --config configs/default.toml \
  "Implement session persistence and add tests"
```

To use Claude Code as writer/fixer:

```bash
harness-orchestrator run \
  --workspace /path/to/target/repo \
  --config configs/claude-worker.toml \
  "Refactor the permission manager without changing public behavior"
```

Each run is stored outside the target repository by default so orchestration artifacts never dirty the worktree. On Linux/macOS the default is under `${XDG_STATE_HOME:-~/.local/state}/harness-orchestrator/runs/<run-id>` (override with `--runs-dir`).

```text
<state-dir>/harness-orchestrator/runs/<run-id>/
├── task.md
├── state.json
├── plan.json
├── plan.raw.txt
├── execution.raw.txt
├── verification.json
├── review.0.json
├── final.patch
└── *.process.json
```

## Safety model

The first version deliberately uses a **single writer**. Planner and reviewer prompts are read-only; the worker/fixer are the only roles asked to edit files. The target repository should still configure each underlying harness's own sandbox/permission policy.

The orchestrator does **not** shell-expand commands: commands are argv arrays in TOML, reducing quoting surprises and injection risk.

## Current limitations

- No automatic Git worktree creation yet; point the orchestrator at an already-isolated workspace when experimenting.
- No task complexity router yet; this MVP implements the L2 workflow directly.
- Reviewer write protection is prompt-level in v0.1; OS/worktree-level read-only enforcement is planned.
- Codex JSONL parsing extracts final agent text conservatively. Raw stdout/stderr metadata is retained for debugging.
- Cost/usage normalization across harnesses is not implemented yet.

## Next milestones

1. `WorkspaceManager`: create/remove per-run Git worktrees automatically.
2. L0/L1/L2/L3 router so simple tasks avoid Codex entirely.
3. JSON Schema validation for `plan.json` and `review.json`.
4. Usage/cost telemetry and historical worker routing.
5. Read-only reviewer workspace and artifact-only inter-agent communication.
6. Optional parallel Worker A / Critic B mode for high-risk tasks.

## References

- Claude Code supports non-interactive `claude -p`, structured JSON output, tool permission controls, and budget/turn limits.
- DeepSeek Harness exposes a one-shot `dsh --profile headless "task"` mode that prints final assistant output and exits.
- Current Codex CLI supports non-interactive `codex exec --json`; this project treats its JSONL stream as an adapter detail.
