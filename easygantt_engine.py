#!/usr/bin/env python3
# EasyGANTT is a program for managing projects
# Copyright (C) 2024 Paolo Zambetti
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

"""Port Python del motore di EasyGANTT (algorithm2.js + calcProjecDelay).

Serve a far vedere all'LLM i risultati della simulazione: date di inizio e
fine, ritardi, costo, uso delle risorse. Non e' la verita' assoluta: l'app
resta il riferimento. Il port va tenuto allineato a algorithm2.js e i test
di parita' in tests/test_easygantt.py usano i valori del motore JS.

Il piano calcolato e' quello base (senza coda di incertezza). L'incertezza
pianificata e' riportata per fase in giorni, ma la proiezione "fantasma"
non viene simulata qui.
"""

from __future__ import annotations

import hashlib
import json
import math
from datetime import date, datetime, timedelta, timezone
from typing import Any

from easygantt import (
    _js_round,
    format_iso_date,
    normalizza_giorni_lavorativi,
    num,
    parse_iso_date,
)

SEQUENCE = 1
UNCERTAINTY_SHARE = 1.0


# ---------------------------------------------------------------------------
# Calendario (stesse conversioni di algorithm2.js)
# ---------------------------------------------------------------------------

def is_working_day(value: date, working_days: list[bool]) -> bool:
    return working_days[value.isoweekday() % 7]


def epoch_date(creation_date: str, working_days: list[bool]) -> date:
    current = parse_iso_date(creation_date)
    if current is None:
        raise ValueError(f"creationDate non valida: {creation_date!r}")
    while not is_working_day(current, working_days):
        current += timedelta(days=1)
    return current


def date_to_day_number(
    value: str, creation_date: str, working_days: list[bool]
) -> int:
    epoch = epoch_date(creation_date, working_days)
    target = parse_iso_date(value)
    if target is None:
        raise ValueError(f"Data non valida: {value!r}")
    cursor = epoch
    number = 0
    while cursor < target:
        if is_working_day(cursor, working_days):
            number += 1
        cursor += timedelta(days=1)
    while cursor > target:
        cursor -= timedelta(days=1)
        if is_working_day(cursor, working_days):
            number -= 1
    return number


def day_number_to_date(
    number: int, creation_date: str, working_days: list[bool]
) -> date:
    current = epoch_date(creation_date, working_days)
    k = 0
    while k < number:
        current += timedelta(days=1)
        if is_working_day(current, working_days):
            k += 1
    while k > number:
        current -= timedelta(days=1)
        if is_working_day(current, working_days):
            k -= 1
    return current


# ---------------------------------------------------------------------------
# Capacita' e durate (specchio di algorithm2.js)
# ---------------------------------------------------------------------------

def capacita_giornaliera(phase: dict[str, Any]) -> float:
    total = sum(
        num(resource.get("employed"), 0) / 100
        for resource in phase.get("resources", [])
    )
    return total if total > 0 else 1


def durata_giorni_effettiva(phase: dict[str, Any], duration_unit: str) -> int:
    duration = max(1, _js_round(num(phase.get("duration"), 1)))
    if duration_unit != "hours":
        return duration
    days = math.ceil(duration / (8 * capacita_giornaliera(phase)))
    return min(1000, max(1, days))


def incertezza_giorni(phase: dict[str, Any], duration_unit: str) -> int:
    uncertainty = max(0, _js_round(num(phase.get("uncertainty"), 0)))
    if duration_unit != "hours":
        return uncertainty
    base = max(1, _js_round(num(phase.get("duration"), 1)))
    capacity = 8 * capacita_giornaliera(phase)
    base_days = min(1000, math.ceil(base / capacity))
    total_days = min(1000, math.ceil((base + uncertainty) / capacity))
    return max(0, total_days - base_days)


# ---------------------------------------------------------------------------
# Motore
# ---------------------------------------------------------------------------

