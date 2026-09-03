"""停留所時刻表→便詳細→対象停留所RecordのオフラインE2E。

実サイトHTMLは保存しない。DOM/class名はテスト専用の合成値。
基本E2Eは合成ID/時刻を使い、末尾のPublicEvidenceRegressionTestだけは
公開検索でOBSERVED済みのURL・時刻を証拠アンカーとして使う。
Production selectorを表すものではない。
"""
import unittest

from collector.bus_vision.parser import ParseError
from collector.bus_vision.pipeline import assemble_target_departures
from collector.bus_vision.selectors import StopTimetableSelectorConfig, TripDetailSelectorConfig


STOP_URL = (
    "https://oc.bus-vision.jp/osakacitybus/view/diagram.html?"
    "lang=0&poleCd=999&stopCd=999&strLineList=71-1-1"
)
DETAIL_1 = (
    "https://oc.bus-vision.jp/osakacitybus/view/diagramDetail.html?"
    "corpCd=1&dateDivCd=11&diaCd=synthetic-1001&lang=0&lineCd=71&"
    "routeCd=7100&timetableDateDivCd=-1&updownCd=1"
)
DETAIL_2 = (
    "https://oc.bus-vision.jp/osakacitybus/view/diagramDetail.html?"
    "corpCd=1&dateDivCd=11&diaCd=synthetic-1002&lang=0&lineCd=71&"
    "routeCd=7100&timetableDateDivCd=-1&updownCd=1"
)

STOP_HTML = """
<html><body>
  <div class="departure">
    <span class="time">06:10</span>
    <a class="detail" href="diagramDetail.html?corpCd=1&amp;dateDivCd=11&amp;diaCd=synthetic-1001&amp;lang=0&amp;lineCd=71&amp;routeCd=7100&amp;timetableDateDivCd=-1&amp;updownCd=1">便1</a>
  </div>
  <div class="departure">
    <span class="time">07:25</span>
    <a class="detail" href="diagramDetail.html?corpCd=1&amp;dateDivCd=11&amp;diaCd=synthetic-1002&amp;lang=0&amp;lineCd=71&amp;routeCd=7100&amp;timetableDateDivCd=-1&amp;updownCd=1">便2</a>
  </div>
</body></html>
"""

DETAIL_HTML_1 = """
<html><body>
  <span class="line-no">71</span><span class="destination">なんば行き</span>
  <div class="trip-stop"><span class="time">06:07</span><span class="stop">鶴町二丁目</span></div>
  <div class="trip-stop"><span class="time">06:10</span><span class="stop">鶴町一丁目</span></div>
  <div class="trip-stop"><span class="time">06:12</span><span class="stop">昌運橋</span></div>
</body></html>
"""
DETAIL_HTML_2 = """
<html><body>
  <span class="line-no">71</span><span class="destination">なんば行き</span>
  <div class="trip-stop"><span class="time">07:22</span><span class="stop">鶴町二丁目</span></div>
  <div class="trip-stop"><span class="time">07:25</span><span class="stop">鶴町一丁目</span></div>
  <div class="trip-stop"><span class="time">07:27</span><span class="stop">昌運橋</span></div>
</body></html>
"""

STOP_SELECTORS = StopTimetableSelectorConfig(
    departure_item=("div", "departure"),
    time_cell=("span", "time"),
    detail_link=("a", "detail"),
)
TRIP_SELECTORS = TripDetailSelectorConfig(
    stop_row=("div", "trip-stop"),
    stop_name=("span", "stop"),
    time_cell=("span", "time"),
    line_no=("span", "line-no"),
    destination=("span", "destination"),
)
DETAIL_MAP = {DETAIL_1: DETAIL_HTML_1, DETAIL_2: DETAIL_HTML_2}


