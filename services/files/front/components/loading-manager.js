// Loading Manager pour IA-DAS
class LoadingManager {
    constructor() {
        this.overlay = null;
        this.title = null;
        this.details = null;
        this.progressFill = null;
        this.timerElement = null;
        this.currentStep = 0;
        this.totalSteps = 3;
        this.startTime = null;
        this.timerInterval = null;
        
        // Initialiser quand le DOM est prêt
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    init() {
        this.overlay = document.getElementById('loading-overlay');
        this.title = document.getElementById('loading-title');
        this.details = document.getElementById('loading-details');
        this.progressFill = document.getElementById('progress-fill');
        this.timerElement = document.getElementById('timer-value');
        
        console.log(' LoadingManager initialisé');
    }

    show(title = "Chargement des données...") {
        if (!this.overlay) {
            console.error(' LoadingManager pas encore initialisé');
            return;
        }
        
        this.title.textContent = title;
        this.overlay.classList.remove('hidden');
        this.updateProgress(0);
        this.resetSteps();
        
        // Démarrer le timer
        this.startTime = Date.now();
        this.timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
            if (this.timerElement) {
                this.timerElement.textContent = `${elapsed}s`;
            }
        }, 1000);
        
        console.log(' Loading affiché:', title);
    }

    hide() {
        if (!this.overlay) return;
        
        this.overlay.classList.add('hidden');
        this.resetSteps();
        
        // Arrêter le timer
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        console.log(' Loading masqué');
    }

    updateStep(stepName, message, status = 'active') {
        const stepElement = document.getElementById(`step-${stepName}`);
        if (!stepElement) {
            console.warn(` Étape non trouvée: ${stepName}`);
            return;
        }
        
        // Nettoyer les classes précédentes
        stepElement.classList.remove('active', 'completed', 'error');
        
        // Mettre à jour le texte
        const textElement = stepElement.querySelector('.step-text');
        if (textElement) {
            textElement.textContent = message;
        }
        
        // Appliquer le nouveau statut
        if (status === 'completed') {
            stepElement.classList.add('completed');
            this.currentStep++;
        } else if (status === 'error') {
            stepElement.classList.add('error');
        } else {
            stepElement.classList.add('active');
        }
        
        // Mettre à jour les détails
        if (this.details) {
            this.details.textContent = message;
        }
        
        // Mettre à jour la progress bar
        this.updateProgress();
        
        console.log(` Étape ${stepName}: ${message} (${status})`);
    }

    updateProgress(customProgress = null) {
        if (!this.progressFill) return;
        
        const progress = customProgress !== null ? customProgress : (this.currentStep / this.totalSteps) * 100;
        this.progressFill.style.width = `${Math.min(progress, 100)}%`;
    }

    resetSteps() {
        const steps = document.querySelectorAll('.step');
        steps.forEach(step => {
            step.classList.remove('active', 'completed', 'error');
        });
        this.currentStep = 0;
    }

    // Méthodes pratiques pour les étapes communes
    startWarmup() {
        this.updateStep('warmup', '🔥 Préparation de Fuseki...', 'active');
    }

    completeWarmup() {
        this.updateStep('warmup', 'Fuseki prêt !', 'completed');
    }

    startQuery(attempt = 1, maxAttempts = 3) {
        this.updateStep('query', `🎯 Tentative ${attempt}/${maxAttempts}...`, 'active');
    }

    completeQuery(resultCount = null) {
        const message = resultCount 
            ? `✅ ${resultCount} résultats reçus !`
            : '✅ Données reçues !';
        this.updateStep('query', message, 'completed');
    }

    errorQuery(errorMessage) {
        this.updateStep('query', `❌ ${errorMessage}`, 'error');
    }

    startParsing() {
        this.updateStep('parsing', '📊 Traitement des résultats...', 'active');
    }

    completeParsing() {
        this.updateStep('parsing', '✅ Graphique prêt !', 'completed');
    }

    // Utilitaire pour gérer les erreurs
    showError(title, message) {
        this.title.textContent = title;
        this.details.textContent = message;
        
        // Marquer toutes les étapes comme erreur
        const steps = document.querySelectorAll('.step');
        steps.forEach(step => {
            step.classList.add('error');
        });
        
        // Cacher après 3 secondes
        setTimeout(() => {
            this.hide();
        }, 3000);
    }

completeAll() {
    console.log(' Finalisation complète');
    
    // S'assurer que toutes les étapes sont marquées comme terminées
    this.completeWarmup();
    this.completeQuery();
    this.completeParsing();
    
    // Progression à 100%
    this.updateProgress(100);
    
    // Auto-fermeture après 1 seconde
    setTimeout(() => {
        this.hide();
    }, 1000);
}
}

// Instance globale
window.loadingManager = new LoadingManager();

console.log('LoadingManager chargé');