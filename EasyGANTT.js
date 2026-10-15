/* EasyGANTT is a program for managing projects
Copyright (C) 2024 Paolo Zambetti

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>. */



/* Sfugge i caratteri con significato in HTML. Va applicata a OGNI valore
   interpolato dentro innerHTML: i nomi di progetti, fasi e risorse arrivano da
   un file JSON caricato dall'utente, quindi sono dati non fidati. Senza questa
   funzione un nome come `"><img src=x onerror=...>` viene eseguito come script
   sulla pagina, e anche una sola virgoletta rompe silenziosamente l'attributo
   value di un campo di input. */
function esc(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
}

const VERSION = {"major":0, "minor":5, "patch":0}
var projectDelay = []
var selectedProjectIndex = 0
var selectedPhaseIndex = 0
var selectedResourceIndex = 0
var selectedHolidayIndex = 0
var currentResourceIndex = 0
var selectorSetResources = new Set()
// Copia dei dati di esempio, presa PRIMA di rigenSetResource(): quella funzione
// modifica setResources aggiungendo le risorse mancanti, e le modifiche
// dell'utente sovrascrivono poi i globali. Senza questa copia non ci sarebbe
// modo di tornare all'esempio dopo aver lavorato.
const SAMPLE_STATE = JSON.parse(JSON.stringify({ data: data, meta: meta, setResources: setResources }))
rigenSetResource()
var undoRedoManager = new UndoRedoManager(snapshot())

// I due helper che sostituiscono i 21 blocchi identici di updateState sparsi
// per il file: ogni mutazione dello stato passa ora da pushState().
function snapshot(){
    return {
        "data": data,
        "meta": meta,
        "setResources": setResources,
        "selectedProjectIndex": selectedProjectIndex,
        "selectedPhaseIndex": selectedPhaseIndex,
        "selectedResourceIndex": selectedResourceIndex,
        "selectedHolidayIndex": selectedHolidayIndex,
        "currentResourceIndex": currentResourceIndex
    }
}

function pushState(){
    undoRedoManager.updateState(snapshot())
    // La prima modifica "arma" il salvataggio automatico: chi si limita a
    // guardare i dati di esempio non lascia nulla nel browser.
    autosaveArmed = true
    scheduleAutosave()
}


/* ---------------------------------------------------------------------------
   Salvataggio automatico nel browser (localStorage).

   Il formato del payload e' identico a quello di "Download data", cosi' un
   solo validatore (normalizeState) serve sia la bozza sia l'import.
--------------------------------------------------------------------------- */

const AUTOSAVE_KEY = 'easygantt.autosave.v1'
const LAST_IRREVERSIBLE_KEY = 'easygantt.lastIrreversible.v1'
var autosaveArmed = false
var autosaveTimer = null

function scheduleAutosave(){
    if (!autosaveArmed) return
    if (autosaveTimer) clearTimeout(autosaveTimer)
    autosaveTimer = setTimeout(saveNow, 800)
}

function saveNow(){
    if (!autosaveArmed) return
    if (autosaveTimer){ clearTimeout(autosaveTimer); autosaveTimer = null }
    try {
        // Si legge dalla cronologia di undo invece di ricostruire l'oggetto a
        // mano: cosi' la bozza non puo' divergere dallo stato corrente.
        const stato = undoRedoManager.getCurrentState()
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({
            savedAt: new Date().toISOString(),
            appVersion: VERSION,
            payload: { meta: stato.meta, data: stato.data, setResources: stato.setResources }
        }))
    } catch (e) {
        // Tipicamente QuotaExceededError, oppure localStorage non disponibile
        // (per esempio Safari in navigazione privata). Non si insiste.
        autosaveArmed = false
        console.warn('Salvataggio automatico disattivato:', e)
        alert('Impossibile salvare la bozza nel browser. Il lavoro resta solo in questa scheda: usa "Download data" per conservarlo.')
    }
}

function leggiBozza(){
    try {
        const raw = localStorage.getItem(AUTOSAVE_KEY)
        if (!raw) return null
        return normalizeState(JSON.parse(raw).payload)
    } catch (e) {
        console.warn('Bozza illeggibile: si riparte dai dati di esempio.', e)
        return null
    }
}

// Salvataggio immediato quando la scheda viene nascosta o chiusa: altrimenti
// il debounce di 800 ms perderebbe l'ultima modifica.
function attivaSalvataggioSuUscita(){
    window.addEventListener('beforeunload', saveNow)
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') saveNow()
    })
}

function restoreOrInit(){
    const bozza = leggiBozza()
    if (bozza) {
        data = bozza.data
        meta = bozza.meta
        setResources = bozza.setResources
    }
    rigenSetResource()
    undoRedoManager = new UndoRedoManager(snapshot())
    // Si continua a salvare se si sta lavorando su una bozza; se si stanno
    // guardando i dati di esempio si aspettera' la prima modifica.
    autosaveArmed = !!bozza
    syncWorkWeekendCheckbox()
    populateProjectsTable()
    updateChart(new GANTT(data, setResources, meta).getGantt())
    if (bozza) mostraAvvisoRipristino()
    attivaSalvataggioSuUscita()
}

function mostraAvvisoRipristino(){
    const avviso = document.getElementById('restoreNotice')
    if (avviso) avviso.style.display = 'block'
}