class OfflinePipelineTest(unittest.TestCase):
    def assemble(self, *, stop_html=STOP_HTML, detail_map=DETAIL_MAP, trip_selectors=TRIP_SELECTORS):
        return assemble_target_departures(
            stop_html,
            stop_selector_config=STOP_SELECTORS,
            stop_source_url=STOP_URL,
            detail_html_by_url=detail_map,
            trip_selector_config=trip_selectors,
            target_stop_name="鶴町一丁目",
            fetched_at="2026-09-03T12:00:00+09:00",
            direction_hint="なんば方面",
        )

    def test_two_departures_are_assembled_end_to_end(self):
        records = self.assemble()
        self.assertEqual([r.departure_time for r in records], ["06:10", "07:25"])
        self.assertEqual([r.line_no for r in records], ["71", "71"])
        self.assertEqual([r.headsign for r in records], ["なんば行き", "なんば行き"])
        self.assertEqual([r.service for r in records], ["11", "11"])
        self.assertTrue(all(r.stop_name == "鶴町一丁目" for r in records))
        self.assertTrue(all(r.direction == "なんば方面" for r in records))
        self.assertEqual([r.source_url for r in records], [DETAIL_1, DETAIL_2])

    def test_missing_saved_detail_html_fails_closed(self):
        with self.assertRaises(ParseError):
            self.assemble(detail_map={DETAIL_1: DETAIL_HTML_1})

    def test_target_stop_missing_from_one_detail_fails_closed(self):
        broken = DETAIL_HTML_2.replace("鶴町一丁目", "別の停留所")
        with self.assertRaises(ParseError):
            self.assemble(detail_map={DETAIL_1: DETAIL_HTML_1, DETAIL_2: broken})

    def test_duplicate_target_stop_in_detail_fails_closed(self):
        duplicated = DETAIL_HTML_1.replace(
            "</body>",
            '<div class="trip-stop"><span class="time">06:10</span><span class="stop">鶴町一丁目</span></div></body>',
        )
        with self.assertRaises(ParseError):
            self.assemble(detail_map={DETAIL_1: duplicated, DETAIL_2: DETAIL_HTML_2})

    def test_stop_page_and_detail_time_mismatch_fails_closed(self):
        broken_stop = STOP_HTML.replace(">06:10<", ">06:11<")
        with self.assertRaises(ParseError):
            self.assemble(stop_html=broken_stop)

    def test_missing_date_div_is_not_guessed(self):
        detail_without_date = DETAIL_1.replace("dateDivCd=11&", "")
        stop_html = STOP_HTML.replace(DETAIL_1.split("/view/")[1].replace("&", "&amp;"), detail_without_date.split("/view/")[1].replace("&", "&amp;"))
        detail_map = {detail_without_date: DETAIL_HTML_1, DETAIL_2: DETAIL_HTML_2}
        with self.assertRaises(ParseError):
            self.assemble(stop_html=stop_html, detail_map=detail_map)

    def test_empty_target_stop_name_is_rejected(self):
        with self.assertRaises(ParseError):
            assemble_target_departures(
                STOP_HTML,
                stop_selector_config=STOP_SELECTORS,
                stop_source_url=STOP_URL,
                detail_html_by_url=DETAIL_MAP,
                trip_selector_config=TRIP_SELECTORS,
                target_stop_name="",
                fetched_at="2026-09-03T12:00:00+09:00",
            )


# Public Bus-Vision evidence observed via normal public search/index on 2026-09-03.
# Only URL identifiers + timetable semantics are retained here; live HTML/DOM is NOT copied.
PUBLIC_STOP_URL = (
    "https://oc.bus-vision.jp/osakacitybus/view/diagram.html?"
    "lang=0&poleCd=80&stopCd=811&strLineList=71-1-1_87-1-1"
)
PUBLIC_87_DETAIL_URL = (
    "https://oc.bus-vision.jp/osakacitybus/view/diagramDetail.html?"
    "corpCd=1&dateDivCd=11&diaCd=5047&lang=0&lineCd=87&"
    "opeYmd=20260304&revYmd=20260301&routeCd=8700&"
    "timetableDateDivCd=-1&updownCd=1"
)
PUBLIC_EVIDENCE_STOP_HTML = """
<html><body>
  <div class="departure">
    <span class="time">07:35</span>
    <a class="detail" href="diagramDetail.html?corpCd=1&amp;dateDivCd=11&amp;diaCd=5047&amp;lang=0&amp;lineCd=87&amp;opeYmd=20260304&amp;revYmd=20260301&amp;routeCd=8700&amp;timetableDateDivCd=-1&amp;updownCd=1">87 新千歳経由</a>
  </div>
</body></html>
"""
PUBLIC_EVIDENCE_DETAIL_HTML = """
<html><body>
  <span class="line-no">87</span><span class="destination">なんば行き</span>
  <div class="trip-stop"><span class="time">07:34</span><span class="stop">鶴町四丁目</span></div>
  <div class="trip-stop"><span class="time">07:35</span><span class="stop">鶴町三丁目</span></div>
  <div class="trip-stop"><span class="time">07:36</span><span class="stop">鶴町南公園</span></div>
  <div class="trip-stop"><span class="time">07:43</span><span class="stop">新千歳</span></div>
  <div class="trip-stop"><span class="time">08:08</span><span class="stop">なんば</span></div>
</body></html>
"""


class PublicEvidenceRegressionTest(unittest.TestCase):
    def assemble(self, stop_html=PUBLIC_EVIDENCE_STOP_HTML):
        return assemble_target_departures(
            stop_html,
            stop_selector_config=STOP_SELECTORS,
            stop_source_url=PUBLIC_STOP_URL,
            detail_html_by_url={PUBLIC_87_DETAIL_URL: PUBLIC_EVIDENCE_DETAIL_HTML},
            trip_selector_config=TRIP_SELECTORS,
            target_stop_name="鶴町三丁目",
            fetched_at="2026-09-03T12:21:00+09:00",
            direction_hint="なんば方面",
        )

    def test_observed_87_trip_joins_at_tsurumachi_sanchome_0735(self):
        records = self.assemble()
        self.assertEqual(len(records), 1)
        record = records[0]
        self.assertEqual(record.stop_name, "鶴町三丁目")
        self.assertEqual(record.departure_time, "07:35")
        self.assertEqual(record.line_no, "87")
        self.assertEqual(record.headsign, "なんば行き")
        self.assertEqual(record.service, "11")
        self.assertEqual(record.source_url, PUBLIC_87_DETAIL_URL)

    def test_observed_join_still_fails_closed_if_stop_time_drifts(self):
        with self.assertRaises(ParseError):
            self.assemble(PUBLIC_EVIDENCE_STOP_HTML.replace(">07:35<", ">07:36<"))


if __name__ == "__main__":
    unittest.main()
