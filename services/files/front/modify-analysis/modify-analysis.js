document.addEventListener('DOMContentLoaded', function () {

    const selectionStep = document.getElementById('selection-step');
    const editStep = document.getElementById('edit-step');
    const searchInput = document.getElementById('analysisIdSearch');
    const searchBtn = document.getElementById('searchBtn');
    const loadAllBtn = document.getElementById('loadAllBtn');
    const searchResults = document.getElementById('search-results');
    const analysesList = document.getElementById('analyses-list');
    const currentAnalysisId = document.getElementById('current-analysis-id');
    const backToSearchBtn = document.getElementById('backToSearch');
    const modifyForm = document.getElementById('modifyAnalysisForm');
    const previewBtn = document.getElementById('previewChanges');
    const saveBtn = document.getElementById('saveChanges');

    // Variables globales
    let currentAnalysisData = null;
    let isLoading = false;

    // Configuration
    const SERVER_URL = window.location.hostname === 'localhost' ?
        'http://localhost:8003' :
        `http://${window.location.hostname}:8003`;

    // ================== UTILITAIRES ==================

    // Afficher un message de statut
    function showMessage(type, message) {
        // Créer ou mettre à jour un élément de message
        let messageEl = document.getElementById('status-message');
        if (!messageEl) {
            messageEl = document.createElement('div');
            messageEl.id = 'status-message';
            messageEl.className = `message message-${type}`;
            document.querySelector('.modify-container').insertBefore(messageEl, document.querySelector('.modify-container').firstChild);
        }

        messageEl.className = `message message-${type}`;
        messageEl.textContent = message;
        messageEl.style.display = 'block';

        // Auto-hide après 5 secondes pour les succès
        if (type === 'success') {
            setTimeout(() => {
                messageEl.style.display = 'none';
            }, 5000);
        }
    }

    // Nettoyer les messages
    function clearMessages() {
        const messageEl = document.getElementById('status-message');
        if (messageEl) {
            messageEl.style.display = 'none';
        }
    }

    // Basculer entre les étapes
    function showStep(stepName) {
        if (stepName === 'selection') {
            selectionStep.style.display = 'block';
            editStep.style.display = 'none';
        } else if (stepName === 'edit') {
            selectionStep.style.display = 'none';
            editStep.style.display = 'block';
        }
    }

    // ================== REQUÊTES SPARQL ==================

    // Exécuter une requête SPARQL
    async function executeQuery(sparqlQuery) {
        try {

            const response = await fetch(
                window.location.hostname === 'localhost'
                    ? 'http://localhost:8003'
                    : 'http://51.44.188.162:8003',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        queryType: 'raw_sparql',
                        rawSparqlQuery: sparqlQuery
                    })
                }
            );


            if (!response.ok) {
                throw new Error(`Erreur serveur: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            return data.results?.bindings || [];

        } catch (error) {
            throw new Error(`Impossible de contacter le serveur: ${error.message}`);
        }
    }

    // ================== RECHERCHE D'ANALYSES ==================

    // Rechercher des analyses par ID (partiel)
    async function searchAnalysesByIds(searchTerm) {
        console.log(' Recherche analyses avec terme:', searchTerm);

        const query = `
PREFIX iadas: <http://ia-das.org/onto#>
PREFIX iadas-data: <http://ia-das.org/data#>

SELECT ?analysis ?analysisId WHERE {
    ?analysis a iadas:Analysis ;
              iadas:analysisId ?analysisId .
    FILTER(CONTAINS(LCASE(?analysisId), "${searchTerm.toLowerCase()}"))
}
ORDER BY ?analysisId
LIMIT 50`;

        return await executeQuery(query);
    }

    // Récupérer toutes les analyses (limitées)
    async function getAllAnalyses() {

        const query = `
PREFIX iadas: <http://ia-das.org/onto#>
PREFIX iadas-data: <http://ia-das.org/data#>

SELECT ?analysis ?analysisId WHERE {
    ?analysis a iadas:Analysis ;
              iadas:analysisId ?analysisId .
}
ORDER BY ?analysisId
LIMIT 10000`;

        return await executeQuery(query);
    }

    // Afficher les résultats de recherche
    function displaySearchResults(analyses) {
        analysesList.innerHTML = '';

        if (analyses.length === 0) {
            analysesList.innerHTML = '<div class="no-results"> Aucune analyse trouvée</div>';
            searchResults.style.display = 'block';
            return;
        }


        analyses.forEach(analysis => {
            const analysisId = analysis.analysisId?.value || 'ID inconnu';
            const analysisURI = analysis.analysis?.value || '';

            const item = document.createElement('div');
            item.className = 'analysis-item';
            item.innerHTML = `
                <div class="analysis-info">
                    <strong>ID: ${analysisId}</strong>
                    <small>${analysisURI}</small>
                </div>
                <div class="analysis-actions">
                    <button class="btn-select" onclick="selectAnalysisForEditing('${analysisId}')">
                         Modifier cette analyse
                    </button>
                    <button class="btn-delete" onclick="deleteAnalysis('${analysisId}')">
                         Supprimer cette analyse
                    </button>
                </div>
            `;

            analysesList.appendChild(item);
        });

        searchResults.style.display = 'block';
    }

    // ================== CHARGEMENT DES DONNÉES ==================

    // Charger toutes les données d'une analyse
    async function loadCompleteAnalysisData(analysisId) {

        // Requête complexe pour récupérer TOUTES les données
        const query = `
PREFIX iadas: <http://ia-das.org/onto#>
PREFIX iadas-data: <http://ia-das.org/data#>
PREFIX bibo: <http://purl.org/ontology/bibo/>
PREFIX dcterms: <http://purl.org/dc/terms/>

SELECT ?property ?value ?entity WHERE {
    {
        # Données de l'analyse
        iadas-data:Analysis_${analysisId} ?property ?value .
        BIND("analysis" AS ?entity)
    }
    UNION
    {
        # Données de l'article lié
        ?article iadas:hasAnalysis iadas-data:Analysis_${analysisId} ;
                 ?property ?value .
        BIND("article" AS ?entity)
    }
    UNION
    {
        # Données de la population
        iadas-data:Analysis_${analysisId} iadas:hasPopulation ?population .
        ?population ?property ?value .
        BIND("population" AS ?entity)
    }
    UNION
    {
        # Données du sport
        iadas-data:Analysis_${analysisId} iadas:hasSport ?sport .
        ?sport ?property ?value .
        BIND("sport" AS ?entity)
    }
    UNION
    {
        # Données des relations
        iadas-data:Analysis_${analysisId} iadas:hasRelation ?relation .
        ?relation ?property ?value .
        BIND("relation" AS ?entity)
    }
    UNION
    {
        # Variable dépendante
        iadas-data:Analysis_${analysisId} iadas:hasRelation ?relation .
        ?relation iadas:hasDependentVariable ?varVD .
        ?varVD ?property ?value .
        BIND("variableVD" AS ?entity)
    }
    UNION
    {
        # Variable indépendante
        iadas-data:Analysis_${analysisId} iadas:hasRelation ?relation .
        ?relation iadas:hasIndependentVariable ?varVI .
        ?varVI ?property ?value .
        BIND("variableVI" AS ?entity)
    }
    UNION
    {
        # Statistiques d'âge
        iadas-data:Analysis_${analysisId} iadas:hasPopulation ?population .
        ?population iadas:ageStats ?ageStats .
        ?ageStats ?property ?value .
        BIND("ageStats" AS ?entity)
    }
    UNION
    {
        # Statistiques de BMI
        iadas-data:Analysis_${analysisId} iadas:hasPopulation ?population .
        ?population iadas:bmiStats ?bmiStats .
        ?bmiStats ?property ?value .
        BIND("bmiStats" AS ?entity)
    }
}`;

        const results = await executeQuery(query);
        return parseAnalysisResults(results);
    }

    // Parser les résultats SPARQL en objet structuré
    function parseAnalysisResults(results) {

        const data = {};

        results.forEach(result => {
            const property = result.property?.value;
            const value = result.value?.value;
            const entity = result.entity?.value;

            if (!property || !value) return;

            // Extraire le nom de la propriété (après le # ou après le dernier /)
            let propName = property.split('#')[1];
            if (!propName) {
                // Si pas de #, prendre après le dernier /
                const parts = property.split('/');
                propName = parts[parts.length - 1];
            }

            // Mapper selon l'entité
            switch (entity) {
                case 'analysis':
                    mapAnalysisProperty(data, propName, value);
                    break;
                case 'article':
                    mapArticleProperty(data, propName, value);
                    break;
                case 'population':
                    mapPopulationProperty(data, propName, value);
                    break;
                case 'sport':
                    mapSportProperty(data, propName, value);
                    break;
                case 'relation':
                    mapRelationProperty(data, propName, value);
                    break;
                case 'variableVD':
                    mapVariableProperty(data, propName, value, 'vd');
                    break;
                case 'variableVI':
                    mapVariableProperty(data, propName, value, 'vi');
                    break;
                case 'ageStats':
                    mapAgeStatsProperty(data, propName, value);
                    break;
                case 'bmiStats':
                    mapBmiStatsProperty(data, propName, value);
                    break;
            }
        });

        return data;
    }

    // Fonctions de mapping des propriétés (CORRIGÉES selon l'ontologie)
    function mapAnalysisProperty(data, propName, value) {
        const mapping = {
            'analysisId': 'analysisId',
            'typeOfAnalysis': 'typeOfAnalysis',
            'analysisMultiplicity': 'analysisMultiplicity',
            'relationDegree': 'relationDegree',
            'sampleSizeMobilized': 'sampleSizeMobilized',
            'authorConclusion': 'authorConclusion',
            'limites': 'limites',
            'perspectives': 'perspectives',
            'acads': 'acads',
            'hasMediator': 'mediator',
            'hasModerator': 'moderator',
            'moderatorMeasure': 'moderatorMeasure',
            'mediatorMeasure': 'mediatorMeasure'
        };

        if (mapping[propName]) {
            data[mapping[propName]] = value;
        }
    }

    function mapArticleProperty(data, propName, value) {
        const mapping = {
            'doi': 'doi',
            'title': 'title',
            'creator': 'authors',
            'journal': 'journal',
            'date': 'year',
            'country': 'country',
            'studyType': 'studyType'
        };

        if (mapping[propName]) {
            data[mapping[propName]] = value;
        } else {
            // Debug : afficher les propriétés non mappées
        }
    }

    function mapPopulationProperty(data, propName, value) {
        const mapping = {
            'sampleSize': 'sampleSize',
            'gender': 'gender',
            'population': 'population',
            'inclusionCriteria': 'inclusionCriteria',
            'hasSubgroup': 'hasSubgroup',
            'sportingPopulation': 'sportingPopulation',
            
        };

        if (mapping[propName]) {
            data[mapping[propName]] = value;
        }
    }

    function mapSportProperty(data, propName, value) {
        const mapping = {
            'sportName': 'sportName',
            'sportLevel': 'sportLevel',
            'sportPracticeType': 'sportPracticeType',
            'sportSubcategory': 'sportSubcategory'
        };

        if (mapping[propName]) {
            data[mapping[propName]] = value;
            console.log(` Sport - ${propName} → ${mapping[propName]}: ${value}`);
        }
    }

    function mapRelationProperty(data, propName, value) {
        const mapping = {
            'degreR': 'degreR',
            'degreP': 'degreP',
            'signeP': 'signeP',
            'degreBeta': 'degreBeta',
            'degreR2': 'degreR2',
            'resultatRelation': 'resultatRelation',
            'sousGroupeAnalyse': 'sousGroupeAnalyse',
            'sousGroupeAnalyse2': 'sousGroupeAnalyse2',
            'relationDegreeSecondary': 'relationDegreeSecondary'
        };

        if (mapping[propName]) {
            data[mapping[propName]] = value;
        }
    }

    function mapVariableProperty(data, propName, value, type) {
        const prefix = type === 'vd' ? 'vd' : 'vi';

        // CORRECTION IMPORTANTE : VD et VI sont les noms des propriétés !
        const mapping = {
            'VD': `${prefix}Name`,           // iadas:VD → vdName
            'VI': `${prefix}Name`,           // iadas:VI → viName  
            'hasCategory': `${prefix}Category`,
            'measure': `${prefix}Measure`,
            'subClass1': `${prefix}SubClass1`,
            'subClass2': `${prefix}SubClass2`,
            'subClass3': `${prefix}SubClass3`,
            'subClass4': `${prefix}SubClass4`,
            'finalClass': `${prefix}FinalClass`,
            'variableType': `${prefix}Type`
        };

        if (mapping[propName]) {
            data[mapping[propName]] = value;
        }
    }

    function mapAgeStatsProperty(data, propName, value) {
        const mapping = {
            'ageDescription': 'ageDescription',
            'meanAge': 'meanAge',
            'sdAge': 'sdAge',
            'minAge': 'minAge',
            'maxAge': 'maxAge'
        };

        if (mapping[propName]) {
            data[mapping[propName]] = value;
        }
    }

    function mapBmiStatsProperty(data, propName, value) {
        const mapping = {
            'bmiDescription': 'bmiDescription',
            'meanBMI': 'meanBMI',
            'sdBMI': 'sdBMI',
            'minBMI': 'minBMI',
            'maxBMI': 'maxBMI'
        };

        if (mapping[propName]) {
            data[mapping[propName]] = value;
        }
    }

    // ================== GESTION DU FORMULAIRE ==================

    // Pré-remplir le formulaire avec les données
    function populateForm(data) {

        // Parcourir tous les champs et les remplir
        Object.keys(data).forEach(key => {
            const field = document.getElementById(key);
            if (field && data[key] !== undefined) {
                field.value = data[key] === 'N.A.' ? '' : data[key];
                console.log(`✓ ${key}: ${data[key]}`);
            }
        });

        // S'assurer que l'ID d'analyse est affiché et non modifiable
        const analysisIdField = document.getElementById('analysisId');
        if (analysisIdField && data.analysisId) {
            analysisIdField.value = data.analysisId;

        }
    }

    // Collecter les données du formulaire
    function collectFormData() {
        const formData = new FormData(modifyForm);
        const data = {};

        for (let [key, value] of formData.entries()) {
            data[key] = value.trim() || 'N.A.';
        }

        return data;
    }

    // ================== GÉNÉRATION DES REQUÊTES UPDATE ==================

    // Générateur de requêtes UPDATE (adapté de SPARQLGenerator)
    class UpdateSPARQLGenerator {
        constructor() {
            this.prefixes = `
PREFIX iadas: <http://ia-das.org/onto#>
PREFIX iadas-data: <http://ia-das.org/data#>
PREFIX bibo: <http://purl.org/ontology/bibo/>
PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>`;
        }

        // Nettoyer les valeurs
        cleanValue(value) {
            if (!value || value === 'N.A.') return 'N.A.';
            return value.toString().replace(/"/g, '\\"').replace(/\n/g, '\\n');
        }

        // Générer un literal SPARQL
        literal(value, type = 'string') {
            const cleanedValue = this.cleanValue(value);

            if (cleanedValue === 'N.A.') {
                return '"N.A."';
            }

            switch (type) {
                case 'integer':
                    return `"${cleanedValue}"^^xsd:integer`;
                case 'decimal':
                    return `"${cleanedValue}"^^xsd:decimal`;
                default:
                    return `"${cleanedValue}"`;
            }
        }

        // Générer requête UPDATE pour l'analyse
        generateAnalysisUpdate(data, originalData) {
            const analysisId = this.cleanValue(data.analysisId);

            return `${this.prefixes}

DELETE {
    iadas-data:Analysis_${analysisId} iadas:typeOfAnalysis ?oldTypeOfAnalysis ;
                                      iadas:analysisMultiplicity ?oldMultiplicity ;
                                      iadas:relationDegree ?oldRelationDegree ;
                                      iadas:sampleSizeMobilized ?oldSampleSize ;
                                      iadas:authorConclusion ?oldConclusion ;
                                      iadas:limites ?oldLimites ;
                                      iadas:perspectives ?oldPerspectives ;
                                      iadas:acads ?oldAcads ;
                                      iadas:hasMediator ?oldMediator ;
                                      iadas:hasModerator ?oldModerator .
}
INSERT {
    iadas-data:Analysis_${analysisId} iadas:typeOfAnalysis ${this.literal(data.typeOfAnalysis)} ;
                                      iadas:analysisMultiplicity ${this.literal(data.analysisMultiplicity)} ;
                                      iadas:relationDegree ${this.literal(data.relationDegree)} ;
                                      iadas:sampleSizeMobilized ${this.literal(data.sampleSizeMobilized, 'integer')} ;
                                      iadas:authorConclusion ${this.literal(data.authorConclusion)} ;
                                      iadas:limites ${this.literal(data.limites)} ;
                                      iadas:perspectives ${this.literal(data.perspectives)} ;
                                      iadas:acads ${this.literal(data.acads)} ;
                                      iadas:hasMediator ${this.literal(data.mediator)} ;
                                      iadas:hasModerator ${this.literal(data.moderator)} .
}
WHERE {
    iadas-data:Analysis_${analysisId} a iadas:Analysis .
    OPTIONAL { iadas-data:Analysis_${analysisId} iadas:typeOfAnalysis ?oldTypeOfAnalysis }
    OPTIONAL { iadas-data:Analysis_${analysisId} iadas:analysisMultiplicity ?oldMultiplicity }
    OPTIONAL { iadas-data:Analysis_${analysisId} iadas:relationDegree ?oldRelationDegree }
    OPTIONAL { iadas-data:Analysis_${analysisId} iadas:sampleSizeMobilized ?oldSampleSize }
    OPTIONAL { iadas-data:Analysis_${analysisId} iadas:authorConclusion ?oldConclusion }
    OPTIONAL { iadas-data:Analysis_${analysisId} iadas:limites ?oldLimites }
    OPTIONAL { iadas-data:Analysis_${analysisId} iadas:perspectives ?oldPerspectives }
    OPTIONAL { iadas-data:Analysis_${analysisId} iadas:acads ?oldAcads }
    OPTIONAL { iadas-data:Analysis_${analysisId} iadas:hasMediator ?oldMediator }
    OPTIONAL { iadas-data:Analysis_${analysisId} iadas:hasModerator ?oldModerator }
}`;
        }

        // Générer toutes les requêtes UPDATE
        generateAllUpdates(data, originalData) {
            return {
                analysis: this.generateAnalysisUpdate(data, originalData)
                // TODO: Ajouter d'autres entités (article, population, etc.)
            };
        }
    }

    // ================== SUPPRESSION D'ANALYSE ==================

    // Fonction globale pour supprimer une analyse
    window.deleteAnalysis = async function (analysisId) {
        console.log('🗑️ Demande de suppression pour l\'analyse:', analysisId);

        // Confirmation de suppression
        const confirmMessage = `Êtes-vous sûr de vouloir supprimer définitivement l'analyse ${analysisId} ?\n\nCette action est irréversible et supprimera :\n- L'analyse elle-même\n- Toutes ses données associées\n- Les relations avec l'article\n- Les données de population et sport\n- Les variables et statistiques\n\nTapez "SUPPRIMER" pour confirmer :`;
        
        const userConfirmation = prompt(confirmMessage);
        
        if (userConfirmation !== 'SUPPRIMER') {
            showMessage('info', 'Suppression annulée');
            return;
        }

        if (isLoading) return;
        isLoading = true;

        try {
            clearMessages();
            showMessage('info', `Suppression de l'analyse ${analysisId} en cours...`);

            // Générer la requête de suppression
            const deleteQuery = generateDeleteQuery(analysisId);

            // Envoyer au serveur - Utiliser l'endpoint /update-analysis pour la suppression
            const response = await fetch(
                window.location.hostname === 'localhost'
                    ? 'http://localhost:8003/delete-analysis'
                    : 'http://51.44.188.162:8003/delete-analysis',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        queryType: 'raw_sparql',
                        rawSparqlQuery: deleteQuery,
                        operation: 'delete',
                        analysisId: analysisId
                    })
                }
            );

            if (!response.ok) {
                throw new Error(`Erreur serveur: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            
            showMessage('success', `✅ Analyse ${analysisId} supprimée avec succès !`);
            
            // Rafraîchir la liste des analyses
            const currentSearchTerm = searchInput.value.trim();
            if (currentSearchTerm) {
                // Rechercher à nouveau avec le même terme
                const results = await searchAnalysesByIds(currentSearchTerm);
                displaySearchResults(results);
            } else {
                // Recharger toutes les analyses
                const results = await getAllAnalyses();
                displaySearchResults(results);
            }

        } catch (error) {
            console.error('💥 Erreur lors de la suppression:', error);
            showMessage('error', `Erreur lors de la suppression: ${error.message}`);
        } finally {
            isLoading = false;
        }
    };

    // Générer la requête SPARQL DELETE pour une analyse complète
    function generateDeleteQuery(analysisId) {
        const cleanedAnalysisId = analysisId.replace(/[^a-zA-Z0-9_-]/g, '_');
        
        return `
PREFIX iadas: <http://ia-das.org/onto#>
PREFIX iadas-data: <http://ia-das.org/data#>
PREFIX bibo: <http://purl.org/ontology/bibo/>
PREFIX dcterms: <http://purl.org/dc/terms/>

DELETE {
    # Supprimer l'analyse elle-même
    iadas-data:Analysis_${cleanedAnalysisId} ?p1 ?o1 .
    ?s1 ?p1b iadas-data:Analysis_${cleanedAnalysisId} .
    
    # Supprimer la population associée
    iadas-data:Population_${cleanedAnalysisId} ?p2 ?o2 .
    ?s2 ?p2b iadas-data:Population_${cleanedAnalysisId} .
    
    # Supprimer le sport associé
    iadas-data:Sport_${cleanedAnalysisId} ?p3 ?o3 .
    ?s3 ?p3b iadas-data:Sport_${cleanedAnalysisId} .
    
    # Supprimer les relations
    iadas-data:Relations_${cleanedAnalysisId} ?p4 ?o4 .
    ?s4 ?p4b iadas-data:Relations_${cleanedAnalysisId} .
    
    # Supprimer les variables VD et VI
    iadas-data:Variable_VD_${cleanedAnalysisId} ?p5 ?o5 .
    ?s5 ?p5b iadas-data:Variable_VD_${cleanedAnalysisId} .
    iadas-data:Variable_VI_${cleanedAnalysisId} ?p6 ?o6 .
    ?s6 ?p6b iadas-data:Variable_VI_${cleanedAnalysisId} .
    
    # Supprimer les statistiques d'âge
    iadas-data:AgeStats_${cleanedAnalysisId} ?p7 ?o7 .
    ?s7 ?p7b iadas-data:AgeStats_${cleanedAnalysisId} .
    
    # Supprimer les statistiques BMI
    iadas-data:BMIStats_${cleanedAnalysisId} ?p8 ?o8 .
    ?s8 ?p8b iadas-data:BMIStats_${cleanedAnalysisId} .
    
    # Supprimer les liens depuis l'article
    ?article iadas:hasAnalysis iadas-data:Analysis_${cleanedAnalysisId} .
}
WHERE {
    {
        # Propriétés de l'analyse
        iadas-data:Analysis_${cleanedAnalysisId} ?p1 ?o1 .
    }
    UNION
    {
        # Références vers l'analyse
        ?s1 ?p1b iadas-data:Analysis_${cleanedAnalysisId} .
    }
    UNION
    {
        # Propriétés de la population
        iadas-data:Population_${cleanedAnalysisId} ?p2 ?o2 .
    }
    UNION
    {
        # Références vers la population
        ?s2 ?p2b iadas-data:Population_${cleanedAnalysisId} .
    }
    UNION
    {
        # Propriétés du sport
        iadas-data:Sport_${cleanedAnalysisId} ?p3 ?o3 .
    }
    UNION
    {
        # Références vers le sport
        ?s3 ?p3b iadas-data:Sport_${cleanedAnalysisId} .
    }
    UNION
    {
        # Propriétés des relations
        iadas-data:Relations_${cleanedAnalysisId} ?p4 ?o4 .
    }
    UNION
    {
        # Références vers les relations
        ?s4 ?p4b iadas-data:Relations_${cleanedAnalysisId} .
    }
    UNION
    {
        # Propriétés des variables VD
        iadas-data:Variable_VD_${cleanedAnalysisId} ?p5 ?o5 .
    }
    UNION
    {
        # Références vers les variables VD
        ?s5 ?p5b iadas-data:Variable_VD_${cleanedAnalysisId} .
    }
    UNION
    {
        # Propriétés des variables VI
        iadas-data:Variable_VI_${cleanedAnalysisId} ?p6 ?o6 .
    }
    UNION
    {
        # Références vers les variables VI
        ?s6 ?p6b iadas-data:Variable_VI_${cleanedAnalysisId} .
    }
    UNION
    {
        # Propriétés des stats d'âge
        iadas-data:AgeStats_${cleanedAnalysisId} ?p7 ?o7 .
    }
    UNION
    {
        # Références vers les stats d'âge
        ?s7 ?p7b iadas-data:AgeStats_${cleanedAnalysisId} .
    }
    UNION
    {
        # Propriétés des stats BMI
        iadas-data:BMIStats_${cleanedAnalysisId} ?p8 ?o8 .
    }
    UNION
    {
        # Références vers les stats BMI
        ?s8 ?p8b iadas-data:BMIStats_${cleanedAnalysisId} .
    }
    UNION
    {
        # Lien depuis l'article
        ?article iadas:hasAnalysis iadas-data:Analysis_${cleanedAnalysisId} .
    }
}`;
    }

    // ================== GESTION DES ÉVÉNEMENTS ==================

    // Fonction globale pour sélectionner une analyse (appelée depuis le HTML)
    window.selectAnalysisForEditing = async function (analysisId) {

        if (isLoading) return;
        isLoading = true;

        try {
            clearMessages();
            showMessage('info', `Chargement des données de l'analyse ${analysisId}...`);

            // Charger les données complètes
            const data = await loadCompleteAnalysisData(analysisId);
            currentAnalysisData = data;

            // Mettre à jour l'affichage
            currentAnalysisId.textContent = analysisId;

            // Pré-remplir le formulaire
            populateForm(data);

            // Basculer vers l'étape de modification
            showStep('edit');

            clearMessages();
            showMessage('success', `Données chargées avec succès pour l'analyse ${analysisId}`);

        } catch (error) {
            console.error('💥 Erreur lors du chargement:', error);
            showMessage('error', `Erreur lors du chargement: ${error.message}`);
        } finally {
            isLoading = false;
        }
    };

    // Gestionnaire de recherche
    searchBtn.addEventListener('click', async function () {
        const searchTerm = searchInput.value.trim();

        if (!searchTerm) {
            showMessage('error', 'Veuillez saisir un ID d\'analyse à rechercher');
            return;
        }

        if (isLoading) return;
        isLoading = true;

        try {
            clearMessages();
            showMessage('info', 'Recherche en cours...');

            const results = await searchAnalysesByIds(searchTerm);
            displaySearchResults(results);

            clearMessages();
            showMessage('success', `${results.length} analyse(s) trouvée(s)`);

        } catch (error) {
            console.error('💥 Erreur lors de la recherche:', error);
            showMessage('error', `Erreur lors de la recherche: ${error.message}`);
        } finally {
            isLoading = false;
        }
    });

    // Gestionnaire "Voir toutes les analyses"
    loadAllBtn.addEventListener('click', async function () {
        if (isLoading) return;
        isLoading = true;

        try {
            clearMessages();
            showMessage('info', 'Chargement de toutes les analyses...');

            const results = await getAllAnalyses();
            displaySearchResults(results);

            clearMessages();
            showMessage('success', `${results.length} analyse(s) trouvée(s)`);

        } catch (error) {
            console.error('💥 Erreur lors du chargement:', error);
            showMessage('error', `Erreur lors du chargement: ${error.message}`);
        } finally {
            isLoading = false;
        }
    });

    // Gestionnaire "Retour à la recherche"
    backToSearchBtn.addEventListener('click', function () {
        showStep('selection');
        currentAnalysisData = null;
        modifyForm.reset();
        clearMessages();
    });

    // Gestionnaire "Prévisualiser les modifications"
    previewBtn.addEventListener('click', function () {
        const data = collectFormData();

        // Créer une fenêtre de prévisualisation
        const previewWindow = window.open('', 'preview', 'width=900,height=700,scrollbars=yes');

        const previewHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Prévisualisation - Modifications analyse ${data.analysisId}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .section { margin-bottom: 30px; border: 1px solid #ddd; padding: 15px; border-radius: 8px; }
                .section h2 { color: #2c3e50; border-bottom: 2px solid #ecf0f1; padding-bottom: 10px; }
                .field { margin-bottom: 10px; display: flex; }
                .field label { font-weight: bold; color: #34495e; min-width: 200px; }
                .field span { margin-left: 10px; flex: 1; }
                .na { color: #7f8c8d; font-style: italic; }
                .changed { background-color: #fff3cd; padding: 2px 4px; border-radius: 3px; }
            </style>
        </head>
        <body>
            <h1> Prévisualisation des modifications</h1>
            <p><strong>Analyse ID:</strong> ${data.analysisId}</p>
            
            <div class="section">
                <h2> Article</h2>
                <div class="field"><label>DOI:</label><span class="${data.doi === 'N.A.' ? 'na' : ''}">${data.doi}</span></div>
                <div class="field"><label>Titre:</label><span class="${data.title === 'N.A.' ? 'na' : ''}">${data.title}</span></div>
                <div class="field"><label>Auteurs:</label><span class="${data.authors === 'N.A.' ? 'na' : ''}">${data.authors}</span></div>
                <div class="field"><label>Journal:</label><span class="${data.journal === 'N.A.' ? 'na' : ''}">${data.journal}</span></div>
                <div class="field"><label>Année:</label><span class="${data.year === 'N.A.' ? 'na' : ''}">${data.year}</span></div>
                <div class="field"><label>Pays:</label><span class="${data.country === 'N.A.' ? 'na' : ''}">${data.country}</span></div>
            </div>
            
            <div class="section">
                <h2> Analyse</h2>
                <div class="field"><label>Type d'analyse:</label><span class="${data.typeOfAnalysis === 'N.A.' ? 'na' : ''}">${data.typeOfAnalysis}</span></div>
                <div class="field"><label>Multiplicité:</label><span class="${data.analysisMultiplicity === 'N.A.' ? 'na' : ''}">${data.analysisMultiplicity}</span></div>
                <div class="field"><label>Conclusions:</label><span class="${data.authorConclusion === 'N.A.' ? 'na' : ''}">${data.authorConclusion}</span></div>
            </div>
            
            <div class="section">
                <h2> Population</h2>
                <div class="field"><label>Taille échantillon:</label><span class="${data.sampleSize === 'N.A.' ? 'na' : ''}">${data.sampleSize}</span></div>
                <div class="field"><label>Genre:</label><span class="${data.gender === 'N.A.' ? 'na' : ''}">${data.gender}</span></div>
                <div class="field"><label>Description:</label><span class="${data.population === 'N.A.' ? 'na' : ''}">${data.population}</span></div>
            </div>
            
            <div class="section">
                <h2> Sport</h2>
                <div class="field"><label>Nom:</label><span class="${data.sportName === 'N.A.' ? 'na' : ''}">${data.sportName}</span></div>
                <div class="field"><label>Niveau:</label><span class="${data.sportLevel === 'N.A.' ? 'na' : ''}">${data.sportLevel}</span></div>
            </div>
            
            <div class="section">
                <h2> Variables</h2>
                <h3>Variable Dépendante</h3>
                <div class="field"><label>VD:</label><span class="${data.vdName === 'N.A.' ? 'na' : ''}">${data.vdName}</span></div>
                <div class="field"><label>Catégorie VD:</label><span class="${data.vdCategory === 'N.A.' ? 'na' : ''}">${data.vdCategory}</span></div>
                
                <h3>Variable Indépendante</h3>
                <div class="field"><label>VI:</label><span class="${data.viName === 'N.A.' ? 'na' : ''}">${data.viName}</span></div>
                <div class="field"><label>Catégorie VI:</label><span class="${data.viCategory === 'N.A.' ? 'na' : ''}">${data.viCategory}</span></div>
            </div>
            
            <div class="section">
                <h2> Relations statistiques</h2>
                <div class="field"><label>Coefficient r:</label><span class="${data.degreR === 'N.A.' ? 'na' : ''}">${data.degreR}</span></div>
                <div class="field"><label>Valeur p:</label><span class="${data.degreP === 'N.A.' ? 'na' : ''}">${data.degreP}</span></div>
                <div class="field"><label>Beta:</label><span class="${data.degreBeta === 'N.A.' ? 'na' : ''}">${data.degreBeta}</span></div>
                <div class="field"><label>Résultat:</label><span class="${data.resultatRelation === 'N.A.' ? 'na' : ''}">${data.resultatRelation}</span></div>
            </div>
            
            <div class="section">
                <h2> Médiateurs et Modérateurs</h2>
                <div class="field"><label>Médiateur:</label><span class="${data.mediator === 'N.A.' ? 'na' : ''}">${data.mediator}</span></div>
                <div class="field"><label>Modérateur:</label><span class="${data.moderator === 'N.A.' ? 'na' : ''}">${data.moderator}</span></div>
            </div>
            
            <button onclick="window.close()" style="padding: 10px 20px; background: #2980b9; color: white; border: none; border-radius: 5px; margin-top: 20px;">Fermer la prévisualisation</button>
        </body>
        </html>`;

        previewWindow.document.write(previewHTML);
        previewWindow.document.close();
    });

    // Gestionnaire "Sauvegarder les modifications"
    modifyForm.addEventListener('submit', async function (event) {
        event.preventDefault();

        if (isLoading) return;
        isLoading = true;

        try {
            clearMessages();
            showMessage('info', 'Génération des requêtes de modification...');

            const formData = collectFormData();

            // Générer les requêtes UPDATE
            const generator = new ExtendedUpdateSPARQLGenerator();
            const updateQueries = generator.generateAllUpdates(formData, currentAnalysisData);


            // Envoyer au serveur
            showMessage('info', 'Envoi des modifications au serveur...');

            const response = await fetch(
                window.location.hostname === 'localhost'
                    ? 'http://localhost:8003/update-analysis'
                    : 'http://51.44.188.162:8003/update-analysis',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        formData: formData,
                        sparqlQueries: updateQueries,
                        operation: 'update',
                        originalAnalysisId: currentAnalysisData.analysisId
                    })
                }
            );


            const result = await response.json();

            if (response.ok || response.status === 207) {
                // Succès complet ou partiel
                const successCount = result.results?.successCount || 0;
                const totalCount = result.results?.totalQueries || 0;

                if (response.status === 200) {
                    showMessage('success', `✅ Analyse modifiée avec succès ! ${successCount} objets mis à jour.`);
                    
                    // Mettre à jour la date de dernière mise à jour
                    if (typeof window.updateHomePageDate === 'function') {
                        window.updateHomePageDate();
                    }
                } else {
                    showMessage('warning', `⚠️ Modification partielle : ${successCount}/${totalCount} objets mis à jour.`);
                }

                // Mettre à jour les données actuelles
                currentAnalysisData = formData;

                // Proposer de retourner à la recherche
                setTimeout(() => {
                    if (confirm('Modification terminée ! Voulez-vous retourner à la recherche pour modifier une autre analyse ?')) {
                        showStep('selection');
                        modifyForm.reset();
                        clearMessages();
                    }
                }, 2000);

            } else {
                // Erreur
                showMessage('error', `❌ Erreur lors de la modification: ${result.message || 'Erreur inconnue'}`);
                console.error('Détails de l\'erreur:', result);
            }

        } catch (error) {
            console.error('💥 Erreur lors de la sauvegarde:', error);
            showMessage('error', `Erreur de connexion: ${error.message}`);
        } finally {
            isLoading = false;
        }
    });

    // Gestionnaire pour la recherche avec Enter
    searchInput.addEventListener('keypress', function (event) {
        if (event.key === 'Enter') {
            searchBtn.click();
        }
    });

    // ================== INITIALISATION ==================

    // Fonctions utilitaires globales pour debug
    window.debugModifyAnalysis = function () {
        console.log('=== DEBUG MODIFY ANALYSIS ===');
        console.log('Current analysis data:', currentAnalysisData);
        console.log('Form data:', collectFormData());

        if (currentAnalysisData) {
            const generator = new ExtendedUpdateSPARQLGenerator();
            const queries = generator.generateAllUpdates(collectFormData(), currentAnalysisData);
            console.log('Generated UPDATE queries:', queries);
            return queries;
        }
    };

    // Test de connexion serveur au chargement
    async function testServerConnection() {
        try {
            console.log('Test de connexion au serveur...');

            const testQuery = `
PREFIX iadas: <http://ia-das.org/onto#>
SELECT (COUNT(*) as ?count) WHERE {
    ?s a iadas:Analysis .
}
LIMIT 1`;

            await executeQuery(testQuery);
            console.log(' Connexion serveur OK');

        } catch (error) {
            console.error(' Erreur de connexion serveur:', error);
            showMessage('error', 'Impossible de se connecter au serveur SPARQL. Vérifiez que le serveur est démarré sur le port 8003.');
        }
    }

    // Initialisation
    console.log('Initialisation de la page de modification');
    showStep('selection'); // Afficher l'étape de sélection au démarrage
    testServerConnection();

    console.log(' Page de modification prête');
});

// ================== GÉNÉRATEUR SPARQL UPDATE ÉTENDU ==================

// Version complète du générateur pour toutes les entités
class ExtendedUpdateSPARQLGenerator {
    constructor() {
        this.prefixes = `
PREFIX iadas: <http://ia-das.org/onto#>
PREFIX iadas-data: <http://ia-das.org/data#>
PREFIX bibo: <http://purl.org/ontology/bibo/>
PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>`;
    }

    cleanValue(value) {
        if (!value || value === 'N.A.') return 'N.A.';
        return value.toString().replace(/"/g, '\\"').replace(/\n/g, '\\n');
    }

    literal(value, type = 'string') {
        const cleanedValue = this.cleanValue(value);

        if (cleanedValue === 'N.A.') {
            return '"N.A."';
        }

        switch (type) {
            case 'integer':
                return `"${cleanedValue}"^^xsd:integer`;
            case 'decimal':
                return `"${cleanedValue}"^^xsd:decimal`;
            default:
                return `"${cleanedValue}"`;
        }
    }

    // UPDATE pour l'article (CORRIGÉ pour utiliser l'URI existant)
    generateArticleUpdate(data) {
        // Utiliser l'URI existant de l'article plutôt que de le recréer
        const analysisId = this.cleanValue(data.analysisId);

        return `${this.prefixes}

DELETE {
    ?article bibo:doi ?oldDoi ;
             dcterms:title ?oldTitle ;
             dcterms:creator ?oldCreator ;
             bibo:journal ?oldJournal ;
             dcterms:date ?oldDate ;
             iadas:country ?oldCountry ;
             iadas:studyType ?oldStudyType .
}
INSERT {
    ?article bibo:doi ${this.literal(data.doi)} ;
             dcterms:title ${this.literal(data.title)} ;
             dcterms:creator ${this.literal(data.authors)} ;
             bibo:journal ${this.literal(data.journal)} ;
             dcterms:date ${this.literal(data.year)} ;
             iadas:country ${this.literal(data.country)} ;
             iadas:studyType ${this.literal(data.studyType)} .
}
WHERE {
    ?article iadas:hasAnalysis iadas-data:Analysis_${analysisId} .
    OPTIONAL { ?article bibo:doi ?oldDoi }
    OPTIONAL { ?article dcterms:title ?oldTitle }
    OPTIONAL { ?article dcterms:creator ?oldCreator }
    OPTIONAL { ?article bibo:journal ?oldJournal }
    OPTIONAL { ?article dcterms:date ?oldDate }
    OPTIONAL { ?article iadas:country ?oldCountry }
    OPTIONAL { ?article iadas:studyType ?oldStudyType }
}`;
    }

    // UPDATE pour la population
    generatePopulationUpdate(data) {
        const analysisId = this.cleanValue(data.analysisId);

        return `${this.prefixes}

DELETE {
    iadas-data:Population_${analysisId} iadas:sampleSize ?oldSampleSize ;
                                        iadas:gender ?oldGender ;
                                        iadas:population ?oldPopulation ;
                                        iadas:inclusionCriteria ?oldCriteria .
}
INSERT {
    iadas-data:Population_${analysisId} iadas:sampleSize ${this.literal(data.sampleSize, 'integer')} ;
                                        iadas:gender ${this.literal(data.gender)} ;
                                        iadas:population ${this.literal(data.population)} ;
                                        iadas:inclusionCriteria ${this.literal(data.inclusionCriteria)} .
}
WHERE {
    iadas-data:Population_${analysisId} a iadas:Population .
    OPTIONAL { iadas-data:Population_${analysisId} iadas:sampleSize ?oldSampleSize }
    OPTIONAL { iadas-data:Population_${analysisId} iadas:gender ?oldGender }
    OPTIONAL { iadas-data:Population_${analysisId} iadas:population ?oldPopulation }
    OPTIONAL { iadas-data:Population_${analysisId} iadas:inclusionCriteria ?oldCriteria }
}`;
    }

    // UPDATE pour le sport
    generateSportUpdate(data) {
        const analysisId = this.cleanValue(data.analysisId);

        return `${this.prefixes}

DELETE {
    iadas-data:Sport_${analysisId} iadas:sportName ?oldSportName ;
                                   iadas:sportLevel ?oldSportLevel .
}
INSERT {
    iadas-data:Sport_${analysisId} iadas:sportName ${this.literal(data.sportName)} ;
                                   iadas:sportLevel ${this.literal(data.sportLevel)} .
}
WHERE {
    iadas-data:Sport_${analysisId} a iadas:Sport .
    OPTIONAL { iadas-data:Sport_${analysisId} iadas:sportName ?oldSportName }
    OPTIONAL { iadas-data:Sport_${analysisId} iadas:sportLevel ?oldSportLevel }
}`;
    }

    // UPDATE pour les variables
    generateVariablesUpdate(data) {
        const analysisId = this.cleanValue(data.analysisId);

        return `${this.prefixes}

DELETE {
    iadas-data:Variable_VD_${analysisId} iadas:VD ?oldVD ;
                                         iadas:hasCategory ?oldVDCategory ;
                                         iadas:measure ?oldVDMeasure .
    iadas-data:Variable_VI_${analysisId} iadas:VI ?oldVI ;
                                         iadas:hasCategory ?oldVICategory ;
                                         iadas:measure ?oldVIMeasure .
}
INSERT {
    iadas-data:Variable_VD_${analysisId} iadas:VD ${this.literal(data.vdName)} ;
                                         iadas:hasCategory ${this.literal(data.vdCategory)} ;
                                         iadas:measure ${this.literal(data.vdMeasure)} .
    iadas-data:Variable_VI_${analysisId} iadas:VI ${this.literal(data.viName)} ;
                                         iadas:hasCategory ${this.literal(data.viCategory)} ;
                                         iadas:measure ${this.literal(data.viMeasure)} .
}
WHERE {
    iadas-data:Variable_VD_${analysisId} a iadas:Variable .
    iadas-data:Variable_VI_${analysisId} a iadas:Variable .
    OPTIONAL { iadas-data:Variable_VD_${analysisId} iadas:VD ?oldVD }
    OPTIONAL { iadas-data:Variable_VD_${analysisId} iadas:hasCategory ?oldVDCategory }
    OPTIONAL { iadas-data:Variable_VD_${analysisId} iadas:measure ?oldVDMeasure }
    OPTIONAL { iadas-data:Variable_VI_${analysisId} iadas:VI ?oldVI }
    OPTIONAL { iadas-data:Variable_VI_${analysisId} iadas:hasCategory ?oldVICategory }
    OPTIONAL { iadas-data:Variable_VI_${analysisId} iadas:measure ?oldVIMeasure }
}`;
    }

    // UPDATE pour les relations
    generateRelationsUpdate(data) {
        const analysisId = this.cleanValue(data.analysisId);

        return `${this.prefixes}

DELETE {
    iadas-data:Relations_${analysisId} iadas:degreR ?oldR ;
                                       iadas:degreP ?oldP ;
                                       iadas:degreBeta ?oldBeta ;
                                       iadas:resultatRelation ?oldResult .
}
INSERT {
    iadas-data:Relations_${analysisId} iadas:degreR ${this.literal(data.degreR, 'decimal')} ;
                                       iadas:degreP ${this.literal(data.degreP, 'decimal')} ;
                                       iadas:degreBeta ${this.literal(data.degreBeta, 'decimal')} ;
                                       iadas:resultatRelation ${this.literal(data.resultatRelation)} .
}
WHERE {
    iadas-data:Relations_${analysisId} a iadas:Relations .
    OPTIONAL { iadas-data:Relations_${analysisId} iadas:degreR ?oldR }
    OPTIONAL { iadas-data:Relations_${analysisId} iadas:degreP ?oldP }
    OPTIONAL { iadas-data:Relations_${analysisId} iadas:degreBeta ?oldBeta }
    OPTIONAL { iadas-data:Relations_${analysisId} iadas:resultatRelation ?oldResult }
}`;
    }

    // Générer toutes les requêtes UPDATE
    generateAllUpdates(data, originalData) {
        console.log(' Génération de toutes les requêtes UPDATE...');

        const queries = {
            analysis: this.generateAnalysisUpdate(data),
            article: this.generateArticleUpdate(data),
            population: this.generatePopulationUpdate(data),
            sport: this.generateSportUpdate(data),
            variables: this.generateVariablesUpdate(data),
            relations: this.generateRelationsUpdate(data)
        };

        console.log(' Requêtes UPDATE générées:', Object.keys(queries));
        return queries;
    }

    // UPDATE pour l'analyse (version complète)
    generateAnalysisUpdate(data) {
        const analysisId = this.cleanValue(data.analysisId);

        return `${this.prefixes}

DELETE {
    iadas-data:Analysis_${analysisId} iadas:typeOfAnalysis ?oldTypeOfAnalysis ;
                                      iadas:analysisMultiplicity ?oldMultiplicity ;
                                      iadas:relationDegree ?oldRelationDegree ;
                                      iadas:sampleSizeMobilized ?oldSampleSize ;
                                      iadas:authorConclusion ?oldConclusion ;
                                      iadas:limites ?oldLimites ;
                                      iadas:perspectives ?oldPerspectives ;
                                      iadas:acads ?oldAcads ;
                                      iadas:hasMediator ?oldMediator ;
                                      iadas:hasModerator ?oldModerator .
}
INSERT {
    iadas-data:Analysis_${analysisId} iadas:typeOfAnalysis ${this.literal(data.typeOfAnalysis)} ;
                                      iadas:analysisMultiplicity ${this.literal(data.analysisMultiplicity)} ;
                                      iadas:relationDegree ${this.literal(data.relationDegree)} ;
                                      iadas:sampleSizeMobilized ${this.literal(data.sampleSizeMobilized, 'integer')} ;
                                      iadas:authorConclusion ${this.literal(data.authorConclusion)} ;
                                      iadas:limites ${this.literal(data.limites)} ;
                                      iadas:perspectives ${this.literal(data.perspectives)} ;
                                      iadas:acads ${this.literal(data.acads)} ;
                                      iadas:hasMediator ${this.literal(data.mediator)} ;
                                      iadas:hasModerator ${this.literal(data.moderator)} .
}
WHERE {
    iadas-data:Analysis_${analysisId} a iadas:Analysis .
    OPTIONAL { iadas-data:Analysis_${analysisId} iadas:typeOfAnalysis ?oldTypeOfAnalysis }
    OPTIONAL { iadas-data:Analysis_${analysisId} iadas:analysisMultiplicity ?oldMultiplicity }
    OPTIONAL { iadas-data:Analysis_${analysisId} iadas:relationDegree ?oldRelationDegree }
    OPTIONAL { iadas-data:Analysis_${analysisId} iadas:sampleSizeMobilized ?oldSampleSize }
    OPTIONAL { iadas-data:Analysis_${analysisId} iadas:authorConclusion ?oldConclusion }
    OPTIONAL { iadas-data:Analysis_${analysisId} iadas:limites ?oldLimites }
    OPTIONAL { iadas-data:Analysis_${analysisId} iadas:perspectives ?oldPerspectives }
    OPTIONAL { iadas-data:Analysis_${analysisId} iadas:acads ?oldAcads }
    OPTIONAL { iadas-data:Analysis_${analysisId} iadas:hasMediator ?oldMediator }
    OPTIONAL { iadas-data:Analysis_${analysisId} iadas:hasModerator ?oldModerator }
}`;
    }
}

// Remplacer la classe simple par la version étendue
window.UpdateSPARQLGenerator = ExtendedUpdateSPARQLGenerator;