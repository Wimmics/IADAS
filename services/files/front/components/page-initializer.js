// Système d'initialisation de la page IA-DAS
class PageInitializer {
    constructor() {
        this.isInitialized = false;
        this.initPromise = null;
    }

    async initializePage() {
        if (this.isInitialized) {
            return true;
        }

        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this.performInitialization();
        return this.initPromise;
    }

    async performInitialization() {
        try {
            
            // Afficher le loading d'initialisation
            window.loadingManager.show("Initialisation de IA-DAS...");
            window.loadingManager.updateStep('warmup', 'Réveil de Fuseki...', 'active');
            
            // 1. Réveiller Fuseki avec la première requête
            await this.wakeupFuseki();
            window.loadingManager.completeWarmup();
            
            // 2. Tester avec une deuxième requête
            window.loadingManager.updateStep('query', 'Test de fonctionnement...', 'active');
            await this.testFusekiStability();
            window.loadingManager.completeQuery();
            
            // 3. Préparer l'interface
            window.loadingManager.updateStep('parsing', 'Préparation de l\'interface...', 'active');
            await this.prepareInterface();
            window.loadingManager.completeParsing();
            
            // 4. Activation
            this.isInitialized = true;
            this.enableUserInterface();
            
            // Fermer le loading
            window.loadingManager.completeAll();
            
            console.log(' Page initialisée avec succès');
            return true;
            
        } catch (error) {
            console.error(' Erreur lors de l\'initialisation:', error);
            console.error(' Type d\'erreur:', error.name);
            console.error(' Message:', error.message);
            console.error(' Stack:', error.stack);
            
            window.loadingManager.showError(
                'Erreur d\'initialisation', 
                'Impossible de connecter à la base de données. Rechargez la page.'
            );
            
            // Proposer un retry
            setTimeout(() => {
                if (confirm('Réessayer l\'initialisation ?')) {
                    this.initPromise = null;
                    this.initializePage();
                }
            }, 3000);
            
            return false;
        }
    }

    async wakeupFuseki() {
        
        // Détection de l'environnement
        const apiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
            ? 'http://localhost:8003/' 
            : 'http://51.44.188.162:8003/';
        
        
        const warmupQuery = {
            queryType: 'generated',
            categoryVD: 'DEAB'
        };
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(warmupQuery),
            timeout: 60000 
        });
        
        if (!response.ok) {
            throw new Error(`Erreur warmup: ${response.status}`);
        }
        
        const data = await response.json();
        
        return data;
    }

    async testFusekiStability() {
        
        // Détection de l'environnement
        const apiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
            ? 'http://localhost:8003/' 
            : 'http://51.44.188.162:8003/';
        
        // Requête différente pour s'assurer de la stabilité
        const testQuery = {
            queryType: 'generated',
            gender: 'Male'
        };
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testQuery),
            timeout: 30000 // 30 secondes (devrait être rapide maintenant)
        });
        
        if (!response.ok) {
            throw new Error(`Erreur test: ${response.status}`);
        }
        
        const data = await response.json();
        
        return data;
    }

    async prepareInterface() {
        
        // Simuler la préparation de l'interface
        await new Promise(resolve => setTimeout(resolve, 500));
        
    }

    enableUserInterface() {
        
        // Activer tous les boutons et inputs
        const disabledElements = document.querySelectorAll('[disabled]');
        disabledElements.forEach(element => {
            if (element.id !== 'searchBtn') { // Ne pas activer le bouton recherche tout de suite
                element.disabled = false;
            }
        });
        
        // Retirer l'overlay de blocage s'il existe
        const blockingOverlay = document.getElementById('initialization-overlay');
        if (blockingOverlay) {
            blockingOverlay.remove();
        }
        
        // Activer le bouton de recherche
        const searchBtn = document.getElementById('searchBtn');
        if (searchBtn) {
            searchBtn.disabled = false;
            searchBtn.textContent = 'Rechercher';
            searchBtn.classList.remove('loading');
        }
        
        // Afficher un message de succès
        this.showReadyMessage();
    }

    showReadyMessage() {
        // Petit toast de confirmation
        const toast = document.createElement('div');
        toast.className = 'ready-toast';
        toast.innerHTML = '✅ IA-DAS est prêt à utiliser !';
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4CAF50;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 10000;
            font-weight: 500;
            animation: slideIn 0.3s ease-out;
        `;
        
        // Ajouter l'animation CSS
        if (!document.getElementById('toast-styles')) {
            const style = document.createElement('style');
            style.id = 'toast-styles';
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(toast);
        
        // Retirer après 3 secondes
        setTimeout(() => {
            toast.style.animation = 'slideIn 0.3s ease-out reverse';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Méthode pour vérifier si la page est prête avant une recherche
    async ensureReady() {
        if (!this.isInitialized) {
            return this.initializePage();
        }
        return true;
    }
}

// Instance globale
window.pageInitializer = new PageInitializer();

