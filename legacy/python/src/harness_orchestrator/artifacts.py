from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


_JSON_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL | re.IGNORECASE)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.rstrip() + "\n", encoding="utf-8")


def parse_json_object(text: str) -> dict[str, Any]:
    candidates = [text.strip()]
    candidates.extend(m.group(1).strip() for m in _JSON_FENCE.finditer(text))
    left, right = text.find("{"), text.rfind("}")
    if left >= 0 and right > left:
        candidates.append(text[left : right + 1])
    for candidate in candidates:
        try:
            value = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            return value
    raise ValueError("agent output did not contain a JSON object")