function resetToSample(){
    if (!confirm('Discard the saved draft and go back to the sample data?')) return
    try { localStorage.removeItem(AUTOSAVE_KEY) } catch (e) {}
    data = JSON.parse(JSON.stringify(SAMPLE_STATE.data))
    meta = JSON.parse(JSON.stringify(SAMPLE_STATE.meta))
    setResources = JSON.parse(JSON.stringify(SAMPLE_STATE.setResources))
    rigenSetResource()
    undoRedoManager = new UndoRedoManager(snapshot())
    autosaveArmed = false
    selectedProjectIndex = 0
    selectedPhaseIndex = 0
    selectedResourceIndex = 0
    selectedHolidayIndex = 0
    currentResourceIndex = 0
    const avviso = document.getElementById('restoreNotice')
    if (avviso) avviso.style.display = 'none'
    syncWorkWeekendCheckbox()
    populateProjectsTable()
    updateChart(new GANTT(data, setResources, meta).getGantt())
}

// Conserva lo stato precedente a un'azione irreversibile: con il salvataggio
// automatico un errore diventa permanente, questa e' una rete di sicurezza.
function salvaStatoIrreversibile(){
    try {
        localStorage.setItem(LAST_IRREVERSIBLE_KEY, JSON.stringify({
            savedAt: new Date().toISOString(),
            payload: { meta: meta, data: data, setResources: setResources }
        }))
    } catch (e) {
        console.warn('Impossibile conservare lo stato precedente:', e)
    }
}

function ripristinaStatoIrreversibile(){
    let salvato = null
    try {
        const raw = localStorage.getItem(LAST_IRREVERSIBLE_KEY)
        if (raw) salvato = normalizeState(JSON.parse(raw).payload)
    } catch (e) { salvato = null }
    if (!salvato){ alert('Nessuna azione irreversibile da annullare.'); return }
    if (!confirm('Undo the last irreversible action (recalculate / cut) and restore the previous state?')) return
    data = salvato.data
    meta = salvato.meta
    setResources = salvato.setResources
    rigenSetResource()
    undoRedoManager = new UndoRedoManager(snapshot())
    autosaveArmed = true
    try { localStorage.removeItem(LAST_IRREVERSIBLE_KEY) } catch (e) {}
    syncWorkWeekendCheckbox()
    populateProjectsTable()
    updateChart(new GANTT(data, setResources, meta).getGantt())
    scheduleAutosave()
}


/* ---------------------------------------------------------------------------
   Validazione e normalizzazione dello stato caricato.

   Serve sia all'import di un file sia alla lettura della bozza. Oltre a
   rifiutare i dati malformati, COERCE I TIPI: un file con "employed": "40"
   (stringa) faceva diventare res.employed + emp una concatenazione di stringhe,
   quindi "400" > 100 e la risorsa risultava sempre satura. Lo stesso valeva
   per duration e start.
--------------------------------------------------------------------------- */

function isDataValida(d){
    return d instanceof Date && !isNaN(d.getTime())
}

function num(value, fallback){
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
}

function clamp(n, min, max){
    return Math.min(max, Math.max(min, Math.round(n)))
}

function normalizeState(raw){
    if (!raw || typeof raw !== 'object') return null
    if (!raw.meta || typeof raw.meta !== 'object') return null
    if (!Array.isArray(raw.data) || raw.data.length === 0) return null
    if (!Array.isArray(raw.setResources)) return null

    const creation = parseISODate(raw.meta.creationDate)
    if (!isDataValida(creation)) return null

    const meta = {
        creationDate: formatISODate(creation),
        // Campo introdotto da questa versione: assente nei file vecchi, dove
        // significa false, cioe' il comportamento di prima.
        workWeekend: !!raw.meta.workWeekend
    }

    const setResources = raw.setResources
        .filter(r => r && typeof r.name === 'string' && r.name !== '')
        .map(r => ({
            name: r.name,
            holidays: (Array.isArray(r.holidays) ? r.holidays : [])
                .filter(h => h && isDataValida(parseISODate(h.startDate)))
                .map(h => ({
                    startDate: formatISODate(parseISODate(h.startDate)),
                    duration: clamp(num(h.duration, 0), 0, 1000),
                    employed: clamp(num(h.employed, 100), 0, 100)
                }))
        }))

    const data = raw.data
        .filter(p => p && typeof p.name === 'string')
        .map(p => ({
            name: p.name,
            delivery: isDataValida(parseISODate(p.delivery)) ? formatISODate(parseISODate(p.delivery)) : meta.creationDate,
            penalty: clamp(num(p.penalty, 0), 0, 10),
            phases: (Array.isArray(p.phases) ? p.phases : [])
                .filter(ph => ph && ph.name !== undefined)
                .map(ph => ({
                    name: String(ph.name),
                    // Una fase di durata 0 non occupa nessuno slot e faceva
                    // uscire dai limiti i cicli del motore.
                    duration: clamp(num(ph.duration, 1), 1, 1000),
                    start: num(ph.start, 0) === 1 ? SEQUENCE : PARALLEL,
                    resources: (Array.isArray(ph.resources) ? ph.resources : [])
                        .filter(r => r && typeof r.name === 'string' && r.name !== '')
                        .map(r => ({ name: r.name, employed: clamp(num(r.employed, 100), 1, 100) }))
                }))
        }))
        // Un progetto senza fasi non e' calcolabile: si scarta.
        .filter(p => p.phases.length > 0)

    if (data.length === 0) return null
    return { meta, data, setResources }
}


// Interruttore globale: se attivo anche sabato e domenica sono giorni di
// calendario, quindi una durata di 5 occupa 5 giorni consecutivi; se spento
// (comportamento dei file salvati prima di questa versione) il weekend non
// consuma durata.
function setWorkWeekend(value){
    if (!!meta.workWeekend === !!value) return
    meta.workWeekend = !!value
    pushState()
    updateChart(new GANTT(data, setResources, meta).getGantt())
}

function syncWorkWeekendCheckbox(){
    var box = document.getElementById('workWeekend')
    if (box) box.checked = !!meta.workWeekend
}

