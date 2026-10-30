import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import easygantt as eg
import easygantt_engine as engine

MINIMAL_TEMPLATE = (
    '<!doctype html><html><head><meta charset="UTF-8">'
    "<title>test</title></head><body></body></html>"
)


def esempio():
    return {
        "meta": {
            "creationDate": "2026-09-01",
            "workingDays": [False, True, True, True, True, True, False],
            "durationUnit": "days",
        },
        "setResources": [{"name": "DESIGNER", "holidays": []}],
        "data": [
            {
                "name": "P",
                "delivery": "2026-12-11",
                "penalty": 2,
                "phases": [
                    {
                        "name": "A",
                        "duration": 10,
                        "uncertainty": 2,
                        "start": 0,
                        "resources": [{"name": "DESIGNER", "employed": 100}],
                    },
                    {
                        "name": "B",
                        "duration": 5,
                        "uncertainty": 0,
                        "start": 1,
                        "resources": [{"name": "DESIGNER", "employed": 50}],
                    },
                ],
            }
        ],
    }


class NormalizeTests(unittest.TestCase):
    def test_valid_document_is_kept(self):
        state = eg.normalize_state(esempio())
        self.assertIsNotNone(state)
        self.assertEqual(state["meta"]["creationDate"], "2026-09-01")
        self.assertEqual(state["data"][0]["name"], "P")
        self.assertEqual(state["data"][0]["phases"][0]["name"], "A")
        self.assertIs(state["data"][0]["phases"][0]["finished"], False)

    def test_clamps_out_of_range_values(self):
        raw = esempio()
        raw["data"][0]["penalty"] = 99
        raw["data"][0]["phases"][0]["duration"] = 0
        raw["data"][0]["phases"][0]["uncertainty"] = -5
        raw["data"][0]["phases"][0]["resources"][0]["employed"] = 0
        state = eg.normalize_state(raw)
        self.assertEqual(state["data"][0]["penalty"], 10)
        self.assertEqual(state["data"][0]["phases"][0]["duration"], 1)
        self.assertEqual(state["data"][0]["phases"][0]["uncertainty"], 0)
        self.assertEqual(
            state["data"][0]["phases"][0]["resources"][0]["employed"], 1
        )

    def test_first_phase_start_is_zero(self):
        self.assertEqual(eg.limita_start(9, 0), 0)
        self.assertEqual(eg.limita_start(-9, 0), 0)

    def test_start_range(self):
        self.assertEqual(eg.limita_start(9, 1), 1)
        self.assertEqual(eg.limita_start(-9, 1), 0)
        self.assertEqual(eg.limita_start(-9, 3), -2)
        self.assertEqual(eg.limita_start(-1, 3), -1)
        self.assertEqual(eg.limita_start(0, 3), 0)
        self.assertEqual(eg.limita_start(1, 3), 1)

    def test_working_days_defaults(self):
        self.assertEqual(
            eg.normalizza_giorni_lavorativi([]), eg.DEFAULT_WORKING_DAYS
        )
        self.assertEqual(
            eg.normalizza_giorni_lavorativi([False] * 7), eg.DEFAULT_WORKING_DAYS
        )
        self.assertEqual(eg.normalizza_giorni_lavorativi([True] * 7), [True] * 7)

    def test_legacy_work_weekend(self):
        raw = esempio()
        del raw["meta"]["workingDays"]
        raw["meta"]["workWeekend"] = True
        state = eg.normalize_state(raw)
        self.assertEqual(state["meta"]["workingDays"], [True] * 7)

    def test_missing_resource_is_added(self):
        raw = esempio()
        raw["setResources"] = []
        state = eg.normalize_state(raw)
        self.assertEqual(
            [resource["name"] for resource in state["setResources"]],
            ["DESIGNER"],
        )
        self.assertEqual(state["setResources"][0]["holidays"], [])

    def test_project_without_phases_is_dropped(self):
        raw = esempio()
        raw["data"].append(
            {"name": "X", "delivery": "2026-01-01", "penalty": 0, "phases": []}
        )
        state = eg.normalize_state(raw)
        self.assertEqual([project["name"] for project in state["data"]], ["P"])

    def test_invalid_creation_date_is_rejected(self):
        raw = esempio()
        raw["meta"]["creationDate"] = "2026-13-01"
        self.assertIsNone(eg.normalize_state(raw))

    def test_hours_limits(self):
        raw = esempio()
        raw["meta"]["durationUnit"] = "hours"
        raw["data"][0]["phases"][0]["duration"] = 1_000_000
        state = eg.normalize_state(raw)
        self.assertEqual(state["data"][0]["phases"][0]["duration"], eg.MAX_HOURS)

    def test_validate_reports_dropped_entries(self):
        raw = esempio()
        raw["data"].append({"name": "X", "phases": []})
        result = eg.validate_state(raw)
        self.assertTrue(result["ok"])
        self.assertTrue(result["warnings"])


