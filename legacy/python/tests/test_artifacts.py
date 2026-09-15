import unittest

from harness_orchestrator.artifacts import parse_json_object


class ParseJsonTests(unittest.TestCase):
    def test_plain(self):
        self.assertEqual(parse_json_object('{"a":1}'), {"a": 1})

    def test_fenced(self):
        self.assertEqual(parse_json_object('text\n```json\n{"a":2}\n```'), {"a": 2})


if __name__ == "__main__":
    unittest.main()
