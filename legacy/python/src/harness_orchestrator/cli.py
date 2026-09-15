from __future__ import annotations

import argparse
import json
from pathlib import Path

from .config import load_config
from .orchestrator import Orchestrator


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="harness-orchestrator")
    sub = p.add_subparsers(dest="command", required=True)
    run = sub.add_parser("run", help="run one orchestrated coding task")
    run.add_argument("task", help="task text")
    run.add_argument("--workspace", type=Path, default=Path.cwd())
    run.add_argument("--config", type=Path, default=Path("configs/default.toml"))
    run.add_argument("--runs-dir", type=Path)
    return p


def main() -> int:
    args = build_parser().parse_args()
    if args.command == "run":
        agents, policy = load_config(args.config)
        ctx = Orchestrator(agents, policy).run(args.task, args.workspace, args.runs_dir)
        print(json.dumps(ctx.snapshot(), ensure_ascii=False, indent=2))
        return 0
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
