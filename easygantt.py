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

"""Costruttore e validatore di dati EasyGANTT, con export HTML.

La libreria replica le regole di validazione di EasyGANTT.js
(normalizeState e le funzioni limita*), cosi' un LLM puo' produrre JSON
che l'app accetta senza sorprese. Non esegue JavaScript e non contiene
HTML: costruisce solo il blocco dati da incorporare nel file esportato.

Uso da libreria:

    import json
    from easygantt import normalize_state, build_html

    stato = normalize_state(json.load(open("progetto.json")))
    html = build_html(stato)
    open("progetto.html", "w", encoding="utf-8").write(html)

Uso da riga di comando:

    python easygantt.py validate progetto.json
    python easygantt.py simulate progetto.json -o progetto.simulato.json
    python easygantt.py build progetto.simulato.json -o progetto.html
    python easygantt.py extract progetto.html -o progetto.json

Il file HTML generato carica l'app da https://easygantt.net/ (override con
--base) e incorpora lo stato in un blocco application/json, esattamente come
"Download HTML" dell'app. Aprendolo, EasyGANTT mostra i dati del progetto.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from datetime import date
from html import escape as html_escape
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

DEFAULT_WORKING_DAYS = [False, True, True, True, True, True, False]
ALL_WORKING_DAYS = [True] * 7
MAX_DAYS = 1000
MAX_HOURS = 100000
DEFAULT_BASE_URL = "https://easygantt.net/"
DATA_BLOCK_ID = "easygantt-data"

_DATE_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")


class EasyGanttError(ValueError):
    """Dati EasyGANTT non validi o HTML senza blocco dati."""


# ---------------------------------------------------------------------------
# Date
# ---------------------------------------------------------------------------

def parse_iso_date(value: Any) -> date | None:
    """Legge una data YYYY-MM-DD; restituisce None se non e' valida."""
    if isinstance(value, date):
        return value
    if not isinstance(value, str):
        return None
    match = _DATE_RE.match(value.strip())
    if not match:
        return None
    try:
        return date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
    except ValueError:
        return None


def format_iso_date(value: date) -> str:
    return value.isoformat()


def is_valid_date(value: Any) -> bool:
    return parse_iso_date(value) is not None


# ---------------------------------------------------------------------------
# Numeri: stessa semantica di Number() / Math.round() del motore JS
# ---------------------------------------------------------------------------

def _js_number(value: Any) -> float:
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, (int, float)):
        number = float(value)
        return number if math.isfinite(number) else math.nan
    if isinstance(value, str):
        text = value.strip()
        if text == "":
            return 0.0
        try:
            number = float(text)
        except ValueError:
            return math.nan
        return number if math.isfinite(number) else math.nan
    return math.nan


def num(value: Any, fallback: float) -> float:
    if value is None:
        return float(fallback)
    number = _js_number(value)
    return number if math.isfinite(number) else float(fallback)


def _js_round(number: float) -> int:
    # Math.round arrotonda .5 verso +infinito, anche per i negativi.
    return int(math.floor(number + 0.5))


def _int_from(value: Any, fallback: int) -> int:
    if value is None:
        return fallback
    number = _js_number(value)
    if not math.isfinite(number):
        return fallback
    return _js_round(number)


def clamp_int(value: float, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, _js_round(value)))


# ---------------------------------------------------------------------------
# Regole di validazione (specchio di EasyGANTT.js)
# ---------------------------------------------------------------------------

def normalizza_giorni_lavorativi(value: Any) -> list[bool]:
    """Sette flag, domenica per prima; almeno un giorno lavorativo."""
    if (
        isinstance(value, list)
        and len(value) == 7
        and any(bool(item) for item in value)
    ):
        return [bool(item) for item in value]
    return DEFAULT_WORKING_DAYS[:]


def giorni_lavorativi_da_meta(meta: Any) -> list[bool]:
    if not isinstance(meta, dict):
        meta = {}
    if isinstance(meta.get("workingDays"), list):
        return normalizza_giorni_lavorativi(meta["workingDays"])
    # File precedenti: workWeekend=true significava "tutti i giorni".
    if meta.get("workWeekend"):
        return ALL_WORKING_DAYS[:]
    return DEFAULT_WORKING_DAYS[:]


