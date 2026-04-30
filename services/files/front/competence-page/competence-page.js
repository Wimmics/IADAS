let currentData = null;
let currentQuery = null;
let currentMode = 'table';

console.log("Script competence-page chargé !");

document.addEventListener('DOMContentLoaded', async function () {

    const excelPaths = [
        './data/IA-DAS-Data1.xlsx',
        './../data/IA-DAS-Data1.xlsx'
    ];

    let excelLoaded = false;
    for (const excelPath of excelPaths) {
        try {

            if (window.csvLoader && typeof window.csvLoader.loadExcelData === 'function') {
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
        }
    }

    if (!excelLoaded) {
        console.error(" Aucun fichier Excel trouvé !");
    }

    // Configurer les boutons d'export au chargement
    setupInitialExportButtons();

    // Attendre que le composant soit initialisé
    setTimeout(() => {
        console.log(" Recherche du composant compétence...");

        const competenceComponent = document.querySelector('input-competence-component');
        if (competenceComponent) {
            console.log("Composant compétence trouvé, ajout du listener !");

            competenceComponent.addEventListener('search', (event) => {
                console.log("=== ÉVÉNEMENT COMPÉTENCE REÇU ===");
                console.log("Données:", event.detail);
                rechercherCompetence(event.detail);
            });
        } else {
            console.log(" Composant compétence non trouvé dans le DOM");
        }
    }, 500);
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

async function rechercherCompetence(data) {
    console.log(" ===============================================");
    console.log(" DÉBUT RECHERCHE COMPÉTENCE - DEBUG COMPLET");
    console.log(" ===============================================");
    console.log(" Timestamp:", new Date().toISOString());
    
    // ===== DEBUG ENVIRONNEMENT =====
    console.log(" === ANALYSE ENVIRONNEMENT ===");
    console.log("   window.location.href:", window.location.href);
    console.log("   window.location.hostname:", window.location.hostname);
    console.log("   window.location.port:", window.location.port);
    console.log("   window.location.protocol:", window.location.protocol);
    
    // ===== DÉTECTION URL API =====
    console.log("🔧 === DÉTECTION URL API ===");
    const hostname = window.location.hostname;
    let apiUrl;
    
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        apiUrl = 'http://localhost:8003';
        console.log("   ENVIRONNEMENT: LOCAL");
        console.log("   URL API CHOISIE:", apiUrl);
    } else {
        apiUrl = `http://${hostname}:8003`;
        console.log("   ENVIRONNEMENT: DISTANT");
        console.log("   Hostname détecté:", hostname);
        console.log("   URL API CONSTRUITE:", apiUrl);
    }
    
    // ===== VALIDATION DONNÉES ENTRÉE =====
    console.log(" === VALIDATION DONNÉES ENTRÉE ===");
    console.log("   Données reçues:", JSON.stringify(data, null, 2));
    
    if (!data.questionId) {
        console.error(" ERREUR CRITIQUE: questionId manquant !");
        throw new Error("Question ID manquant");
    }
    console.log("    questionId présent:", data.questionId);
    console.log("   questionText:", data.questionText?.substring(0, 100) + "...");
    
    // ===== CONSTRUCTION PAYLOAD =====
    const payload = {
        queryType: 'predefined_competence',
        questionId: data.questionId,
        questionText: data.questionText,
        description: data.description
    };

    // Stocker les données de recherche pour l'export
    window.currentSearchData = {
        questionType: data.questionId,
        filters: null,
        timestamp: new Date()
    };
   
    try {
        // ===== TEST CONNECTIVITÉ RÉSEAU =====
       
        
        const startTime = Date.now();
        
      
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        const requestTime = Date.now() - startTime;
        console.log(" === RÉPONSE REÇUE ===");
        console.log("    Temps requête:", requestTime, "ms");
        console.log("    Status:", response.status);
        console.log("    Status Text:", response.statusText);
        console.log("    OK:", response.ok);
        console.log("    Headers:", [...response.headers.entries()]);
        console.log("    Heure réception:", new Date().toLocaleTimeString());
        
        // ===== ANALYSE STATUS HTTP =====
        if (!response.ok) {
            console.error(" === ERREUR HTTP ===");
            console.error("   Status:", response.status);
            console.error("   Status Text:", response.statusText);
            
            let errorText;
            try {
                errorText = await response.text();
                console.error("   Réponse serveur:", errorText);
            } catch (e) {
                console.error("   Impossible de lire réponse serveur:", e);
                errorText = "Erreur inconnue";
            }
            
            // Diagnostics spécifiques selon le code d'erreur
            switch (response.status) {
                case 404:
                    console.error(" DIAGNOSTIC: Endpoint non trouvé - Vérifiez que l'API tourne sur", apiUrl);
                    break;
                case 500:
                    console.error(" DIAGNOSTIC: Erreur serveur - Vérifiez les logs du serveur SPARQL");
                    break;
                case 502:
                    console.error(" DIAGNOSTIC: Bad Gateway - Le serveur est peut-être arrêté");
                    break;
                case 503:
                    console.error(" DIAGNOSTIC: Service indisponible - Le serveur est surchargé");
                    break;
                default:
                    console.error(" DIAGNOSTIC: Erreur inconnue - Vérifiez la connectivité réseau");
            }
            
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        // ===== PARSING RÉPONSE =====
     
        let responseData;
        try {
            const responseText = await response.text();
          
            responseData = JSON.parse(responseText);
            console.log("    JSON parsé avec succès");
        } catch (parseError) {
            console.error(" ERREUR PARSING JSON:", parseError);
            console.error("   Contenu reçu:", await response.text());
            throw new Error(`Erreur parsing JSON: ${parseError.message}`);
        }
        
        // ===== ANALYSE RÉPONSE =====
        console.log("== ANALYSE RÉPONSE SERVEUR ===");
        console.log("    Type réponse:", typeof responseData);
        console.log("    Clés principales:", Object.keys(responseData));
        
        if (responseData.results) {
            console.log("    Structure results:", Object.keys(responseData.results));
            console.log("    Nombre résultats:", responseData.results.bindings?.length || 0);
            
            if (responseData.results.bindings?.length > 0) {
                console.log("    Premier résultat:", responseData.results.bindings[0]);
                console.log("    Variables disponibles:", responseData.head?.vars);
            }
        }
        
        if (responseData.error) {
            console.error("    Erreur dans réponse:", responseData.error);
        }
        
        if (responseData.performance) {
            console.log("    Performance:", responseData.performance);
        }
        
        // ===== PARSING DONNÉES RÉSEAU =====
        console.log(" === PARSING DONNÉES RÉSEAU ===");
        let parsedData = responseData;
        
        if (window.SPARQLDataParser && typeof window.SPARQLDataParser.parse === 'function') {
            console.log("    SPARQLDataParser disponible");
            try {
                const parseStartTime = Date.now();
                parsedData = window.SPARQLDataParser.parse(responseData);
                const parseTime = Date.now() - parseStartTime;
                
                console.log("    Parsing réussi en", parseTime, "ms");
                console.log("    Structure parsée:", Object.keys(parsedData));
                
                if (parsedData.networkData) {
                    console.log("    Réseau créé:");
                    console.log("      - Nœuds:", parsedData.networkData.nodes?.length || 0);
                    console.log("      - Liens:", parsedData.networkData.links?.length || 0);
                }
            } catch (parseError) {
                console.error("    Erreur parsing réseau:", parseError);
                console.log("    Utilisation données brutes");
            }
        } else {
            console.warn("   SPARQLDataParser non disponible");
        }
        
        // ===== AFFICHAGE RÉSULTATS =====
        console.log(" === AFFICHAGE RÉSULTATS ===");
        hideSimpleLoading();
        console.log("    Loading masqué");
        
        // Récupérer la requête SPARQL depuis la réponse du serveur
        console.log("Clés disponibles dans responseData:", Object.keys(responseData));
        let sparqlQuery = responseData.query || responseData.sparqlQuery || responseData.generatedQuery || responseData.sparql || null;
        
        // Fallback : chercher dans des structures imbriquées
        if (!sparqlQuery && responseData.metadata) {
            sparqlQuery = responseData.metadata.query || responseData.metadata.sparql || null;
        }
        if (!sparqlQuery && responseData.debug) {
            sparqlQuery = responseData.debug.query || responseData.debug.sparql || null;
        }
        
        // Fallback : créer une requête approximative à partir des données de la question
        if (!sparqlQuery && data) {
            sparqlQuery = `# Requête générée pour la compétence :
# Question: ${data.questionText || 'Question prédéfinie'}
# Type: ${data.category || 'Recherche de compétences'}

# La requête SPARQL exacte n'est pas retournée par le serveur.
# Voici une représentation approximative :

PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX : <http://example.org/ontology#>

SELECT * WHERE {
  ?competence rdf:type :Competence .
  # Critères spécifiques à la question sélectionnée
  # appliqués par le serveur
}`;
        }
        
        console.log("Requête SPARQL récupérée:", sparqlQuery);
        
        displayCompetenceResults(parsedData, sparqlQuery);
        console.log("    Résultats affichés");
        
        // ===== SUCCÈS FINAL =====
        const totalTime = Date.now() - startTime;
        console.log("===============================================");
        console.log(" RECHERCHE COMPÉTENCE RÉUSSIE !");
        console.log(" ===============================================");
        console.log(" Temps total:", totalTime, "ms");
        console.log(" Résultats:", responseData.results?.bindings?.length || 0);
        console.log(" Fin:", new Date().toLocaleTimeString());
        
    } catch (error) {
        // ===== GESTION ERREUR COMPLÈTE =====
        
        // ===== DIAGNOSTICS AUTOMATIQUES =====
        console.error(" === DIAGNOSTICS AUTOMATIQUES ===");
        
        if (error.message.includes("Failed to fetch")) {
            console.error("    DIAGNOSTIC: Problème de connectivité réseau");
            console.error("    SOLUTIONS POSSIBLES:");
            console.error("      - Vérifiez que le serveur tourne sur", apiUrl);
            console.error("      - Vérifiez que le port 8003 est ouvert");
            console.error("      - Vérifiez les règles firewall/sécurité AWS");
            console.error("      - Testez manuellement:", apiUrl);
        } else if (error.message.includes("JSON")) {
            console.error("   DIAGNOSTIC: Problème de format de réponse");
            console.error("    Le serveur ne renvoie pas du JSON valide");
        } else if (error.message.includes("HTTP")) {
            console.error("    DIAGNOSTIC: Erreur serveur HTTP");
            console.error("    Vérifiez les logs du serveur");
        }
        
        hideSimpleLoading();
        showError('Erreur de recherche compétence', error.message, data);
        
        console.error(" === FIN GESTION ERREUR ===");
        throw error; // Re-lancer pour debugging
    }
}



function showSimpleLoading(message) {
    const resultsDiv = document.getElementById('results');
    if (resultsDiv) {
        resultsDiv.innerHTML = `
            <div id="simple-loading" style="
                text-align: center; 
                padding: 40px; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                color: white; 
                border-radius: 8px;
                margin: 20px 0;
            ">
                <div style="
                    width: 40px; 
                    height: 40px; 
                    border: 4px solid rgba(255,255,255,0.3); 
                    border-radius: 50%; 
                    border-top-color: white; 
                    animation: spin 1s ease-in-out infinite; 
                    margin: 0 auto 20px auto;
                "></div>
                <h3>🔍 Recherche en cours...</h3>
                <p>${message}</p>
            </div>
            <style>
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            </style>
        `;
    }
}

function hideSimpleLoading() {
    const loadingDiv = document.getElementById('simple-loading');
    if (loadingDiv) {
        loadingDiv.remove();
    }
}

function showError(title, message, data) {
    const resultsDiv = document.getElementById('results');
    if (resultsDiv) {
        resultsDiv.innerHTML = `
            <div style="color: red; padding: 20px; background: #fff3f3; border: 1px solid #ffcdd2; border-radius: 5px; margin: 20px 0;">
                <h4> ${title}</h4>
                <p><strong>Question:</strong> ${data.questionText}</p>
                <p><strong>Erreur:</strong> ${message}</p>
                <p><strong>Suggestions:</strong></p>
                <ul>
                    <li>Vérifiez que le serveur SPARQL Generator fonctionne (port 8003)</li>
                    <li>Vérifiez que les requêtes de compétence sont bien configurées</li>
                    <li>Consultez la console pour plus de détails</li>
                </ul>
                <button onclick="location.reload()" style="
                    background: #dc3545; 
                    color: white; 
                    border: none; 
                    padding: 10px 20px; 
                    border-radius: 5px; 
                    cursor: pointer; 
                    margin-top: 10px;
                ">🔄 Recharger la page</button>
            </div>
        `;
    }
}

function displayCompetenceResults(data, sparqlQuery) {
    currentData = data;
    currentQuery = sparqlQuery;

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

// Fonctions d'affichage (inchangées)
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
    console.log('🔍 Ouverture panneau pour analyse:', analysisId);
    
    try {
        // Vérifier que les services sont disponibles
        if (typeof window.analysisPanel === 'undefined') {
            console.error('AnalysisPanel non disponible !');
            alert('Erreur: Le panneau d\'analyse n\'est pas disponible.');
            return;
        }
        
        if (typeof window.fusekiRetriever === 'undefined') {
            console.error('FusekiAnalysisRetriever non disponible !');
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
        
        console.log('🔍 DEBUG: ID nettoyé:', cleanAnalysisId);
        
        // Créer un objet nodeData factice avec l'ID d'analyse
        const nodeData = {
            label: `Analyse ${cleanAnalysisId}`,
            analyses: [cleanAnalysisId],
            type: 'analysis_link'
        };
        
        // Récupérer les données d'analyse via Fuseki
        const analysisData = await window.fusekiRetriever.getAllAnalysesData(nodeData);
        
        // Ouvrir le panneau avec les données
        window.analysisPanel.openMultipleAnalyses(`Analyse ${analysisId}`, analysisData);
        
        console.log('✅ Panneau ouvert avec succès');
        
    } catch (error) {
        console.error('❌ Erreur ouverture panneau:', error);
        alert(`Erreur lors de l'ouverture du panneau d'analyse: ${error.message}`);
    }
}

function displayGraphView() {
    const displayDiv = document.getElementById('result-display');

    if (!currentData || !currentData.results || !currentData.results.bindings) {
        displayDiv.innerHTML = `
            <div style="padding: 20px; text-align: center; background: #f8f9fa; border-radius: 5px;">
                <p>Aucune donnée à visualiser</p>
                <p style="color: #666;">Sélectionnez une question et lancez une recherche d'abord</p>
            </div>
        `;
        return;
    }

    // Info sur les données seulement
    const dataInfo = `
        <div style="margin-bottom: 15px; color: #666;">
            ${currentData.results.bindings.length} relations • 
            ${currentQuery?.questionText?.substring(0, 50)}...
        </div>
    `;

    try {
        // Afficher le loading pendant le parsing
        displayDiv.innerHTML = dataInfo + `
            <div id="graph-container">
                <div style="text-align: center; padding: 40px;">
                    <div style="
                        width: 40px; height: 40px; 
                        border: 4px solid #f3f3f3; 
                        border-top: 4px solid #667eea; 
                        border-radius: 50%; 
                        animation: spin 1s linear infinite; 
                        margin: 0 auto 20px;
                    "></div>
                    <p>🎨 Génération du graphique...</p>
                </div>
            </div>
            <style>
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
        `;

        console.log(" Début génération graphique...");
        console.log(" Données brutes:", currentData);

        let parsedData;

        if (typeof SPARQLDataParser !== 'undefined' && typeof SPARQLDataParser.parse === 'function') {
            console.log(" SPARQLDataParser disponible, parsing...");
            const parseStartTime = Date.now();

            parsedData = SPARQLDataParser.parse(currentData);

            const parseTime = Date.now() - parseStartTime;
            console.log(` Temps de parsing: ${parseTime}ms`);
            console.log(" Données parsées - structure:", Object.keys(parsedData));

            if (parsedData.networkData) {
                
            }
        } else {
            console.warn(" SPARQLDataParser non disponible, données brutes utilisées");
        }

        // Vérifier que les données parsées ont la bonne structure
        if (!parsedData.networkData || !parsedData.networkData.nodes) {
            throw new Error("Les données parsées n'ont pas la structure réseau attendue");
        }

       

        setTimeout(() => {
            const graphContainer = document.getElementById('graph-container');

            // Nettoyer le loading
            graphContainer.innerHTML = '';

            // Créer le graphique avec les bonnes données
            if (typeof GraphRenderer !== 'undefined') {
                const renderer = new GraphRenderer(graphContainer, parsedData);
                renderer.render();

            } else if (typeof OntologyGraphComponent !== 'undefined') {
                const graphComponent = new OntologyGraphComponent(graphContainer, parsedData);
                graphComponent.render();

            } else {
                createAdvancedD3Graph(graphContainer, parsedData);
            }

        }, 100);

        // Événement d'export
        setTimeout(() => {
            const exportBtn = document.getElementById('exportGraph');
            if (exportBtn) {
                exportBtn.onclick = () => exportGraphToPNG();
            }
            
        }, 200);

    } catch (error) {
        console.error(' Erreur graphique:', error);
        displayDiv.innerHTML = `
            <div style="padding: 20px; background: #ffebee; border: 1px solid #ffcdd2; border-radius: 5px;">
                <h4> Erreur lors de l'affichage du graphique</h4>
                <p><strong>Détails:</strong> ${error.message}</p>
                <p><strong>Données disponibles:</strong> ${currentData.results?.bindings?.length || 0} résultats</p>
                <details style="margin-top: 10px;">
                    <summary style="cursor: pointer; color: #666;">🔍 Détails techniques</summary>
                    <pre style="background: #f5f5f5; padding: 10px; margin-top: 10px; font-size: 12px; overflow-x: auto;">
Structure attendue: { networkData: { nodes: [...], links: [...] } }
Structure reçue: ${JSON.stringify(Object.keys(currentData), null, 2)}
Variables SPARQL: ${JSON.stringify(currentData.head?.vars, null, 2)}
                    </pre>
                </details>
                <div style="margin-top: 15px;">
                    <button onclick="displayTableView()" style="
                        background: #2980b9; color: white; border: none; 
                        padding: 8px 16px; border-radius: 4px; cursor: pointer;
                    ">📊 Voir en tableau</button>
                </div>
            </div>
        `;
    }
}



function createManualNetworkData(rawData) {
    console.log(" Création manuelle des données réseau...");

    const nodes = [];
    const links = [];
    const nodeMap = new Map();

    rawData.results.bindings.forEach((binding, index) => {
        const vi = binding.vi?.value || `facteur_${index}`;
        const vd = binding.vd?.value || `acad_${index}`;
        const relation = binding.resultatRelation?.value || 'unknown';

        // Créer nœud VI
        const viId = `vi_${vi}`;
        if (!nodeMap.has(viId)) {
            nodes.push({
                id: viId,
                label: vi,
                type: 'factor',
                size: 15,
                color: '#1565C0'
            });
            nodeMap.set(viId, true);
        }

        // Créer nœud VD
        const vdId = `vd_${vd}`;
        if (!nodeMap.has(vdId)) {
            nodes.push({
                id: vdId,
                label: vd,
                type: 'acad',
                size: 15,
                color: '#C62828'
            });
            nodeMap.set(vdId, true);
        }

        // Créer lien
        links.push({
            source: viId,
            target: vdId,
            relation: relation,
            label: relation,
            color: relation === '+' ? '#E53E3E' : relation === '-' ? '#38A169' : '#718096'
        });
    });

    console.log(` Réseau manuel créé: ${nodes.length} nœuds, ${links.length} liens`);

    return {
        networkData: { nodes, links },
        variables: rawData.head.vars,
        data: rawData.results.bindings
    };
}

function createSimpleD3Graph(container, data) {

    // Nettoyer le container
    d3.select(container).selectAll("*").remove();

    const width = 800;
    const height = 600;

    // Créer l'SVG
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .style('border', '1px solid #ddd')
        .style('border-radius', '8px');

    // Ajouter un message temporaire
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .style('font-size', '18px')
        .style('fill', '#666')
        .text('🎨 Graphique simple en développement...');

    // Statistiques des données
    const resultCount = data.results?.bindings?.length || 0;
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2 + 40)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('fill', '#999')
        .text(` ${resultCount} relations trouvées`);

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
        const filename = `competence_graph_${currentQuery?.questionId || 'unknown'}_${timestamp}.png`;
        
        downloadCanvas(finalCanvas, filename);
        
    } catch (error) {
        console.error(' Erreur export PNG:', error);
        alert(`Erreur lors de l'export : ${error.message}`);
    }
}


function displaySparqlView() {
    const displayDiv = document.getElementById('result-display');

    const sparqlHTML = `
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-top: 10px;">
            <h4>Requête SPARQL générée :</h4>
            <pre style="background: #2d3748; color: #e2e8f0; padding: 15px; border-radius: 5px; overflow-x: auto; white-space: pre-wrap;">${currentQuery || 'Requête non disponible'}</pre>
            
            <h4 style="margin-top: 20px;">Résultats JSON :</h4>
            <pre style="background: #2d3748; color: #e2e8f0; padding: 15px; border-radius: 5px; overflow-x: auto; max-height: 400px; white-space: pre-wrap;">${JSON.stringify(currentData, null, 2)}</pre>
        </div>
    `;

    displayDiv.innerHTML = sparqlHTML;
}

function exportCompetenceAnalysis(data, questionContext) {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `competence_${questionContext.questionId}_${timestamp}.json`;

    const exportData = {
        metadata: {
            questionId: questionContext.questionId,
            questionText: questionContext.questionText,
            description: questionContext.description,
            timestamp: new Date().toISOString(),
            resultCount: data.results?.bindings?.length || 0
        },
        results: data,
        analysis: {
            summary: `Analyse de ${data.results?.bindings?.length || 0} relations pour la question de compétence`
        }
    };

    // Créer et télécharger le fichier
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    console.log(`Analyse de compétence exportée: ${filename}`);
}

// Fonctions d'export simplifiées
async function exportToExcel() {
    if (!currentData || !currentData.results || !currentData.results.bindings) {
        alert('Aucune donnée à exporter');
        return;
    }
    
    try {
        console.log('Export Excel avec toutes les analyses de compétence...');
        
        // Afficher un indicateur de chargement
        const originalText = 'Export Excel';
        const exportBtn = document.getElementById('exportExcel');
        if (exportBtn) {
            exportBtn.textContent = 'Export en cours...';
            exportBtn.disabled = true;
        }
        
        // Récupérer toutes les analyses complètes
        const completeAnalyses = await getAllCompleteAnalysesForCompetence(currentData.results.bindings);
        
        // Créer le fichier Excel avec toutes les informations
        const excelData = createCompleteCompetenceExcelExport(completeAnalyses, currentData, currentQuery);
        
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const filename = `competence_complet_${currentQuery?.questionId || 'unknown'}_${timestamp}.xlsx`;
        downloadExcelFile(excelData, filename);
        console.log('Export Excel complet réussi:', filename);
        
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

function exportToTurtle() {
    if (!currentData || !currentData.results || !currentData.results.bindings) {
        alert('Aucune donnée à exporter');
        return;
    }
    
    try {
        convertToTurtle(currentData);
        console.log('Export Turtle lancé');
    } catch (error) {
        console.error('Erreur export Turtle:', error);
        alert(`Erreur lors de l'export Turtle: ${error.message}`);
    }
}

// Récupère toutes les analyses complètes pour la page compétence
async function getAllCompleteAnalysesForCompetence(bindings) {
    console.log(`Récupération de ${bindings.length} analyses complètes pour compétence...`);
    
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
    
    console.log(`${analysisIds.size} analyses uniques trouvées pour compétence:`, Array.from(analysisIds));
    
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
    
    console.log(`${completeAnalyses.length} analyses complètes récupérées pour compétence`);
    return completeAnalyses;
}

// Crée un export Excel complet spécifique aux compétences
function createCompleteCompetenceExcelExport(completeAnalyses, originalData, queryInfo) {
    const workbook = XLSX.utils.book_new();
    
    // ========== FEUILLE 1: QUESTION DE COMPÉTENCE ==========
    const questionData = [
        ['Propriété', 'Valeur'],
        ['Question ID', queryInfo?.questionId || 'N/A'],
        ['Type de Question', getCompetenceQuestionTitle(queryInfo?.questionId) || 'N/A'],
        ['Date Export', new Date().toLocaleString('fr-FR')],
        ['Nombre de Résultats', originalData.results.bindings.length],
        ['Variables Recherchées', originalData.head.vars.join(', ')],
        ['Source', 'Ontologie IA-DAS - Questions de Compétences']
    ];
    
    const questionSheet = XLSX.utils.aoa_to_sheet(questionData);
    XLSX.utils.book_append_sheet(workbook, questionSheet, "Question de Compétence");
    
    // ========== FEUILLE 2: RÉSULTATS BRUTS ==========
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
    
    // ========== FEUILLE 3: ANALYSES COMPLÈTES (TOUTES LES COLONNES DYNAMIQUES) ==========
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
        
        console.log(`📊 Export Excel Compétence: ${allColumns.length} colonnes dynamiques trouvées`);
        
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
    
    // ========== FEUILLE 4: STATISTIQUES PAR COMPÉTENCE ==========
    if (completeAnalyses.length > 0) {
        const stats = calculateCompetenceStatistics(completeAnalyses, queryInfo);
        const statsData = [
            ['Statistique', 'Valeur'],
            ...Object.entries(stats).map(([key, value]) => [key, value])
        ];
        
        const statsSheet = XLSX.utils.aoa_to_sheet(statsData);
        XLSX.utils.book_append_sheet(workbook, statsSheet, "Statistiques");
    }
    
    // ========== FEUILLE 5: TOUTES LES PROPRIÉTÉS SPARQL BRUTES ==========
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
            console.log(`📋 Compétence: Ajout de ${sparqlData.length - 1} propriétés SPARQL brutes à l'export`);
        }
    }

    // ========== FEUILLE 6: ANALYSE PAR CATÉGORIE ==========
    if (completeAnalyses.length > 0) {
        const categoryAnalysis = analyzeByCategoryForCompetence(completeAnalyses);
        
        const categoryData = [
            ['Catégorie', 'Nombre d\'analyses', 'Pourcentage'],
            ...Object.entries(categoryAnalysis).map(([category, count]) => [
                category, 
                count, 
                `${Math.round((count / completeAnalyses.length) * 100)}%`
            ])
        ];
        
        const categorySheet = XLSX.utils.aoa_to_sheet(categoryData);
        XLSX.utils.book_append_sheet(workbook, categorySheet, "Analyse par Catégorie");
    }
    
    return workbook;
}

// Calcule des statistiques spécifiques aux compétences
function calculateCompetenceStatistics(analyses, queryInfo) {
    const stats = {};
    
    // Informations générales
    stats['Question de Compétence'] = getCompetenceQuestionTitle(queryInfo?.questionId) || queryInfo?.questionId || 'N/A';
    stats['Type d\'Analyse'] = 'Question de Compétence Prédéfinie';
    
    // Analyses avec/sans erreur
    const validAnalyses = analyses.filter(a => !a.error);
    const errorAnalyses = analyses.filter(a => a.error);
    
    stats['Total Analyses'] = analyses.length;
    stats['Analyses Valides'] = validAnalyses.length;
    stats['Analyses en Erreur'] = errorAnalyses.length;
    stats['Taux de Succès'] = `${Math.round((validAnalyses.length / analyses.length) * 100)}%`;
    
    // Statistiques détaillées sur les données valides
    if (validAnalyses.length > 0) {
        const countries = new Set();
        const journals = new Set();
        const sports = new Set();
        const relations = new Set();
        const years = [];
        
        validAnalyses.forEach(analysis => {
            const raw = analysis.rawData;
            if (raw?.Country && raw.Country !== 'N/A') countries.add(raw.Country);
            if (raw?.Journal && raw.Journal !== 'N/A') journals.add(raw.Journal);
            if (raw?.Sport_name && raw.Sport_name !== 'N/A') sports.add(raw.Sport_name);
            if (raw?.Resultat_de_relation && raw.Resultat_de_relation !== 'N/A') relations.add(raw.Resultat_de_relation);
            
            if (raw?.['Year ']) {
                const year = parseInt(raw['Year ']);
                if (!isNaN(year)) years.push(year);
            }
        });
        
        stats['Pays Couverts'] = countries.size;
        stats['Journaux Différents'] = journals.size;
        stats['Sports Étudiés'] = sports.size;
        stats['Types Relations'] = relations.size;
        
        if (years.length > 0) {
            stats['Période - Année Min'] = Math.min(...years);
            stats['Période - Année Max'] = Math.max(...years);
            stats['Période - Moyenne'] = Math.round(years.reduce((a, b) => a + b, 0) / years.length);
        }
        
        // Relations les plus fréquentes
        const relationCounts = {};
        validAnalyses.forEach(analysis => {
            const relation = analysis.rawData?.Resultat_de_relation;
            if (relation && relation !== 'N/A') {
                relationCounts[relation] = (relationCounts[relation] || 0) + 1;
            }
        });
        
        const topRelation = Object.entries(relationCounts)
            .sort(([,a], [,b]) => b - a)[0];
        
        if (topRelation) {
            stats['Relation Plus Fréquente'] = `${topRelation[0]} (${topRelation[1]} fois)`;
        }
    }
    
    return stats;
}

// Analyse par catégorie pour les compétences
function analyzeByCategoryForCompetence(analyses) {
    const categories = {};
    
    analyses.forEach(analysis => {
        if (analysis.error) {
            categories['Erreur'] = (categories['Erreur'] || 0) + 1;
            return;
        }
        
        const raw = analysis.rawData;
        
        // Catégoriser par variable dépendante (ACADS)
        const acads = raw?.ACADS || raw?.VD || 'Non spécifié';
        categories[`VD: ${acads}`] = (categories[`VD: ${acads}`] || 0) + 1;
        
        // Catégoriser par résultat de relation
        const relation = raw?.Resultat_de_relation || 'Relation non spécifiée';
        categories[`Relation: ${relation}`] = (categories[`Relation: ${relation}`] || 0) + 1;
        
        // Catégoriser par type de sport
        const sport = raw?.Sport_name || 'Sport non spécifié';
        if (sport !== 'Sport non spécifié') {
            categories[`Sport: ${sport}`] = (categories[`Sport: ${sport}`] || 0) + 1;
        }
    });
    
    return categories;
}

function convertToExcel(data) {
    if (!data.results || !data.results.bindings || data.results.bindings.length === 0) {
        // Retourner un workbook vide avec message
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.aoa_to_sheet([['Aucune donnée disponible']]);
        XLSX.utils.book_append_sheet(workbook, worksheet, "Pas de données");
        return workbook;
    }
    
    const bindings = data.results.bindings;
    const variables = data.head.vars;
    
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
    XLSX.utils.book_append_sheet(workbook, worksheet, "Compétences Export");
    
    return workbook;
}

async function convertToTurtle(data) {
    try {
        // Déterminer l'URL API
        const hostname = window.location.hostname;
        const apiUrl = hostname === 'localhost' || hostname === '127.0.0.1' 
            ? 'http://localhost:8003' 
            : `http://${hostname}:8003`;
        
        const response = await fetch(`${apiUrl}/api/export/turtle`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sparqlResults: data,
                metadata: {
                    questionId: currentQuery?.questionId,
                    questionText: currentQuery?.questionText,
                    exportType: 'competence_query'
                }
            })
        });
        
        if (!response.ok) {
            throw new Error(`Erreur serveur: ${response.status}`);
        }
        
        const turtleData = await response.text();
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const filename = `competence_data_${currentQuery?.questionId || 'unknown'}_${timestamp}.ttl`;
        downloadFile(turtleData, filename, 'text/turtle');
        
    } catch (error) {
        console.error('Erreur export Turtle:', error);
        alert(`Erreur lors de l'export Turtle: ${error.message}`);
    }
}

function downloadExcelFile(workbook, filename) {
    XLSX.writeFile(workbook, filename);
}

function downloadFile(content, filename, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Debug global
window.competenceDebug = {
    getCurrentData: () => currentData,
    getCurrentQuery: () => currentQuery,
    testFunction: () => console.log(" competence-page.js fonctionne !")
};