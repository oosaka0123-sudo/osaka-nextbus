"""
collector/http_client.py
---------------------------------------------------------
Bus-Vision公開HTMLへの低速・許可ゲート付きアクセスを行うクライアント。

安全設計(ユーザー仕様の「安全要件」に対応):
- config.PERMISSION_GRANTED が True でない限り、いかなるネットワークI/O
  (robots.txt の取得すら含む)も実行しない。ensure_permission() は
  ソケットを開く「前」に必ず呼び出し、Falseなら例外を送出して停止する。
- 1リクエストごとに MIN_DELAY_SEC〜MAX_DELAY_SEC のランダムなsleep
  (ジッタ)を入れる(低速アクセス)。
- 5xx・接続エラーのみ、指数バックオフで最大 MAX_RETRIES 回まで再試行する。
- 4xx応答(403/404等)は「アクセスが許可されていない/存在しない」という
  正当な応答であり、ヘッダー偽装や別経路での回避は一切行わず、
  そのまま例外として呼び出し元に伝搬し停止する(4xx時は無理に回避しない)。
"""
import random
import time
import urllib.error
import urllib.request
import urllib.robotparser

from . import config


class PermissionNotGrantedError(RuntimeError):
    """config.PERMISSION_GRANTED が False の間、これによって
    いかなるネットワークアクセスも未然に防がれる。"""


class HttpForbiddenError(RuntimeError):
    """4xx応答。回避を試みず、そのまま停止させるための例外。"""


def ensure_permission() -> None:
    if not config.PERMISSION_GRANTED:
        raise PermissionNotGrantedError(
            "config.PERMISSION_GRANTED が False です。大阪シティバスからの"
            "正式な利用許可が確認できるまで、ネットワークアクセスは一切行いません。"
        )


def check_robots_txt(base_url: str, path: str, user_agent: str = None) -> bool:
    """robots.txt を確認し、path へのアクセスが許可されているか判定する。
    許可フラグが立っていない限り、robots.txt自体も取得しない。"""
    ensure_permission()
    ua = user_agent or config.USER_AGENT
    rp = urllib.robotparser.RobotFileParser()
    rp.set_url(base_url.rstrip("/") + "/robots.txt")
    rp.read()
    return rp.can_fetch(ua, path)


def fetch(url: str) -> str:
    """低速アクセス・指数バックオフ付きでURLのHTMLを取得する。

    - リクエストのたびに、必ずジッタ付きsleepを先に入れる。
    - 4xx応答は回避を試みず HttpForbiddenError を送出して停止する。
    - 5xx応答・接続エラーのみ、最大 config.MAX_RETRIES 回まで
      指数バックオフで再試行する。
    """
    ensure_permission()

    last_error = None
    for attempt in range(config.MAX_RETRIES + 1):
        time.sleep(random.uniform(config.MIN_DELAY_SEC, config.MAX_DELAY_SEC))

        req = urllib.request.Request(url, headers={"User-Agent": config.USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=config.REQUEST_TIMEOUT_SEC) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            if 400 <= e.code < 500:
                raise HttpForbiddenError(
                    f"{url} が HTTP {e.code} を返しました。回避せず停止します。"
                ) from e
            last_error = e
        except urllib.error.URLError as e:
            last_error = e

        if attempt < config.MAX_RETRIES:
            time.sleep(config.BACKOFF_BASE_SEC * (2**attempt))

    raise RuntimeError(f"{url} の取得に{config.MAX_RETRIES + 1}回失敗しました: {last_error}")
