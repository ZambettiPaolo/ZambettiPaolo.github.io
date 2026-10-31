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
| `easygantt.py` | libreria + CLI (validazione, HTML, simulazione) |
| `easygantt_engine.py` | port del motore: piano base, ritardi, uso risorse |
| `easygantt_prompt.md` | system prompt da incollare nella chat |
| `easygantt_schema.json` | JSON Schema del documento di input |
| `easygantt_results_schema.json` | JSON Schema dell'output di `simulate` (file separato) |
| `examples/easygantt-coffee.json` | esempio valido |
| `tests/test_easygantt.py` | test con `unittest`, con valori di riferimento dal motore JS |

## Uso da riga di comando

```bash
# Controlla un JSON prodotto dalla chat
python easygantt.py validate progetto.json

# Normalizza (limita i valori fuori range, scarta le voci malformate)
python easygantt.py normalize progetto.json -o progetto.normalized.json

# Calcola i risultati in un file separato: date, ritardi, costo, uso risorse
python easygantt.py simulate progetto.json -o risultati.json

# Costruisce il file HTML dal progetto (solo input, niente risultati)
python easygantt.py build progetto.json -o progetto.html

# Estrae lo stato da un HTML già esportato (per poi modificarlo con la chat)
python easygantt.py extract progetto.html -o progetto.json
```

`simulate` produce **solo i risultati**, in un file separato dal progetto:
per ogni progetto e fase inizio/fine, giorni lavorativi, ritardo, costo, uso
delle risorse, totali e `inputHash`. Non va incorporato nel JSON del progetto
né nell'HTML: l'app lo ignora e ricalcola. Serve all'LLM per ragionare.

Il documento del progetto resta `meta`, `data`, `setResources` (più
`meta.llm`, che l'app e la libreria ignorano). Se l'input cambia, i risultati
sono obsoleti: rilancia `simulate`; `inputHash` serve a accorgersene.

L'app aggiunge al JSON copiato/esportato un blocco `meta.llm` con i link a
questo prompt, ai sorgenti Python, agli schemi e al comando `simulate`.
`normalize_state` lo ignora, quindi non entra nello stato né nei risultati:
serve solo a far trovare all'LLM le istruzioni senza passarle a parte.

`build` usa come template l'`index.html` accanto a `easygantt.py`. Il file
generato carica CSS e script da `https://easygantt.net/`; per un uso offline
passa `--base` con la cartella locale che contiene l'app:

```bash
python easygantt.py build progetto.json -o progetto.html --base ./easygantt/
```

## Uso da libreria

```python
import json
from easygantt import build_html, simulate, validate_state

raw = json.load(open("progetto.json", encoding="utf-8"))
result = validate_state(raw)
for warning in result["warnings"]:
    print("warning:", warning)

state = result["state"]
if state is None:
    raise SystemExit("Dati non validi")

# I risultati sono un oggetto separato: servono per l'analisi, non per l'HTML.
results = simulate(state)

# L'HTML contiene solo l'input del progetto.
html = build_html(state, base_url="https://easygantt.net/")
open("progetto.html", "w", encoding="utf-8").write(html)
```

## Il ciclo con la chat

1. Incolla `easygantt_prompt.md` come system prompt (o in un progetto/GPT
   personalizzato).
2. Chiedi il progetto: la chat restituisce un blocco JSON completo.
3. Salvalo come `progetto.json` e lancia `python easygantt.py validate`.
4. `python easygantt.py simulate progetto.json -o risultati.json`: ottieni
   le date, i ritardi e i costi in un file separato.
5. Passa il progetto e/o `risultati.json` alla chat: ora vede i risultati e
   può ragionare ("siamo in ritardo di 3 giorni", "conviene spostare questa
   fase").
6. `python easygantt.py build progetto.json -o progetto.html`.
7. Apri `progetto.html` nel browser: EasyGANTT mostra i dati e ricalcola la
   pianificazione.
8. Per modificare: la chat restituisce solo il documento aggiornato (`meta`,
   `data`, `setResources`), senza risultati; ripeti dal punto 3.

Se la chat ha un code interpreter, può scaricare il motore ed eseguire lei
`simulate` nel suo ambiente: il ciclo diventa automatico. Se non ce l'ha,
l'utente esegue i comandi tra un messaggio e l'altro.

La chat non apre file locali da sola: l'utente passa il JSON. Il documento
scambiato è solo input; i risultati sono un file di lavoro separato, così non
finiscono mai nel progetto o nell'HTML.

## Cosa fa e cosa non fa

**Fa:**
- valida e normalizza il documento con le stesse regole dell'app;
- limita i valori fuori range (`start`, durata, incertezza, impiego, penalty);
- scarta progetti senza fasi e voci malformate, segnalandole;
- aggiunge a `setResources` le risorse citate dalle fasi ma non dichiarate
  (come `rigenSetResource()` nell'app);
- costruisce ed estrae il blocco `<script type="application/json"
  id="easygantt-data">` con l'escape di `<`, U+2028 e U+2029;
- **calcola il piano base** con il port Python del motore: date di inizio e
  fine per fase/progetto, ritardo in giorni lavorativi, costo, uso delle
  risorse, totali; `simulate` li scrive in un file **separato** dal progetto.

**Non fa:**
- non simula la proiezione con incertezza (il "fantasma"): riporta solo
  `uncertaintyWorkingDays` per fase;
- non è la verità assoluta: l'app resta il riferimento. Il port va tenuto
  allineato a `algorithm2.js` e i test di parità usano i valori del motore JS;
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

La libreria è uno specchio delle regole di `EasyGANTT.js` e di
`algorithm2.js`. Se cambiano `normalizeState`, `limitaStart`, `limitaDurata`,
`limitaIncertezza`, il motore (`insertProject`, ferie, capacità, `start`,
coda di incertezza, `calcProjecDelay`) o il formato dell'export HTML, vanno
aggiornati `easygantt.py`, `easygantt_engine.py`, gli schemi, il prompt e i
test.

I test di parità in `tests/test_easygantt.py` contengono i valori prodotti dal
motore JS sull'esempio: sono la rete di sicurezza minima. I test di round-trip
(`build` → `extract`) coprono il formato.

## Licenza

GPLv3, come il resto di EasyGANTT.
