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


const PARALLEL = 0
const SEQUENCE = 1

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

// Unico punto in cui si decide cosa e' un giorno lavorativo.
function isWorkingDay(date, workWeekend) {
    if (workWeekend) return true
    const g = date.getDay()
    return g !== 0 && g !== 6
}

// Primo giorno lavorativo >= creationDate. Con workWeekend l'epoch e'
// creationDate stessa, qualunque giorno sia.
function epochDate(creationDate, workWeekend) {
    const d = parseISODate(creationDate)
    while (!isWorkingDay(d, workWeekend)) d.setDate(d.getDate() + 1)
    return d
}

// Indice dello slot che contiene `value`. 0 = epoch, negativo se precedente.
// Inversa esatta di dayNumberToDate.
function dateToDayNumber(value, creationDate, workWeekend) {
    const epoch = epochDate(creationDate, workWeekend)
    const target = parseISODate(value)
    const cursore = new Date(epoch)
    let n = 0
    while (cursore < target) {
        if (isWorkingDay(cursore, workWeekend)) n++
        cursore.setDate(cursore.getDate() + 1)
    }
    while (cursore > target) {
        cursore.setDate(cursore.getDate() - 1)
        if (isWorkingDay(cursore, workWeekend)) n--
    }
    return n
}

// Data del giorno lavorativo numero `n`. Inversa esatta di dateToDayNumber.
function dayNumberToDate(n, creationDate, workWeekend) {
    const d = epochDate(creationDate, workWeekend)
    let k = 0
    while (k < n) {
        d.setDate(d.getDate() + 1)
        if (isWorkingDay(d, workWeekend)) k++
    }
    while (k > n) {
        d.setDate(d.getDate() - 1)
        if (isWorkingDay(d, workWeekend)) k--
    }
    return d
}


class GANTT{

    constructor(data, setResources,meta){
        this.data = data
        this.setResources = setResources
        this.meta = meta
        // Unica fonte di verita' per la conversione date <-> indici di slot.
        // `meta.workWeekend` assente significa false: i file salvati prima di
        // questa versione si ricaricano esattamente come prima.
        this.creationDate = meta.creationDate
        this.workWeekend = !!meta.workWeekend
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
        return dateToDayNumber(date, this.creationDate, this.workWeekend)
    }

    getGantt(){
        console.log(this.solution)
        return this.solution
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
            if (index!=0){ //cerca il giorno in cui cominciare a inserire la fase se PARALLEL
                if (phase.start===PARALLEL){
                    currentDay = 0
                    // Il limite superiore evita il TypeError che si aveva quando
                    // la fase precedente non compariva in nessun giorno (per
                    // esempio una fase di durata 0): senza limite l'indice
                    // usciva dall'array e this.solution[currentDay] era undefined.
                    while (currentDay < this.solution.length &&
                           this.solution[currentDay].used[this.phaseIndex-1]===0){currentDay++}
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
            this.phaseIndex++
        })    
   } 
}