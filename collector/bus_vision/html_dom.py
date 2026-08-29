"""
collector/bus_vision/html_dom.py
---------------------------------------------------------
依存パッケージを増やさない方針(本リポジトリの他のスクリプト群と同じ)
のため、標準ライブラリの html.parser だけで組み立てた、最小限のHTML
木構造パーサー。BeautifulSoupの find_all / get_text 相当のごく一部だけを
実装した軽量版。

このモジュール自体はBus-Vision固有の知識を一切含まない、汎用的な
HTMLパースユーティリティ。
"""
from html.parser import HTMLParser

_VOID_TAGS = {
    "br", "img", "input", "hr", "meta", "link",
    "col", "area", "base", "embed", "source", "track", "wbr",
}


class Element:
    __slots__ = ("tag", "attrs", "children", "parent")

    def __init__(self, tag, attrs, parent=None):
        self.tag = tag
        self.attrs = dict(attrs)
        self.children = []  # list[Element | str]
        self.parent = parent

    def _classes(self):
        return (self.attrs.get("class") or "").split()

    def matches(self, tag=None, class_=None, id_=None, attrs=None) -> bool:
        if tag is not None and self.tag != tag:
            return False
        if class_ is not None and class_ not in self._classes():
            return False
        if id_ is not None and self.attrs.get("id") != id_:
            return False
        if attrs:
            for k, v in attrs.items():
                if self.attrs.get(k) != v:
                    return False
        return True

    def find_all(self, tag=None, class_=None, id_=None, attrs=None):
        """自分の子孫(自分自身は含まない)から、条件に一致する要素を
        出現順にすべて返す。"""
        results = []
        for child in self.children:
            if isinstance(child, str):
                continue
            if child.matches(tag=tag, class_=class_, id_=id_, attrs=attrs):
                results.append(child)
            results.extend(child.find_all(tag=tag, class_=class_, id_=id_, attrs=attrs))
        return results

    def find(self, tag=None, class_=None, id_=None, attrs=None):
        found = self.find_all(tag=tag, class_=class_, id_=id_, attrs=attrs)
        return found[0] if found else None

    def get_text(self, separator: str = "", strip: bool = False) -> str:
        parts = []
        for child in self.children:
            if isinstance(child, str):
                parts.append(child)
            else:
                parts.append(child.get_text(separator=separator, strip=False))
        text = separator.join(parts)
        return text.strip() if strip else text


class _TreeBuilder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Element("[document]", {})
        self._stack = [self.root]

    def handle_starttag(self, tag, attrs):
        el = Element(tag, attrs, parent=self._stack[-1])
        self._stack[-1].children.append(el)
        if tag not in _VOID_TAGS:
            self._stack.append(el)

    def handle_startendtag(self, tag, attrs):
        el = Element(tag, attrs, parent=self._stack[-1])
        self._stack[-1].children.append(el)

    def handle_endtag(self, tag):
        # 開始タグと対応しない閉じタグ(壊れたHTML)が来ても例外にはせず、
        # 直近で同名の開始タグまで遡って閉じるだけにとどめる。
        for i in range(len(self._stack) - 1, 0, -1):
            if self._stack[i].tag == tag:
                del self._stack[i:]
                break

    def handle_data(self, data):
        if data:
            self._stack[-1].children.append(data)


def parse_html(html: str) -> Element:
    """HTML文字列を解析し、ルート要素([document])を返す。"""
    builder = _TreeBuilder()
    builder.feed(html)
    return builder.root
