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


// start delle fasi:
//   0  = inizio della fase precedente (per la prima: inizio progetto)
//   1  = dopo la fine della fase precedente
//   -n = inizio della (n+1)-esima fase precedente
//        (-1 = due posti indietro, -2 = tre posti indietro, ...)
const PARALLEL = 0
const SEQUENCE = 1

/* Quota delle risorse usata dalla coda di incertezza, rispetto all'impiego
   della fase base. Con una base al 100% la coda vale 50: sommata a un'altra
   fase al 50% resta dentro il tetto del 100% del motore, mentre accostata al
   grafico base rappresenta la sovrapposizione 100% + 50% = 150%. Il tetto
   dell'algoritmo non cambia. */
const UNCERTAINTY_RESOURCE_SHARE = 0.5

/* ---------------------------------------------------------------------------
   Helper puri di calendario.

   Unita' di misura unica: uno "slot" di this.solution = un giorno lavorativo.
   Queste funzioni sono l'unica fonte di verita' per convertire fra date di
   calendario e indici di slot. Prima esistevano tre conversioni diverse
   (GANTT.dateToDayNumber, calcDayDate, e il ciclo in updateChart) che usavano
   tre basi diverse per lo stesso indice, e le ferie finivano disegnate sul
   giorno sbagliato.

   Nota su perche' non si usa new Date("YYYY-MM-DD"): quella forma viene
   interpretata come mezzanotte UTC, mentre getDay()/getDate()/setDate()
   lavorano in ora locale. Per un utente a ovest di Greenwich il giorno della
   settimana risulterebbe sbagliato di uno, e con esso tutto il conteggio dei
   feriali. parseISODate costruisce invece la data in ora locale.
--------------------------------------------------------------------------- */

function parseISODate(value) {
    if (value instanceof Date) {
        return new Date(value.getFullYear(), value.getMonth(), value.getDate())
    }
    const parti = String(value).split('-')
    return new Date(parseInt(parti[0], 10), parseInt(parti[1], 10) - 1, parseInt(parti[2], 10))
}

function formatISODate(date) {
    const anno = date.getFullYear()
    const mese = String(date.getMonth() + 1).padStart(2, '0')
    const giorno = String(date.getDate()).padStart(2, '0')
    return `${anno}-${mese}-${giorno}`
}

/* Giorni lavorativi: una lista di 7 flag, un flag alzato significa giorno
   lavorativo. L'indice e' quello di Date.getDay(), 0 = domenica ... 6 = sabato,
   cosi' la lista salvata nel JSON si legge con lo stesso indice che usa il
   calendario. Sostituisce il vecchio interruttore booleano "workWeekend", che
   ammetteva solo due configurazioni: lunedi'-venerdi' oppure tutti i giorni. */
const DEFAULT_WORKING_DAYS = [false, true, true, true, true, true, false]
const ALL_WORKING_DAYS = [true, true, true, true, true, true, true]

// Riporta una lista qualsiasi a 7 flag booleani con almeno un giorno
// lavorativo. Una lista vuota o tutta a false non e' utilizzabile: i cicli di
// conversione fra date e slot non troverebbero mai un giorno lavorativo e non
// terminerebbero. Restituisce sempre una copia, cosi' chi la modifica non
// tocca l'oggetto conservato in meta.
function normalizzaGiorniLavorativi(lista) {
    if (Array.isArray(lista) && lista.length === 7 && lista.some(Boolean)) {
        return lista.map(Boolean)
    }
    return DEFAULT_WORKING_DAYS.slice()
}

// Traduce il meta di un file (o della bozza) nella lista di 7 flag. I file
// scritti prima di questa versione portavano il solo interruttore booleano
// "workWeekend": alzato significava "tutti i giorni sono lavorativi", abbassato
// (o assente) lunedi'-venerdi'.
function giorniLavorativiDaMeta(rawMeta) {
    const meta = rawMeta || {}
    if (Array.isArray(meta.workingDays)) return normalizzaGiorniLavorativi(meta.workingDays)
    if (meta.workWeekend) return ALL_WORKING_DAYS.slice()
    return DEFAULT_WORKING_DAYS.slice()
}

