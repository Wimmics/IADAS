let currentData = null;
let currentQuery = null;
let currentMode = 'table';

console.log("Script principal chargé !");
document.addEventListener('DOMContentLoaded', async function () {

    const inputs = document.querySelectorAll('input, button, select');
    inputs.forEach(input => input.disabled = true);

    try {
        await window.pageInitializer.initializePage();
        console.log(' Initialisation terminée avec succès');
    } catch (error) {
        console.error(' Échec de l\'initialisation:', error);
    }

    const excelPaths = [
        './data/IA-DAS-Data1.xlsx',
        './../data/IA-DAS-Data1.xlsx'
    ];

    let excelLoaded = false;
    for (const excelPath of excelPaths) {
        try {

            if (window.csvLoader && typeof window.csvLoader.
                Data === 'function') {
                const excelData = await window.csvLoader.loadExcelData(excelPath);
                if (excelData && excelData.length > 0) {
                    excelLoaded = true;
                    break;
                }
            } else {
                await new Promise(resolve => setTimeout(resolve, 100));
                continue;
            }
        } catch (error) {
            console.log(` Échec chargement ${excelPath}:`, error.message);
        }
    }

    if (!excelLoaded) {
        console.error("Aucun fichier Excel trouvé !");
    }

    // Configurer les boutons d'export au chargement
    setupInitialExportButtons();

    setTimeout(() => {
        const component = document.querySelector('input-intorregation-component');
        if (component) {
            console.log("Composant trouvé, ajout du listener !");
            component.addEventListener('search', (event) => {
                console.log("=== ÉVÉNEMENT REÇU DANS LA PAGE PRINCIPALE ===");
                rechercher(event.detail);
            });
        }
    }, 100);
});

function setupInitialExportButtons() {
    // Configurer les événements des boutons d'export
    const exportPNGBtn = document.getElementById('exportPNG');
    if (exportPNGBtn) {
        exportPNGBtn.onclick = () => exportGraphToPNG();
    }
    
    const exportExcelBtn = document.getElementById('exportExcel');
    if (exportExcelBtn) {
        exportExcelBtn.onclick = () => exportToExcel();
    }
    
    const exportTurtleBtn = document.getElementById('exportTurtle');
    if (exportTurtleBtn) {
        exportTurtleBtn.onclick = () => exportToTurtle();
    }
}


