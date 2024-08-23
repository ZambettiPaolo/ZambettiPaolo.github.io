

const PARALLEL = 0
const SEQUENCE = 1

class GANTT{
    constructor(data){
        this.data = data;
        this.solution = {
            resources: [],
            phases: []
        }
        this.setResources()
        this.data.forEach(project => 
            this.insertProject(project)
        )
    }

    addDay(){
        const map = new Map()
        this.resources.forEach(res => map.set(res, 0))
        this.solution.resources.push(map)
        this.solution.phases.push(new Set())
    }

    setResources(){
        this.resources = new Set()
        this.data.forEach(project => project.phases.forEach(phase => phase.resources.forEach(resource => 
            this.resources.add(resource.name)
        )))
    }

    getGantt(){
        console.log(this.solution)
        return this.solution
    }
    
    insertProject(project){
        var start = 0
        var end = this.insertPhase(project.phases[0], start)
    
        for(let i = 1; i < project.phases.length; i++){
            if(project.phases[i].start === SEQUENCE){
                start = end+1
                console.log("SEQUENCE!", end)
            }
               
            console.log("Start ", project.phases[i], start)
            end = this.insertPhase(project.phases[i], start)
        }
    
        return end;
    }
    
    insertPhase(phase, start){
        var workdaysLeft = phase.duration
        var relativeDay = 0

        for(; workdaysLeft > 0; relativeDay++){
            //console.log("INSERTING PHASE", phase, relativeDay)
            const absoluteDay = start+relativeDay
            if(this.solution.resources.length === absoluteDay){
                this.addDay()
                this.populateDay(phase, absoluteDay)
                workdaysLeft--
            }
            else if(this.isDayFeasible(phase, absoluteDay)){
                this.populateDay(phase, absoluteDay)
                workdaysLeft--
            }
        }
    
        return start+relativeDay-1
    }

    isDayFeasible(phase, day){
        return phase.resources.every(resource => 
            100-this.solution.resources[day].get(resource.name) >= resource.employed
        )

    }

    populateDay(phase, day){
        phase.resources.forEach(resource => {
            this.solution.resources[day].set(resource.name, this.solution.resources[day].get(resource.name) + resource.employed)
        })
        this.solution.phases[day].add(phase.name)
    }    




}