// Unico punto in cui si decide cosa e' un giorno lavorativo. La lista viene
// normalizzata qui e non solo a monte: cosi' nessuna chiamata puo' bloccare un
// ciclo per una lista assente o malformata.
function isWorkingDay(date, workingDays) {
    return normalizzaGiorniLavorativi(workingDays)[date.getDay()]
}

// Primo giorno lavorativo >= creationDate.
function epochDate(creationDate, workingDays) {
    const d = parseISODate(creationDate)
    while (!isWorkingDay(d, workingDays)) d.setDate(d.getDate() + 1)
    return d
}

// Indice dello slot che contiene `value`. 0 = epoch, negativo se precedente.
// Inversa esatta di dayNumberToDate.
function dateToDayNumber(value, creationDate, workingDays) {
    const epoch = epochDate(creationDate, workingDays)
    const target = parseISODate(value)
    const cursore = new Date(epoch)
    let n = 0
    while (cursore < target) {
        if (isWorkingDay(cursore, workingDays)) n++
        cursore.setDate(cursore.getDate() + 1)
    }
    while (cursore > target) {
        cursore.setDate(cursore.getDate() - 1)
        if (isWorkingDay(cursore, workingDays)) n--
    }
    return n
}

// Data del giorno lavorativo numero `n`. Inversa esatta di dateToDayNumber.
function dayNumberToDate(n, creationDate, workingDays) {
    const d = epochDate(creationDate, workingDays)
    let k = 0
    while (k < n) {
        d.setDate(d.getDate() + 1)
        if (isWorkingDay(d, workingDays)) k++
    }
    while (k > n) {
        d.setDate(d.getDate() - 1)
        if (isWorkingDay(d, workingDays)) k--
    }
    return d
}


class GANTT{

    constructor(data, setResources,meta){
        this.data = data
        this.setResources = setResources
        this.meta = meta
        // Unica fonte di verita' per la conversione date <-> indici di slot.
        // I giorni lavorativi si normalizzano qui, all'ingresso del motore: un
        // chiamante che passa un meta senza il campo (o con una lista
        // malformata) non puo' bloccare i cicli di conversione.
        this.creationDate = meta.creationDate
        this.workingDays = giorniLavorativiDaMeta(meta)
        this.uncertaintyShare = UNCERTAINTY_RESOURCE_SHARE
        this.phaseIndex = 1
        this.numberOfPhases = 0
        this.setNumberOfPhases()
        this.solution = []//array di giorni
        this.resourcesEmployed = new Set()
        this.setResourcesEmployed()
        this.setResources.forEach(resource => this.insertHoliday(resource))
        this.data.forEach(project => this.insertProject(project))
    }

    setNumberOfPhases(){
        this.numberOfPhases = 1
        // this.data, non la variabile globale `data`: funzionava solo perche'
        // coincidevano, e si rompeva su qualunque istanza costruita con dati
        // diversi da quelli caricati al momento.
        this.data.forEach(project =>{
            this.numberOfPhases = this.numberOfPhases + project.phases.length
        })

    }

    setResourcesEmployed(){
        this.setResources.forEach(resource => 
                    this.resourcesEmployed.add(resource.name)
        )
        //console.log(this.setResources)
    }

    getNewDay(){
        const map = new Map()
        this.resourcesEmployed.forEach(res => map.set(res, 0))
        var day = {used: [], resource: map}
        //console.log(this.numberOfPhases)
        for (let i=0; i<this.numberOfPhases; i++){
            day.used.push(0);   
        }
        return day
    }