async function rechercher(data) {
    try {
        const isReady = await window.pageInitializer.ensureReady();
        if (!isReady) {
            return;
        }

        console.log("=== RECHERCHE AVEC PAGE INITIALISÉE ===");
        console.log("Données reçues:", data);

        window.loadingManager.show("Recherche en cours...");
        window.loadingManager.startQuery(1, 1); // Une seule tentative nécessaire

        let payload;

        if (data.queryType === 'raw_sparql') {
            payload = {
                queryType: 'raw_sparql',
                rawSparqlQuery: data.rawSparqlQuery
            };
        } else {
            payload = { queryType: 'generated' };

            if (data.selectedVI) payload.selectedVI = data.selectedVI;
            if (data.selectedVD) payload.selectedVD = data.selectedVD;
            if (data.categoryVI) payload.categoryVI = data.categoryVI;
            if (data.categoryVD) payload.categoryVD = data.categoryVD;
            if (data.relationDirection) payload.relationDirection = data.relationDirection;
            if (data.sportType) payload.sportType = data.sportType;
            if (data.gender) payload.gender = data.gender;

            if (data.ageCategory) {
                payload.ageCategory = data.ageCategory;
            } else {
                if (data.meanAge) payload.meanAge = parseFloat(data.meanAge);
                if (data.minAge) payload.minAge = parseInt(data.minAge);    
                if (data.maxAge) payload.maxAge = parseInt(data.maxAge);    
            }

            if (data.exerciseFrequency) {
                payload.exerciseFrequency = data.exerciseFrequency;
            } else {
                if (data.meanExFR) payload.meanExFR = parseFloat(data.meanExFR);
                if (data.minExFR) payload.minExFR = parseInt(data.minExFR);    
                if (data.maxExFR) payload.maxExFR = parseInt(data.maxExFR);    
            }

            if (data.experienceCategory) {
                payload.experienceCategory = data.experienceCategory;
            } else {
                if (data.meanYOE) payload.meanYOE = parseFloat(data.meanYOE);
                if (data.minYOE) payload.minYOE = parseInt(data.minYOE);     
                if (data.maxYOE) payload.maxYOE = parseInt(data.maxYOE);     
            }
        }

        console.log("Payload complet:", payload);

        // Stocker les données de recherche pour l'export
        window.currentSearchData = {
            queryType: data.queryType,
            filters: payload,
            timestamp: new Date()
        };

        const response = await fetch(
            window.location.hostname === 'localhost'
                ? 'http://localhost:8003'
                : 'http://51.44.188.162:8003',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }
        );


        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erreur HTTP ${response.status}: ${errorText}`);
        }

        const responseData = await response.json();
        console.log("Réponse API:", responseData);

        window.loadingManager.completeQuery(responseData.results?.bindings?.length);
        window.loadingManager.startParsing();

        let parsedData = responseData;
        if (window.SPARQLDataParser && typeof window.SPARQLDataParser.parse === 'function') {
            parsedData = window.SPARQLDataParser.parse(responseData);
        }

        window.loadingManager.completeParsing();

        // Récupérer la requête SPARQL depuis la réponse du serveur
        console.log("🔍 DEBUG: Clés disponibles dans responseData:", Object.keys(responseData));
        console.log("🔍 DEBUG: responseData.query:", responseData.query ? "PRÉSENT" : "ABSENT");
        console.log("🔍 DEBUG: responseData.generatedQuery:", responseData.generatedQuery ? "PRÉSENT" : "ABSENT");
        console.log("🔍 DEBUG: responseData.sparqlQuery:", responseData.sparqlQuery ? "PRÉSENT" : "ABSENT");
        
        let sparqlQuery = responseData.query || responseData.sparqlQuery || responseData.generatedQuery || responseData.sparql || null;
        
        // Fallback : chercher dans des structures imbriquées
        if (!sparqlQuery && responseData.metadata) {
            sparqlQuery = responseData.metadata.query || responseData.metadata.sparql || null;
        }
        if (!sparqlQuery && responseData.debug) {
            sparqlQuery = responseData.debug.query || responseData.debug.sparql || null;
        }
        
        // Fallback : créer une requête approximative à partir du payload
        if (!sparqlQuery && payload) {
            sparqlQuery = `# Requête générée à partir des critères :
# ${payload.gender ? `Sexe: ${payload.gender}` : ''}
# ${payload.minAge || payload.maxAge || payload.meanAge ? `Âge: ${payload.minAge || 'min'}-${payload.maxAge || 'max'} (moyenne: ${payload.meanAge || 'N/A'})` : ''}
# ${payload.factorType ? `Facteur: ${payload.factorType}` : ''}

# La requête SPARQL exacte n'est pas retournée par le serveur.
# Voici une représentation approximative basée sur vos critères :

PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX : <http://example.org/ontology#>

SELECT * WHERE {
  ?analysis rdf:type :Analysis .
  ${payload.gender ? `?analysis :hasGender "${payload.gender}" .` : '# Pas de filtre sur le sexe'}
  ${payload.factorType ? `?analysis :hasFactor "${payload.factorType}" .` : '# Pas de filtre sur le facteur'}
  # Filtres d'âge et autres critères appliqués par le serveur
}`;
        }
        
        console.log("Requête SPARQL récupérée:", sparqlQuery);
        
        displayResults(parsedData, sparqlQuery);
        window.loadingManager.completeAll();

    } catch (error) {
        console.error(' Erreur lors de la recherche:', error);

        window.loadingManager.showError('Erreur de recherche', error.message);

        const resultsDiv = document.getElementById('results');
        if (resultsDiv) {
            const template = document.getElementById('error-template');
            const clone = template.content.cloneNode(true);
            clone.getElementById('error-message').textContent = error.message;
            resultsDiv.innerHTML = '';
            resultsDiv.appendChild(clone);
        }
    }
}

function displayResults(data, query = null) {
    currentData = data;
    currentQuery = query;
    
    // Activer les boutons de contrôle et d'export
    enableResultControls();

    // Afficher en mode tableau par défaut
    displayTableView();
}

function enableResultControls() {
    // Activer tous les boutons de contrôle (avec vérification d'existence)
    const viewTable = document.getElementById('viewTable');
    const viewGraph = document.getElementById('viewGraph');
    const viewSparql = document.getElementById('viewSparql');
    const exportPNG = document.getElementById('exportPNG');
    const exportExcel = document.getElementById('exportExcel');
    const exportTurtle = document.getElementById('exportTurtle');
    
    if (viewTable) viewTable.disabled = false;
    if (viewGraph) viewGraph.disabled = false;
    if (viewSparql) viewSparql.disabled = false;
    if (exportPNG) exportPNG.disabled = false;
    if (exportExcel) exportExcel.disabled = false;
    if (exportTurtle) exportTurtle.disabled = false;
    
    // Configurer les événements si pas déjà fait
    setupViewButtons();
}

function setupViewButtons() {
    const viewTable = document.getElementById('viewTable');
    const viewGraph = document.getElementById('viewGraph');
    const viewSparql = document.getElementById('viewSparql');
    
    if (viewTable) viewTable.onclick = () => switchView('table');
    if (viewGraph) viewGraph.onclick = () => switchView('graph');
    if (viewSparql) viewSparql.onclick = () => switchView('sparql');
    
    // Event handlers pour les boutons d'export
    const exportPNGBtn = document.getElementById('exportPNG');
    if (exportPNGBtn) {
        exportPNGBtn.onclick = () => exportGraphToPNG();
    }
    
    const exportExcelBtn = document.getElementById('exportExcel');
    if (exportExcelBtn) {
        exportExcelBtn.onclick = () => exportToExcel();
    }
    
    const exportTurtleBtn = document.getElementById('exportTurtle');
    if (exportTurtleBtn) {
        exportTurtleBtn.onclick = () => exportToTurtle();
    }
}

function switchView(mode) {
    currentMode = mode;

    // Nettoyer le bouton d'export s'il existe
    const exportBtn = document.getElementById('exportGraph');
    if (exportBtn) {
        exportBtn.remove();
    }

    // Mettre à jour les boutons actifs
    document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`view${mode.charAt(0).toUpperCase() + mode.slice(1)}`).classList.add('active');

    // Afficher le bon mode
    switch (mode) {
        case 'table':
            displayTableView();
            break;
        case 'graph':
            displayGraphView();
            break;
        case 'sparql':
            displaySparqlView();
            break;
    }
}

function displayTableView() {
    const displayDiv = document.getElementById('result-display');

    if (!currentData || !currentData.results || !currentData.results.bindings) {
        const template = document.getElementById('no-results-template');
        const clone = template.content.cloneNode(true);
        displayDiv.innerHTML = '';
        displayDiv.appendChild(clone);
        return;
    }

    const bindings = currentData.results.bindings;
    const variables = currentData.head.vars;

    let tableHTML = `
        <div style="overflow-x: auto; margin: 10px 0;">
            <table style="
                width: 100%; 
                border-collapse: collapse; 
                margin: 0;
                font-size: 13px;
                line-height: 1.2;
            ">
                <thead>
                    <tr style="background-color: #f8f9fa;">
                        ${variables.map(v => `<th style="
                            border: 1px solid #ddd; 
                            padding: 6px 8px; 
                            text-align: left;
                            font-weight: 600;
                            font-size: 12px;
                        ">${v}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
    `;

    bindings.forEach((binding, index) => {
        const bgColor = index % 2 === 0 ? '#ffffff' : '#f8f9fa';
        tableHTML += `<tr style="background-color: ${bgColor};">`;

        variables.forEach(variable => {
            const value = binding[variable];
            const displayValue = value ? (value.value || value) : '';
            
            // Détecter si c'est un ID d'analyse et le rendre cliquable
            let cellContent = displayValue;
            if (isAnalysisId(variable, displayValue)) {
                cellContent = `<a href="#" onclick="openAnalysisPanelFromTable('${displayValue}', event)" 
                    style="color: #2980b9; text-decoration: underline; cursor: pointer;">
                    ${displayValue}
                </a>`;
            }
            
            tableHTML += `<td style="
                border: 1px solid #ddd; 
                padding: 4px 8px;
                vertical-align: top;
                word-break: break-word;
                max-width: 200px;
            ">${cellContent}</td>`;
        });

        tableHTML += '</tr>';
    });

    tableHTML += `
                </tbody>
            </table>
        </div>
        <p style="margin: 5px 0; color: #666; font-size: 12px;">
            ${bindings.length} résultat(s) trouvé(s)
        </p>
    `;

    displayDiv.innerHTML = tableHTML;
}

// Fonction pour détecter si une valeur est un ID d'analyse
function isAnalysisId(variableName, value) {
    if (!value) return false;
    
    // Détecter par nom de variable
    const analysisVarNames = ['analysis', 'analysisId', 'analysis_id', 'id', 'Analysis_ID'];
    if (analysisVarNames.some(name => variableName.toLowerCase().includes(name.toLowerCase()))) {
        return true;
    }
    
    // Détecter par format de valeur (ex: A001, A123, Analysis_1, etc.)
    if (typeof value === 'string') {
        return /^(A\d+|Analysis_?\d+|\d+)$/i.test(value.trim());
    }
    
    return false;
}

// Fonction pour ouvrir le panneau d'analyse depuis le tableau
async function openAnalysisPanelFromTable(analysisId, event) {
    event.preventDefault();
    console.log('🔍 DEBUG: Ouverture panneau pour analyse:', analysisId);
    
    try {
        // Vérifier que les services sont disponibles
        if (typeof window.analysisPanel === 'undefined') {
            console.error('❌ AnalysisPanel non disponible !');
            alert('Erreur: Le panneau d\'analyse n\'est pas disponible.');
            return;
        }
        
        if (typeof window.fusekiRetriever === 'undefined') {
            console.error('❌ FusekiAnalysisRetriever non disponible !');
            alert('Erreur: Le système de récupération des données n\'est pas disponible.');
            return;
        }
        
        // Nettoyer l'ID d'analyse (extraire depuis URI si nécessaire)
        let cleanAnalysisId = analysisId;
        if (analysisId.includes('#')) {
            cleanAnalysisId = analysisId.split('#').pop();
        } else if (analysisId.includes('/')) {
            cleanAnalysisId = analysisId.split('/').pop();
        }
        
        // Enlever le préfixe "Analysis_" s'il existe déjà
        if (cleanAnalysisId.startsWith('Analysis_')) {
            cleanAnalysisId = cleanAnalysisId.replace('Analysis_', '');
        }
        
        console.log('🔍 DEBUG: ID final:', cleanAnalysisId);
        
        // Créer un objet nodeData factice avec l'ID d'analyse
        const nodeData = {
            label: `Analyse ${cleanAnalysisId}`,
            analyses: [cleanAnalysisId],
            type: 'analysis_link'
        };
        
        console.log('🔍 DEBUG: nodeData créé:', nodeData);
        
        // Récupérer les données d'analyse via Fuseki
        console.log('🔍 DEBUG: Appel getAllAnalysesData...');
        const analysisData = await window.fusekiRetriever.getAllAnalysesData(nodeData);
        console.log('🔍 DEBUG: analysisData reçu:', analysisData);
        console.log('🔍 DEBUG: Nombre d\'analyses:', analysisData.length);
        
        if (!analysisData || analysisData.length === 0) {
            console.warn('⚠️ Aucune donnée d\'analyse récupérée');
            alert('Aucune donnée trouvée pour cette analyse.');
            return;
        }
        
        // Ouvrir le panneau avec les données
        console.log('🔍 DEBUG: Ouverture du panneau...');
        window.analysisPanel.openMultipleAnalyses(`Analyse ${analysisId}`, analysisData);
        
        console.log('✅ Panneau ouvert avec succès');
        
    } catch (error) {
        console.error('❌ ERREUR ouverture panneau:', error);
        console.error('❌ Stack:', error.stack);
        alert(`Erreur lors de l'ouverture du panneau d'analyse: ${error.message}`);
    }
}

// Fonctions d'export simplifiées
async function exportToExcel() {
    if (!currentData || !currentData.results || !currentData.results.bindings) {
        alert('Aucune donnée à exporter');
        return;
    }
    
    try {
        console.log('Export Excel avec toutes les analyses...');
        
        // Afficher un indicateur de chargement
        const originalText = 'Export Excel';
        const exportBtn = document.getElementById('exportExcel');
        if (exportBtn) {
            exportBtn.textContent = 'Export en cours...';
            exportBtn.disabled = true;
        }
        
        // Récupérer toutes les analyses complètes
        const completeAnalyses = await getAllCompleteAnalyses(currentData.results.bindings);
        
        // Créer le fichier Excel avec toutes les informations
        const excelData = createCompleteExcelExport(completeAnalyses, currentData);
        
        const timestamp = new Date().toISOString().slice(0, 16).replace(/[:-]/g, '');
        downloadExcelFile(excelData, `IA-DAS-Export-Complet-${timestamp}.xlsx`);
        console.log('Export Excel complet réussi');
        
        // Restaurer le bouton
        if (exportBtn) {
            exportBtn.textContent = originalText;
            exportBtn.disabled = false;
        }
        
    } catch (error) {
        console.error('Erreur export Excel:', error);
        alert(`Erreur lors de l'export Excel: ${error.message}`);
        
        // Restaurer le bouton en cas d'erreur
        const exportBtn = document.getElementById('exportExcel');
        if (exportBtn) {
            exportBtn.textContent = 'Export Excel';
            exportBtn.disabled = false;
        }
    }
}

async function exportToTurtle() {
    if (!currentData || !currentData.results || !currentData.results.bindings) {
        alert('Aucune donnée à exporter');
        return;
    }
    
    try {
        console.log('Export Turtle...');
        const turtleContent = await convertToTurtle(currentData);
        const timestamp = new Date().toISOString().slice(0, 16).replace(/[:-]/g, '');
        downloadFile(turtleContent, `IA-DAS-Export-${timestamp}.ttl`, 'text/turtle');
        console.log('Export Turtle réussi');
    } catch (error) {
        console.error('Erreur export Turtle:', error);
        alert(`Erreur lors de l'export Turtle: ${error.message}`);
    }
}

// Récupère toutes les analyses complètes avec tous leurs détails
async function getAllCompleteAnalyses(bindings) {
    console.log(`Récupération de ${bindings.length} analyses complètes...`);
    
    // Extraire les IDs d'analyses uniques
    const analysisIds = new Set();
    bindings.forEach(binding => {
        Object.keys(binding).forEach(key => {
            const value = binding[key]?.value || binding[key];
            if (value && isAnalysisId(key, value)) {
                // Nettoyer l'ID d'analyse
                let cleanId = value;
                if (cleanId.includes('#')) {
                    cleanId = cleanId.split('#').pop();
                } else if (cleanId.includes('/')) {
                    cleanId = cleanId.split('/').pop();
                }
                if (cleanId.startsWith('Analysis_')) {
                    cleanId = cleanId.replace('Analysis_', '');
                }
                analysisIds.add(cleanId);
            }
        });
    });
    
    console.log(`${analysisIds.size} analyses uniques trouvées:`, Array.from(analysisIds));
    
    // Récupérer les données complètes via FusekiAnalysisRetriever
    const completeAnalyses = [];
    
    if (window.fusekiRetriever && typeof window.fusekiRetriever.getAnalysisData === 'function') {
        const promises = Array.from(analysisIds).map(async analysisId => {
            try {
                const analysisData = await window.fusekiRetriever.getAnalysisData(analysisId);
                return analysisData;
            } catch (error) {
                console.error(`Erreur pour analyse ${analysisId}:`, error);
                return {
                    id: analysisId,
                    error: error.message,
                    rawData: { Analysis_ID: analysisId, ERROR: error.message }
                };
            }
        });
        
        const results = await Promise.all(promises);
        completeAnalyses.push(...results);
    } else {
        console.warn('FusekiAnalysisRetriever non disponible, export basique seulement');
        // Fallback : créer des analyses basiques depuis les bindings
        Array.from(analysisIds).forEach(analysisId => {
            completeAnalyses.push({
                id: analysisId,
                rawData: { Analysis_ID: analysisId, Source: 'Données limitées' }
            });
        });
    }
    
    console.log(`${completeAnalyses.length} analyses complètes récupérées`);
    return completeAnalyses;
}

// Crée un export Excel complet avec toutes les informations de l'ontologie
function createCompleteExcelExport(completeAnalyses, originalData) {
    const workbook = XLSX.utils.book_new();
    
    // ========== FEUILLE 1: RÉSULTATS DE RECHERCHE ==========
    const originalBindings = originalData.results.bindings;
    const originalVariables = originalData.head.vars;
    
    const searchData = [];
    searchData.push(originalVariables); // En-têtes
    
    originalBindings.forEach(binding => {
        const row = originalVariables.map(variable => {
            const value = binding[variable];
            return value ? (value.value || value) : '';
        });
        searchData.push(row);
    });
    
    const searchSheet = XLSX.utils.aoa_to_sheet(searchData);
    XLSX.utils.book_append_sheet(workbook, searchSheet, "Résultats Recherche");
    
    // ========== FEUILLE 2: ANALYSES COMPLÈTES (TOUTES LES COLONNES DYNAMIQUES) ==========
    if (completeAnalyses.length > 0) {
        // Récupérer TOUTES les colonnes disponibles dynamiquement
        const allColumnsSet = new Set();
        
        // Passer par toutes les analyses pour trouver TOUTES les colonnes possibles
        completeAnalyses.forEach(analysis => {
            if (!analysis.error && analysis.rawData) {
                Object.keys(analysis.rawData).forEach(key => {
                    // Éviter les métadonnées internes mais les garder dans une section séparée
                    if (!key.startsWith('__') || key === '__PROPERTY_COUNT__' || key === '__DATA_SOURCE__' || key === '__ENTITIES_FOUND__') {
                        allColumnsSet.add(key);
                    }
                });
            }
        });
        
        // Trier les colonnes par ordre de préférence
        const allColumns = [...allColumnsSet].sort((a, b) => {
            // Ordre de priorité pour les colonnes importantes
            const priority = [
                'Analysis_ID', 'Title', 'Authors', 'Year ', 'DOI', 'Journal', 'Country',
                'Types of study', 'N', 'Population', 'Sexe', 'Age', 'AgeForAnalysis_Mean',
                'SDAnalysis', 'MinAge', 'MaxAge', 'BMI', 'BMI_Mean', 'BMI_SD',
                'Sport_name', 'Sport_level', 'Type_of _sport_practice', 'Subcategory_of_sport',
                'ACADS', 'VD', 'Measure_VD', 'VI', 'Measure_VI',
                'Mediator', 'Measure_Mediator', 'Moderator', 'Measure_Moderator',
                'Resultat_de_relation', 'Degre_r', 'Degre_p ', 'Signe_p', 'Degre_beta', 'Degre_RS',
                'Type_of_analysis', 'N_mobilise_dans_les analyse', 'Authors_conclusions',
                'Limites', 'Perspectives', 'Multiplicity_analyse'
            ];
            
            const aIndex = priority.indexOf(a);
            const bIndex = priority.indexOf(b);
            
            if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
            if (aIndex !== -1) return -1;
            if (bIndex !== -1) return 1;
            
            // Pour les colonnes non prioritaires, trier alphabétiquement
            return a.localeCompare(b);
        });
        
        console.log(`📊 Export Excel: ${allColumns.length} colonnes dynamiques trouvées`);
        
        const analysesData = [];
        analysesData.push(allColumns); // En-têtes dynamiques
        
        completeAnalyses.forEach(analysis => {
            const row = allColumns.map(column => {
                if (analysis.error) {
                    return column === 'Analysis_ID' ? analysis.id : 
                           column === 'ERROR' ? analysis.error : '';
                }
                
                const value = analysis.rawData?.[column];
                
                // Gérer les objets complexes (comme __COMPLETE_RAW_DATA__)
                if (typeof value === 'object' && value !== null) {
                    if (column === '__COMPLETE_RAW_DATA__') {
                        return `${Object.keys(value).length} propriétés SPARQL`;
                    }
                    return JSON.stringify(value);
                }
                
                return value || '';
            });
            analysesData.push(row);
        });
        
        const analysesSheet = XLSX.utils.aoa_to_sheet(analysesData);
        XLSX.utils.book_append_sheet(workbook, analysesSheet, "Analyses Complètes");
    }
    
    // ========== FEUILLE 3: MÉTADONNÉES ==========
    const metadataData = [
        ['Propriété', 'Valeur'],
        ['Date Export', new Date().toLocaleString('fr-FR')],
        ['Nombre Résultats Recherche', originalBindings.length],
        ['Nombre Analyses Détaillées', completeAnalyses.length],
        ['Variables Recherche', originalVariables.join(', ')],
        ['Filtres Appliqués', getAppliedFiltersText()],
        ['Source', 'Ontologie IA-DAS'],
        ['Type Export', 'Export Complet avec Panel Analysis']
    ];
    
    const metadataSheet = XLSX.utils.aoa_to_sheet(metadataData);
    XLSX.utils.book_append_sheet(workbook, metadataSheet, "Métadonnées");
    
    // ========== FEUILLE 4: TOUTES LES PROPRIÉTÉS SPARQL BRUTES ==========
    if (completeAnalyses.length > 0) {
        const sparqlData = [['Analysis_ID', 'Entité', 'Propriété SPARQL', 'Valeur', 'Type Entité', 'Sous-Entité']];
        
        completeAnalyses.forEach(analysis => {
            if (!analysis.error && analysis.rawData && analysis.rawData['__COMPLETE_RAW_DATA__']) {
                const rawProperties = analysis.rawData['__COMPLETE_RAW_DATA__'];
                
                Object.entries(rawProperties).forEach(([propertyKey, values]) => {
                    values.forEach(propInfo => {
                        sparqlData.push([
                            analysis.id,
                            propInfo.entity || '',
                            propInfo.originalProperty || propertyKey,
                            propInfo.value || '',
                            propInfo.entityType || '',
                            propInfo.subEntity || ''
                        ]);
                    });
                });
            }
        });
        
        if (sparqlData.length > 1) { // Plus que juste les en-têtes
            const sparqlSheet = XLSX.utils.aoa_to_sheet(sparqlData);
            XLSX.utils.book_append_sheet(workbook, sparqlSheet, "Propriétés SPARQL Brutes");
            console.log(`📋 Ajout de ${sparqlData.length - 1} propriétés SPARQL brutes à l'export`);
        }
    }

    // ========== FEUILLE 5: STATISTIQUES ==========
    if (completeAnalyses.length > 0) {
        const stats = calculateAnalysesStatistics(completeAnalyses);
        const statsData = [
            ['Statistique', 'Valeur'],
            ...Object.entries(stats).map(([key, value]) => [key, value])
        ];
        
        const statsSheet = XLSX.utils.aoa_to_sheet(statsData);
        XLSX.utils.book_append_sheet(workbook, statsSheet, "Statistiques");
    }
    
    return workbook;
}

// Calcule des statistiques sur les analyses récupérées
function calculateAnalysesStatistics(analyses) {
    const stats = {};
    
    // Analyses avec/sans erreur
    const validAnalyses = analyses.filter(a => !a.error);
    const errorAnalyses = analyses.filter(a => a.error);
    
    stats['Analyses Valides'] = validAnalyses.length;
    stats['Analyses en Erreur'] = errorAnalyses.length;
    stats['Taux de Succès'] = `${Math.round((validAnalyses.length / analyses.length) * 100)}%`;
    
    // Statistiques sur les données
    if (validAnalyses.length > 0) {
        const countries = new Set();
        const journals = new Set();
        const sports = new Set();
        const years = [];
        
        validAnalyses.forEach(analysis => {
            const raw = analysis.rawData;
            if (raw?.Country) countries.add(raw.Country);
            if (raw?.Journal) journals.add(raw.Journal);
            if (raw?.Sport_name) sports.add(raw.Sport_name);
            if (raw?.['Year ']) {
                const year = parseInt(raw['Year ']);
                if (!isNaN(year)) years.push(year);
            }
        });
        
        stats['Pays Différents'] = countries.size;
        stats['Journaux Différents'] = journals.size;
        stats['Sports Différents'] = sports.size;
        
        if (years.length > 0) {
            stats['Année Min'] = Math.min(...years);
            stats['Année Max'] = Math.max(...years);
            stats['Année Moyenne'] = Math.round(years.reduce((a, b) => a + b, 0) / years.length);
        }
    }
    
    return stats;
}

// Récupère le texte des filtres appliqués
function getAppliedFiltersText() {
    if (window.currentSearchData && window.currentSearchData.filters) {
        const filters = window.currentSearchData.filters;
        const filterTexts = [];
        
        if (filters.gender) filterTexts.push(`Genre: ${filters.gender}`);
        if (filters.sportType) filterTexts.push(`Sport: ${filters.sportType}`);
        if (filters.selectedVI) filterTexts.push(`VI: ${filters.selectedVI}`);
        if (filters.selectedVD) filterTexts.push(`VD: ${filters.selectedVD}`);
        if (filters.minAge || filters.maxAge) {
            filterTexts.push(`Âge: ${filters.minAge || 'N/A'}-${filters.maxAge || 'N/A'}`);
        }
        
        return filterTexts.join(', ') || 'Aucun filtre spécifique';
    }
    
    return 'Informations de filtres non disponibles';
}

// Convertir les données SPARQL en Excel (fonction originale gardée pour compatibilité)
function convertToExcel(bindings, variables) {
    // Préparer les données pour XLSX
    const worksheetData = [];
    
    // En-têtes
    worksheetData.push(variables);
    
    // Données
    bindings.forEach(binding => {
        const row = variables.map(variable => {
            const value = binding[variable];
            return value ? (value.value || value) : '';
        });
        worksheetData.push(row);
    });
    
    // Créer le workbook et la worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    
    // Ajouter la worksheet au workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, "IA-DAS Export");
    
    return workbook;
}

// Télécharger un fichier Excel
function downloadExcelFile(workbook, filename) {
    XLSX.writeFile(workbook, filename);
}

// Convertir les données SPARQL en Turtle (via backend)
async function convertToTurtle(sparqlData) {
    const response = await fetch('/api/export/turtle', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(sparqlData)
    });

    if (!response.ok) {
        throw new Error(`Erreur serveur: ${response.status}`);
    }

    return await response.text();
}

// Télécharger un fichier
function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    console.log(`Fichier téléchargé: ${filename}`);
}

