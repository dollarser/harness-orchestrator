import unittest
from pathlib import Path

from harness_orchestrator.process import render_argv


class RenderTests(unittest.TestCase):
    def test_render(self):
        out = render_argv(["x", "{workspace}", "{prompt}"], prompt="hello", workspace=Path("/tmp/repo"))
        self.assertEqual(out, ["x", "/tmp/repo", "hello"])


if __name__ == "__main__":
    unittest.main()