    // Converte una data nell'indice dello slot che la contiene. Prima questa
    // funzione usava le variabili globali `meta` e una propria conversione
    // basata sulla differenza in millisecondi: quest'ultima era corretta solo
    // perche' entrambe le date erano a mezzanotte UTC, ma non contava i giorni
    // feriali allo stesso modo di calcDayDate (in EasyGANTT.js) e del ciclo in
    // updateChart, e per questo le ferie finivano disegnate un giorno piu' in
    // la'. Ora delega all'helper condiviso.
    dateToDayNumber(date){
        return dateToDayNumber(date, this.creationDate, this.workingDays)
    }

    // Primo giorno occupato da una fase (indice globale di used[]). Serve
    // alle fasi che partono all'inizio di una fase precedente.
    primoGiornoUso(usedIndex){
        for (let d = 0; d < this.solution.length; d++){
            if (this.solution[d].used[usedIndex] !== 0) return d
        }
        return 0
    }

    getGantt(){
        this.extendToDeliveries()
        return this.solution
    }

    // Allunga il grafico fino all'ultima consegna. Senza questo, una consegna
    // successiva all'ultima fase non aveva una colonna su cui disegnare la
    // barra rossa (e la data non compariva affatto nell'intestazione). I giorni
    // aggiunti sono vuoti: non spostano la fine delle fasi ne' i ritardi,
    // perche' calcProjecDelay ignora gli slot finali non occupati.
    extendToDeliveries(){
        var lastDelivery = -1
        this.data.forEach(project => {
            var slot = this.dateToDayNumber(project.delivery)
            if (slot > lastDelivery) lastDelivery = slot
        })
        while (this.solution.length <= lastDelivery){
            this.solution.push(this.getNewDay())
        }
    }

    insertHoliday(resource){
        resource.holidays.forEach((holiday) => {
            var dayNumberStart = this.dateToDayNumber(holiday.startDate)
            var duration = holiday.duration
            if(dayNumberStart < 0 && dayNumberStart + holiday.duration >=0){
                duration = dayNumberStart + holiday.duration
                dayNumberStart = 0
            }
            if (dayNumberStart < 0) return
            var dayNumberFinish = dayNumberStart + duration
            for (let currentDay = 0; currentDay < dayNumberFinish;currentDay++){
                if (this.solution.length <= currentDay){
                    this.solution[currentDay] = this.getNewDay()
                }
                const day = this.solution[currentDay]
                if (currentDay < dayNumberStart) continue
                day.used[0] = 1
                // Math.min su UNA sola somma. Prima la percentuale veniva
                // sommata due volte nel test del cap (emp + employed, con emp
                // che conteneva gia' employed) e il tetto del 100% non
                // funzionava: una risorsa gia' al 50% con una ferie al 30%
                // finiva al 100 invece che all'80%.
                //
                // Si scrive sempre su `day`. Prima il ramo "ALL" scriveva su
                // `newDay`, che e' una variabile dell'ultimo giorno creato, non
                // del giorno corrente: funzionava per caso solo perche' le
                // ferie di "ALL" sono le prime e creano i giorni man mano.
                if (resource.name == "ALL"){
                    this.resourcesEmployed.forEach(nome =>{
                        day.resource.set(nome, Math.min(100, day.resource.get(nome) + holiday.employed))
                    })
                }
                else{
                    day.resource.set(resource.name,
                        Math.min(100, day.resource.get(resource.name) + holiday.employed))
                }
            }
        })
    }


