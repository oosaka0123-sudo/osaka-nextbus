import copy
import json
import unittest
from pathlib import Path

from collector.bus_vision.evidence_registry import (
    DEFAULT_REGISTRY_PATH,
    EvidenceRegistryError,
    load_evidence_registry,
    validate_registry_document,
)


def registry_document():
    return json.loads(Path(DEFAULT_REGISTRY_PATH).read_text(encoding="utf-8"))


class EvidenceRegistryTest(unittest.TestCase):
    def test_committed_registry_loads_verified_tsurumachi_and_namba(self):
        entries = load_evidence_registry()
        self.assertEqual(len(entries), 2)

        by_stop = {entry.stop_name: entry for entry in entries}
        self.assertEqual(set(by_stop), {"鶴町三丁目", "なんば"})

        tsurumachi = by_stop["鶴町三丁目"]
        self.assertEqual(tsurumachi.stop_cd, "811")
        self.assertEqual(tsurumachi.pole_cd, "80")
        self.assertEqual(tsurumachi.str_line_list, "71-1-1_87-1-1")

        namba = by_stop["なんば"]
        self.assertEqual(namba.stop_cd, "360")
        self.assertEqual(namba.pole_cd, "91")
        self.assertEqual(namba.str_line_list, "null")
        self.assertEqual(namba.lang, "0")
        self.assertIn("strLineList=null", namba.source_url)

        self.assertNotIn("809", {item.stop_cd for item in entries})

    def test_literal_null_line_list_must_match_observed_url(self):
        doc = registry_document()
        namba = next(item for item in doc["entries"] if item["stopName"] == "なんば")
        self.assertEqual(namba["strLineList"], "null")
        validated = validate_registry_document(doc)
        verified_namba = next(item for item in validated if item.stop_name == "なんば")
        self.assertEqual(verified_namba.str_line_list, "null")

    def test_declared_stop_cd_must_match_url(self):
        doc = registry_document()
        doc["entries"][0]["stopCd"] = "809"
        with self.assertRaises(EvidenceRegistryError):
            validate_registry_document(doc)

    def test_declared_pole_cd_must_match_url(self):
        doc = registry_document()
        doc["entries"][0]["poleCd"] = "999"
        with self.assertRaises(EvidenceRegistryError):
            validate_registry_document(doc)

    def test_declared_line_list_must_match_url(self):
        doc = registry_document()
        doc["entries"][0]["strLineList"] = "71-1-1"
        with self.assertRaises(EvidenceRegistryError):
            validate_registry_document(doc)

    def test_non_official_host_is_rejected(self):
        doc = registry_document()
        doc["entries"][0]["sourceUrl"] = doc["entries"][0]["sourceUrl"].replace(
            "oc.bus-vision.jp", "example.invalid"
        )
        with self.assertRaises(EvidenceRegistryError):
            validate_registry_document(doc)

    def test_wrong_path_is_rejected(self):
        doc = registry_document()
        doc["entries"][0]["sourceUrl"] = doc["entries"][0]["sourceUrl"].replace(
            "/diagram.html?", "/diagramDetail.html?"
        )
        with self.assertRaises(EvidenceRegistryError):
            validate_registry_document(doc)

    def test_duplicate_url_is_rejected(self):
        doc = registry_document()
        doc["entries"].append(copy.deepcopy(doc["entries"][0]))
        with self.assertRaises(EvidenceRegistryError):
            validate_registry_document(doc)

    def test_empty_entries_are_rejected(self):
        doc = registry_document()
        doc["entries"] = []
        with self.assertRaises(EvidenceRegistryError):
            validate_registry_document(doc)

    def test_schema_version_mismatch_is_rejected(self):
        doc = registry_document()
        doc["schemaVersion"] = 2
        with self.assertRaises(EvidenceRegistryError):
            validate_registry_document(doc)


if __name__ == "__main__":
    unittest.main()
