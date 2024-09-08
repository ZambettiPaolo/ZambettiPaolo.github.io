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



const VERSION = {"major":0, "minor":3, "patch":0}
var projectDelay = []
var selectedProjectIndex = 0
var selectedPhaseIndex = 0
var selectedResourceIndex = 0
var setResources = new Set()


function version() {
    document.getElementById('version').textContent =`Version: ${VERSION.major}.${VERSION.minor}.${VERSION.patch}`
}


function handleFileUpload(event) {
    const file = event.target.files[0]
    if (file && file.type === 'application/json') {
        const reader = new FileReader()
        reader.onload = function(e) {
            try {
                var res = JSON.parse(e.target.result)
                data = res.data
                meta = res.meta
                calendar = res.calendar
                populateProjectsTable()
                updateChart(new GANTT(data).getGantt())
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

function downloadJSON() {
    meta.version = VERSION
    
    var out = {"meta":meta, "data":data, "calendar": calendar }
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
    console.log(data)
    data.forEach((project, index) => {
        var projectRow = document.createElement('tr')
        projectRow.innerHTML = `
            <td><input type="text" value="${project.name}" name="name" style="width: 20em" maxlength="30" onchange="updateProjectField(${index}, 'name', this.value)"></td>
            <td><input type="date" value="${project.delivery}" name="delivery" onchange="updateProjectField(${index}, 'delivery', this.value)"></td>
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
    rigenSetResource()
    var resourcesTableBody = document.querySelector('#resourcesTable tbody')
    resourcesTableBody.innerHTML = ''
    var phase = data[selectedProjectIndex].phases[selectedPhaseIndex]
    phase.resources.forEach((resource, index) => {
        var stringSelect = ""
        setResources.forEach(resourceOption =>{
            if (resource.name === resourceOption){
                stringSelect  = `${stringSelect}<option value="${resourceOption}"selected >${resourceOption}</option>\n`   
            }
            else{
                stringSelect  = `${stringSelect}<option value="${resourceOption}">${resourceOption}</option>\n`  
            }
        })
           stringSelect = `${stringSelect}<option value="add">Add</option></select>`
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
}


function rigenSetResource() {
    setResources = new Set()
    data.forEach(project => {
        project.phases.forEach(phase => {
            phase.resources.forEach(resource => {
                setResources.add(resource.name)
            })
        })
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
    populateResourcesTable();

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
    populateProjectsTable()
}

function cloneProject(){
    selectedProjectIndex++
    selectedPhaseIndex = 0
    selectedResourceIndex = 0
    const clonedData = structuredClone(data[selectedProjectIndex - 1])
    data.splice(selectedProjectIndex, 0, clonedData)
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
    populatePhasesTable()
}

function newResorce(){
    rigenSetResource()
    selectedResourceIndex++
    data[selectedProjectIndex].phases[selectedPhaseIndex].resources.forEach(res => {
        setResources.delete(res.name)})
    var firstFreeResource = setResources.values().next().value
    console.log(firstFreeResource)
    if (firstFreeResource===undefined){ 
        var name = prompt("Insert new resource name")
        rigenSetResource()
        if (!setResources.has(name)){   
            data[selectedProjectIndex].phases[selectedPhaseIndex].resources.splice( selectedResourceIndex,0, 
                {
                "name": name,
                "employed": 0
                }
            )
        }
        else{
            alert("Invald value!")
            selectedResourceIndex = 0
        }    
    }
    else{
        data[selectedProjectIndex].phases[selectedPhaseIndex].resources.splice( selectedResourceIndex,0, 
                {
                "name": firstFreeResource,
                "employed": 0
                }
            )
    }
    populateResourcesTable()
}

function deleteProject(){
    if (data.length > 1 && confirm("You want to delete the project?")){
        data.splice( selectedProjectIndex,1)
        if (data.length === selectedProjectIndex){
            selectedProjectIndex--
        }
        populateProjectsTable();
        
    } 

}

function deletePhase(){
    if (data[selectedProjectIndex].phases.length > 1 && confirm("You want to delete the phase?")){
        data[selectedProjectIndex].phases.splice( selectedPhaseIndex,1)
        if (data[selectedProjectIndex].phases.length === selectedPhaseIndex){
            selectedPhaseIndex--  
        }
        populatePhasesTable() 
    }
}

function deleteResource(){
    if(data[selectedProjectIndex].phases[selectedPhaseIndex].resources.length > 1 && confirm("You want to delete the resource?")){
    data[selectedProjectIndex].phases[selectedPhaseIndex].resources.splice( selectedResourceIndex,1);
    if(data[selectedProjectIndex].phases[selectedPhaseIndex].resources.length ===  selectedResourceIndex){
        selectedResourceIndex--      
    }

    populateResourcesTable()
 }
}

function upProject(){
    if (data.length > 1 && selectedProjectIndex > 0){
        selectedData = data[selectedProjectIndex]
        data.splice( selectedProjectIndex,1)
        selectedProjectIndex--
        data.splice( selectedProjectIndex,0,selectedData)
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
        populateProjectsTable()  
    } 
}
function downProject(){
    if (data.length > 1 && selectedProjectIndex < data.length-1){
        selectedData = data[selectedProjectIndex]
        data.splice( selectedProjectIndex,1)
        selectedProjectIndex++
        data.splice( selectedProjectIndex,0,selectedData)
        populateProjectsTable()
    } 
}

function downPhase(){
    if (data[selectedProjectIndex].phases.length  > 1 && selectedPhaseIndex < data[selectedProjectIndex].phases.length-1){
        selectedData = data[selectedProjectIndex].phases[selectedPhaseIndex]
        data[selectedProjectIndex].phases.splice( selectedPhaseIndex,1)
        selectedPhaseIndex++
        data[selectedProjectIndex].phases.splice( selectedPhaseIndex,0,selectedData)
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
    if (value === "add"){ value = prompt("Insert new resource name")
        if (setResources.has(value)){res=true}   
    }
    if (campo==="name"){
        data[selectedProjectIndex].phases[selectedPhaseIndex].resources.forEach(resource => {if(resource.name===value){res=true}})}
    if(!res){
    data[selectedProjectIndex].phases[selectedPhaseIndex].resources[index][campo] = value
    }
    else{ alert("Invald value!")}
    populateResourcesTable()
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
    console.log(deltaDay)
    data.forEach(project => project.phases.forEach(phase => listPhases.push(phase)))
    for (let i=0; i < days[0].used.length; i++){
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
        listPhases[i].resources.forEach(res => {
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
    console.log(projectDelay)
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
    console.log(meta.creationDate)
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
        updateChart(new GANTT(data).getGantt())
    }
}

function cutProjectsToday(){
    if (confirm(`Warning! Irreversible action\n
        All phases in the past will be deleted\n
        The start date will be set to today`)){    
        days = new GANTT(data).getGantt()
    var deltaDay = calcDayDate(new Date())
    var listPhases = []
    var nDay = 0
    data.forEach(project => project.phases.forEach(phase => listPhases.push(phase)))
    while (((deltaDay-nDay) > 0) && (nDay < days.length)){
        days.forEach((day, index) => {
            if (day.used[index]===1){
                if(listPhases[index].duration > 0){
                    listPhases[index].duration--
                }
            }
        })
        nDay++
    }
    data.forEach((project, pIndex) => project.phases.forEach((phase, index)=>{
        if (phase.duration===0){
            data[pIndex].phases.splice(index, 1)
        }
    }))
    populateProjectsTable()
    var today= new Date()
    console.log(meta.creationDate)
    if(today.getDay()===0 ) today.setDate(today.getDate()+1)
    if(today.getDay()===6 ) today.setDate(today.getDate()+2)
    meta.creationDate = today.toJSON().slice(0, 10)
    updateChart(new GANTT(data).getGantt())
    populateDelayTable()
}
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