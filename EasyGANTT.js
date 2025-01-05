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



const VERSION = {"major":0, "minor":4, "patch":0}
var projectDelay = []
var selectedProjectIndex = 0
var selectedPhaseIndex = 0
var selectedResourceIndex = 0
var selectedHolidayIndex = 0
var currentResourceIndex = 0
var dataLimiteMax ="2025-01-01"
var dataLimiteMin ="2025-01-01"
var selectorSetResources = new Set()
rigenSetResource()
var undoRedoManager = new UndoRedoManager({
    "data":data, 
    "meta":meta, 
    "setResources":setResources,
    "selectedProjectIndex":selectedProjectIndex,
    "selectedPhaseIndex":selectedPhaseIndex,
    "selectedResourceIndex":selectedResourceIndex,
    "selectedHolidayIndex":selectedHolidayIndex,
    "currentResourceIndex":currentResourceIndex
})
limitDate()


function version() {
    document.getElementById('version').textContent =`Version: ${VERSION.major}.${VERSION.minor}.${VERSION.patch}`
}


function handleFileUpload(event) {
    limitDate()
    const file = event.target.files[0]
    if (file && file.type === 'application/json') {
        const reader = new FileReader()
        reader.onload = function(e) {
            try {
                var res = JSON.parse(e.target.result)
                data = res.data
                meta = res.meta
                setResources = res.setResources
                rigenSetResource()
                undoRedoManager = new UndoRedoManager({
                    "data":data, 
                    "meta":meta, 
                    "setResources":setResources,
                    "selectedProjectIndex":selectedProjectIndex,
                    "selectedPhaseIndex":selectedPhaseIndex,
                    "selectedResourceIndex":selectedResourceIndex,
                    "selectedHolidayIndex":selectedHolidayIndex,
                    "currentResourceIndex":currentResourceIndex
                })
                populateProjectsTable()
                setHolidayTitle()
                updateChart(new GANTT(data,setResources,meta).getGantt())
            } catch (err) {
                alert("Errore nel parsing del file JSON.")
            }
        }
        reader.readAsText(file)
    } 
    else {
        alert("Per favore, carica un file JSON valido.")
    }
}

function undo(){
    undoRedoManager.undo()
    var st = undoRedoManager.getCurrentState()
    data = st.data
    meta = st.meta
    setResources = st.setResources
    selectedProjectIndex = st.selectedProjectIndex
    selectedPhaseIndex = st.selectedPhaseIndex
    selectedResourceIndex = st.selectedResourceIndex
    selectedHolidayIndex = st.selectedHolidayIndex
    currentResourceIndex = st.currentResourceIndex
    populateProjectsTable()

}
function redo(){
    undoRedoManager.redo()
    var st = undoRedoManager.getCurrentState()
    data = st.data
    meta = st.meta
    setResources = st.setResources
    selectedProjectIndex = st.selectedProjectIndex
    selectedPhaseIndex = st.selectedPhaseIndex
    selectedResourceIndex = st.selectedResourceIndex
    selectedHolidayIndex = st.selectedHolidayIndex
    currentResourceIndex = st.currentResourceIndex
    populateProjectsTable()
}