    insertProject(project){
        var currentDay = 0
        project.phases.forEach((phase, index) => {
            if (index != 0){
                const s = Math.round(Number(phase.start) || 0)
                if (s === SEQUENCE){
                    // currentDay resta dopo la fine della fase precedente.
                }
                else if (s <= 0){
                    // 0 = inizio della precedente; -1 = due posti indietro;
                    // -2 = tre posti indietro; e cosi' via. Il riferimento e'
                    // sempre a una fase gia' schedulata, quindi niente cicli.
                    const k = 1 - s
                    const rif = this.phaseIndex - k
                    const primoProgetto = this.phaseIndex - index
                    currentDay = rif >= primoProgetto ? this.primoGiornoUso(rif) : 0
                }
                else {
                    // Valore non valido (la validazione lo impedisce): si
                    // riparte dall'inizio del progetto.
                    currentDay = 0
                }
            }
            for(let i = 0; i < phase.duration; i++){
                do{
                    var isFree = true
                    var emp = 0
                    if (this.solution.length <= currentDay){
                        isFree = true
                        var newDay = this.getNewDay()
                        newDay.used[this.phaseIndex] = 1
                        // Il consumo di risorse va registrato anche sul giorno
                        // appena creato. Prima qui c'era un forEach VUOTO, quindi
                        // una fase che occupava un giorno nuovo non registrava
                        // nulla: la risorsa risultava libera e le fasi seguenti
                        // le si sovrapponevano, sommando impieghi oltre il 100%.
                        // Il difetto restava nascosto solo quando le ferie
                        // avevano gia' creato i giorni in anticipo.
                        phase.resources.forEach(res => {
                            newDay.resource.set(res.name, res.employed)
                        })
                        this.solution[currentDay] = newDay
                    }
                    else{
                        // La disponibilita' si valuta su TUTTE le risorse prima
                        // di avanzare di un giorno. Prima l'incremento stava
                        // dentro il forEach delle risorse: con due risorse gia'
                        // occupate il giorno avanzava di due in un colpo solo e
                        // la fase scavalchia giorni liberi. Inoltre la
                        // percentuale veniva riletta su un indice ormai cambiato.
                        isFree = phase.resources.every(res =>
                            (res.employed + this.solution[currentDay].resource.get(res.name)) <= 100)
                        if  (isFree){
                            phase.resources.forEach(res => {
                                emp = this.solution[currentDay].resource.get(res.name)
                                this.solution[currentDay].resource.set(res.name, (res.employed + emp))
                            })
                            this.solution[currentDay].used[this.phaseIndex]=1
                        }
                        else{
                            currentDay++
                        }
                    }
                }
                while (!isFree)
                currentDay++
            }
            // Coda di incertezza: e' una fase in piu' attaccata alla base, con
            // una quota ridotta delle stesse risorse. Il numero di giorni e'
            // gia' stato decurtato dal tempo trascorso (uncertaintyRemaining),
            // quindi qui il motore non ha bisogno di sapere che giorno e' oggi.
            // used = 2 distingue la coda dalla base (used = 1) nel disegno.
            var giorniIncertezza = Math.max(0, Math.round(Number(phase.uncertaintyRemaining) || 0))
            for (let i = 0; i < giorniIncertezza; i++){
                do{
                    isFree = true
                    if (this.solution.length <= currentDay){
                        var newDayIncertezza = this.getNewDay()
                        newDayIncertezza.used[this.phaseIndex] = 2
                        phase.resources.forEach(res => {
                            newDayIncertezza.resource.set(
                                res.name, res.employed * this.uncertaintyShare)
                        })
                        this.solution[currentDay] = newDayIncertezza
                    }
                    else{
                        isFree = phase.resources.every(res =>
                            (res.employed * this.uncertaintyShare +
                             this.solution[currentDay].resource.get(res.name)) <= 100)
                        if (isFree){
                            phase.resources.forEach(res => {
                                var impiego = this.solution[currentDay].resource.get(res.name)
                                this.solution[currentDay].resource.set(
                                    res.name, impiego + res.employed * this.uncertaintyShare)
                            })
                            this.solution[currentDay].used[this.phaseIndex] = 2
                        }
                        else{
                            currentDay++
                        }
                    }
                }
                while (!isFree)
                currentDay++
            }
            this.phaseIndex++
        })
   }
}
