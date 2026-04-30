// Service d'autocomplétion basé sur l'ontologie IA-DAS
class OntologyAutocompleteService {
    constructor() {
        // URL du serveur (utilise la même logique que FusekiAnalysisRetriever)
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        this.serverURL = isLocal ? 'http://localhost:8003' : 'http://51.44.188.162:8003';
        
        // Cache des données pour éviter les requêtes répétitives
        this.cache = new Map();
        this.cacheTimeout = 10 * 60 * 1000; // 10 minutes
        
        // Configuration des champs et leurs requêtes SPARQL
        this.fieldConfigs = {
            // Articles
            'journal': {
                query: `
                    PREFIX bibo: <http://purl.org/ontology/bibo/>
                    SELECT DISTINCT ?value WHERE {
                        ?article bibo:journal ?value .
                        FILTER(?value != "N.A.")
                    } ORDER BY ?value LIMIT 100`,
                cache: 'journals'
            },
            'country': {
                query: `
                    PREFIX iadas: <http://ia-das.org/onto#>
                    SELECT DISTINCT ?value WHERE {
                        ?article iadas:country ?value .
                        FILTER(?value != "N.A.")
                    } ORDER BY ?value LIMIT 100`,
                cache: 'countries'
            },
            'studyType': {
                query: `
                    PREFIX iadas: <http://ia-das.org/onto#>
                    SELECT DISTINCT ?value WHERE {
                        ?article iadas:studyType ?value .
                        FILTER(?value != "N.A.")
                    } ORDER BY ?value LIMIT 100`,
                cache: 'studyTypes'
            },
            // Analyse
            'typeOfAnalysis': {
                query: `
                    PREFIX iadas: <http://ia-das.org/onto#>
                    SELECT DISTINCT ?value WHERE {
                        ?analysis iadas:typeOfAnalysis ?value .
                        FILTER(?value != "N.A.")
                    } ORDER BY ?value LIMIT 100`,
                cache: 'analysisTypes'
            },
            'acads': {
                query: `
                    PREFIX iadas: <http://ia-das.org/onto#>
                    SELECT DISTINCT ?value WHERE {
                        ?analysis iadas:acads ?value .
                        FILTER(?value != "N.A.")
                    } ORDER BY ?value LIMIT 100`,
                cache: 'acads'
            },
            // Population
            'gender': {
                query: `
                    PREFIX iadas: <http://ia-das.org/onto#>
                    SELECT DISTINCT ?value WHERE {
                        ?population iadas:gender ?value .
                        FILTER(?value != "N.A.")
                    } ORDER BY ?value LIMIT 50`,
                cache: 'genders'
            },
            'sportingPopulation': {
                query: `
                    PREFIX iadas: <http://ia-das.org/onto#>
                    SELECT DISTINCT ?value WHERE {
                        ?population iadas:sportingPopulation ?value .
                        FILTER(?value != "N.A.")
                    } ORDER BY ?value LIMIT 100`,
                cache: 'sportingPopulations'
            },
            // Sports
            'sportName': {
                query: `
                    PREFIX iadas: <http://ia-das.org/onto#>
                    SELECT DISTINCT ?value WHERE {
                        ?sport iadas:sportName ?value .
                        FILTER(?value != "N.A.")
                    } ORDER BY ?value LIMIT 200`,
                cache: 'sportNames'
            },
            'sportLevel': {
                query: `
                    PREFIX iadas: <http://ia-das.org/onto#>
                    SELECT DISTINCT ?value WHERE {
                        ?sport iadas:sportLevel ?value .
                        FILTER(?value != "N.A.")
                    } ORDER BY ?value LIMIT 50`,
                cache: 'sportLevels'
            },
            'sportPracticeType': {
                query: `
                    PREFIX iadas: <http://ia-das.org/onto#>
                    SELECT DISTINCT ?value WHERE {
                        ?sport iadas:sportPracticeType ?value .
                        FILTER(?value != "N.A.")
                    } ORDER BY ?value LIMIT 50`,
                cache: 'practiceTypes'
            },
            'sportSubcategory': {
                query: `
                    PREFIX iadas: <http://ia-das.org/onto#>
                    SELECT DISTINCT ?value WHERE {
                        ?sport iadas:sportSubcategory ?value .
                        FILTER(?value != "N.A.")
                    } ORDER BY ?value LIMIT 100`,
                cache: 'sportSubcategories'
            },
            // Variables dépendantes
            'vdName': {
                query: `
                    PREFIX iadas: <http://ia-das.org/onto#>
                    SELECT DISTINCT ?value WHERE {
                        ?var iadas:VD ?value .
                        FILTER(?value != "N.A.")
                    } ORDER BY ?value LIMIT 200`,
                cache: 'vdNames'
            },
            'vdCategory': {
                query: `
                    PREFIX iadas: <http://ia-das.org/onto#>
                    SELECT DISTINCT ?value WHERE {
                        ?var iadas:hasCategory ?value ;
                             iadas:variableType "VD" .
                        FILTER(?value != "N.A.")
                    } ORDER BY ?value LIMIT 100`,
                cache: 'vdCategories'
            },
            'vdMeasure': {
                query: `
                    PREFIX iadas: <http://ia-das.org/onto#>
                    SELECT DISTINCT ?value WHERE {
                        ?var iadas:measure ?value ;
                             iadas:variableType "VD" .
                        FILTER(?value != "N.A.")
                    } ORDER BY ?value LIMIT 150`,
                cache: 'vdMeasures'
            },
            // Variables indépendantes
            'viName': {
                query: `
                    PREFIX iadas: <http://ia-das.org/onto#>
                    SELECT DISTINCT ?value WHERE {
                        ?var iadas:VI ?value .
                        FILTER(?value != "N.A.")
                    } ORDER BY ?value LIMIT 200`,
                cache: 'viNames'
            },
            'viCategory': {
                query: `
                    PREFIX iadas: <http://ia-das.org/onto#>
                    SELECT DISTINCT ?value WHERE {
                        ?var iadas:hasCategory ?value ;
                             iadas:variableType "VI" .
                        FILTER(?value != "N.A.")
                    } ORDER BY ?value LIMIT 100`,
                cache: 'viCategories'
            },
            'viMeasure': {
                query: `
                    PREFIX iadas: <http://ia-das.org/onto#>
                    SELECT DISTINCT ?value WHERE {
                        ?var iadas:measure ?value ;
                             iadas:variableType "VI" .
                        FILTER(?value != "N.A.")
                    } ORDER BY ?value LIMIT 150`,
                cache: 'viMeasures'
            },
            // Relations
            'resultatRelation': {
                query: `
                    PREFIX iadas: <http://ia-das.org/onto#>
                    SELECT DISTINCT ?value WHERE {
                        ?relation iadas:resultatRelation ?value .
                        FILTER(?value != "N.A.")
                    } ORDER BY ?value LIMIT 50`,
                cache: 'relationResults'
            },
            // Médiateurs/Modérateurs
            'mediator': {
                query: `
                    PREFIX iadas: <http://ia-das.org/onto#>
                    SELECT DISTINCT ?value WHERE {
                        ?analysis iadas:hasMediator ?value .
                        FILTER(?value != "N.A.")
                    } ORDER BY ?value LIMIT 100`,
                cache: 'mediators'
            },
            'moderator': {
                query: `
                    PREFIX iadas: <http://ia-das.org/onto#>
                    SELECT DISTINCT ?value WHERE {
                        ?analysis iadas:hasModerator ?value .
                        FILTER(?value != "N.A.")
                    } ORDER BY ?value LIMIT 100`,
                cache: 'moderators'
            },
            'mediatorMeasure': {
                query: `
                    PREFIX iadas: <http://ia-das.org/onto#>
                    SELECT DISTINCT ?value WHERE {
                        ?analysis iadas:mediatorMeasure ?value .
                        FILTER(?value != "N.A.")
                    } ORDER BY ?value LIMIT 100`,
                cache: 'mediatorMeasures'
            },
            'moderatorMeasure': {
                query: `
                    PREFIX iadas: <http://ia-das.org/onto#>
                    SELECT DISTINCT ?value WHERE {
                        ?analysis iadas:moderatorMeasure ?value .
                        FILTER(?value != "N.A.")
                    } ORDER BY ?value LIMIT 100`,
                cache: 'moderatorMeasures'
            }
        };
    }

