"""
collector.http_client のテスト。

最重要: config.PERMISSION_GRANTED が False の間は、いかなる方法でも
実際のネットワークI/O(urllib.request.urlopen / robotparserのread)が
呼び出されないことを、モックで検証する。
本テストファイルは絶対に実ネットワークへアクセスしない。
"""
import unittest
from unittest import mock

from collector import config, http_client


class PermissionGuardTest(unittest.TestCase):
    def setUp(self):
        self._orig_permission = config.PERMISSION_GRANTED
        self._sleep_patcher = mock.patch("time.sleep")  # テストを高速化する(実際の待機は行わない)
        self._sleep_patcher.start()

    def tearDown(self):
        config.PERMISSION_GRANTED = self._orig_permission
        self._sleep_patcher.stop()

    def test_fetch_refuses_without_touching_network_when_permission_false(self):
        config.PERMISSION_GRANTED = False
        with mock.patch("urllib.request.urlopen") as mock_urlopen:
            with self.assertRaises(http_client.PermissionNotGrantedError):
                http_client.fetch("https://example.invalid/should-not-be-called")
            mock_urlopen.assert_not_called()

    def test_check_robots_txt_refuses_without_touching_network_when_permission_false(self):
        config.PERMISSION_GRANTED = False
        with mock.patch("urllib.robotparser.RobotFileParser.read") as mock_read:
            with self.assertRaises(http_client.PermissionNotGrantedError):
                http_client.check_robots_txt("https://example.invalid", "/diagramDetail.html")
            mock_read.assert_not_called()

    def test_fetch_only_calls_urlopen_when_permission_true(self):
        # permission=Trueの場合に限り、ゲートを通過して(モック化された)
        # urlopenまで到達することを確認する。ここでも urlopen 自体は
        # モックなので実際のネットワークへは一切アクセスしない。
        config.PERMISSION_GRANTED = True
        cm = mock.MagicMock()
        cm.__enter__.return_value.read.return_value = b"<html>dummy</html>"
        with mock.patch("urllib.request.urlopen", return_value=cm) as mock_urlopen:
            result = http_client.fetch("https://example.invalid/x")
            mock_urlopen.assert_called_once()
            self.assertEqual(result, "<html>dummy</html>")

    def test_4xx_response_is_not_retried_or_bypassed(self):
        import urllib.error

        config.PERMISSION_GRANTED = True
        err = urllib.error.HTTPError(
            "https://example.invalid/x", 404, "Not Found", hdrs=None, fp=None
        )
        with mock.patch("urllib.request.urlopen", side_effect=err) as mock_urlopen:
            with self.assertRaises(http_client.HttpForbiddenError):
                http_client.fetch("https://example.invalid/x")
            # 4xxは再試行しない(1回だけ呼ばれて即座に停止する)
            mock_urlopen.assert_called_once()


if __name__ == "__main__":
    unittest.main()
