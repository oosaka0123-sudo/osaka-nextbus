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
    def test_committed_registry_loads_verified_targets(self):
        entries = load_evidence_registry()
        self.assertEqual(len(entries), 8)

        tsurumachi3 = next(item for item in entries if item.stop_name == "鶴町三丁目")
        self.assertEqual(tsurumachi3.stop_cd, "811")
        self.assertEqual(tsurumachi3.pole_cd, "80")
        self.assertEqual(tsurumachi3.str_line_list, "71-1-1_87-1-1")

        namba = next(item for item in entries if item.stop_name == "なんば")
        self.assertEqual(namba.stop_cd, "360")
        self.assertEqual(namba.pole_cd, "91")
        self.assertEqual(namba.str_line_list, "null")
        self.assertEqual(namba.lang, "0")
        self.assertIn("strLineList=null", namba.source_url)

        tsurumachi1 = [item for item in entries if item.stop_name == "鶴町一丁目"]
        self.assertEqual(len(tsurumachi1), 2)
        by_pole = {item.pole_cd: item for item in tsurumachi1}
        self.assertEqual(set(by_pole), {"60", "70"})
        self.assertEqual(by_pole["60"].stop_cd, "809")
        self.assertEqual(by_pole["60"].str_line_list, "71-1-1")
        self.assertEqual(by_pole["70"].stop_cd, "809")
        self.assertEqual(by_pole["70"].str_line_list, "null")
        self.assertIn("strLineList=null", by_pole["70"].source_url)

        sangenya = [item for item in entries if item.stop_name == "三軒家"]
        self.assertEqual(len(sangenya), 2)
        by_pole = {item.pole_cd: item for item in sangenya}
        self.assertEqual(set(by_pole), {"80", "90"})
        self.assertEqual(by_pole["90"].stop_cd, "796")
        self.assertEqual(by_pole["90"].str_line_list, "71-1-1")
        self.assertEqual(by_pole["80"].stop_cd, "796")
        self.assertEqual(by_pole["80"].str_line_list, "71-2-1")

        taishobashi = [item for item in entries if item.stop_name == "\u5927\u6b63\u6a4b"]
        self.assertEqual(len(taishobashi), 2)
        by_pole = {item.pole_cd: item for item in taishobashi}
        self.assertEqual(set(by_pole), {"31", "41"})
        self.assertEqual(by_pole["41"].stop_cd, "820")
        self.assertEqual(by_pole["41"].str_line_list, "71-1-1")
        self.assertEqual(by_pole["31"].stop_cd, "820")
        self.assertEqual(by_pole["31"].str_line_list, "71-2-1")

    def test_literal_null_line_lists_match_observed_urls(self):
        doc = registry_document()
        literal_null_entries = [item for item in doc["entries"] if item["strLineList"] == "null"]
        self.assertEqual({item["stopName"] for item in literal_null_entries}, {"なんば", "鶴町一丁目"})
        validated = validate_registry_document(doc)
        verified_nulls = [item for item in validated if item.str_line_list == "null"]
        self.assertEqual({item.stop_name for item in verified_nulls}, {"なんば", "鶴町一丁目"})

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