def limita_start(value: Any, index: int) -> int:
    """Valore di start valido per la fase in posizione 0-based `index`.

    1 = dopo la fine della precedente; 0 = inizio della precedente;
    -n = inizio della (n+1)-esima fase precedente. La prima fase sta a 0.
    """
    start = _int_from(value, 0)
    if index <= 0:
        return 0
    if start > 1:
        start = 1
    minimum = 1 - index
    if start < minimum:
        start = minimum
    return start


def _max_for(unit: str) -> int:
    return MAX_HOURS if unit == "hours" else MAX_DAYS


def limita_duration(value: Any, unit: str) -> int:
    v = _js_round(num(value, 1))
    if v < 1:
        v = 1
    maximum = _max_for(unit)
    if v > maximum:
        v = maximum
    return v


def limita_uncertainty(value: Any, unit: str) -> int:
    v = _js_round(num(value, 0))
    if v < 0:
        v = 0
    maximum = _max_for(unit)
    if v > maximum:
        v = maximum
    return v


def _js_string(value: Any) -> str:
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    return str(value)


# ---------------------------------------------------------------------------
# Normalizzazione e validazione
# ---------------------------------------------------------------------------

def rigen_set_resource(state: dict[str, Any]) -> dict[str, Any]:
    """Aggiunge a setResources le risorse citate dalle fasi ma non dichiarate.

    E' cio' che fa rigenSetResource() all'apertura di un file: senza questo
    passaggio una risorsa usata in una fase ma assente dall'elenco non
    comparirebbe nel selettore risorse.
    """
    names: dict[str, None] = {}
    for project in state.get("data", []):
        for phase in project.get("phases", []):
            for resource in phase.get("resources", []):
                names.setdefault(resource["name"], None)
    existing = {resource["name"] for resource in state.get("setResources", [])}
    for name in names:
        if name not in existing:
            state["setResources"].append({"name": name, "holidays": []})
    return state