class GANTT:
    """Port di GANTT (algorithm2.js). `data` deve essere gia' normalizzato."""

    def __init__(
        self,
        data: list[dict[str, Any]],
        set_resources: list[dict[str, Any]],
        meta: dict[str, Any],
    ) -> None:
        self.data = data
        self.set_resources = set_resources
        self.meta = meta
        self.creation_date = meta["creationDate"]
        self.working_days = normalizza_giorni_lavorativi(meta.get("workingDays"))
        self.duration_unit = (
            "hours" if meta.get("durationUnit") == "hours" else "days"
        )
        self.uncertainty_share = UNCERTAINTY_SHARE
        self.phase_index = 1
        self.number_of_phases = 1 + sum(
            len(project.get("phases", [])) for project in data
        )
        self.solution: list[dict[str, Any] | None] = []
        # Un Set JS deduplica i nomi: dict.fromkeys conserva l'ordine.
        self.resources_employed = list(
            dict.fromkeys(resource["name"] for resource in set_resources)
        )
        for resource in set_resources:
            self.insert_holiday(resource)
        for project in data:
            self.insert_project(project)

    def get_new_day(self) -> dict[str, Any]:
        return {
            "used": [0] * self.number_of_phases,
            "resource": {name: 0 for name in self.resources_employed},
        }

    def date_to_day_number(self, value: str) -> int:
        return date_to_day_number(value, self.creation_date, self.working_days)

    def primo_giorno_uso(self, used_index: int) -> int:
        for index, day in enumerate(self.solution):
            if day is not None and day["used"][used_index] != 0:
                return index
        return 0

    def insert_holiday(self, resource: dict[str, Any]) -> None:
        for holiday in resource.get("holidays", []):
            start = self.date_to_day_number(holiday["startDate"])
            duration = holiday["duration"]
            if start < 0 and start + duration >= 0:
                duration = start + duration
                start = 0
            if start < 0:
                continue
            finish = start + duration
            for current_day in range(finish):
                if len(self.solution) <= current_day:
                    self.solution.append(self.get_new_day())
                day = self.solution[current_day]
                if day is None or current_day < start:
                    continue
                day["used"][0] = 1
                employed = holiday["employed"]
                if resource["name"] == "ALL":
                    for name in self.resources_employed:
                        day["resource"][name] = min(
                            100, day["resource"][name] + employed
                        )
                else:
                    day["resource"][resource["name"]] = min(
                        100, day["resource"][resource["name"]] + employed
                    )

    def _new_solution_day(self, current_day: int) -> dict[str, Any]:
        while len(self.solution) < current_day:
            self.solution.append(self.get_new_day())
        day = self.get_new_day()
        if len(self.solution) == current_day:
            self.solution.append(day)
        else:
            self.solution[current_day] = day
        return day

    def insert_project(self, project: dict[str, Any]) -> None:
        current_day = 0
        for index, phase in enumerate(project.get("phases", [])):
            if index != 0:
                start = _js_round(num(phase.get("start"), 0))
                if start == SEQUENCE:
                    # current_day resta dopo la fine della fase precedente.
                    pass
                elif start <= 0:
                    k = 1 - start
                    reference = self.phase_index - k
                    first_of_project = self.phase_index - index
                    current_day = (
                        self.primo_giorno_uso(reference)
                        if reference >= first_of_project
                        else 0
                    )
                else:
                    current_day = 0

            days = durata_giorni_effettiva(phase, self.duration_unit)
            for _ in range(days):
                while True:
                    if len(self.solution) <= current_day:
                        new_day = self._new_solution_day(current_day)
                        new_day["used"][self.phase_index] = 1
                        for resource in phase.get("resources", []):
                            new_day["resource"][resource["name"]] = resource["employed"]
                        is_free = True
                    else:
                        is_free = all(
                            resource["employed"]
                            + self.solution[current_day]["resource"].get(
                                resource["name"], 0
                            )
                            <= 100
                            for resource in phase.get("resources", [])
                        )
                        if is_free:
                            for resource in phase.get("resources", []):
                                employed = self.solution[current_day][
                                    "resource"
                                ].get(resource["name"], 0)
                                self.solution[current_day]["resource"][
                                    resource["name"]
                                ] = resource["employed"] + employed
                            self.solution[current_day]["used"][
                                self.phase_index
                            ] = 1
                        else:
                            current_day += 1
                    if is_free:
                        break
                current_day += 1

            uncertainty_days = max(
                0, _js_round(num(phase.get("uncertaintyRemaining"), 0))
            )
            for _ in range(uncertainty_days):
                while True:
                    if len(self.solution) <= current_day:
                        new_day = self._new_solution_day(current_day)
                        new_day["used"][self.phase_index] = 2
                        for resource in phase.get("resources", []):
                            new_day["resource"][resource["name"]] = (
                                resource["employed"] * self.uncertainty_share
                            )
                        is_free = True
                    else:
                        is_free = all(
                            resource["employed"] * self.uncertainty_share
                            + self.solution[current_day]["resource"].get(
                                resource["name"], 0
                            )
                            <= 100
                            for resource in phase.get("resources", [])
                        )
                        if is_free:
                            for resource in phase.get("resources", []):
                                employed = self.solution[current_day][
                                    "resource"
                                ].get(resource["name"], 0)
                                self.solution[current_day]["resource"][
                                    resource["name"]
                                ] = (
                                    employed
                                    + resource["employed"] * self.uncertainty_share
                                )
                            self.solution[current_day]["used"][
                                self.phase_index
                            ] = 2
                        else:
                            current_day += 1
                    if is_free:
                        break
                current_day += 1

            self.phase_index += 1

    def extend_to_deliveries(self) -> None:
        last_delivery = -1
        for project in self.data:
            slot = self.date_to_day_number(project["delivery"])
            if slot > last_delivery:
                last_delivery = slot
        while len(self.solution) <= last_delivery:
            self.solution.append(self.get_new_day())

    def get_gantt(self) -> list[dict[str, Any]]:
        self.extend_to_deliveries()
        return [day for day in self.solution if day is not None]