function version() {
    // Scrive in uno span dedicato: prima sovrascriveva il contenuto dell'h1,
    // facendo sparire la scritta "EasyGANTT" dal titolo.
    document.getElementById('versionNumber').textContent =
        `Version: ${VERSION.major}.${VERSION.minor}.${VERSION.patch}`
}


function handleFileUpload(event) {
    const file = event.target.files[0]
    // Alcuni sistemi (Linux in particolare) non valorizzano file.type: ci si
    // basa anche sull'estensione, altrimenti il file veniva rifiutato a torto.
    const sembraJson = file && (file.type === 'application/json' ||
                                file.type === '' ||
                                /\.json$/i.test(file.name))
    if (!sembraJson) {
        alert("Please choose a JSON file.")
        event.target.value = ''
        return
    }
    const reader = new FileReader()
    reader.onload = function(e) {
        let normalizzato = null
        try {
            normalizzato = normalizeState(JSON.parse(e.target.result))
        } catch (err) {
            normalizzato = null
        }
        // La validazione avviene PRIMA di toccare i globali: prima venivano
        // sovrascritti dentro il try, quindi un file malformato lasciava l'app
        // in uno stato incoerente (data nuovo, setResources vecchio).
        if (!normalizzato) {
            alert("This file is not valid EasyGANTT data. Nothing has been changed.")
            event.target.value = ''
            return
        }
        if (autosaveArmed && !confirm('There is a saved draft in this browser. Loading this file will replace it. Continue?')) {
            event.target.value = ''
            return
        }
        data = normalizzato.data
        meta = normalizzato.meta
        setResources = normalizzato.setResources
        rigenSetResource()
        undoRedoManager = new UndoRedoManager(snapshot())
        autosaveArmed = true
        selectedProjectIndex = 0
        selectedPhaseIndex = 0
        selectedResourceIndex = 0
        selectedHolidayIndex = 0
        currentResourceIndex = 0
        syncWorkWeekendCheckbox()
        populateProjectsTable()
        updateChart(new GANTT(data, setResources, meta).getGantt())
        scheduleAutosave()
        event.target.value = ''
    }
    reader.readAsText(file)
}

// Applica uno stato ripristinato dalla cronologia e RIDISEGNA TUTTO. Prima
// undo() e redo() chiamavano solo populateProjectsTable(): le tabelle di fasi,
// risorse, ferie e la Delay Table restavano quelle di prima, quindi dopo un
// Undo la tabella dei ritardi mostrava ancora i valori vecchi.
function applicaStato(st){
    data = st.data
    meta = st.meta
    setResources = st.setResources
    selectedProjectIndex = st.selectedProjectIndex
    selectedPhaseIndex = st.selectedPhaseIndex
    selectedResourceIndex = st.selectedResourceIndex
    selectedHolidayIndex = st.selectedHolidayIndex
    currentResourceIndex = st.currentResourceIndex
    syncWorkWeekendCheckbox()
    populateProjectsTable()
    updateChart(new GANTT(data, setResources, meta).getGantt())
    scheduleAutosave()
}

function undo(){
    undoRedoManager.undo()
    applicaStato(undoRedoManager.getCurrentState())
}
function redo(){
    undoRedoManager.redo()
    applicaStato(undoRedoManager.getCurrentState())
}

