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

    constructor(data){
        this.data = data
        this.phaseIndex = 0
        this.numberOfPhases = 0
        this.setNumberOfPhases()

        this.solution = []//array di giorni
        this.resources = new Set()
        this.setResources()
        
        this.data.forEach(project => 
            this.insertProject(project)
        )
    }
    setNumberOfPhases(){
        data.forEach(project =>{
            this.numberOfPhases = this.numberOfPhases + project.phases.length
        })
    }

    setResources(){

        this.data.forEach(project => project.phases.forEach(phase => phase.resources.forEach(resource => 
            this.resources.add(resource.name)
        )))
    }
    getNewDay(){
        const map = new Map()
        this.resources.forEach(res => map.set(res, 0))
        var day = {used: [], resource: map}
        console.log(this.numberOfPhases)
        for (let i=0; i<this.numberOfPhases; i++){
            day.used.push(0);   
        }
        return day
    }
    getGantt(){
        console.log(this.solution)
        return this.solution
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
                        newDay.resource.set(res.name, res.employed)

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