"""
collector.run_collect のテスト。

現時点(許可待ち)では main() を呼んでも即座にエラー終了し、
ネットワークアクセスに一切到達しないことを保証する回帰テスト。
"""
import unittest
from unittest import mock

from collector import config, run_collect


class RunCollectPermissionTest(unittest.TestCase):
    def setUp(self):
        self._orig_permission = config.PERMISSION_GRANTED

    def tearDown(self):
        config.PERMISSION_GRANTED = self._orig_permission

    def test_main_exits_with_error_when_permission_not_granted(self):
        config.PERMISSION_GRANTED = False
        with mock.patch("urllib.request.urlopen") as mock_urlopen:
            exit_code = run_collect.main()
            mock_urlopen.assert_not_called()
        self.assertEqual(exit_code, 1)


if __name__ == "__main__":
    unittest.main()
