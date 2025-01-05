class UndoRedoManager {
    constructor(initialState) {
        this.undoStack = []; // Stack per l'undo
        this.redoStack = []; // Stack per il redo
        this.currentState =JSON.stringify(initialState); // Stato corrente
    }
  
    // Metodo per fare una copia dello stato corrente e aggiungerla alla pila di undo
    saveState() {
        this.undoStack.push(this.currentState);
        if (this.undoStack.length > 20)this.undoStack.splice(0,1)//elimina l'elemento zero 
        this.redoStack = []; // Svuota la pila di redo ogni volta che viene fatta una modifica
     
    }
  
    // Metodo per annullare l'ultima modifica
    undo() {
      if (this.undoStack.length > 0) {
        this.redoStack.push(this.currentState); // Salva lo stato attuale in redo
        this.currentState = this.undoStack.pop(); // Ripristina l'ultimo stato di undo
      } else {
        console.log("Nessuna operazione da annullare.");
      }
    }
  
    // Metodo per ripetere l'ultima modifica annullata
    redo() {
      if (this.redoStack.length > 0) {
        this.undoStack.push(this.currentState); // Salva lo stato corrente in undo
        this.currentState = this.redoStack.pop(); // Ripristina l'ultimo stato di redo
      } else {
        console.log("Nessuna operazione da ripetere.");
      }
    }
  
    // Metodo per modificare lo stato dell'oggetto
    updateState(newState) {
      this.saveState(); // Salva lo stato prima della modifica
      this.currentState = JSON.stringify(newState); // Modifica lo stato
    }
  
    // Metodo per ottenere lo stato corrente
    getCurrentState() {
      return JSON.parse(this.currentState);
    }
  }
  