function downloadJSON() {
    meta.version = VERSION
    
    var out = {"meta":meta, "data":data, "setResources": setResources }
    const json = JSON.stringify(out, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'tabella_dati.json'
    a.click()
    URL.revokeObjectURL(url)
}


function populateProjectsTable() {
    var projectsTableBody = document.querySelector('#projectsTable tbody')
    projectsTableBody.innerHTML = ''
    data.forEach((project, index) => {
        var projectRow = document.createElement('tr')
        projectRow.innerHTML = `
            <td><input type="text" value="${project.name}" name="name" style="width: 20em" maxlength="30" onchange="updateProjectField(${index}, 'name', this.value)"></td>
            <td><input type="date" value="${project.delivery}" name="delivery" max="${dataLimiteMax}" min="${dataLimiteMin}" onchange="updateProjectField(${index}, 'delivery', this.value)"></td>
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
            <td><input type="text" name="description" value="${phase.name}" style="width: 20em" maxlength="30" onchange="updatePhaseField( ${index}, 'name', this.value)"></td>
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
                    stringSelect  = `${stringSelect}<option value="${resourceOption.name}"selected >${resourceOption.name}</option>\n`   
                
                }
                else{
                    stringSelect  = `${stringSelect}<option value="${resourceOption.name}">${resourceOption.name}</option>\n`  
            
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
        currentResourceIndex = setResources.findIndex((element) => element.name == data[selectedProjectIndex].phases[selectedPhaseIndex].resources[selectedResourceIndex].name)
        populateResourcesManagerTable()
    })
}


function rigenSetResource() {
    
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
    currentResourceIndex = setResources.findIndex((element) => element.name == data[selectedProjectIndex].phases[selectedPhaseIndex].resources[selectedResourceIndex].name)
    populateResourcesManagerTable()
    
  

}
function newProject(){
    selectedProjectIndex++
    selectedPhaseIndex = 0
    selectedResourceIndex = 0
    data.splice( selectedProjectIndex,0,{
        "name": "OVEN",
        "delivery": "2000-1-1",
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
    undoRedoManager.updateState({ 
        "data":data,
        "meta":meta, 
        "setResources":setResources,
        "selectedProjectIndex":selectedProjectIndex,
        "selectedPhaseIndex":selectedPhaseIndex,
        "selectedResourceIndex":selectedResourceIndex,
        "selectedHolidayIndex":selectedHolidayIndex,
        "currentResourceIndex":currentResourceIndex
    })
    populateProjectsTable()
}

function cloneProject(){
    selectedProjectIndex++
    selectedPhaseIndex = 0
    selectedResourceIndex = 0
    const clonedData = structuredClone(data[selectedProjectIndex - 1])
    data.splice(selectedProjectIndex, 0, clonedData)
    undoRedoManager.updateState({ 
        "data":data,
        "meta":meta, 
        "setResources":setResources,
        "selectedProjectIndex":selectedProjectIndex,
        "selectedPhaseIndex":selectedPhaseIndex,
        "selectedResourceIndex":selectedResourceIndex,
        "selectedHolidayIndex":selectedHolidayIndex,
        "currentResourceIndex":currentResourceIndex
    })
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
    undoRedoManager.updateState({
        "data":data, 
        "meta":meta, 
        "setResources":setResources,
        "selectedProjectIndex":selectedProjectIndex,
        "selectedPhaseIndex":selectedPhaseIndex,
        "selectedResourceIndex":selectedResourceIndex,
        "selectedHolidayIndex":selectedHolidayIndex,
        "currentResourceIndex":currentResourceIndex
    })
    populatePhasesTable()
}

function addResorce(){
    var setResourcesName = new Set()
    setResources.forEach(element => {setResourcesName.add(element.name)})

    selectedResourceIndex++
    data[selectedProjectIndex].phases[selectedPhaseIndex].resources.forEach(res => {
        setResourcesName.delete(res.name)})
    var firstFreeResource = setResourcesName.values().next().value
    if (firstFreeResource===undefined){ 
        alert("All resources are already employed!")  
    }
    else{
        data[selectedProjectIndex].phases[selectedPhaseIndex].resources.splice( selectedResourceIndex,0, 
                {
                "name": firstFreeResource,
                "employed": 100
                }
            )
    }
    currentResourceIndex = setResources.findIndex((element) => element.name == data[selectedProjectIndex].phases[selectedPhaseIndex].resources[selectedResourceIndex].name)
    undoRedoManager.updateState({ 
        "data":data,
        "meta":meta, 
        "setResources":setResources,
        "selectedProjectIndex":selectedProjectIndex,
        "selectedPhaseIndex":selectedPhaseIndex,
        "selectedResourceIndex":selectedResourceIndex,
        "selectedHolidayIndex":selectedHolidayIndex,
        "currentResourceIndex":currentResourceIndex
    })
    populateResourcesTable()
}

function deleteProject(){
    if (data.length > 1 && confirm("You want to delete the project?")){
        data.splice( selectedProjectIndex,1)
        if (data.length === selectedProjectIndex){
            selectedProjectIndex--
        }
        undoRedoManager.updateState({
            "data":data, 
            "meta":meta, 
            "setResources":setResources,
            "selectedProjectIndex":selectedProjectIndex,
            "selectedPhaseIndex":selectedPhaseIndex,
            "selectedResourceIndex":selectedResourceIndex,
            "selectedHolidayIndex":selectedHolidayIndex,
            "currentResourceIndex":currentResourceIndex
        })
        populateProjectsTable();
        
    } 

}

function deletePhase(){
    if (data[selectedProjectIndex].phases.length > 1 && confirm("You want to delete the phase?")){
        data[selectedProjectIndex].phases.splice( selectedPhaseIndex,1)
        if (data[selectedProjectIndex].phases.length === selectedPhaseIndex){
            selectedPhaseIndex--  
        }
        undoRedoManager.updateState({ 
            "data":data,
            "meta":meta, 
            "setResources":setResources,
            "selectedProjectIndex":selectedProjectIndex,
            "selectedPhaseIndex":selectedPhaseIndex,
            "selectedResourceIndex":selectedResourceIndex,
            "selectedHolidayIndex":selectedHolidayIndex,
            "currentResourceIndex":currentResourceIndex
        })
        populatePhasesTable() 
    }
}

function removeResource(){
    if(data[selectedProjectIndex].phases[selectedPhaseIndex].resources.length > 1 && confirm("You want to delete the resource?")){
    data[selectedProjectIndex].phases[selectedPhaseIndex].resources.splice( selectedResourceIndex,1);
    if(data[selectedProjectIndex].phases[selectedPhaseIndex].resources.length ===  selectedResourceIndex){
        selectedResourceIndex--  
        
    }
    currentResourceIndex = setResources.findIndex((element) => element.name == data[selectedProjectIndex].phases[selectedPhaseIndex].resources[selectedResourceIndex].name)
    undoRedoManager.updateState({ 
        "data":data,
        "meta":meta, 
        "setResources":setResources,
        "selectedProjectIndex":selectedProjectIndex,
        "selectedPhaseIndex":selectedPhaseIndex,
        "selectedResourceIndex":selectedResourceIndex,
        "selectedHolidayIndex":selectedHolidayIndex,
        "currentResourceIndex":currentResourceIndex
    })
    populateResourcesTable()
 }
}

function upProject(){
    if (data.length > 1 && selectedProjectIndex > 0){
        selectedData = data[selectedProjectIndex]
        data.splice( selectedProjectIndex,1)
        selectedProjectIndex--
        data.splice( selectedProjectIndex,0,selectedData)
        undoRedoManager.updateState({ 
            "data":data,
            "meta":meta, 
            "setResources":setResources,
            "selectedProjectIndex":selectedProjectIndex,
            "selectedPhaseIndex":selectedPhaseIndex,
            "selectedResourceIndex":selectedResourceIndex,
            "selectedHolidayIndex":selectedHolidayIndex,
            "currentResourceIndex":currentResourceIndex
        })
        populateProjectsTable()
    } 
}

function upPhase(){
    if (data[selectedProjectIndex].phases.length  > 1 && selectedPhaseIndex > 0){
        selectedData = data[selectedProjectIndex].phases[selectedPhaseIndex]
        data[selectedProjectIndex].phases.splice( selectedPhaseIndex,1)
        selectedPhaseIndex--
        data[selectedProjectIndex].phases.splice( selectedPhaseIndex,0,selectedData)
        if (selectedPhaseIndex === 0 ){
            data[selectedProjectIndex].phases[selectedPhaseIndex]['start'] = 0
        }
        undoRedoManager.updateState({ 
            "data":data,
            "meta":meta, 
            "setResources":setResources,
            "selectedProjectIndex":selectedProjectIndex,
            "selectedPhaseIndex":selectedPhaseIndex,
            "selectedResourceIndex":selectedResourceIndex,
            "selectedHolidayIndex":selectedHolidayIndex,
            "currentResourceIndex":currentResourceIndex
        })
        populateProjectsTable()  
    } 
}
function downProject(){
    if (data.length > 1 && selectedProjectIndex < data.length-1){
        selectedData = data[selectedProjectIndex]
        data.splice( selectedProjectIndex,1)
        selectedProjectIndex++
        data.splice( selectedProjectIndex,0,selectedData)
        undoRedoManager.updateState({
            "data":data, 
            "meta":meta, 
            "setResources":setResources,
            "selectedProjectIndex":selectedProjectIndex,
            "selectedPhaseIndex":selectedPhaseIndex,
            "selectedResourceIndex":selectedResourceIndex,
            "selectedHolidayIndex":selectedHolidayIndex,
            "currentResourceIndex":currentResourceIndex
        })
        populateProjectsTable()
    } 
}

function downPhase(){
    if (data[selectedProjectIndex].phases.length  > 1 && selectedPhaseIndex < data[selectedProjectIndex].phases.length-1){
        selectedData = data[selectedProjectIndex].phases[selectedPhaseIndex]
        data[selectedProjectIndex].phases.splice( selectedPhaseIndex,1)
        selectedPhaseIndex++
        data[selectedProjectIndex].phases.splice( selectedPhaseIndex,0,selectedData)
        undoRedoManager.updateState({
            "data":data, 
            "meta":meta, 
            "setResources":setResources,
            "selectedProjectIndex":selectedProjectIndex,
            "selectedPhaseIndex":selectedPhaseIndex,
            "selectedResourceIndex":selectedResourceIndex,
            "selectedHolidayIndex":selectedHolidayIndex,
            "currentResourceIndex":currentResourceIndex
        })
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
    undoRedoManager.updateState({
        "data":data, 
        "meta":meta, 
        "setResources":setResources,
        "selectedProjectIndex":selectedProjectIndex,
        "selectedPhaseIndex":selectedPhaseIndex,
        "selectedResourceIndex":selectedResourceIndex,
        "selectedHolidayIndex":selectedHolidayIndex,
        "currentResourceIndex":currentResourceIndex
    })
    populateProjectsTable()
}

function updatePhaseField(index, campo, value){
    if (campo === "duration"){
        value = Math.round(value)
        if (value >1000){
            value = 1000
        }
        if (value < 0){
            value = 0
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
    undoRedoManager.updateState({
        "data":data, 
        "meta":meta, 
        "setResources":setResources,
        "selectedProjectIndex":selectedProjectIndex,
        "selectedPhaseIndex":selectedPhaseIndex,
        "selectedResourceIndex":selectedResourceIndex,
        "selectedHolidayIndex":selectedHolidayIndex,
        "currentResourceIndex":currentResourceIndex
    })
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
    currentResourceIndex = setResources.findIndex((element) => element.name == data[selectedProjectIndex].phases[selectedPhaseIndex].resources[selectedResourceIndex].name)
    undoRedoManager.updateState({ 
        "data":data,
        "meta":meta, 
        "setResources":setResources,
        "selectedProjectIndex":selectedProjectIndex,
        "selectedPhaseIndex":selectedPhaseIndex,
        "selectedResourceIndex":selectedResourceIndex,
        "selectedHolidayIndex":selectedHolidayIndex,
        "currentResourceIndex":currentResourceIndex
    })
    return value
}


function updateChart(days){
    
    var tableHead = document.querySelectorAll('#graphic2 thead')[0]
    tableHead.innerHTML = ""
    var monthHead = document.createElement('tr')
    var dayHead = document.createElement('tr')
    var monthString = ""
    var dayString = ""
    var startDay = new Date(meta.creationDate)
    var newDay = new Date()

    if (startDay < newDay){newDay=startDay}
    var oldMonth = newDay.getMonth()
    var spanMonth =  0
    days.forEach((day, i) => { 
        if (newDay.getDay()===0){newDay.setDate(newDay.getDate()+1)}
        if (newDay.getDay()===6){newDay.setDate(newDay.getDate()+2)}

        dayString = dayString + "<th>"+newDay.getDate()+"</th>"
        if (newDay.getMonth()===oldMonth){spanMonth++}
        else{ 
            monthString = `${monthString}<th class="text-center" colspan="${spanMonth}">${oldMonth+1}</th>` 
            spanMonth = 1;
            oldMonth = newDay.getMonth()
        }
        newDay.setDate(newDay.getDate()+1)
        
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
    var deltaDay = calcDayDate(new Date())
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
        tableRow.innerHTML = `<td rowspan="${project.phases.length}">${project.name}</td><td>${project.phases[0].name}</td>`
        tableBody.appendChild(tableRow);
        project.phases.forEach((phase, y) => {
            if (y!=0){
                tableRow = document.createElement('tr')
                tableRow.innerHTML = `<td>${phase.name}</td>`
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
        var scadenza = new Date(pro.delivery)
        phaseIndex = phaseIndex + pro.phases.length
        finishDay = days.length
        while (days[finishDay-1].used[phaseIndex-1]===0){
            finishDay--
        }
        result[index] = finishDay-calcDayDate(scadenza)
     })
    return result
}

function calcDayDate(data){
    var newDay = new Date(meta.creationDate)
    var numDay = 0
    while (newDay <= data){
        
        if (newDay.getDay()!=0 && newDay.getDay()!= 6) numDay++
    
        newDay.setDate(newDay.getDate()+1)
        
    }
    return numDay
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
        tableRow.innerHTML = `<td>${project.name}</td><td>${projectDelay[index]}</td><td>${cost}</td>`
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
        meta.creationDate = new Date().toJSON().slice(0, 10)
        undoRedoManager.updateState({
            "data":data, 
            "meta":meta, 
            "setResources":setResources,
            "selectedProjectIndex":selectedProjectIndex,
            "selectedPhaseIndex":selectedPhaseIndex,
            "selectedResourceIndex":selectedResourceIndex,
            "selectedHolidayIndex":selectedHolidayIndex,
            "currentResourceIndex":currentResourceIndex
        })
        updateChart(new GANTT(data,setResources,meta).getGantt())

    }
}

function cutProjectsToday(){
    if (confirm(`Warning! Irreversible action\n
        All phases in the past will be deleted\n
        The start date will be set to today`)){    
        days = new GANTT(data,setResources,meta).getGantt()
    var deltaDay = calcDayDate(new Date())
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
    meta.creationDate = today.toJSON().slice(0, 10)
    populateProjectsTable()
    updateChart(new GANTT(data,setResources,meta).getGantt())
    undoRedoManager.updateState({
        "data":data, 
        "meta":meta, 
        "setResources":setResources,
        "selectedProjectIndex":selectedProjectIndex,
        "selectedPhaseIndex":selectedPhaseIndex,
        "selectedResourceIndex":selectedResourceIndex,
        "selectedHolidayIndex":selectedHolidayIndex,
        "currentResourceIndex":currentResourceIndex
    })
    populateDelayTable()
}
}

function purgeHolidayPast(){
    var today= new Date(meta.creationDate)
    setResources.forEach(res=> {
        for (var x = res.holidays.length-1; x>=0; x--){
        var start = new Date(res.holidays[x].startDate)
        var duration = res.holidays[x].duration
            if (today > start){
                for (var i=0; i<duration; i++){
                    start.setDate(start.getDate()+1)
                    if(today.getDay()===0 ) start.setDate(start.getDate()+1)
                    if(today.getDay()===6 ) start.setDate(start.getDate()+2)
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
                <td>${element.name}</td>`
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
    setResources[currentResourceIndex].holidays.forEach((holiday, index) =>{  
            var calendarRow = document.createElement('tr')
                calendarRow.innerHTML = `
                <td><input type="date" value="${holiday.startDate}" name="startDate" max="${dataLimiteMax}" min="${dataLimiteMin}" onchange="updateCalendarField(${index}, 'startDate', this.value)"></td>
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
    undoRedoManager.updateState({ 
        "data":data,
        "meta":meta, 
        "setResources":setResources,
        "selectedProjectIndex":selectedProjectIndex,
        "selectedPhaseIndex":selectedPhaseIndex,
        "selectedResourceIndex":selectedResourceIndex,
        "selectedHolidayIndex":selectedHolidayIndex,
        "currentResourceIndex":currentResourceIndex
    })
    populateHolidayTable()
}

function newResource(){
    var name = prompt("Please insert new resource name!", "ELECTRICIAN")
    var res = setResources.find(function (element) {
        return element.name == name})
    if (!(res===undefined)){ 
        alert("Invalid name because it already exists!")
    }
    else{
        currentResourceIndex++
        setResources.splice( currentResourceIndex,0, 
                {
                "name": name,
                "holidays": []
                }
            )
    }
    undoRedoManager.updateState({ 
        "data":data,
        "meta":meta, 
        "setResources":setResources,
        "selectedProjectIndex":selectedProjectIndex,
        "selectedPhaseIndex":selectedPhaseIndex,
        "selectedResourceIndex":selectedResourceIndex,
        "selectedHolidayIndex":selectedHolidayIndex,
        "currentResourceIndex":currentResourceIndex
    })
    populateResourcesTable()
}


function sortHoliday() {
    // Per ogni oggetto all'interno dell'array setResources
    setResources.forEach(function(resource) {
      // Ordina la lista di ferie 'holiday' in base alla data di inizio 'startDate'
      resource.holidays.sort(function(a, b) {
        // Confronta le date di inizio
        return new Date(a.startDate) - new Date(b.startDate);
      });
    });
    populateHolidayTable()
  }

  function sortSetResource() {
    // Per ogni oggetto all'interno dell'array setResources
    setResources.sort(function(a, b) {
        // Confronta le date di inizio
        return (a.name > b.name)
    });
    populateResourcesTable()
  }

function newHoliday(){
    setResources[currentResourceIndex].holidays.splice( selectedHolidayIndex,0, 
            {
                "startDate": "2025-01-01",
                "duration": 1,
                "employed": 100
            }
    
    )
    undoRedoManager.updateState({ 
        "data":data,
        "meta":meta, 
        "setResources":setResources,
        "selectedProjectIndex":selectedProjectIndex,
        "selectedPhaseIndex":selectedPhaseIndex,
        "selectedResourceIndex":selectedResourceIndex,
        "selectedHolidayIndex":selectedHolidayIndex,
        "currentResourceIndex":currentResourceIndex
    })
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
    if (found){
        window.alert("The resource is in use. Command canceled!")
    }
    else{
        if(setResources.length > 0 && confirm("You want to delete the resource?")){
            setResources.splice(currentResourceIndex,1)
            if(currentResourceIndex > 0)currentResourceIndex--
            console.log(setResources) 
        }
        if(setResources.length == 0){
            window.alert("Nothing to delete!")
        }
    }
    undoRedoManager.updateState({ 
        "data":data,
        "meta":meta, 
        "setResources":setResources,
        "selectedProjectIndex":selectedProjectIndex,
        "selectedPhaseIndex":selectedPhaseIndex,
        "selectedResourceIndex":selectedResourceIndex,
        "selectedHolidayIndex":selectedHolidayIndex,
        "currentResourceIndex":currentResourceIndex
    })
    populateResourcesManagerTable()
}


function deleteHoliday(){
    if (setResources[currentResourceIndex].holidays.length > 0 && confirm("You want to delete the project?")){
        setResources[currentResourceIndex].holidays.splice( selectedHolidayIndex,1)
        if (selectedHolidayIndex > 0) selectedHolidayIndex--
    } 
    undoRedoManager.updateState({ 
        "data":data,
        "meta":meta, 
        "setResources":setResources,
        "selectedProjectIndex":selectedProjectIndex,
        "selectedPhaseIndex":selectedPhaseIndex,
        "selectedResourceIndex":selectedResourceIndex,
        "selectedHolidayIndex":selectedHolidayIndex,
        "currentResourceIndex":currentResourceIndex
    })
    populateHolidayTable()
}

function limitDate(){
    var oggi = new Date();
    oggi.setMonth(oggi.getMonth() + 18);
    dataLimiteMax = oggi.toISOString().split('T')[0];
    oggi = new Date();
    oggi.setMonth(oggi.getMonth() - 12);
    dataLimiteMin = oggi.toISOString().split('T')[0];
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