def normalize_state(
    raw: Any, warnings: list[str] | None = None
) -> dict[str, Any] | None:
    """Riporta un documento alla forma accettata da EasyGANTT.

    Restituisce None se il documento non e' utilizzabile (meta/data/
    setResources mancanti o data vuoto). I valori fuori range vengono
    limitati, i progetti senza fasi e le voci malformate vengono scartati.
    Se `warnings` e' una lista, vi si aggiungono le correzioni applicate.
    """

    def warn(message: str) -> None:
        if warnings is not None:
            warnings.append(message)

    if not isinstance(raw, dict):
        warn("Il documento non e' un oggetto JSON.")
        return None

    meta_raw = raw.get("meta")
    if not isinstance(meta_raw, dict):
        warn("Manca l'oggetto 'meta' o non e' valido.")
        return None

    data_raw = raw.get("data")
    if not isinstance(data_raw, list) or not data_raw:
        warn("Manca l'array 'data' o e' vuoto.")
        return None

    resources_raw = raw.get("setResources")
    if not isinstance(resources_raw, list):
        warn("Manca l'array 'setResources' o non e' valido.")
        return None

    creation = parse_iso_date(meta_raw.get("creationDate"))
    if creation is None:
        warn("meta.creationDate deve essere una data YYYY-MM-DD valida.")
        return None

    duration_unit = "hours" if meta_raw.get("durationUnit") == "hours" else "days"
    meta = {
        "creationDate": format_iso_date(creation),
        "workingDays": giorni_lavorativi_da_meta(meta_raw),
        "durationUnit": duration_unit,
    }

    set_resources: list[dict[str, Any]] = []
    for index, resource in enumerate(resources_raw):
        if not isinstance(resource, dict):
            warn(f"setResources[{index}] non e' un oggetto: scartato.")
            continue
        name = resource.get("name")
        if not isinstance(name, str) or name == "":
            warn(f"setResources[{index}] non ha un nome valido: scartato.")
            continue

        holidays_raw = resource.get("holidays")
        if holidays_raw is None:
            holidays_raw = []
        if not isinstance(holidays_raw, list):
            warn(f"setResources[{index}].holidays non e' un array: ignorato.")
            holidays_raw = []

        holidays: list[dict[str, Any]] = []
        for h_index, holiday in enumerate(holidays_raw):
            if not isinstance(holiday, dict):
                warn(
                    f"setResources[{index}].holidays[{h_index}] "
                    "non e' un oggetto: scartata."
                )
                continue
            start = parse_iso_date(holiday.get("startDate"))
            if start is None:
                warn(
                    f"setResources[{index}].holidays[{h_index}].startDate "
                    "non e' valida: scartata."
                )
                continue
            holidays.append(
                {
                    "startDate": format_iso_date(start),
                    "duration": clamp_int(num(holiday.get("duration"), 0), 0, MAX_DAYS),
                    "employed": clamp_int(num(holiday.get("employed"), 100), 0, 100),
                }
            )

        set_resources.append({"name": name, "holidays": holidays})

    data: list[dict[str, Any]] = []
    for p_index, project in enumerate(data_raw):
        if not isinstance(project, dict) or not isinstance(project.get("name"), str):
            warn(f"data[{p_index}] non ha un nome valido: progetto scartato.")
            continue

        delivery = parse_iso_date(project.get("delivery"))
        if delivery is None:
            delivery = creation
            warn(
                f"data[{p_index}].delivery non e' valida: "
                "si usa creationDate."
            )

        phases_raw = project.get("phases")
        if not isinstance(phases_raw, list):
            warn(f"data[{p_index}].phases non e' un array: progetto scartato.")
            continue

        # Come il filtro JS `ph && ph.name !== undefined`: un nome null
        # esplicito resta (JS lo trasforma in "null").
        phases_raw = [
            phase for phase in phases_raw
            if isinstance(phase, dict) and "name" in phase
        ]

        phases: list[dict[str, Any]] = []
        for f_index, phase in enumerate(phases_raw):
            resources: list[dict[str, Any]] = []
            phase_resources = phase.get("resources")
            if phase_resources is None:
                phase_resources = []
            if not isinstance(phase_resources, list):
                warn(
                    f"data[{p_index}].phases[{f_index}].resources "
                    "non e' un array: ignorato."
                )
                phase_resources = []

            for r_index, resource in enumerate(phase_resources):
                if (
                    not isinstance(resource, dict)
                    or not isinstance(resource.get("name"), str)
                    or resource.get("name") == ""
                ):
                    warn(
                        f"data[{p_index}].phases[{f_index}]."
                        f"resources[{r_index}] non e' valida: scartata."
                    )
                    continue
                resources.append(
                    {
                        "name": resource["name"],
                        "employed": clamp_int(
                            num(resource.get("employed"), 100), 1, 100
                        ),
                    }
                )

            phases.append(
                {
                    "name": _js_string(phase.get("name")),
                    "duration": limita_duration(phase.get("duration"), duration_unit),
                    "uncertainty": limita_uncertainty(
                        phase.get("uncertainty"), duration_unit
                    ),
                    "finished": phase.get("finished") is True,
                    "start": limita_start(phase.get("start"), f_index),
                    "resources": resources,
                }
            )

        if not phases:
            warn(f"data[{p_index}] non ha fasi: progetto scartato.")
            continue

        data.append(
            {
                "name": project["name"],
                "delivery": format_iso_date(delivery),
                "penalty": clamp_int(num(project.get("penalty"), 0), 0, 10),
                "phases": phases,
            }
        )

    if not data:
        warn("Nessun progetto valido rimasto dopo la validazione.")
        return None

    state = {"meta": meta, "data": data, "setResources": set_resources}
    return rigen_set_resource(state)


def validate_state(raw: Any) -> dict[str, Any]:
    """Valida un documento e restituisce esito, stato normalizzato, warning."""
    warnings: list[str] = []
    state = normalize_state(raw, warnings)
    return {"ok": state is not None, "state": state, "warnings": warnings}


def simulate(state: Any) -> dict[str, Any]:
    """Restituisce l'input normalizzato con il blocco `results` calcolato.

    Il calcolo e' nel port Python del motore (easygantt_engine.py): date di
    inizio/fine, ritardi, costo e uso delle risorse. L'app resta il
    riferimento; questo blocco serve all'LLM per vedere i risultati senza
    doverli ricalcolare a mano.

    L'import e' locale per evitare il ciclo easygantt -> engine -> easygantt.
    """
    from easygantt_engine import build_results

    warnings: list[str] = []
    normalized = normalize_state(state, warnings)
    if normalized is None:
        raise EasyGanttError("Stato EasyGANTT non valido.")
    return {**normalized, "results": build_results(normalized, warnings)}