def calc_project_delay(
    days: list[dict[str, Any]],
    data: list[dict[str, Any]],
    meta: dict[str, Any],
) -> list[int]:
    """Ritardo in slot (giorni lavorativi) per progetto; negativo = in anticipo."""
    if not days:
        return []
    last_use = [-1] * len(days[0]["used"])
    missing = len(last_use) - 1
    for index in range(len(days) - 1, -1, -1):
        if missing <= 0:
            break
        used = days[index]["used"]
        for used_index in range(1, len(used)):
            if used[used_index] != 0 and last_use[used_index] < 0:
                last_use[used_index] = index
                missing -= 1

    working_days = normalizza_giorni_lavorativi(meta.get("workingDays"))
    result: list[int] = []
    used_index = 1
    for project in data:
        finish = -1
        for _ in project["phases"]:
            if last_use[used_index] > finish:
                finish = last_use[used_index]
            used_index += 1
        deadline = date_to_day_number(
            project["delivery"], meta["creationDate"], working_days
        )
        result.append(finish - deadline)
    return result


# ---------------------------------------------------------------------------
# Risultati per l'LLM
# ---------------------------------------------------------------------------

def _input_hash(state: dict[str, Any]) -> str:
    payload = {
        "meta": state["meta"],
        "data": state["data"],
        "setResources": state["setResources"],
    }
    text = json.dumps(
        payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def build_results(
    state: dict[str, Any], warnings: list[str] | None = None
) -> dict[str, Any]:
    """Calcola il blocco `results` da uno stato gia' normalizzato.

    Il piano e' quello base; l'incertezza pianificata per fase e' riportata
    in giorni ma non viene simulata come coda (il "fantasma" e' visuale).
    """
    meta = state["meta"]
    data = state["data"]
    set_resources = state["setResources"]
    working_days = normalizza_giorni_lavorativi(meta.get("workingDays"))
    creation_date = meta["creationDate"]
    duration_unit = (
        "hours" if meta.get("durationUnit") == "hours" else "days"
    )

    days = GANTT(data, set_resources, meta).get_gantt()
    delays = calc_project_delay(days, data, meta)

    projects: list[dict[str, Any]] = []
    used_index = 1
    for project_index, project in enumerate(data):
        phases: list[dict[str, Any]] = []
        project_slots: set[int] = set()
        for phase in project["phases"]:
            slots = [
                index
                for index, day in enumerate(days)
                if day["used"][used_index] == SEQUENCE
            ]
            for slot in slots:
                project_slots.add(slot)
            start_slot = slots[0] if slots else None
            end_slot = slots[-1] if slots else None
            resources = []
            for resource in phase.get("resources", []):
                resource_days = sum(
                    (days[slot]["resource"].get(resource["name"], 0) / 100)
                    for slot in slots
                )
                resources.append(
                    {
                        "name": resource["name"],
                        "employed": resource["employed"],
                        "resourceDays": round(resource_days, 4),
                    }
                )
            phases.append(
                {
                    "name": phase["name"],
                    "startSlot": start_slot,
                    "endSlot": end_slot,
                    "start": (
                        format_iso_date(
                            day_number_to_date(start_slot, creation_date, working_days)
                        )
                        if start_slot is not None
                        else None
                    ),
                    "finish": (
                        format_iso_date(
                            day_number_to_date(end_slot, creation_date, working_days)
                        )
                        if end_slot is not None
                        else None
                    ),
                    "workingDays": len(slots),
                    "uncertaintyWorkingDays": incertezza_giorni(
                        phase, duration_unit
                    ),
                    "resources": resources,
                }
            )
            used_index += 1

        finish_slot = max(project_slots) if project_slots else -1
        start_slot = min(project_slots) if project_slots else None
        delay = delays[project_index] if project_index < len(delays) else 0
        cost = max(0, delay) * project["penalty"]
        projects.append(
            {
                "name": project["name"],
                "delivery": project["delivery"],
                "deliverySlot": date_to_day_number(
                    project["delivery"], creation_date, working_days
                ),
                "start": (
                    format_iso_date(
                        day_number_to_date(start_slot, creation_date, working_days)
                    )
                    if start_slot is not None
                    else None
                ),
                "finishSlot": finish_slot,
                "finish": (
                    format_iso_date(
                        day_number_to_date(finish_slot, creation_date, working_days)
                    )
                    if finish_slot >= 0
                    else None
                ),
                "workingDays": len(project_slots),
                "delayWorkingDays": delay,
                "penaltyPerDay": project["penalty"],
                "cost": cost,
                "onTime": delay <= 0,
                "phases": phases,
            }
        )

    resources_result = []
    for resource in set_resources:
        name = resource["name"]
        busy_days = 0
        peak = 0
        for day in days:
            value = day["resource"].get(name, 0)
            if value > 0:
                busy_days += 1
            if value > peak:
                peak = value
        resources_result.append(
            {
                "name": name,
                "busyDays": busy_days,
                "peakEmployed": peak,
                "utilization": round(busy_days / len(days), 4) if days else 0,
                "holidays": resource.get("holidays", []),
            }
        )

    total_delay = sum(max(0, project["delayWorkingDays"]) for project in projects)
    total_cost = sum(project["cost"] for project in projects)
    generated_at = (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )

    return {
        "schema": "easygantt.results/1",
        "engine": "easygantt-py/1.0",
        "generatedAt": generated_at,
        "inputHash": _input_hash(state),
        "durationUnit": duration_unit,
        "calendar": {
            "creationDate": creation_date,
            "workingDays": working_days,
        },
        "daysTotal": len(days),
        "projects": projects,
        "totals": {
            "delayWorkingDays": total_delay,
            "cost": total_cost,
            "projectsLate": sum(1 for p in projects if not p["onTime"]),
            "projectsOnTime": sum(1 for p in projects if p["onTime"]),
        },
        "resources": resources_result,
        "uncertainty": {
            "included": False,
            "note": (
                "Piano base. La proiezione con incertezza (fantasma) non e' "
                "simulata; per ogni fase e' riportata uncertaintyWorkingDays."
            ),
        },
        "warnings": warnings or [],
    }
