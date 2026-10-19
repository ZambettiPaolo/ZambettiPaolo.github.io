class UndoRedoManager {
    constructor(initialState) {
        // Doppio tetto: numero di passi e memoria occupata. Ogni stato e' una
        // copia JSON completa dei dati, quindi 40 stati di un progetto grande
        // possono pesare molto piu' di 40 stati dei dati di esempio.
        this.maxStates = 40
        this.maxChars = 16 * 1024 * 1024
        this.undoStack = []; // Stack per l'undo
        this.redoStack = []; // Stack per il redo
        this.currentState = JSON.stringify(initialState); // Stato corrente
    }

    // Somma dei caratteri di uno stack. Gli stati sono stringhe JSON gia'
    // pronte: misurarle e' l'unico modo per fermarsi prima di esaurire la RAM.
    lunghezzaStack(stack) {
        return stack.reduce(function (totale, stato) { return totale + stato.length }, 0)
    }

    // Scarta gli stati piu' vecchi finche' lo stack rientra nei due tetti.
    // Si tiene sempre almeno uno stato: se un singolo snapshot supera il
    // limite di caratteri non ha senso svuotare tutta la cronologia.
    limitaStack(stack) {
        while (stack.length > this.maxStates ||
               (stack.length > 1 && this.lunghezzaStack(stack) > this.maxChars)) {
            stack.shift()
        }
    }

    // Metodo per fare una copia dello stato corrente e aggiungerla alla pila di undo
    saveState() {
        this.undoStack.push(this.currentState);
        this.limitaStack(this.undoStack)
        this.redoStack = []; // Svuota la pila di redo ogni volta che viene fatta una modifica
    }

    // Metodo per annullare l'ultima modifica
    undo() {
      if (this.undoStack.length > 0) {
        this.redoStack.push(this.currentState); // Salva lo stato attuale in redo
        this.limitaStack(this.redoStack)
        this.currentState = this.undoStack.pop(); // Ripristina l'ultimo stato di undo
      } else {
        console.log("Nessuna operazione da annullare.");
      }
    }

    // Metodo per ripetere l'ultima modifica annullata
    redo() {
      if (this.redoStack.length > 0) {
        this.undoStack.push(this.currentState); // Salva lo stato corrente in undo
        this.limitaStack(this.undoStack)
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

    // Stringa gia' serializzata: serve al salvataggio nel browser, che non ha
    // bisogno di fare avanti e indietro dal JSON.
    getCurrentStateString() {
      return this.currentState
    }

    // Stati annullabili, dal piu' vecchio al piu' recente.
    getUndoStates() {
      return this.undoStack.slice()
    }

    // Ricostruisce la cronologia dopo un reload. `undoStates` sono gli stati
    // precedenti (dal piu' vecchio al piu' recente) e `currentState` quello
    // corrente. Gli oggetti arrivano gia' validati da leggiStorico().
    restoreHistory(undoStates, currentState) {
      this.undoStack = undoStates.map(function (stato) {
        return typeof stato === 'string' ? stato : JSON.stringify(stato)
      })
      this.limitaStack(this.undoStack)
      this.redoStack = []
      this.currentState = JSON.stringify(currentState)
    }
  }
