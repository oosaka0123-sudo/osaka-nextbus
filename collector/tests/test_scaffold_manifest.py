"""Tests for the verified-only, intentionally incomplete manifest scaffolder."""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from collector.offline_dry_run import DryRunError, load_dry_run_bundle
from collector.scaffold_manifest import ScaffoldError, scaffold


URL_1 = (
    "https://oc.bus-vision.jp/osakacitybus/view/diagram.html?"
    "lang=0&poleCd=80&stopCd=811&strLineList=71-1-1_87-1-1"
)
URL_2 = (
    "https://oc.bus-vision.jp/osakacitybus/view/diagram.html?"
    "lang=0&poleCd=81&stopCd=812&strLineList=71-1-1"
)


def entry(url: str, *, stop_cd: str, pole_cd: str, line_list: str, stop_name: str = "鶴町三丁目"):
    return {
        "stopName": stop_name,
        "directionNote": "synthetic test direction",
        "sourceUrl": url,
        "stopCd": stop_cd,
        "poleCd": pole_cd,
        "strLineList": line_list,
        "lang": "0",
        "observedAt": "2026-09-03",
        "evidenceNote": "synthetic registry fixture for offline unit tests only",
    }


class ScaffoldManifestTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.registry = self.root / "registry.json"
        self._write_registry([
            entry(URL_1, stop_cd="811", pole_cd="80", line_list="71-1-1_87-1-1")
        ])

    def tearDown(self):
        self.tmp.cleanup()

    def _write_registry(self, entries):
        self.registry.write_text(
            json.dumps({"schemaVersion": 1, "entries": entries}, ensure_ascii=False),
            encoding="utf-8",
        )

    def test_verified_url_generates_incomplete_template_without_html(self):
        output = self.root / "manifest.json"
        result = scaffold(
            output_path=output,
            registry_path=self.registry,
            source_url=URL_1,
        )
        self.assertEqual(result, output.resolve())
        document = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(document["templateState"], "incomplete")
        self.assertEqual(document["sourceUrl"], URL_1)
        self.assertEqual(document["targetStopName"], "鶴町三丁目")
        self.assertEqual(document["verifiedEvidence"]["stopCd"], "811")
        self.assertEqual(document["verifiedEvidence"]["poleCd"], "80")
        self.assertEqual(document["verifiedEvidence"]["strLineList"], "71-1-1_87-1-1")
        self.assertTrue(document["fetchedAt"].startswith("REQUIRED_"))
        self.assertTrue(document["details"][0]["url"].startswith("REQUIRED_"))
        self.assertEqual(list(self.root.glob("*.html")), [])

    def test_unique_verified_stop_name_can_select_entry(self):
        output = self.root / "by-name.json"
        scaffold(
            output_path=output,
            registry_path=self.registry,
            stop_name=" 鶴町三丁目 ",
        )
        document = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(document["sourceUrl"], URL_1)

    def test_unverified_url_fails_closed_and_creates_no_file(self):
        output = self.root / "bad.json"
        with self.assertRaises(ScaffoldError):
            scaffold(
                output_path=output,
                registry_path=self.registry,
                source_url=URL_1.replace("stopCd=811", "stopCd=999"),
            )
        self.assertFalse(output.exists())

    def test_same_stop_name_with_multiple_verified_entries_requires_url(self):
        self._write_registry([
            entry(URL_1, stop_cd="811", pole_cd="80", line_list="71-1-1_87-1-1"),
            entry(URL_2, stop_cd="812", pole_cd="81", line_list="71-1-1"),
        ])
        with self.assertRaisesRegex(ScaffoldError, "use --url"):
            scaffold(
                output_path=self.root / "ambiguous.json",
                registry_path=self.registry,
                stop_name="鶴町三丁目",
            )

    def test_existing_output_is_not_overwritten(self):
        output = self.root / "existing.json"
        output.write_text("KEEP", encoding="utf-8")
        with self.assertRaises(ScaffoldError):
            scaffold(
                output_path=output,
                registry_path=self.registry,
                source_url=URL_1,
            )
        self.assertEqual(output.read_text(encoding="utf-8"), "KEEP")

    def test_incomplete_template_is_rejected_before_any_html_read(self):
        output = self.root / "manifest.json"
        scaffold(
            output_path=output,
            registry_path=self.registry,
            source_url=URL_1,
        )
        # No referenced HTML files exist. The template-state guard must fire first.
        with self.assertRaisesRegex(DryRunError, "templateState"):
            load_dry_run_bundle(output, registry_path=self.registry)
        self.assertEqual(list(self.root.glob("*.html")), [])


if __name__ == "__main__":
    unittest.main()
