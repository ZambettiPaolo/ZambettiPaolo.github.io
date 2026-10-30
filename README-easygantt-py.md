# easygantt.py

Libreria Python (solo standard library) per far produrre dati a un LLM e
trasformarli in un file HTML apribile in EasyGANTT. Non c'è server, non c'è
chiave API, non c'è installazione lato utente: la chat genera JSON, la
libreria lo valida e costruisce il file.

## Perché serve

Il formato dei dati di EasyGANTT ha regole precise: date ISO, `start` che
dipende dalla posizione della fase, limiti su durata e impiego, giorni
lavorativi con domenica per prima, risorse dichiarate. Un LLM può sbagliarle.
`easygantt.py` replica le regole di `normalizeState` e delle funzioni `limita*`
di `EasyGANTT.js`, quindi:

- la chat produce **solo JSON** (niente HTML, niente script);
- la libreria valida, limita e costruisce l'export;
- l'app resta l'unico motore che calcola date, ritardi e fantasma.

## File

| File | Scopo |
|---|---|
| `easygantt.py` | libreria + CLI |
| `easygantt_prompt.md` | system prompt da incollare nella chat |
| `easygantt_schema.json` | JSON Schema del documento |
| `examples/easygantt-coffee.json` | esempio valido |
| `tests/test_easygantt.py` | test con `unittest` |

## Uso da riga di comando

```bash
# Controlla un JSON prodotto dalla chat
python easygantt.py validate progetto.json

# Normalizza (limita i valori fuori range, scarta le voci malformate)
python easygantt.py normalize progetto.json -o progetto.normalized.json

# Costruisce il file HTML da aprire in EasyGANTT
python easygantt.py build progetto.json -o progetto.html

# Estrae lo stato da un HTML già esportato (per poi modificarlo con la chat)
python easygantt.py extract progetto.html -o progetto.json
```

`build` usa come template l'`index.html` accanto a `easygantt.py`. Il file
generato carica CSS e script da `https://easygantt.net/`; per un uso offline
passa `--base` con la cartella locale che contiene l'app:

```bash
python easygantt.py build progetto.json -o progetto.html --base ./easygantt/
```

## Uso da libreria

```python
import json
from easygantt import normalize_state, build_html, validate_state

raw = json.load(open("progetto.json", encoding="utf-8"))
result = validate_state(raw)
for warning in result["warnings"]:
    print("warning:", warning)

state = result["state"]
if state is None:
    raise SystemExit("Dati non validi")

html = build_html(state, base_url="https://easygantt.net/")
open("progetto.html", "w", encoding="utf-8").write(html)
```

## Il ciclo con la chat

1. Incolla `easygantt_prompt.md` come system prompt (o in un progetto/GPT
   personalizzato).
2. Chiedi il progetto: la chat restituisce un blocco JSON completo.
3. Salvalo come `progetto.json` e lancia `python easygantt.py validate`.
4. `python easygantt.py build progetto.json -o progetto.html`.
5. Apri `progetto.html` nel browser: EasyGANTT mostra i dati e calcola date,
   ritardi e fantasma.
6. Per modificare: esporta il JSON dall'app (o usa `extract` su un HTML),
   passalo alla chat con la richiesta, ricevi il documento completo aggiornato
   e ripeti dal punto 3.

La chat non apre file e non calcola la pianificazione: il giro è manuale, ma
funziona con qualunque chat, anche gratuita, senza chiavi e senza server.

## Cosa fa e cosa non fa

**Fa:**
- valida e normalizza il documento con le stesse regole dell'app;
- limita i valori fuori range (`start`, durata, incertezza, impiego, penalty);
- scarta progetti senza fasi e voci malformate, segnalandole;
- aggiunge a `setResources` le risorse citate dalle fasi ma non dichiarate
  (come `rigenSetResource()` nell'app);
- costruisce ed estrae il blocco `<script type="application/json"
  id="easygantt-data">` con l'escape di `<`, U+2028 e U+2029.

**Non fa:**
- non calcola la schedulazione, i ritardi o il costo: lo fa l'app;
- non esegue JavaScript e non interpreta l'HTML della chat;
- non incorpora l'app: l'HTML caricato da `--base` deve essere raggiungibile
  (online o in una cartella locale);
- non gestisce il multiutente, la sincronizzazione o la persistenza.

## Sicurezza

- La chat produce **dati**, non codice. Il blocco è `application/json` e non
  viene eseguito.
- I nomi possono contenere `</script>`: `json_for_html()` trasforma ogni `<`
  in `<`, un escape JSON valido, quindi il blocco non si chiude.
- Non aprire HTML generati direttamente dalla chat senza passare da
  `easygantt.py` o dall'app: un HTML è codice eseguibile.
- Il file HTML caricato da `https://easygantt.net/` esegue gli script
  dell'app: è lo stesso comportamento di "Download HTML".

## Test

```bash
python -m unittest discover -s tests -t .
```

## Manutenzione

La libreria è uno specchio delle regole di `EasyGANTT.js`. Se cambiano
`normalizeState`, `limitaStart`, `limitaDurata`, `limitaIncertezza` o il
formato dell'export HTML, vanno aggiornati `easygantt.py`, lo schema, il
prompt e i test. I test di round-trip (`build` → `extract`) sono la rete di
sicurezza minima.

## Licenza

GPLv3, come il resto di EasyGANTT.