class HtmlTests(unittest.TestCase):
    def test_json_escapes_script(self):
        text = eg.json_for_html({"name": "</script><script>alert(1)</script>"})
        self.assertNotIn("<", text)
        self.assertIn("\\u003c/script>", text)

    def test_build_extract_roundtrip(self):
        state = eg.normalize_state(esempio())
        with tempfile.TemporaryDirectory() as tmp:
            template = Path(tmp) / "index.html"
            template.write_text(MINIMAL_TEMPLATE, encoding="utf-8")
            html = eg.build_html(state, template=template)
            self.assertEqual(html.count('id="easygantt-data"'), 1)
            self.assertEqual(html.count("<base "), 1)
            self.assertIn('<base href="https://easygantt.net/">', html)
            recovered = eg.extract_html(html)
            self.assertEqual(recovered, state)

    def test_build_is_idempotent(self):
        state = eg.normalize_state(esempio())
        with tempfile.TemporaryDirectory() as tmp:
            template = Path(tmp) / "index.html"
            template.write_text(MINIMAL_TEMPLATE, encoding="utf-8")
            first = eg.build_html(state, template=template)
            template.write_text(first, encoding="utf-8")
            second = eg.build_html(state, template=template)
            self.assertEqual(second.count('id="easygantt-data"'), 1)
            self.assertEqual(second.count("<base "), 1)
            self.assertEqual(eg.extract_html(second), state)

    def test_custom_base_url(self):
        state = eg.normalize_state(esempio())
        with tempfile.TemporaryDirectory() as tmp:
            template = Path(tmp) / "index.html"
            template.write_text(MINIMAL_TEMPLATE, encoding="utf-8")
            html = eg.build_html(state, template=template, base_url="http://127.0.0.1:4173")
            self.assertIn('<base href="http://127.0.0.1:4173/">', html)

    def test_extract_rejects_html_without_block(self):
        with self.assertRaises(eg.EasyGanttError):
            eg.extract_html("<html><body>no data</body></html>")