    /**
     * Exécute une requête SPARQL via le serveur
     */
    async executeQuery(sparqlQuery) {
        try {
            const response = await fetch(this.serverURL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    queryType: 'raw_sparql',
                    rawSparqlQuery: sparqlQuery
                })
            });
            
            if (!response.ok) {
                throw new Error(`Erreur serveur: ${response.status}`);
            }
            
            const data = await response.json();
            return data.results?.bindings || [];
            
        } catch (error) {
            console.error('Erreur lors de l\'exécution de la requête:', error);
            return [];
        }
    }

    /**
     * Récupère les suggestions pour un champ donné
     */
    async getSuggestions(fieldName, query = '') {
        const config = this.fieldConfigs[fieldName];
        if (!config) {
            console.warn(`Pas de configuration d'autocomplétion pour le champ: ${fieldName}`);
            return [];
        }

        // Vérifier le cache d'abord
        const cacheKey = config.cache;
        const cached = this.cache.get(cacheKey);
        
        let suggestions = [];
        
        if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
            suggestions = cached.data;
        } else {
            // Récupérer depuis l'ontologie
            try {
                const results = await this.executeQuery(config.query);
                suggestions = results.map(result => result.value?.value).filter(Boolean);
                
                // Mettre en cache
                this.cache.set(cacheKey, {
                    data: suggestions,
                    timestamp: Date.now()
                });
                
                console.log(`💾 ${suggestions.length} suggestions récupérées pour ${fieldName}`);
                
            } catch (error) {
                console.error(`Erreur lors de la récupération des suggestions pour ${fieldName}:`, error);
                return [];
            }
        }

        // Filtrer selon la requête utilisateur
        if (query && query.length > 0) {
            const queryLower = query.toLowerCase();
            suggestions = suggestions.filter(suggestion => 
                suggestion.toLowerCase().includes(queryLower)
            );
        }

        return suggestions.slice(0, 20); // Limiter à 20 résultats
    }

    /**
     * Précharge toutes les données d'autocomplétion (optionnel, pour améliorer les performances)
     */
    async preloadAllData() {
        console.log('🚀 Préchargement des données d\'autocomplétion...');
        
        const promises = Object.entries(this.fieldConfigs).map(async ([fieldName, config]) => {
            try {
                await this.getSuggestions(fieldName);
                console.log(`✅ ${fieldName} préchargé`);
            } catch (error) {
                console.error(`❌ Erreur préchargement ${fieldName}:`, error);
            }
        });

        await Promise.all(promises);
        console.log('✨ Préchargement terminé');
    }

    /**
     * Vide tout le cache
     */
    clearCache() {
        this.cache.clear();
        console.log('🗑️ Cache vidé');
    }

    /**
     * Obtient les statistiques du cache
     */
    getCacheStats() {
        const entries = Array.from(this.cache.entries());
        const now = Date.now();
        const validEntries = entries.filter(([key, data]) => 
            (now - data.timestamp) < this.cacheTimeout
        );
        
        return {
            total: this.cache.size,
            valid: validEntries.length,
            expired: this.cache.size - validEntries.length,
            fields: entries.map(([key, data]) => ({
                field: key,
                count: data.data.length,
                age: Math.round((now - data.timestamp) / 1000) + 's'
            }))
        };
    }

    /**
     * Récupère les champs supportés
     */
    getSupportedFields() {
        return Object.keys(this.fieldConfigs);
    }
}

// Export global
window.OntologyAutocompleteService = OntologyAutocompleteService;

// Instance globale
window.ontologyAutocomplete = new OntologyAutocompleteService();

// Fonction de debug pour la console
window.debugAutocomplete = async function(fieldName, query = '') {
    console.log(`=== DEBUG AUTOCOMPLÉTION: ${fieldName} ===`);
    
    if (fieldName) {
        const suggestions = await window.ontologyAutocomplete.getSuggestions(fieldName, query);
        console.log(`Suggestions pour "${fieldName}" avec requête "${query}":`, suggestions);
        return suggestions;
    } else {
        console.log('Champs supportés:', window.ontologyAutocomplete.getSupportedFields());
        console.log('Stats cache:', window.ontologyAutocomplete.getCacheStats());
        return window.ontologyAutocomplete.getSupportedFields();
    }
};