# ---------------------------------------------------------------------------
# Export / import HTML
# ---------------------------------------------------------------------------

def json_for_html(state: dict[str, Any]) -> str:
    """Serializza lo stato per il blocco application/json dell'HTML.

    `<` diventa `\\u003c` (escape JSON valido): un nome contenente
    "</script>" non puo' chiudere il blocco. U+2028/U+2029 vengono
    scritti come escape per non introdurre separatori di riga nel sorgente.
    """
    text = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
    text = text.replace("<", "\\u003c")
    text = text.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    return text


def build_html(
    state: Any,
    template: str | Path | None = None,
    base_url: str = DEFAULT_BASE_URL,
) -> str:
    """Costruisce un export HTML a file singolo con lo stato incorporato.

    `template` e' l'index.html dell'app (default: quello accanto a questo
    file). `base_url` e' la cartella da cui caricare CSS/script: l'app
    online per un file apribile ovunque, o un percorso locale per l'offline.
    """
    normalized = normalize_state(state)
    if normalized is None:
        raise EasyGanttError("Stato EasyGANTT non valido.")

    # I risultati non fanno parte dello stato che l'app legge (normalizeState
    # li ignora), ma restano nel blocco JSON per chi legge il file: LLM o
    # utente. Se il documento non li ha, l'export resta quello di prima.
    results = state.get("results") if isinstance(state, dict) else None
    payload = dict(normalized)
    if isinstance(results, dict):
        payload["results"] = results

    if template is None:
        template = Path(__file__).with_name("index.html")
    html = Path(template).read_text(encoding="utf-8-sig")

    # Idempotente: si parte anche da un HTML gia' esportato.
    html = re.sub(r"<base\b[^>]*>\s*", "", html, count=1, flags=re.IGNORECASE)
    html = re.sub(
        r"<script\b[^>]*(?<![\w-])id\s*=\s*[\"']easygantt-data[\"'][^>]*>"
        r".*?</script>\s*",
        "",
        html,
        count=1,
        flags=re.IGNORECASE | re.DOTALL,
    )

    base = base_url if base_url.endswith("/") else base_url + "/"
    block = (
        f'<base href="{html_escape(base, quote=True)}">\n'
        f'<script type="application/json" id="{DATA_BLOCK_ID}">'
        f"{json_for_html(payload)}</script>\n"
    )

    if '<meta charset="UTF-8">' in html:
        return html.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n' + block, 1)
    return html.replace("<head>", "<head>\n" + block, 1)


class _EasyGanttDataParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.capturing = False
        self.found = False
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "script":
            return
        attributes = {key.lower(): value for key, value in attrs}
        if attributes.get("id") == DATA_BLOCK_ID:
            self.capturing = True
            self.found = True

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "script" and self.capturing:
            self.capturing = False

    def handle_data(self, data: str) -> None:
        if self.capturing:
            self.parts.append(data)


def extract_html(html: str, include_results: bool = False) -> dict[str, Any]:
    """Legge e valida il blocco easygantt-data di un HTML esportato.

    Con `include_results=True` il blocco `results` (se presente) viene
    conservato accanto all'input normalizzato.
    """
    parser = _EasyGanttDataParser()
    parser.feed(html)
    if not parser.found:
        raise EasyGanttError("Nessun blocco easygantt-data trovato nell'HTML.")
    text = "".join(parser.parts).strip()
    try:
        raw = json.loads(text)
    except json.JSONDecodeError as error:
        raise EasyGanttError(
            f"JSON non valido nel blocco easygantt-data: {error}"
        ) from error
    state = normalize_state(raw)
    if state is None:
        raise EasyGanttError(
            "Il blocco easygantt-data non contiene uno stato EasyGANTT valido."
        )
    if include_results and isinstance(raw.get("results"), dict):
        state["results"] = raw["results"]
    return state


# ---------------------------------------------------------------------------
# I/O e riga di comando
# ---------------------------------------------------------------------------

def _read_text(source: str | Path) -> str:
    if str(source) == "-":
        return sys.stdin.read().lstrip("\ufeff")
    return Path(source).read_text(encoding="utf-8-sig")