async function loadHtml2Canvas() {
    return new Promise((resolve, reject) => {
        if (window.html2canvas) {
            resolve();
            return;
        }
        
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

async function addLogoAndTitleToCanvas(originalCanvas, searchFilters = null) {
    return new Promise((resolve, reject) => {
        const logoPath = './../assets/logo_IA-DAS-No-Background.png'; 
        const logoImg = new Image();
        
        logoImg.onload = () => {
            try {
                const finalCanvas = document.createElement('canvas');
                const ctx = finalCanvas.getContext('2d');
                
                const margin = 240; // Plus de marge pour le titre agrandi (x4)
                const maxLogoSize = 480; // Logo agrandi (x4)
                const titleHeight = 320; // Espace pour le titre agrandi (x4)
                const padding = 80;
                
                // Calculer les dimensions du logo (plus petit)
                const logoRatio = logoImg.width / logoImg.height;
                let logoWidth, logoHeight;
                
                if (logoRatio > 1) {
                    logoWidth = maxLogoSize;
                    logoHeight = maxLogoSize / logoRatio;
                } else {
                    logoHeight = maxLogoSize;
                    logoWidth = maxLogoSize * logoRatio;
                }
                
                // Canvas final avec espace pour titre
                finalCanvas.width = originalCanvas.width + margin;
                finalCanvas.height = originalCanvas.height + margin + titleHeight;
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
                
                // === AJOUTER LE TITRE AGRANDI ===
                const title = generateExportTitle(searchFilters);
                if (title) {
                    // Titre principal (x4)
                    ctx.fillStyle = '#2c3e50';
                    ctx.font = 'bold 96px Arial, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(title.main, finalCanvas.width / 2, 140);
                    
                    // Sous-titre avec filtres (x4)
                    if (title.filters) {
                        ctx.fillStyle = '#7f8c8d';
                        ctx.font = '64px Arial, sans-serif';
                        ctx.fillText(title.filters, finalCanvas.width / 2, 240);
                    }
                }
                
                // Dessiner le graphique (décalé vers le bas pour le titre)
                ctx.drawImage(originalCanvas, margin/2, titleHeight + margin/2);
                
                // === AJOUTER LE LOGO (plus petit, en bas à droite) ===
                const logoX = finalCanvas.width - logoWidth - padding;
                const logoY = finalCanvas.height - logoHeight - padding;
                
                // Fond blanc pour le logo (agrandi)
                const logoBgPadding = 32; // x4
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(
                    logoX - logoBgPadding, 
                    logoY - logoBgPadding, 
                    logoWidth + (logoBgPadding * 2), 
                    logoHeight + (logoBgPadding * 2)
                );
                
                // Bordure subtile (plus épaisse)
                ctx.strokeStyle = '#e0e0e0';
                ctx.lineWidth = 4; // x4
                ctx.strokeRect(
                    logoX - logoBgPadding, 
                    logoY - logoBgPadding, 
                    logoWidth + (logoBgPadding * 2), 
                    logoHeight + (logoBgPadding * 2)
                );
                
                // Dessiner le logo
                ctx.drawImage(logoImg, logoX, logoY, logoWidth, logoHeight);
                
                // === AJOUTER LA DATE ET L'HEURE (agrandie) ===
                const now = new Date();
                const dateStr = now.toLocaleDateString('fr-FR');
                const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                
                ctx.fillStyle = '#95a5a6';
                ctx.font = '48px Arial, sans-serif'; // x4
                ctx.textAlign = 'right';
                ctx.fillText(`Généré le ${dateStr} à ${timeStr}`, finalCanvas.width - padding, finalCanvas.height - padding - logoHeight - 60);
                
                resolve(finalCanvas);
                
            } catch (err) {
                reject(err);
            }
        };
        
        logoImg.onerror = () => {
            console.warn('Logo non trouvé, export sans logo');
            // Même traitement mais sans logo (tailles agrandies)
            const finalCanvas = document.createElement('canvas');
            const ctx = finalCanvas.getContext('2d');
            const margin = 240; // x4
            const titleHeight = 320; // x4
            
            finalCanvas.width = originalCanvas.width + margin;
            finalCanvas.height = originalCanvas.height + margin + titleHeight;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
            
            // Titre seulement (agrandi)
            const title = generateExportTitle(searchFilters);
            if (title) {
                ctx.fillStyle = '#2c3e50';
                ctx.font = 'bold 96px Arial, sans-serif'; // x4
                ctx.textAlign = 'center';
                ctx.fillText(title.main, finalCanvas.width / 2, 140); // x4
                
                if (title.filters) {
                    ctx.fillStyle = '#7f8c8d';
                    ctx.font = '64px Arial, sans-serif'; // x4
                    ctx.fillText(title.filters, finalCanvas.width / 2, 240); // x4
                }
            }
            
            ctx.drawImage(originalCanvas, margin/2, titleHeight + margin/2);
            resolve(finalCanvas);
        };
        
        logoImg.src = logoPath;
    });
}

function generateExportTitle(searchFilters) {
    // Vérifier s'il y a des données de recherche disponibles
    if (window.currentSearchData) {
        const data = window.currentSearchData;
        
        // Pour les questions de compétence
        if (data.questionType) {
            return {
                main: "IA-DAS - Analyse de Compétences",
                filters: getCompetenceQuestionTitle(data.questionType)
            };
        }
        
        // Pour les recherches personnalisées
        if (data.filters) {
            const filters = [];
            if (data.filters.gender) filters.push(`Genre: ${data.filters.gender}`);
            if (data.filters.sportType) filters.push(`Sport: ${data.filters.sportType}`);
            if (data.filters.selectedVI) filters.push(`VI: ${data.filters.selectedVI}`);
            if (data.filters.selectedVD) filters.push(`VD: ${data.filters.selectedVD}`);
            
            return {
                main: "IA-DAS - Recherche Personnalisée",
                filters: filters.join(' • ')
            };
        }
    }
    
    // Titre par défaut
    return {
        main: "IA-DAS - Graphique Ontologique",
        filters: null
    };
}

function getCompetenceQuestionTitle(questionType) {
    const titles = {
        'q1': 'Pour une ACAD spécifique → facteurs associés',
        'q2-protecteur': 'Facteurs protecteurs → ACAD',
        'q2-risque': 'Facteurs de risque → ACAD', 
        'q2-ambigu': 'Facteurs ambigus → ACAD',
        'q3-intrapersonnels': 'Facteurs intrapersonnels → ACAD',
        'q3-interpersonnels': 'Facteurs interpersonnels → ACAD',
        'q3-socioenvironnementaux': 'Facteurs socio-environnementaux → ACAD',
        'q3-autres': 'Autres comportements → ACAD',
        'q4-male': 'Relations ACAD-facteurs (Populations masculines)',
        'q4-female': 'Relations ACAD-facteurs (Populations féminines)',
        'q4-mixed': 'Relations ACAD-facteurs (Populations mixtes)',
        'q5-individual': 'Relations ACAD-facteurs (Sports individuels)',
        'q5-team': 'Relations ACAD-facteurs (Sports d\'équipe)',
        'q5-mixed': 'Relations ACAD-facteurs (Sports mixtes)',
        'q5-aesthetic': 'Relations ACAD-facteurs (Sports esthétiques)'
    };
    
    return titles[questionType] || 'Question de compétence';
}

function downloadCanvas(canvas, filename) {
    canvas.toBlob(function(blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    });
}

async function exportGraphToPNG() {
    try {
        const graphContainer = document.getElementById('graph-container');
        if (!graphContainer) {
            alert('Aucun graphique à exporter');
            return;
        }

        console.log('Début de l\'export PNG...');
        
        await loadHtml2Canvas();
        
        const canvas = await html2canvas(graphContainer, {
            scale: 6, 
            backgroundColor: '#ffffff',
            useCORS: true,
            allowTaint: true,
            logging: false,
            width: graphContainer.scrollWidth,
            height: graphContainer.scrollHeight
        });

        console.log('Graphique capturé, ajout du logo...');
        
        const finalCanvas = await addLogoAndTitleToCanvas(canvas, window.currentSearchData);
        
        console.log('Logo et titre ajoutés, téléchargement...');
        
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const filename = `graph_export_${timestamp}.png`;
        
        downloadCanvas(finalCanvas, filename);
        
    } catch (error) {
        console.error('Erreur export PNG:', error);
        alert(`Erreur lors de l'export PNG: ${error.message}`);
    }
}
function displayGraphView() {
    const displayDiv = document.getElementById('result-display');

    try {
        const template = document.getElementById('graph-view-template');
        const clone = template.content.cloneNode(true);

        displayDiv.innerHTML = '';
        displayDiv.appendChild(clone);

        const controls = document.getElementById('result-controls');
        // Ajouter export PNG (image) seulement pour la vue graphique
        if (controls && !document.getElementById('exportGraph')) {
            const imageExportTemplate = document.getElementById('export-image-template');
            const imageExportClone = imageExportTemplate.content.cloneNode(true);
            controls.appendChild(imageExportClone);
            document.getElementById('exportGraph').onclick = () => exportGraphToPNG();
        }

        const graphContainer = document.getElementById('graph-container');
        const graphComponent = new OntologyGraphComponent(graphContainer, currentData);
        graphComponent.render();

    } catch (error) {
        console.error('Erreur graphique:', error);
        const errorTemplate = document.getElementById('graph-error-template');
        const errorClone = errorTemplate.content.cloneNode(true);
        displayDiv.innerHTML = '';
        displayDiv.appendChild(errorClone);
    }
}

function displaySparqlView() {
    const displayDiv = document.getElementById('result-display');
    const template = document.getElementById('sparql-view-template');
    const clone = template.content.cloneNode(true);
    
    // Améliorer l'affichage de la requête SPARQL
    const queryDisplay = clone.getElementById('sparql-query');
    if (currentQuery && currentQuery !== 'Requête non disponible') {
        queryDisplay.textContent = currentQuery;
    } else {
        queryDisplay.innerHTML = `<span style="color: #e74c3c; font-style: italic;">
            Requête SPARQL non disponible
            <br><br>
            <small style="color: #7f8c8d;">
            Note: Cela peut arriver avec des requêtes générées par le système.
            Le tableau et le graphique contiennent les résultats corrects.
            </small>
        </span>`;
    }
    
    // Améliorer l'affichage des résultats JSON
    const resultsDisplay = clone.getElementById('sparql-results');
    if (currentData) {
        try {
            resultsDisplay.textContent = JSON.stringify(currentData, null, 2);
        } catch (error) {
            resultsDisplay.textContent = 'Erreur lors de l\'affichage des résultats JSON';
        }
    } else {
        resultsDisplay.textContent = 'Aucune donnée disponible';
    }
    
    displayDiv.innerHTML = '';
    displayDiv.appendChild(clone);
}

// Gestion du modal d'aide
document.addEventListener('DOMContentLoaded', function() {
    const helpButton = document.getElementById('helpButton');
    const helpModal = document.getElementById('helpModal');
    const closeHelp = document.getElementById('closeHelp');

    // Ouvrir le modal
    helpButton.addEventListener('click', function() {
        helpModal.style.display = 'block';
    });

    // Fermer le modal avec le bouton X
    closeHelp.addEventListener('click', function() {
        helpModal.style.display = 'none';
    });

    // Fermer le modal en cliquant en dehors
    window.addEventListener('click', function(event) {
        if (event.target === helpModal) {
            helpModal.style.display = 'none';
        }
    });
});