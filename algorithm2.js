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


class GANTT{

    constructor(data, setResources,meta){
        this.data = data
        this.setResources = setResources
        this.meta = meta
        this.startGantt= new Date(meta.creationDate)
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
        data.forEach(project =>{
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

    dateToDayNumber(date){
        var dayN= 0
        var day = new Date(date)
        var delta = Math.floor((day-this.startGantt)/ (1000 * 60 * 60 * 24))
        var newDay = new Date(meta.creationDate)
        if (delta > 0){
            for (let i=0; i<delta; i++){
                newDay.setDate(newDay.getDate()+1)
                if (!(newDay.getDay()==0 || newDay.getDay()==6)){dayN++}
            }
            
        }
        else{
            for (let i=0; i>delta; i--){
                newDay.setDate(newDay.getDate()-1)
                if (!(newDay.getDay()==0 || newDay.getDay()==6)){dayN--}
            }

        }
        return dayN
    }

    getGantt(){
        console.log(this.solution)
        return this.solution
    }

    insertHoliday(resource){
        var emp = 0
        var day = {}
        resource.holidays.forEach((holiday, index) => {
            var dayNumberStart = this.dateToDayNumber(holiday.startDate)
            var duration = holiday.duration
            if(dayNumberStart < 0 && dayNumberStart + holiday.duration >=0){
                duration = dayNumberStart + holiday.duration
                dayNumberStart = 0
            }
            var dayNumberFinish = dayNumberStart + duration
            if(dayNumberStart>=0){
                for (let currentDay = 0; currentDay < dayNumberFinish;currentDay++){
                    if (this.solution.length <= currentDay){
                        var newDay = this.getNewDay()
                        this.solution[currentDay] = newDay
                    }
                    day = this.solution[currentDay]
                    if (currentDay >= dayNumberStart){
                        day.used[0] = 1
                        if (day.resource.has(resource.name)) {
                            emp = day.resource.get(resource.name)
                            emp = emp + holiday.employed
                            if (emp + holiday.employed>100) emp = 100
                            if (resource.name == "ALL"){
                                
                                this.resourcesEmployed.forEach((value,key) =>{
                                    emp = day.resource.get(value)
                                    emp = emp + holiday.employed
                                    if (emp + holiday.employed>100) emp = 100
                                    newDay.resource.set(key, emp)
                                }) 
                            }
                            else day.resource.set(resource.name, emp ) 
                            

                        }
                        else{
                            if (res.name=="ALL"){
                                this.resourcesEmployed.forEach((value,key) =>{
                                    newDay.resource.set(value, holiday.employed)
                                }) 
                            }
                            else newDay.resource.set(resource.name, holiday.employed)
                             
                        }   
                    }
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
                    while (this.solution[currentDay].used[this.phaseIndex-1]===0){currentDay++}
                }
            }
            for(let i = 0; i < phase.duration; i++){0
                do{
                var isFree = true
                var emp = 0
                if (this.solution.length <= currentDay){
                    isFree = true
                    var newDay = this.getNewDay()
                    newDay.used[this.phaseIndex] = 1
                    phase.resources.forEach(res => {                        
                    })
                    newDay.used[this.phaseIndex] = 1
                    this.solution[currentDay] = newDay
                }
                else{
                    phase.resources.forEach(res => {
                        emp =this.solution[currentDay].resource.get(res.name)
                        if ((res.employed + emp) > 100){
                            isFree = false 
                            currentDay++ 
                        }
                    })
                    if  (isFree){
                        phase.resources.forEach(res => {
   
                            emp =this.solution[currentDay].resource.get(res.name)
                            this.solution[currentDay].resource.set(res.name, (res.employed + emp))
                            
                        })
                        this.solution[currentDay].used[this.phaseIndex]=1
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