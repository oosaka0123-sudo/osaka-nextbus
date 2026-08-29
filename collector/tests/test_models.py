"""
collector.models.DepartureRecord のテスト。
ネットワークアクセスなし。合成したテスト値のみを使用する
(実際のBus-Visionのデータは一切含まない)。
"""
import unittest

from collector.models import DepartureRecord

_BASE = dict(
    stop_name="テスト停留所1",
    departure_time="06:00",
    line_no="27号",
    headsign="なんば行",
    direction="なんば方面",
    service="1",
    source_url="https://example.invalid/x",
    fetched_at="2026-08-29T09:00:00+09:00",
)


class DepartureRecordTest(unittest.TestCase):
    def test_valid_record_has_no_errors(self):
        r = DepartureRecord(**_BASE)
        self.assertEqual(r.validate(), [])

    def test_empty_field_is_reported(self):
        r = DepartureRecord(**{**_BASE, "stop_name": ""})
        errors = r.validate()
        self.assertTrue(any("stop_name" in e for e in errors))

    def test_bad_time_format_is_reported(self):
        r = DepartureRecord(**{**_BASE, "departure_time": "6時"})
        errors = r.validate()
        self.assertTrue(any("departure_time" in e for e in errors))

    def test_midnight_crossing_time_is_valid(self):
        r = DepartureRecord(**{**_BASE, "departure_time": "24:10"})
        self.assertEqual(r.validate(), [])

    def test_multiple_empty_fields_are_all_reported(self):
        r = DepartureRecord(**{**_BASE, "headsign": "", "direction": ""})
        errors = r.validate()
        self.assertEqual(len(errors), 2)


if __name__ == "__main__":
    unittest.main()