class EngineTests(unittest.TestCase):
    """Valori di riferimento prodotti dal motore JS (algorithm2.js)."""

    def test_calendar_slots(self):
        working_days = eg.DEFAULT_WORKING_DAYS
        self.assertEqual(
            engine.date_to_day_number("2026-09-01", "2026-09-01", working_days), 0
        )
        self.assertEqual(
            engine.date_to_day_number("2026-09-23", "2026-09-01", working_days), 16
        )
        self.assertEqual(
            engine.date_to_day_number("2026-10-21", "2026-09-01", working_days), 36
        )
        self.assertEqual(
            engine.day_number_to_date(36, "2026-09-01", working_days).isoformat(),
            "2026-10-21",
        )

    def test_example_schedule_matches_js(self):
        raw = json.loads(
            (ROOT / "examples" / "easygantt-coffee.json").read_text(encoding="utf-8")
        )
        results = eg.simulate(raw)["results"]
        self.assertEqual(results["daysTotal"], 74)

        projects = {project["name"]: project for project in results["projects"]}
        coffee = projects["COFFEE MACHINE"]
        self.assertEqual(coffee["finish"], "2026-10-21")
        self.assertEqual(coffee["delayWorkingDays"], -37)
        self.assertEqual(coffee["cost"], 0)
        self.assertTrue(coffee["onTime"])

        design = coffee["phases"][0]
        self.assertEqual(
            (design["start"], design["finish"], design["workingDays"]),
            ("2026-09-01", "2026-09-23", 12),
        )
        self.assertAlmostEqual(design["resources"][0]["resourceDays"], 12.0)

        build = coffee["phases"][1]
        self.assertEqual(
            (build["start"], build["finish"], build["workingDays"]),
            ("2026-09-24", "2026-10-21", 20),
        )
        self.assertAlmostEqual(
            build["resources"][0]["resourceDays"], 16.0, places=3
        )

        bottle = projects["BOTTLE OPENER"]
        self.assertEqual(bottle["finish"], "2026-11-04")
        self.assertEqual(bottle["delayWorkingDays"], -12)

        concept = bottle["phases"][0]
        self.assertEqual(
            (concept["start"], concept["finish"], concept["workingDays"]),
            ("2026-09-24", "2026-09-30", 5),
        )
        self.assertAlmostEqual(
            concept["resources"][0]["resourceDays"], 2.5
        )

        production = bottle["phases"][1]
        self.assertEqual(
            (production["start"], production["finish"], production["workingDays"]),
            ("2026-10-22", "2026-11-04", 10),
        )
        self.assertAlmostEqual(
            production["resources"][0]["resourceDays"], 10.0
        )

        self.assertEqual(
            results["totals"],
            {
                "delayWorkingDays": 0,
                "cost": 0,
                "projectsLate": 0,
                "projectsOnTime": 2,
            },
        )
        resources = {item["name"]: item for item in results["resources"]}
        self.assertEqual(resources["DESIGNER"]["busyDays"], 22)
        self.assertEqual(resources["DESIGNER"]["peakEmployed"], 100)
        self.assertEqual(resources["BUILDER"]["busyDays"], 30)
        self.assertEqual(resources["BUILDER"]["peakEmployed"], 100)

    def test_late_project_cost(self):
        raw = {
            "meta": {
                "creationDate": "2026-09-01",
                "workingDays": [False, True, True, True, True, True, False],
                "durationUnit": "days",
            },
            "setResources": [{"name": "R", "holidays": []}],
            "data": [
                {
                    "name": "P",
                    "delivery": "2026-09-01",
                    "penalty": 3,
                    "phases": [
                        {
                            "name": "A",
                            "duration": 10,
                            "uncertainty": 0,
                            "start": 0,
                            "resources": [{"name": "R", "employed": 100}],
                        }
                    ],
                }
            ],
        }
        results = eg.simulate(raw)["results"]
        project = results["projects"][0]
        self.assertEqual(project["finish"], "2026-09-14")
        self.assertEqual(project["delayWorkingDays"], 9)
        self.assertEqual(project["cost"], 27)
        self.assertFalse(project["onTime"])
        self.assertEqual(results["totals"]["cost"], 27)
        self.assertEqual(results["totals"]["projectsLate"], 1)

    def test_input_hash_changes_when_input_changes(self):
        raw = json.loads(
            (ROOT / "examples" / "easygantt-coffee.json").read_text(encoding="utf-8")
        )
        first = eg.simulate(raw)["results"]["inputHash"]
        raw["data"][0]["penalty"] = 5
        second = eg.simulate(raw)["results"]["inputHash"]
        self.assertNotEqual(first, second)

    def test_build_html_keeps_results(self):
        raw = json.loads(
            (ROOT / "examples" / "easygantt-coffee.json").read_text(encoding="utf-8")
        )
        document = eg.simulate(raw)
        with tempfile.TemporaryDirectory() as tmp:
            template = Path(tmp) / "index.html"
            template.write_text(MINIMAL_TEMPLATE, encoding="utf-8")
            html = eg.build_html(document, template=template)
            recovered = eg.extract_html(html, include_results=True)
            self.assertIn("results", recovered)
            self.assertEqual(recovered["results"]["daysTotal"], 74)
            # Senza include_results il blocco derivato viene scartato.
            self.assertNotIn("results", eg.extract_html(html))


class ExampleTests(unittest.TestCase):
    def test_example_file_is_valid(self):
        raw = json.loads(
            (ROOT / "examples" / "easygantt-coffee.json").read_text(encoding="utf-8")
        )
        state = eg.normalize_state(raw)
        self.assertIsNotNone(state)
        self.assertEqual(
            [project["name"] for project in state["data"]],
            ["COFFEE MACHINE", "BOTTLE OPENER"],
        )


if __name__ == "__main__":
    unittest.main()
