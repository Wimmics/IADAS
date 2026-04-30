// 🔧 Gestionnaire de configuration API - api-config.js
class ApiConfigManager {
    constructor() {
        this.config = this.detectEnvironment();
    }

    detectEnvironment() {
        const hostname = window.location.hostname;
        const protocol = window.location.protocol;
        const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
        
        if (isLocal) {
            return {
                environment: 'development',
                baseUrl: 'http://localhost',
                ports: {
                    sparql: 8003,
                    api: 8003,
                    main: 8000
                }
            };
        } else {
            return {
                environment: 'production',
                baseUrl: `${protocol}//${hostname}`,
                ports: {
                    sparql: 8003,
                    api: 8003,
                    main: 8000
                }
            };
        }
    }

    // Méthode principale pour obtenir une URL d'endpoint
    getEndpoint(service, path = '') {
        const port = this.config.ports[service];
        const baseUrl = `${this.config.baseUrl}:${port}`;
        return path ? `${baseUrl}/${path}` : baseUrl;
    }

    // Méthodes spécifiques pour chaque service
    getSparqlEndpoint(path = '') {
        return this.getEndpoint('sparql', path);
    }

    getApiEndpoint(path = '') {
        return this.getEndpoint('api', path);
    }

    // Méthode avec fallback automatique
    async fetchWithFallback(service, path, options = {}) {
        const primaryUrl = this.getEndpoint(service, path);
        
        // URLs de fallback selon l'environnement
        const fallbackUrls = this.config.environment === 'production' ? [
            primaryUrl,
            `http://localhost:${this.config.ports[service]}/${path}`, // fallback local
        ] : [
            primaryUrl,
            `http://51.44.188.162:${this.config.ports[service]}/${path}` // fallback prod
        ];

        let lastError = null;

        for (const url of fallbackUrls) {
            try {
                console.log(` Tentative avec: ${url}`);
                
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...options.headers
                    },
                    ...options
                });

                if (response.ok) {
                    return response;
                } else {
                    console.warn(` ${url} a retourné ${response.status}`);
                    lastError = new Error(`HTTP ${response.status}`);
                }
            } catch (error) {
                console.warn(` Échec avec ${url}:`, error.message);
                lastError = error;
                continue;
            }
        }

        throw lastError || new Error('Tous les endpoints ont échoué');
    }

    // Debug info
    getDebugInfo() {
        return {
            environment: this.config.environment,
            hostname: window.location.hostname,
            sparqlEndpoint: this.getSparqlEndpoint(),
            apiEndpoint: this.getApiEndpoint(),
            updateAnalysisEndpoint: this.getSparqlEndpoint('update-analysis')
        };
    }
}

// Instance globale
window.apiConfig = new ApiConfigManager();

// 🔧 Fonctions utilitaires pour vos cas d'usage existants

// Pour remplacer votre code de compétence
async function rechercherCompetenceFixed(data) {
   
    try {
        if (!data.questionId) {
            throw new Error("Question ID manquant");
        }

        showSimpleLoading(`Analyse de la question : ${data.questionText.substring(0, 50)}...`);

        const payload = {
            queryType: 'predefined_competence',
            questionId: data.questionId,
            questionText: data.questionText,
            description: data.description
        };

      
        const response = await window.apiConfig.fetchWithFallback('sparql', '', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        const responseData = await response.json();
        console.log(" Réponse reçue:", responseData);

        hideSimpleLoading();
        displayCompetenceResults(responseData, data);

    } catch (error) {
        console.error(' Erreur recherche compétence:', error);
        hideSimpleLoading();
        showError('Erreur de recherche compétence', error.message, data);
    }
}

// Pour remplacer votre code d'update-analysis
async function updateAnalysisFixed(formData, sparqlQueries) {
    
    const payload = {
        formData: formData,
        sparqlQueries: sparqlQueries
    };
    
  
    
    try {
        // 🔥 NOUVEAU : URL dynamique avec fallback
        const response = await window.apiConfig.fetchWithFallback('sparql', 'update-analysis', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        
        const responseData = await response.json();
        
      
        return responseData;

    } catch (error) {
        throw error;
    }
}

// 🔧 Migration automatique de votre code existant

// Fonction pour remplacer automatiquement les URLs hardcodées
function migrateExistingCode() {
    
    // Remplace window.fetch pour intercepter les calls hardcodés (temporaire)
    const originalFetch = window.fetch;
    
    window.fetch = function(url, options = {}) {
        // Détecter et remplacer les URLs localhost hardcodées
        if (typeof url === 'string') {
            if (url.includes('localhost:8003')) {
                const newUrl = url.replace('http://localhost:8003', window.apiConfig.getSparqlEndpoint());
                console.log(` URL migrée: ${url} → ${newUrl}`);
                url = newUrl;
            }
        }
        
        return originalFetch(url, options);
    };
    
}

// 🚀 Initialisation automatique
document.addEventListener('DOMContentLoaded', () => {
    
    // Activer la migration temporaire si nécessaire
    // migrateExistingCode(); // Décommentez pour migration automatique
});

// 🔧 Exemples d'utilisation

// Simple
const sparqlUrl = window.apiConfig.getSparqlEndpoint();
const updateUrl = window.apiConfig.getSparqlEndpoint('update-analysis');

// Avec fallback automatique
async function exempleUtilisation() {
    try {
        const response = await window.apiConfig.fetchWithFallback('sparql', 'mon-endpoint', {
            method: 'POST',
            body: JSON.stringify({ data: 'test' })
        });
        
        const result = await response.json();
        console.log('Résultat:', result);
    } catch (error) {
        console.error('Erreur:', error);
    }
}