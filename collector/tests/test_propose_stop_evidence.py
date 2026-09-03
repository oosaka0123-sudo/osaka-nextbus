"""Tests for offline, non-promoting stop evidence proposal intake."""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from collector.propose_stop_evidence import (
    EvidenceProposalError,
    build_proposal,
    propose,
)


EXISTING_URL = (
    "https://oc.bus-vision.jp/osakacitybus/view/diagram.html?"
    "lang=0&poleCd=80&stopCd=811&strLineList=71-1-1_87-1-1"
)
CANDIDATE_URL = (
    "https://oc.bus-vision.jp/osakacitybus/view/diagram.html?"
    "lang=0&poleCd=22&stopCd=777&strLineList=55-1-1_90-1-1"
)


class EvidenceProposalTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.registry = self.root / "registry.json"
        self.registry_document = {
            "schemaVersion": 1,
            "entries": [
                {
                    "stopName": "鶴町三丁目",
                    "directionNote": "市内向き",
                    "sourceUrl": EXISTING_URL,
                    "stopCd": "811",
                    "poleCd": "80",
                    "strLineList": "71-1-1_87-1-1",
                    "lang": "0",
                    "observedAt": "2026-09-03",
                    "evidenceNote": "synthetic copy of committed verified entry",
                }
            ],
        }
        self.registry.write_text(
            json.dumps(self.registry_document, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def tearDown(self):
        self.tmp.cleanup()

    def _build(self, **overrides):
        kwargs = {
            "source_url": CANDIDATE_URL,
            "stop_name": "候補停留所",
            "direction_note": "候補方向 — human confirmation required",
            "observed_at": "2026-09-03",
            "evidence_note": "URL bar copied from a normal public screen; semantic match not yet confirmed",
            "registry_path": self.registry,
        }
        kwargs.update(overrides)
        return build_proposal(**kwargs)

    def test_valid_url_extracts_ids_but_remains_explicitly_unverified(self):
        document = self._build()
        self.assertEqual(document["proposalState"], "unverified")
        self.assertIs(document["requiresHumanConfirmation"], True)
        self.assertEqual(document["stopCd"], "777")
        self.assertEqual(document["poleCd"], "22")
        self.assertEqual(document["strLineList"], "55-1-1_90-1-1")
        self.assertEqual(document["lang"], "0")
        self.assertIn("NOT been verified", document["verificationBoundary"])
        self.assertIn("same normal public", document["nextAction"])
        self.assertNotEqual(document["proposalState"], "verified")

    def test_building_proposal_does_not_mutate_registry(self):
        before = self.registry.read_text(encoding="utf-8")
        self._build()
        after = self.registry.read_text(encoding="utf-8")
        self.assertEqual(after, before)

    def test_existing_verified_url_is_rejected_as_duplicate(self):
        with self.assertRaisesRegex(EvidenceProposalError, "already in Verified"):
            self._build(source_url=EXISTING_URL)

    def test_existing_verified_identity_is_rejected_even_if_query_order_or_extra_value_differs(self):
        same_identity = (
            "https://oc.bus-vision.jp/osakacitybus/view/diagram.html?"
            "poleCd=80&stopCd=811&strLineList=71-1-1_87-1-1&lang=0&extra=test"
        )
        with self.assertRaisesRegex(EvidenceProposalError, "identity is already"):
            self._build(source_url=same_identity)

    def test_non_official_host_is_rejected(self):
        with self.assertRaises(EvidenceProposalError):
            self._build(source_url=CANDIDATE_URL.replace("oc.bus-vision.jp", "example.invalid"))

    def test_wrong_path_is_rejected(self):
        with self.assertRaises(EvidenceProposalError):
            self._build(source_url=CANDIDATE_URL.replace("/diagram.html?", "/diagramDetail.html?"))

    def test_missing_identifier_is_rejected(self):
        bad = CANDIDATE_URL.replace("&poleCd=22", "")
        with self.assertRaisesRegex(EvidenceProposalError, "must contain"):
            self._build(source_url=bad)

    def test_empty_free_text_is_rejected(self):
        with self.assertRaises(EvidenceProposalError):
            self._build(stop_name="   ")

    def test_invalid_observed_date_is_rejected(self):
        with self.assertRaisesRegex(EvidenceProposalError, "YYYY-MM-DD"):
            self._build(observed_at="2026/09/03")

    def test_existing_output_is_not_overwritten(self):
        output = self.root / "proposal.json"
        output.write_text("KEEP", encoding="utf-8")
        with self.assertRaises(EvidenceProposalError):
            propose(
                source_url=CANDIDATE_URL,
                stop_name="候補停留所",
                direction_note="候補方向",
                observed_at="2026-09-03",
                evidence_note="test evidence note",
                output_path=output,
                registry_path=self.registry,
            )
        self.assertEqual(output.read_text(encoding="utf-8"), "KEEP")


if __name__ == "__main__":
    unittest.main()