function downloadJSON() {
    // meta.version NON viene scritta sull'oggetto vivo: era una mutazione non
    // annullabile dello stato (e finiva dentro la cronologia di undo).
    var out = {"meta": Object.assign({}, meta, {version: VERSION}),
               "data":data, "setResources": setResources }
    const json = JSON.stringify(out, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'tabella_dati.json'
    a.click()
    // La revoca immediata poteva annullare il download in alcuni browser.
    setTimeout(() => URL.revokeObjectURL(url), 0)
}


function populateProjectsTable() {
    var projectsTableBody = document.querySelector('#projectsTable tbody')
    projectsTableBody.innerHTML = ''
    data.forEach((project, index) => {
        var projectRow = document.createElement('tr')
        projectRow.innerHTML = `
            <td><input type="text" value="${esc(project.name)}" name="name" style="width: 20em" maxlength="30" onchange="updateProjectField(${index}, 'name', this.value)"></td>
            <td><input type="date" value="${esc(project.delivery)}" name="delivery" onchange="updateProjectField(${index}, 'delivery', this.value)"></td>
            <td><input type="number" value="${project.penalty}" name="penalty"  min="0" max="10" step="1" onchange="updateProjectField(${index}, 'penalty', this.value)"></td>`
        if (selectedProjectIndex === index) {
            projectRow.classList.add('selected1')
        }
        projectRow.classList.add("rowBorder")
        projectRow.addEventListener('click', function() {
          toggleProjectSelection(index)
        })
        projectsTableBody.appendChild(projectRow)
    })
    populatePhasesTable();
}

function populatePhasesTable() {
    var phasesTableBody = document.querySelector('#phasesTable tbody')
    phasesTableBody.innerHTML = ''
    var project = data[selectedProjectIndex]
    project.phases.forEach((phase, index) => {
        var phaseRow = document.createElement('tr')
        phaseRow.innerHTML = `
            <td><input type="text" name="description" value="${esc(phase.name)}" style="width: 20em" maxlength="30" onchange="updatePhaseField( ${index}, 'name', this.value)"></td>
            <td><input type="number"  name="start" value="${phase.start}" min="0" max="1" step="1" onchange="updatePhaseField( ${index}, 'start', this.value)"></td>
            <td><input type="number"  name="duration" value="${phase.duration}" min="1" max="1000" step="1" onchange="updatePhaseField( ${index}, 'duration', this.value)"></td>`
        if (selectedPhaseIndex === index) {
            phaseRow.classList.add('selected2')
        }
        phaseRow.classList.add("rowBorder")
        phaseRow.addEventListener('click', function() { togglePhaseSelection(index) })
        phasesTableBody.appendChild(phaseRow)   
    })
    populateResourcesTable()
}

function populateResourcesTable() {
    
    var resourcesTableBody = document.querySelector('#resourcesTable tbody')
    resourcesTableBody.innerHTML = ''
    var phase = data[selectedProjectIndex].phases[selectedPhaseIndex]
    phase.resources.forEach((resource, index) => {
        var stringSelect = ""
        setResources.forEach(resourceOption =>{
            if (resourceOption.name != "ALL"){
                if (resource.name === resourceOption.name){
                    stringSelect  = `${stringSelect}<option value="${esc(resourceOption.name)}"selected >${esc(resourceOption.name)}</option>\n`   
                
                }
                else{
                    stringSelect  = `${stringSelect}<option value="${esc(resourceOption.name)}">${esc(resourceOption.name)}</option>\n`  
            
                }
            }
        })
        var resourceRow = document.createElement('tr')
        resourceRow.innerHTML = `
                <td>
                    <select class="form-select" onchange="updateResourceField(${index},'name', this.value)">
                    ${stringSelect} 
                <td>
                    <input type="number" value="${resource.employed}" min="1" max="100" step="1" onchange="updateResourceField( ${index}, 'employed', this.value)">
                </td>`
        if (selectedResourceIndex === index) {
            resourceRow.classList.add('selected3')
        }   
        resourceRow.classList.add("rowBorder")
        resourceRow.addEventListener('click', function() {toggleResourceSelection(index)})
        resourcesTableBody.appendChild(resourceRow)
    })
    // Fuori dal forEach: prima veniva richiamata una volta per riga, e ogni
    // chiamata ridisegnava anche la tabella delle ferie (rendering O(n^2)).
    aggiornaRisorsaCorrente()
    populateResourcesManagerTable()
}

// Riallinea currentResourceIndex al nome della risorsa selezionata nella fase.
// Restituisce false (senza toccare l'indice) se non c'e' una selezione valida:
// findIndex puo' restituire -1, e un -1 finiva poi in setResources[-1].holidays
// facendo crashare populateHolidayTable.
function aggiornaRisorsaCorrente(){
    const fase = data[selectedProjectIndex] && data[selectedProjectIndex].phases[selectedPhaseIndex]
    const risorsa = fase && fase.resources[selectedResourceIndex]
    if (!risorsa) return false
    const trovato = setResources.findIndex(element => element.name === risorsa.name)
    if (trovato < 0) return false
    currentResourceIndex = trovato
    return true
}


function rigenSetResource() {
    // Va azzerato a ogni chiamata: prima si accumulava fra il caricamento
    // iniziale e ogni import, cosi' le risorse usate solo dal file precedente
    // restavano in setResources e comparivano come voci fantasma nella select.
    selectorSetResources = new Set()

    data.forEach(project => {
        project.phases.forEach(phase => {
            phase.resources.forEach(resource => {
                selectorSetResources.add(resource.name)
            })
        })
    })

    var resourceFind = false
    selectorSetResources.forEach(tresource => {
        setResources.forEach(resource => {
            if (tresource == resource.name)resourceFind=true
        }) 
        if (!resourceFind){
            setResources.push({
                "name":tresource,
                "holidays":[
                  ]
            })
        } 
    resourceFind = false      
    })
    setResources.forEach(resource => {
        selectorSetResources.add(resource.name)
    }) 

}

// Funzione per selezionare un progetto
function toggleProjectSelection(index) {
    
    selectedProjectIndex = index;
    selectedPhaseIndex = 0 // Resetta l'indice della fase selezionata
    selectedResourceIndex = 0
    // Evidenzia la riga selezionata
    var rows = document.querySelectorAll('#projectsTable tbody tr');
    rows.forEach((row, i) => {
        if (i === index) {
            row.classList.add('selected1')
        } else {
            row.classList.remove('selected1')
        }
    });

    // Popola la tabella delle fasi per il progetto selezionato
    populatePhasesTable()
}

// Funzione per selezionare una fase
function togglePhaseSelection(index) {
    selectedPhaseIndex = index
    selectedResourceIndex = 0

    // Evidenzia la riga selezionata
    var rows = document.querySelectorAll('#phasesTable tbody tr');
    rows.forEach((row, i) => {
        if (i === index) {
            row.classList.add('selected2');
        } else {
            row.classList.remove('selected2');
        }
    });
    populateResourcesTable()

}

function toggleResourceSelection(index) {
    selectedResourceIndex = index
   

    // Evidenzia la riga selezionata
    var rows = document.querySelectorAll('#resourcesTable tbody tr');
    rows.forEach((row, i) => {
        if (i === index) {
            row.classList.add('selected3')
        } else {
            row.classList.remove('selected3')
        }
    });
    aggiornaRisorsaCorrente()
    populateResourcesManagerTable()
    
  

}
function newProject(){
    selectedProjectIndex++
    selectedPhaseIndex = 0
    selectedResourceIndex = 0
    data.splice( selectedProjectIndex,0,{
        "name": "OVEN",
        // Data odierna, non una stringa hardcoded non-ISO ("2000-1-1"): quella
        // forma non era valida per <input type="date"> e il campo appariva
        // vuoto appena creato il progetto.
        "delivery": formatISODate(new Date()),
        "penalty": 0,
        "phases": [
            {
                "name": "DESIGN",
                "duration": 1,
                "start": 0,
                "resources": [
                    {
                        "name": "DESIGNER",
                        "employed": 100
                    }
                ]
            }
        ]
    })
    pushState()
    populateProjectsTable()
}

function cloneProject(){
    selectedProjectIndex++
    selectedPhaseIndex = 0
    selectedResourceIndex = 0
    const clonedData = structuredClone(data[selectedProjectIndex - 1])
    data.splice(selectedProjectIndex, 0, clonedData)
    pushState()
    populateProjectsTable()
}

function newPhase(){
    selectedPhaseIndex++
    selectedResourceIndex = 0
    data[selectedProjectIndex].phases.splice( selectedPhaseIndex,0, 
         
            {
                "name": "DESIGN",
                "duration": 1,
                "start": 0,
                "resources": [
                    {
                        "name": "DESIGNER",
                        "employed": 100
                    }
                ]
            }
    
    )
    pushState()
    populatePhasesTable()
}

function addResorce(){
    var setResourcesName = new Set()
    setResources.forEach(element => {setResourcesName.add(element.name)})

    data[selectedProjectIndex].phases[selectedPhaseIndex].resources.forEach(res => {
        setResourcesName.delete(res.name)})
    var firstFreeResource = setResourcesName.values().next().value
    // L'indice si incrementa solo dopo il controllo: prima veniva incrementato
    // per primo e, se non c'era nessuna risorsa libera, la funzione proseguiva
    // fino ad accedere a resources[selectedResourceIndex] fuori dall'array.
    if (firstFreeResource===undefined){
        alert("All resources are already employed!")
        return
    }
    selectedResourceIndex++
    data[selectedProjectIndex].phases[selectedPhaseIndex].resources.splice( selectedResourceIndex,0,
            {
            "name": firstFreeResource,
            "employed": 100
            }
        )
    aggiornaRisorsaCorrente()
    pushState()
    populateResourcesTable()
}

function deleteProject(){
    if (data.length > 1 && confirm("You want to delete the project?")){
        data.splice( selectedProjectIndex,1)
        if (data.length === selectedProjectIndex){
            selectedProjectIndex--
        }
        pushState()
        populateProjectsTable();
        
    } 

}

function deletePhase(){
    if (data[selectedProjectIndex].phases.length > 1 && confirm("You want to delete the phase?")){
        data[selectedProjectIndex].phases.splice( selectedPhaseIndex,1)
        if (data[selectedProjectIndex].phases.length === selectedPhaseIndex){
            selectedPhaseIndex--  
        }
        pushState()
        populatePhasesTable() 
    }
}

function removeResource(){
    if(data[selectedProjectIndex].phases[selectedPhaseIndex].resources.length > 1 && confirm("You want to delete the resource?")){
    data[selectedProjectIndex].phases[selectedPhaseIndex].resources.splice( selectedResourceIndex,1);
    if(data[selectedProjectIndex].phases[selectedPhaseIndex].resources.length ===  selectedResourceIndex){
        selectedResourceIndex--  
        
    }
    aggiornaRisorsaCorrente()
    pushState()
    populateResourcesTable()
 }
}

function upProject(){
    if (data.length > 1 && selectedProjectIndex > 0){
        const selectedData = data[selectedProjectIndex]
        data.splice( selectedProjectIndex,1)
        selectedProjectIndex--
        data.splice( selectedProjectIndex,0,selectedData)
        pushState()
        populateProjectsTable()
    } 
}

function upPhase(){
    if (data[selectedProjectIndex].phases.length  > 1 && selectedPhaseIndex > 0){
        const selectedData = data[selectedProjectIndex].phases[selectedPhaseIndex]
        data[selectedProjectIndex].phases.splice( selectedPhaseIndex,1)
        selectedPhaseIndex--
        data[selectedProjectIndex].phases.splice( selectedPhaseIndex,0,selectedData)
        if (selectedPhaseIndex === 0 ){
            data[selectedProjectIndex].phases[selectedPhaseIndex]['start'] = 0
        }
        pushState()
        populateProjectsTable()  
    } 
}
function downProject(){
    if (data.length > 1 && selectedProjectIndex < data.length-1){
        const selectedData = data[selectedProjectIndex]
        data.splice( selectedProjectIndex,1)
        selectedProjectIndex++
        data.splice( selectedProjectIndex,0,selectedData)
        pushState()
        populateProjectsTable()
    } 
}

function downPhase(){
    if (data[selectedProjectIndex].phases.length  > 1 && selectedPhaseIndex < data[selectedProjectIndex].phases.length-1){
        const selectedData = data[selectedProjectIndex].phases[selectedPhaseIndex]
        data[selectedProjectIndex].phases.splice( selectedPhaseIndex,1)
        selectedPhaseIndex++
        data[selectedProjectIndex].phases.splice( selectedPhaseIndex,0,selectedData)
        pushState()
        populateProjectsTable()  
    } 
}

function updateProjectField(index, campo, value){
    if (campo === "penalty"){
        value = Math.round(value)
        if (value >10){
            value = 10
        }
        if (value < 0){
            value = 0
        }
    }
    data[index][campo] = value
    pushState()
    populateProjectsTable()
}

function updatePhaseField(index, campo, value){
    if (campo === "duration"){
        value = Math.round(value)
        if (value >1000){
            value = 1000
        }
        // Minimo 1, coerente con min="1" dell'input. Prima era ammesso 0, ma
        // una fase di durata 0 non occupa nessuno slot e mandava fuori dai
        // limiti i cicli del motore.
        if (value < 1){
            value = 1
        }
    }
    if (campo === "start"){
        value = Math.round(value)
        if (value >1){
            value = 1
        }
        if (value < 0){
            value = 0
        }
        if (index === 0){
            value = 0
        }
    }
    data[selectedProjectIndex].phases[index][campo] = value;
    pushState()
    populatePhasesTable()
}

function updateResourceField(index, campo, value){
    var res = false
    if (campo === "employed"){
        value = Math.round(value)
        if (value >100){
            value = 100
        }
        if (value < 1){
            value = 1
        }
    }
    if (campo==="name"){
        data[selectedProjectIndex].phases[selectedPhaseIndex].resources.forEach(resource => {if(resource.name===value){res=true}})}
    if(!res){
    data[selectedProjectIndex].phases[selectedPhaseIndex].resources[index][campo] = value
    }
    else{ alert("Invald value!")}
    
    populateResourcesTable()
    aggiornaRisorsaCorrente()
    pushState()
    return value
}


function updateChart(days){
    // Se non c'e' nessun giorno (per esempio tutte le fasi sono state
    // cancellate) days[0] era undefined e la funzione lanciava. Si svuotano le
    // tabelle invece di lasciare a schermo il disegno precedente.
    if (!days || !days.length){
        ['#graphic1 thead', '#graphic1 tbody', '#graphic2 thead', '#graphic2 tbody']
            .forEach(sel => { document.querySelector(sel).innerHTML = '' })
        projectDelay = []
        populateDelayTable()
        return
    }

    var tableHead = document.querySelectorAll('#graphic2 thead')[0]
    tableHead.innerHTML = ""
    var monthHead = document.createElement('tr')
    var dayHead = document.createElement('tr')
    var monthString = ""
    var dayString = ""
    // Etichetta di ogni colonna. Si cammina in avanti di un giorno lavorativo
    // per volta: e' la stessa successione che dayNumberToDate() userebbe per
    // ogni indice, quindi l'intestazione e le barre non possono piu'
    // disallinearsi. Prima l'intestazione aveva una numerazione propria (con
    // salto di sabato e domenica) e partiva da min(oggi, creationDate), mentre
    // le barre usavano gli slot del motore: due numerazioni diverse per lo
    // stesso indice.
    var workWeekend = !!meta.workWeekend
    var newDay = epochDate(meta.creationDate, workWeekend)
    var oldMonth = newDay.getMonth()
    var spanMonth =  0
    days.forEach((day, i) => {
        dayString = dayString + "<th>"+newDay.getDate()+"</th>"
        if (newDay.getMonth()===oldMonth){spanMonth++}
        else{
            monthString = `${monthString}<th class="text-center" colspan="${spanMonth}">${oldMonth+1}</th>`
            spanMonth = 1;
            oldMonth = newDay.getMonth()
        }
        do { newDay.setDate(newDay.getDate()+1) } while (!isWorkingDay(newDay, workWeekend))
    })
    if(spanMonth!=0){
        monthString = `${monthString}<th class="text-center" colspan="${spanMonth}">${oldMonth+1}</th>` 

    }

    monthHead.innerHTML = monthString
    dayHead.innerHTML = dayString 
    tableHead.appendChild (monthHead)
    tableHead.appendChild(dayHead)
    
    var tableBody = document.querySelectorAll('#graphic2 tbody')[0]
    tableBody.innerHTML = ""
    var dayString=""
    var listPhases = []
    var deltaDay = dateToDayNumber(formatISODate(new Date()), meta.creationDate, workWeekend)
    var color = "#2855c8"
    data.forEach(project => project.phases.forEach(phase => listPhases.push(phase)))
    for (let i=1; i < days[0].used.length; i++){
        var rowData = document.createElement('tr')
        days.forEach((day, index) => {
            if (day.used[i]===1){
                if((deltaDay-index) > 0){ 
                    if (i%2===0){color="#468ac9"}else{color="#61bb34"}
                }
                else{
                    if (i%2===0){color="#2855c8"}else{color="#00ca26"}
                }
            dayString = `${dayString} <td bgcolor=${color}></td>` 
            }
            else {
                if((deltaDay-index) > 0){dayString = dayString + "<td bgcolor='#fff281'></td>"}else{dayString = dayString + "<td></td>"}
                
            }
        })
        rowData.innerHTML = dayString
        var stringResorces = ""
        listPhases[i-1].resources.forEach(res => {
            stringResorces = `${stringResorces} ${res.name}: ${res.employed}\n`
        })
        rowData.setAttribute('title', stringResorces);
        tableBody.appendChild(rowData)
        dayString=""
    }

    
    tableHead = document.querySelectorAll('#graphic1 thead')[0]
    tableHead.innerHTML = ""
    var rowHead = document.createElement('tr')
    rowHead.innerHTML="<th></th><th>Month</th>"
    tableHead.appendChild (rowHead) 
    rowHead = document.createElement('tr')
    rowHead.innerHTML="<th>Projects</th><th>Phases \\ Day</th>"
    tableHead.appendChild (rowHead)
    

    tableBody = document.querySelectorAll('#graphic1 tbody')[0]
    tableBody.innerHTML = ""

    data.forEach((project) => {            
        var tableRow = document.createElement('tr')
        tableRow.innerHTML = `<td rowspan="${project.phases.length}">${esc(project.name)}</td><td>${esc(project.phases[0].name)}</td>`
        tableBody.appendChild(tableRow);
        project.phases.forEach((phase, y) => {
            if (y!=0){
                tableRow = document.createElement('tr')
                tableRow.innerHTML = `<td>${esc(phase.name)}</td>`
                tableBody.appendChild(tableRow)
            }
        })
    })
    projectDelay = calcProjecDelay(days)
    populateDelayTable()
}

function calcProjecDelay(days){
    var result = []
    var phaseIndex = 0
    var finishDay = 0
    data.forEach((pro, index )=>{
        var scadenza = parseISODate(pro.delivery)
        phaseIndex = phaseIndex + pro.phases.length
        finishDay = days.length
        // Il limite inferiore evita di scendere a indici negativi: days[-1] e'
        // undefined, e il confronto successivo lanciava un TypeError che
        // impediva l'aggiornamento del grafico. Succedeva, per esempio, con una
        // fase di durata 0, che non compare in nessun giorno.
        while (finishDay > 0 && days[finishDay-1].used[phaseIndex-1]===0){
            finishDay--
        }
        // finishDay e' l'indice dell'ultimo slot occupato PIU' UNO, quindi
        // l'ultimo slot e' finishDay-1. Il ritardo e' la differenza fra quello
        // e lo slot della data di consegna. Prima si sottraeva calcDayDate(),
        // che contava i feriali con una base diversa (inclusiva della data
        // iniziale): le due basi non coincidevano ed e' per questo che il
        // risultato era sfasato.
        result[index] = (finishDay-1) - dateToDayNumber(formatISODate(scadenza), meta.creationDate, meta.workWeekend)
     })
    return result
}

function populateDelayTable(){
    var tableBody = document.querySelectorAll('#delay tbody')[0]
    tableBody.innerHTML = ""
    var tableRow = null
    var cost = 0
    var totalCost = 0
    data.forEach((project, index) => {   
        cost = 0         
        tableRow = document.createElement('tr')
        if (projectDelay[index] > 0){ cost = projectDelay[index]* project.penalty }
        tableRow.innerHTML = `<td>${esc(project.name)}</td><td>${projectDelay[index]}</td><td>${cost}</td>`
        totalCost = totalCost + cost
        tableBody.appendChild(tableRow)
    })
    tableRow = document.createElement('tr')
    tableRow.innerHTML = `<td>Total cost</td><td></td><td>${totalCost}</td>`
    tableBody.appendChild(tableRow)
}

function recalculateStartingToday(){
    if (confirm(`Warning! Irreversible action \n
                The start date will be set to today\n
                The old date will be deleted`)){
        salvaStatoIrreversibile()
        meta.creationDate = formatISODate(new Date())
        pushState()
        updateChart(new GANTT(data,setResources,meta).getGantt())

    }
}

function cutProjectsToday(){
    if (confirm(`Warning! Irreversible action\n
        All phases in the past will be deleted\n
        The start date will be set to today`)){
        salvaStatoIrreversibile()
        days = new GANTT(data,setResources,meta).getGantt()
    var deltaDay = dateToDayNumber(formatISODate(new Date()), meta.creationDate, meta.workWeekend)
    var listPhases = []
    var nDay = 0
    data.forEach(project => project.phases.forEach(phase => listPhases.push(phase)))
    while (((deltaDay-nDay) > 1) && (nDay < days.length)){
        days[nDay].used.forEach((res, index) => {
            if (res===1 && index!=0){
                if(listPhases[index-1].duration > 0){
                    listPhases[index-1].duration--
                }
            }
        })
        nDay++
    }
    //rimuove le fasi di rurata 0
    data.forEach(project => {
        for (var i=project.phases.length-1; i>=0; i--){
        console.log("durata",project.phases[i].duration)    
        if (project.phases[i].duration===0){
            project.phases.splice(i, 1)
        }
        }
    })
    //rimuove i profetti senza fasi
    for (var i=data.length-1; i>=0; i--){  
        if (data[i].phases.length==0){
            data.splice(i, 1)
        }
        }

    purgeHolidayPast()
    var today= new Date()
    if(today.getDay()===0 ) today.setDate(today.getDate()+1)
    if(today.getDay()===6 ) today.setDate(today.getDate()+2)
    meta.creationDate = formatISODate(today)
    populateProjectsTable()
    updateChart(new GANTT(data,setResources,meta).getGantt())
    pushState()
    populateDelayTable()
}
}

function purgeHolidayPast(){
    var today= parseISODate(meta.creationDate)
    var workWeekend = !!meta.workWeekend
    setResources.forEach(res=> {
        for (var x = res.holidays.length-1; x>=0; x--){
        var start = parseISODate(res.holidays[x].startDate)
        var duration = res.holidays[x].duration
            if (today > start){
                for (var i=0; i<duration; i++){
                    // L'aggiustamento del weekend va calcolato sul giorno che si
                    // sta scandendo (`start`), non sul giorno di oggi: prima
                    // usava today.getDay(), costante per tutto il ciclo, e le
                    // ferie a cavallo del weekend venivano accorciate o
                    // allungate in modo casuale.
                    do { start.setDate(start.getDate()+1) } while (!isWorkingDay(start, workWeekend))
                }
                if (start< today) res.holidays.splice(x,1)
            }
        }
    })
}




function populateResourcesManagerTable(){
    var holidayTableBody = document.querySelector('#resourcemanager tbody')
    holidayTableBody.innerHTML = ''
    setResources.forEach((element, index) => {
        var calendarRow = document.createElement('tr')
        calendarRow.innerHTML = `
                <td>${esc(element.name)}</td>`
                if (index === currentResourceIndex) {
                    calendarRow.classList.add('selected1')
                }
            calendarRow.classList.add("rowBorder")
            calendarRow.addEventListener('click', function() {toggleResourceManagerTable(index)})
            holidayTableBody.appendChild(calendarRow)

        
    })
    populateHolidayTable() 
}

function populateHolidayTable(){
    var holidayTableBody = document.querySelector('#holidaytable tbody')
    holidayTableBody.innerHTML = ''
    // Guardia su un indice non valido: currentResourceIndex poteva restare
    // fuori dall'array (per esempio dopo una cancellazione) e l'accesso a
    // setResources[-1].holidays lanciava.
    if (!setResources[currentResourceIndex]) return
    setResources[currentResourceIndex].holidays.forEach((holiday, index) =>{  
            var calendarRow = document.createElement('tr')
                calendarRow.innerHTML = `
                <td><input type="date" value="${esc(holiday.startDate)}" name="startDate" onchange="updateCalendarField(${index}, 'startDate', this.value)"></td>
                <td><input type="number" value="${holiday.duration}" name="duration"  min="0" max="200" step="1" onchange="updateCalendarField(${index}, 'duration', parseInt(this.value))"></td>
                <td><input type="number" value="${holiday.employed}" name="employed"  min="0" max="100" step="1" onchange="updateCalendarField(${index}, 'employed', parseInt(this.value))"></td>`
                if (selectedHolidayIndex === index) {
                    calendarRow.classList.add('selected2')
                }
            calendarRow.classList.add("rowBorder")
            calendarRow.addEventListener('click', function() {toggleCalendarSelection(index)})
            holidayTableBody.appendChild(calendarRow)
            }) 
}




function toggleResourceManagerTable(index) {

    currentResourceIndex = index;
    // Evidenzia la riga selezionata
    var rows = document.querySelectorAll('#resourcemanager tbody tr');
    rows.forEach((row, i) => {
        if (i === index) {
            row.classList.add('selected1')
        } else {
            row.classList.remove('selected1')
        }
    });
    populateHolidayTable()
}

function toggleCalendarSelection(index) {

    selectedHolidayIndex = index;
    // Evidenzia la riga selezionata
    var rows = document.querySelectorAll('#holidaytable tbody tr');
    rows.forEach((row, i) => {
        if (i === index) {
            row.classList.add('selected2')
        } else {
            row.classList.remove('selected2')
        }
    });
    //populateHolidayTable()
}

function updateCalendarField(index, campo, value){
    setResources[currentResourceIndex].holidays[index][campo] = value
    pushState()
    populateHolidayTable()
}

function newResource(){
    var name = prompt("Please insert new resource name!", "ELECTRICIAN")
    // prompt restituisce null se l'utente annulla: senza questo controllo
    // veniva creata una risorsa con nome null (e la select mostrava "null").
    if (name === null || name.trim() === '') return
    var res = setResources.find(function (element) {
        return element.name == name})
    // Il ritorno anticipato evita di registrare uno stato di undo identico al
    // precedente quando non e' cambiato nulla: un Undo sembrerebbe non fare
    // niente pur consumando un livello di cronologia.
    if (!(res===undefined)){
        alert("Invalid name because it already exists!")
        return
    }
    currentResourceIndex++
    setResources.splice( currentResourceIndex,0,
            {
            "name": name,
            "holidays": []
            }
        )
    pushState()
    populateResourcesTable()
}


function sortHoliday() {
    // Per ogni oggetto all'interno dell'array setResources
    setResources.forEach(function(resource) {
      // Ordina la lista di ferie 'holiday' in base alla data di inizio 'startDate'
      resource.holidays.sort(function(a, b) {
        // Confronta le date di inizio
        return parseISODate(a.startDate) - parseISODate(b.startDate);
      });
    });
    // L'ordinamento cambia lo stato: va registrato, altrimenti non e' annullabile.
    pushState()
    populateHolidayTable()
  }

  function sortSetResource() {
    // Un comparatore deve restituire un intero negativo/positivo/zero. Prima
    // restituiva un booleano (a.name > b.name), quindi l'ordinamento era di
    // fatto arbitrario.
    setResources.sort(function(a, b) {
        return a.name.localeCompare(b.name)
    });
    pushState()
    // Ridisegna il Resource Manager, che e' la tabella che l'utente sta
    // guardando: prima veniva ridisegnata la tabella delle risorse della fase.
    populateResourcesManagerTable()
  }

function newHoliday(){
    setResources[currentResourceIndex].holidays.splice( selectedHolidayIndex,0, 
            {
                "startDate": formatISODate(new Date()),
                "duration": 1,
                "employed": 100
            }
    
    )
    pushState()
    populateHolidayTable()
}

function deleteResource(){
    
    var found = false
    data.some(project => {
        project.phases.some(phase => {
            phase.resources.some(resource => {
                if(setResources[currentResourceIndex].name == resource.name){
                    found=true
                    return found
                }
            })
        })
    })
    // I ritorni anticipati evitano di registrare uno stato di undo identico al
    // precedente quando la cancellazione non avviene (risorsa in uso, oppure
    // conferma rifiutata): l'Undo sembrerebbe non fare niente.
    if (found){
        window.alert("The resource is in use. Command canceled!")
        return
    }
    if (setResources.length === 0){
        window.alert("Nothing to delete!")
        return
    }
    if (!confirm("You want to delete the resource?")) return
    setResources.splice(currentResourceIndex,1)
    if(currentResourceIndex > 0)currentResourceIndex--
    pushState()
    populateResourcesManagerTable()
}


function deleteHoliday(){
    if (setResources[currentResourceIndex].holidays.length === 0) return
    // Prima il messaggio chiedeva conferma per cancellare un PROGETTO.
    if (!confirm("You want to delete the holiday?")) return
    setResources[currentResourceIndex].holidays.splice( selectedHolidayIndex,1)
    if (selectedHolidayIndex > 0) selectedHolidayIndex--
    pushState()
    populateHolidayTable()
}



function info(){ 
    window.alert(
    'EasyGANTT is a program for managing projects \n'+ 
    'Copyright (C) 2024 Paolo Zambetti. Conctat Him on Github.com\n \n'+

    'This program is free software: you can redistribute it and/or modify \n'+
    'it under the terms of the GNU General Public License as published by\n'+
    'the Free Software Foundation, either version 3 of the License, or\n'+
    '(at your option) any later version.\n\n'+

    'This program is distributed in the hope that it will be useful,\n'+
    'but WITHOUT ANY WARRANTY; without even the implied warranty of \n'+
    'MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the \n'+
    'GNU General Public License for more details. \n\n'+

    'You should have received a copy of the GNU General Public License \n'+
    'along with this program.  If not, see <https://www.gnu.org/licenses/>.')
    }