def load_json(source: str | Path) -> Any:
    return json.loads(_read_text(source))


def _parse_document(text: str, suffix: str) -> Any:
    text = text.lstrip("\ufeff")
    if suffix in (".html", ".htm"):
        return extract_html(text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Un file senza estensione puo' comunque essere un export HTML.
        return extract_html(text)


def load_document(source: str | Path) -> Any:
    if str(source) == "-":
        return _parse_document(sys.stdin.read(), "")
    path = Path(source)
    return _parse_document(path.read_text(encoding="utf-8-sig"), path.suffix.lower())


def _write_json(value: Any, output: str | None) -> None:
    text = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    if output:
        Path(output).write_text(text, encoding="utf-8")
    else:
        sys.stdout.write(text)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="easygantt.py",
        description="Valida, normalizza e converte dati EasyGANTT.",
    )
    parser.add_argument("--version", action="version", version="easygantt.py 1.0")
    sub = parser.add_subparsers(dest="command", required=True)

    validate_parser = sub.add_parser(
        "validate", help="Valida un JSON o un HTML esportato."
    )
    validate_parser.add_argument("input")
    validate_parser.add_argument(
        "--strict",
        action="store_true",
        help="Considera errore anche i warning (valori corretti o voci scartate).",
    )

    normalize_parser = sub.add_parser(
        "normalize", help="Scrive il JSON normalizzato."
    )
    normalize_parser.add_argument("input")
    normalize_parser.add_argument("-o", "--output")

    simulate_parser = sub.add_parser(
        "simulate",
        help="Calcola il blocco results (date, ritardi, costo, risorse).",
    )
    simulate_parser.add_argument("input")
    simulate_parser.add_argument("-o", "--output")

    build_parser = sub.add_parser(
        "build", help="Crea un export HTML a file singolo."
    )
    build_parser.add_argument("input")
    build_parser.add_argument("-o", "--output", required=True)
    build_parser.add_argument(
        "--template",
        default=None,
        help="index.html dell'app (default: quello accanto a easygantt.py).",
    )
    build_parser.add_argument(
        "--base",
        default=DEFAULT_BASE_URL,
        help=f"URL base per CSS/script (default: {DEFAULT_BASE_URL}).",
    )

    extract_parser = sub.add_parser(
        "extract", help="Estrae lo stato da un HTML esportato."
    )
    extract_parser.add_argument("input")
    extract_parser.add_argument("-o", "--output")
    extract_parser.add_argument(
        "--results",
        action="store_true",
        help="Conserva il blocco results, se presente nell'HTML.",
    )

    args = parser.parse_args(argv)

    try:
        if args.command == "validate":
            raw = load_document(args.input)
            result = validate_state(raw)
            for warning in result["warnings"]:
                print(f"warning: {warning}", file=sys.stderr)
            if result["state"] is None:
                print(
                    "invalid: il documento non puo' essere aperto da EasyGANTT.",
                    file=sys.stderr,
                )
                return 2
            if args.strict and result["warnings"]:
                print("invalid: presenti warning (--strict).", file=sys.stderr)
                return 2
            print("ok")
            return 0

        if args.command == "normalize":
            state = normalize_state(load_document(args.input))
            if state is None:
                print(
                    "invalid: il documento non puo' essere aperto da EasyGANTT.",
                    file=sys.stderr,
                )
                return 2
            _write_json(state, args.output)
            return 0

        if args.command == "simulate":
            document = simulate(load_document(args.input))
            _write_json(document, args.output)
            return 0

        if args.command == "build":
            html = build_html(
                load_document(args.input),
                template=args.template,
                base_url=args.base,
            )
            Path(args.output).write_text(html, encoding="utf-8")
            print(args.output)
            return 0

        if args.command == "extract":
            state = extract_html(
                _read_text(args.input), include_results=args.results
            )
            _write_json(state, args.output)
            return 0

    except (OSError, EasyGanttError, json.JSONDecodeError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2

    return 0


if __name__ == "__main__":
    # Permette a easygantt_engine di importare questo modulo come "easygantt"
    # anche quando il file e' eseguito come script: senza l'alias verrebbe
    # caricato una seconda volta come modulo separato.
    sys.modules.setdefault("easygantt", sys.modules[__name__])
    raise SystemExit(main())
