// SPARQL Generator avec warmup AU DÉMARRAGE UNIQUEMENT
const http = require('http');
const fetch = require('node-fetch');

// Fonction de conversion SPARQL vers Turtle
function convertSparqlToTurtle(sparqlResults, metadata = {}) {
  if (!sparqlResults.results || !sparqlResults.results.bindings) {
    throw new Error('Format SPARQL invalide');
  }
  
  const bindings = sparqlResults.results.bindings;
  const timestamp = new Date().toISOString();
  
  // En-tête Turtle avec préfixes
  let turtle = `@prefix iadas: <http://ns.inria.fr/iadas/ontology/> .
@prefix iadas-data: <http://ns.inria.fr/iadas/data/> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix export: <http://ia-das.org/export#> .

# Export généré le ${timestamp}
# Type: ${metadata.exportType || 'sparql_query'}
`;

  if (metadata.questionId) {
    turtle += `# Question ID: ${metadata.questionId}\n`;
  }
  if (metadata.questionText) {
    turtle += `# Question: ${metadata.questionText}\n`;
  }
  
  turtle += `\n`;
  
  // Convertir chaque binding en triples Turtle
  bindings.forEach((binding, index) => {
    const exportId = `export:result_${index + 1}`;
    turtle += `${exportId} rdf:type export:SparqlResult ;\n`;
    
    Object.keys(binding).forEach(variable => {
      const value = binding[variable];
      if (value && value.value) {
        const turtleValue = value.type === 'uri' 
          ? `<${value.value}>` 
          : `"${value.value.replace(/"/g, '\\"')}"`;
        turtle += `    export:${variable} ${turtleValue} ;\n`;
      }
    });
    
    turtle += `    export:resultIndex ${index + 1} .\n\n`;
  });
  
  // Métadonnées d'export
  turtle += `export:metadata rdf:type export:ExportMetadata ;
    export:timestamp "${timestamp}"^^xsd:dateTime ;
    export:resultCount ${bindings.length} ;
    export:exportFormat "turtle" `;
    
  if (metadata.questionId) {
    turtle += `;\n    export:sourceQuestion "${metadata.questionId}" `;
  }
  
  turtle += `.\n`;
  
  return turtle;
}

// Configuration
const FUSEKI_TIMEOUT = 60000; // 60 secondes
const WARMUP_TIMEOUT = 15000; // 15 secondes pour warmup
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 secondes entre tentatives
const FUSEKI_UPDATE_URL = 'http://fuseki:3030/ds/update';

// 🔥 ÉTAT GLOBAL DU WARMUP
let isFusekiWarmed = false;
let warmupInProgress = false;
let warmupPromise = null;

// 🔥 WARMUP AU DÉMARRAGE DU SERVICE
async function performStartupWarmup() {
  if (warmupInProgress || isFusekiWarmed) {
    console.log(' Warmup déjà fait ou en cours - skip');
    return true;
  }

  warmupInProgress = true;
  console.log('\n === WARMUP AU DÉMARRAGE DU SPARQL GENERATOR ===');

  const fusekiEndpoint = 'http://fuseki:3030/ds/sparql';
  const startTime = Date.now();

  // Requêtes de warmup - LES MÊMES que ton code utilise vraiment
  const warmupQueries = [
    {
      name: "Test connexion",
      query: "SELECT (1 as ?test) WHERE { }",
      timeout: 5000
    },
    {
      name: "Fallback principal (EXACT)",
      query: generateFallbackQuery(),
      timeout: 20000
    },
    {
      name: "Requête DEAB (la plus utilisée)",
      query: `
PREFIX iadas: <http://ns.inria.fr/iadas/ontology/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX iadas-data: <http://ns.inria.fr/iadas/data/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

SELECT ?analysis ?vi ?vd ?categoryVI ?categoryVD ?mediator ?moderator ?relationDirection WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation .
    ?relation iadas:hasIndependentVariable ?variableVI ;
              iadas:hasDependentVariable ?variableVD .
    
    ?variableVI iadas:refersToVariable ?viURI .
    BIND(REPLACE(STR(?viURI), ".*ACAD-vocab/", "") AS ?vi)
    BIND(REPLACE(?vi, '_', ' ') AS ?viLabel)
    OPTIONAL { SELECT ?viLabel (MIN(REPLACE(REPLACE(STR(?catVIURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVI) WHERE { ?viConcept skos:prefLabel ?viLabel . ?viConcept skos:broader ?catVIURIRaw } GROUP BY ?viLabel }
    
    ?variableVD iadas:refersToVariable ?vdURI .
    BIND(REPLACE(STR(?vdURI), ".*ACAD-vocab/", "") AS ?vd)
    BIND(REPLACE(?vd, '_', ' ') AS ?vdLabel)
    OPTIONAL { SELECT ?vdLabel (MIN(REPLACE(REPLACE(STR(?catVDURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVD) WHERE { ?vdConcept skos:prefLabel ?vdLabel . ?vdConcept skos:broader ?catVDURIRaw } GROUP BY ?vdLabel }
    
    ?vdSKOS skos:prefLabel ?vdLabel .
    ?vdSKOS skos:broader+ <http://ns.inria.fr/iadas/ACAD-vocab/DEAB> .
    
    OPTIONAL { 
      ?analysis iadas:relationDirection ?relationDirection 
    }
    
    OPTIONAL { ?analysis iadas:hasMediator ?mediator }
    OPTIONAL { ?analysis iadas:hasModerator ?moderator }
}
ORDER BY ?analysis
`,
      timeout: 30000
    },
    {
      name: "Requête Male (courante)",
      query: `
PREFIX iadas: <http://ns.inria.fr/iadas/ontology/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX iadas-data: <http://ns.inria.fr/iadas/data/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

SELECT ?analysis ?vi ?vd ?categoryVI ?categoryVD ?mediator ?moderator ?relationDirection WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation .
    ?relation iadas:hasIndependentVariable ?variableVI ;
              iadas:hasDependentVariable ?variableVD .
    
    ?variableVI iadas:refersToVariable ?viURI .
    BIND(REPLACE(STR(?viURI), ".*ACAD-vocab/", "") AS ?vi)
    BIND(REPLACE(?vi, '_', ' ') AS ?viLabel)
    OPTIONAL { SELECT ?viLabel (MIN(REPLACE(REPLACE(STR(?catVIURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVI) WHERE { ?viConcept skos:prefLabel ?viLabel . ?viConcept skos:broader ?catVIURIRaw } GROUP BY ?viLabel }
    
    ?variableVD iadas:refersToVariable ?vdURI .
    BIND(REPLACE(STR(?vdURI), ".*ACAD-vocab/", "") AS ?vd)
    BIND(REPLACE(?vd, '_', ' ') AS ?vdLabel)
    OPTIONAL { SELECT ?vdLabel (MIN(REPLACE(REPLACE(STR(?catVDURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVD) WHERE { ?vdConcept skos:prefLabel ?vdLabel . ?vdConcept skos:broader ?catVDURIRaw } GROUP BY ?vdLabel }
    
    ?analysis iadas:hasPopulation ?population .
    ?population iadas:gender "Male" .
    
    OPTIONAL { 
      ?analysis iadas:relationDirection ?relationDirection 
    }
    
    OPTIONAL { ?analysis iadas:hasMediator ?mediator }
    OPTIONAL { ?analysis iadas:hasModerator ?moderator }
}
ORDER BY ?analysis`,
      timeout: 30000
    },
    {
      name: "Requête large (sans filtres - LIMIT 1500)",
      query: `
PREFIX iadas: <http://ns.inria.fr/iadas/ontology/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX iadas-data: <http://ns.inria.fr/iadas/data/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

SELECT ?analysis ?vi ?vd ?categoryVI ?categoryVD ?mediator ?moderator ?relationDirection WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation .
    ?relation iadas:hasIndependentVariable ?variableVI ;
              iadas:hasDependentVariable ?variableVD .
    
    ?variableVI iadas:refersToVariable ?viURI .
    BIND(REPLACE(STR(?viURI), ".*ACAD-vocab/", "") AS ?vi)
    BIND(REPLACE(?vi, '_', ' ') AS ?viLabel)
    OPTIONAL { SELECT ?viLabel (MIN(REPLACE(REPLACE(STR(?catVIURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVI) WHERE { ?viConcept skos:prefLabel ?viLabel . ?viConcept skos:broader ?catVIURIRaw } GROUP BY ?viLabel }
    
    ?variableVD iadas:refersToVariable ?vdURI .
    BIND(REPLACE(STR(?vdURI), ".*ACAD-vocab/", "") AS ?vd)
    BIND(REPLACE(?vd, '_', ' ') AS ?vdLabel)
    OPTIONAL { SELECT ?vdLabel (MIN(REPLACE(REPLACE(STR(?catVDURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVD) WHERE { ?vdConcept skos:prefLabel ?vdLabel . ?vdConcept skos:broader ?catVDURIRaw } GROUP BY ?vdLabel }
    
    OPTIONAL { 
      ?analysis iadas:relationDirection ?relationDirection 
    }
    
    OPTIONAL { ?analysis iadas:hasMediator ?mediator }
    OPTIONAL { ?analysis iadas:hasModerator ?moderator }
}
ORDER BY ?analysis
LIMIT 800`,
      timeout: 45000
    },
    {
      name: "Requête Q1 compétence",
      query: `
PREFIX iadas: <http://ns.inria.fr/iadas/ontology/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX iadas-data: <http://ns.inria.fr/iadas/data/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

SELECT DISTINCT ?vd ?vi ?categoryVI ?categoryVD ?relationDirection ?mediator ?moderator ?analysis 
WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation .
    ?relation iadas:hasIndependentVariable ?variableVI ;
              iadas:hasDependentVariable ?variableVD .
    
    ?variableVI iadas:refersToVariable ?viURI .
    BIND(REPLACE(STR(?viURI), ".*ACAD-vocab/", "") AS ?vi)
    BIND(REPLACE(?vi, '_', ' ') AS ?viLabel)
    OPTIONAL { SELECT ?viLabel (MIN(REPLACE(REPLACE(STR(?catVIURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVI) WHERE { ?viConcept skos:prefLabel ?viLabel . ?viConcept skos:broader ?catVIURIRaw } GROUP BY ?viLabel }
    
    ?variableVD iadas:refersToVariable ?vdURI .
    BIND(REPLACE(STR(?vdURI), ".*ACAD-vocab/", "") AS ?vd)
    BIND(REPLACE(?vd, '_', ' ') AS ?vdLabel)
    OPTIONAL { SELECT ?vdLabel (MIN(REPLACE(REPLACE(STR(?catVDURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVD) WHERE { ?vdConcept skos:prefLabel ?vdLabel . ?vdConcept skos:broader ?catVDURIRaw } GROUP BY ?vdLabel }
    
    OPTIONAL { ?analysis iadas:relationDirection ?relationDirection }
    OPTIONAL { ?analysis iadas:hasMediator ?mediator }
    OPTIONAL { ?analysis iadas:hasModerator ?moderator }
}
ORDER BY ?vd ?vi
`,
      timeout: 40000
    }
  ];

  let successCount = 0;

  for (const [index, warmupQuery] of warmupQueries.entries()) {
    console.log(`\n [${index + 1}/${warmupQueries.length}] ${warmupQuery.name}`);

    const queryStart = Date.now();

    try {
      const data = await executeWithRetry(fusekiEndpoint, warmupQuery.query, 2);
      const queryTime = Date.now() - queryStart;
      const resultCount = data.results?.bindings?.length || 0;

      console.log(`   Succès: ${resultCount} résultats en ${queryTime}ms`);
      successCount++;
    } catch (error) {
      const queryTime = Date.now() - queryStart;
      console.log(`    Échec: ${error.message} (${queryTime}ms)`);

      // Si le test de connexion échoue, on attend un peu
      if (index === 0) {
        console.log('    Fuseki pas encore prêt - attente 5s...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    // Délai entre requêtes
    if (index < warmupQueries.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  const totalTime = Date.now() - startTime;

  console.log(`\n === BILAN WARMUP DÉMARRAGE ===`);
  console.log(`    Succès: ${successCount}/${warmupQueries.length} requêtes`);
  console.log(`    Temps total: ${(totalTime / 1000).toFixed(1)}s`);

  if (successCount >= 4) { // Au moins 4/6 requêtes réussies
    isFusekiWarmed = true;
    console.log(`    FUSEKI EST MAINTENANT CHAUD !`);
    console.log(`    Plus de warmup nécessaire pour les requêtes suivantes`);
    console.log(`    Performance optimale garantie`);
  } else {
    console.log(`    Warmup insuffisant (${successCount}/${warmupQueries.length}) - warmup par requête activé`);
  }

  warmupInProgress = false;
  return isFusekiWarmed;
}

// Fonction pour générer les requêtes SPARQL de hiérarchie
function generateHierarchyQuery(conceptLabel) {
 
  
  // Vérifications de base
  if (!conceptLabel || conceptLabel.trim() === '') {
    console.error(" ERREUR: conceptLabel est vide !");
    throw new Error("Concept label requis pour la requête hiérarchie");
  }
  
  // Fonction automatique de mapping label → URI ontologique
  console.log(" Génération automatique de l'URI...");
  
  let conceptUri = generateAutomaticUri(conceptLabel);
  
  console.log(` URI généré: ${conceptLabel} → ${conceptUri}`);
  
  // Générer la requête SPARQL complète
  const prefixes = `
PREFIX iadas: <http://ns.inria.fr/iadas/ontology/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX taxonomy: <http://ia-das.org/taxonomy#>`;

  const query = `${prefixes}

SELECT ?concept ?conceptLabel ?relation ?related ?relatedLabel ?level WHERE {
  # Le concept principal
  BIND(<http://ns.inria.fr/iadas/ontology/${conceptUri.replace('iadas:', '')}> AS ?mainConcept)
  
  {
    # PARENTS du concept avec comptage de niveaux
    ?mainConcept rdfs:subClassOf ?parent1 .
    BIND(?parent1 as ?concept)
    BIND("parent" as ?relation)
    BIND(?concept as ?related) 
    BIND(1 as ?level)
    OPTIONAL { ?concept rdfs:label ?conceptLabel }
    OPTIONAL { ?related rdfs:label ?relatedLabel }
  }
  UNION
  {
    ?mainConcept rdfs:subClassOf ?parent1 .
    ?parent1 rdfs:subClassOf ?parent2 .
    BIND(?parent2 as ?concept)
    BIND("parent" as ?relation)
    BIND(?concept as ?related)
    BIND(2 as ?level)
    OPTIONAL { ?concept rdfs:label ?conceptLabel }
    OPTIONAL { ?related rdfs:label ?relatedLabel }
  }
  UNION
  {
    ?mainConcept rdfs:subClassOf ?parent1 .
    ?parent1 rdfs:subClassOf ?parent2 .
    ?parent2 rdfs:subClassOf ?parent3 .
    BIND(?parent3 as ?concept)
    BIND("parent" as ?relation)
    BIND(?concept as ?related)
    BIND(3 as ?level)
    OPTIONAL { ?concept rdfs:label ?conceptLabel }
    OPTIONAL { ?related rdfs:label ?relatedLabel }
  }
  UNION
  {
    # ENFANTS du concept
    ?concept rdfs:subClassOf ?mainConcept .
    BIND("child" as ?relation)
    BIND(?concept as ?related)
    BIND(1 as ?level)
    OPTIONAL { ?concept rdfs:label ?conceptLabel }
    OPTIONAL { ?related rdfs:label ?relatedLabel }
  }
  UNION
  {
    # Le concept LUI-MÊME
    BIND(?mainConcept as ?concept)
    BIND("self" as ?relation)
    BIND(?mainConcept as ?related)
    BIND(0 as ?level)
    OPTIONAL { ?concept rdfs:label ?conceptLabel }
    OPTIONAL { ?related rdfs:label ?relatedLabel }
  }
  
  # Filtrer pour évider les concepts vides
  FILTER(?concept != <http://www.w3.org/2002/07/owl#Thing>)
  FILTER(?related != <http://www.w3.org/2002/07/owl#Thing>)
}
ORDER BY ?relation DESC(?level)
LIMIT 50`;


  
  return query;
}

// Fonction automatique pour générer les URIs ontologiques
function generateAutomaticUri(label) {
  
  if (!label || label.trim() === '') {
    throw new Error("Label vide pour génération URI");
  }
  
  // Nettoyer et normaliser le label
  let cleanLabel = label.trim();
  
  // Règles de transformation automatiques
  
  // 1. Remplacer SEULEMENT les espaces par des underscores (préserver les tirets existants)
  cleanLabel = cleanLabel.replace(/\s+/g, '_');
  
  // 2. Transformation simple : remplacer espaces par underscores
  // Plus de CamelCase - utiliser le format exact de l'ontologie
  const finalUri = cleanLabel;
  
  
  return `iadas:${finalUri}`;
}

// Tests automatiques des patterns (pour debug)
function testAutomaticMapping() {
  const testCases = [
    "Exercise Motivation",
    "Achievement Goals", 
    "Basic Needs Frustration in Sport",
    "Body Dissatisfaction",
    "Instagram Usage",
    "Depression",
    "DEAB",
    "Interest in Body-improvement TV Content",
    "Exposure to Thin Ideal TV",
    "Hours Spent on Social Media"
  ];
  
  testCases.forEach(label => {
    const uri = generateAutomaticUri(label);
    console.log(`   "${label}" → ${uri}`);
  });
}

// 🔥 WARMUP CONDITIONNEL (seulement si pas fait au démarrage)
async function warmupFuseki(endpoint) {
  // Si déjà warm, skip
  if (isFusekiWarmed) {
    return true;
  }

  // Si warmup en cours, attendre qu'il finisse
  if (warmupInProgress && warmupPromise) {
    return await warmupPromise;
  }

  const warmupQuery = generateFallbackQuery();

  try {
    const result = await executeWithRetry(endpoint, warmupQuery, 2);
    const resultCount = result.results?.bindings?.length || 0;

    // Marquer comme warm même si ce n'était qu'un mini-warmup
    isFusekiWarmed = true;
    return true;

  } catch (error) {
    return false;
  }
}

async function executeWithRetry(endpoint, query, maxRetries = MAX_RETRIES) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const timeout = Math.min(FUSEKI_TIMEOUT * attempt, 180000); // Max 3 minutes

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sparql-query',
          'Accept': 'application/sparql-results+json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: query,
        timeout: timeout
      });

      if (response.ok) {
        const data = await response.json();
        return data;
      } else {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        const delay = RETRY_DELAY * attempt;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Échec après ${maxRetries} tentatives: ${lastError.message}`);
}

function generateSparqlQuery(filters) {
  console.log("=== SPARQL GENERATOR avec FILTRES MIN/MAX CORRIGÉS ===");

  const prefixes = `
PREFIX iadas: <http://ns.inria.fr/iadas/ontology/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX iadas-data: <http://ns.inria.fr/iadas/data/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>`;

  let query = `${prefixes}

SELECT ?analysis ?vi ?vd ?categoryVI ?categoryVD ?mediator ?moderator ?relationDirection ?reference ?gender ?populationType ?sportName WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation .
    ?relation iadas:hasIndependentVariable ?variableVI ;
              iadas:hasDependentVariable ?variableVD .
    
    ?variableVI iadas:refersToVariable ?viURI .
    BIND(REPLACE(STR(?viURI), ".*ACAD-vocab/", "") AS ?vi)
    BIND(REPLACE(?vi, '_', ' ') AS ?viLabel)
    OPTIONAL { SELECT ?viLabel (MIN(REPLACE(REPLACE(STR(?catVIURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVI) WHERE { ?viConcept skos:prefLabel ?viLabel . ?viConcept skos:broader ?catVIURIRaw } GROUP BY ?viLabel }
    
    ?variableVD iadas:refersToVariable ?vdURI .
    BIND(REPLACE(STR(?vdURI), ".*ACAD-vocab/", "") AS ?vd)
    BIND(REPLACE(?vd, '_', ' ') AS ?vdLabel)
    OPTIONAL { SELECT ?vdLabel (MIN(REPLACE(REPLACE(STR(?catVDURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVD) WHERE { ?vdConcept skos:prefLabel ?vdLabel . ?vdConcept skos:broader ?catVDURIRaw } GROUP BY ?vdLabel }
    
    # Nouvelles colonnes ajoutées
    OPTIONAL { ?analysis iadas:analysisId ?reference }
    OPTIONAL { 
        ?analysis iadas:hasPopulation ?population .
        ?population iadas:gender ?gender .
        ?population iadas:population ?populationType .
    }
    
    OPTIONAL { 
        ?analysis iadas:hasSport ?sportURI .
    BIND(REPLACE(STR(?sportURI), ".*sport-vocab/", "") AS ?sportName)
    }`;

  // === FILTRES D'ÂGE - AVEC SÉLECTIONS MULTIPLES ===
  if (filters.meanAge !== undefined) {
    // Cas spécial : âge moyen → recherche ± 1
    const moyenne = parseFloat(filters.meanAge);
    const minAge = moyenne - 1;
    const maxAge = moyenne + 1;

    query += `
    
    # Filtrer sur l'âge moyen ± 1 (correction virgules → points)
    ?analysis iadas:hasPopulation ?population .
    ?population iadas:hasStatistics ?ageStats .
    ?ageStats a iadas:AgeStatistics .
    ?ageStats iadas:hasMeanValue ?meanAgeRaw .
    BIND(IF(REGEX(?meanAgeRaw, "^M="), REPLACE(?meanAgeRaw, "M=([0-9.,]+).*", "$1"), "") AS ?meanAgeStr)
    BIND(xsd:decimal(REPLACE(?meanAgeStr, ",", ".")) AS ?meanAge)
    FILTER(?meanAge >= ${minAge} && ?meanAge <= ${maxAge})`;


  } else if (filters.ageCategories && filters.ageCategories.length > 0) {
    // NOUVEAU : Sélections multiples d'âges
    const ageRanges = {
      'adolescent': { minAge: 15, maxAge: 19 },
      'jeune-adulte': { minAge: 18, maxAge: 26 },
      'adulte': { minAge: 26, maxAge: 35 },
      'adulte-mature': { minAge: 35, maxAge: 50 },
      'senior': { minAge: 50, maxAge: 80 }
    };

    const allowOverlap = filters.allowOverlap !== false;
    
    // Construire les conditions pour chaque catégorie sélectionnée
    const ageConditions = filters.ageCategories.map(category => {
      const range = ageRanges[category];
      if (!range) return '';
      
      if (allowOverlap) {
        return `{
          # Catégorie ${category} - Mode inclusif
          ?analysis iadas:hasPopulation ?population .
          ?population iadas:hasStatistics ?ageStats .
          ?ageStats a iadas:AgeStatistics .
          {
            # Âges moyens dans la plage ${range.minAge}-${range.maxAge}
            ?ageStats iadas:hasMeanValue ?meanAgeRaw .
            BIND(IF(REGEX(?meanAgeRaw, "^M="), REPLACE(?meanAgeRaw, "M=([0-9.,]+).*", "$1"), "") AS ?meanAgeStr)
            FILTER(?meanAgeStr != "" && xsd:decimal(REPLACE(?meanAgeStr, ",", ".")) >= ${range.minAge} && xsd:decimal(REPLACE(?meanAgeStr, ",", ".")) <= ${range.maxAge})
          }
          UNION
          {
            # Plages qui chevauchent
            ?ageStats iadas:hasRange ?rangeStr .
            BIND(IF(REGEX(?rangeStr, "^["), REPLACE(?rangeStr, "[([0-9.]+)-.*", "$1"), "") AS ?minAgeStr)
            BIND(IF(REGEX(?rangeStr, "^["), REPLACE(?rangeStr, ".*-([0-9.]+)]", "$1"), "") AS ?maxAgeStr)
            FILTER(?minAgeStr != "" && ?maxAgeStr != "")
            BIND(xsd:decimal(REPLACE(?minAgeStr, ",", ".")) AS ?minAge)
            BIND(xsd:decimal(REPLACE(?maxAgeStr, ",", ".")) AS ?maxAge)
            FILTER(?maxAge >= ${range.minAge} && ?minAge <= ${range.maxAge})
          }
        }`;
      } else {
        return `{
          # Catégorie ${category} - Mode strict
          ?analysis iadas:hasPopulation ?population .
          ?population iadas:hasStatistics ?ageStats .
          ?ageStats a iadas:AgeStatistics .
          ?ageStats iadas:hasMeanValue ?meanAgeRaw .
          BIND(IF(REGEX(?meanAgeRaw, "^M="), REPLACE(?meanAgeRaw, "M=([0-9.,]+).*", "$1"), "") AS ?meanAgeStr)
          FILTER(?meanAgeStr != "" && xsd:decimal(REPLACE(?meanAgeStr, ",", ".")) >= ${range.minAge} && xsd:decimal(REPLACE(?meanAgeStr, ",", ".")) <= ${range.maxAge})
        }`;
      }
    }).filter(condition => condition !== '');

    if (ageConditions.length > 0) {
      query += `
    
    # Filtres d'âge multiples
    {
      ${ageConditions.join('\n      UNION\n      ')}
    }`;
      
      console.log(`📊 Filtres d'âge multiples appliqués: ${filters.ageCategories.join(', ')}`);
    }

  } else if (filters.minAge !== undefined || filters.maxAge !== undefined) {
    
    if (filters.includeMeanInRange) {
      // CAS SPÉCIAL : Catégories prédéfinies avec option chevauchement
      if (filters.allowOverlap === false) {
        // Mode strict : seulement les moyennes
        query += `
    
    # Mode strict : seulement les âges moyens dans la plage
    ?analysis iadas:hasPopulation ?population .
    ?population iadas:hasStatistics ?ageStats .
    ?ageStats a iadas:AgeStatistics .
    ?ageStats iadas:hasMeanValue ?meanAgeRaw .
    BIND(IF(REGEX(?meanAgeRaw, "^M="), REPLACE(?meanAgeRaw, "M=([0-9.,]+).*", "$1"), "") AS ?meanAgeStr)
    FILTER(?meanAgeStr != "" && xsd:decimal(REPLACE(?meanAgeStr, ",", ".")) >= ${filters.minAge} && xsd:decimal(REPLACE(?meanAgeStr, ",", ".")) <= ${filters.maxAge})`;
        
        console.log(` Filtre âge strict: seulement moyennes ${filters.minAge}-${filters.maxAge}`);
        
      } else {
        // Mode inclusif : moyennes + chevauchements
        query += `
    
    # Mode inclusif : moyennes + chevauchements de plages
    ?analysis iadas:hasPopulation ?population .
    ?population iadas:hasStatistics ?ageStats .
    ?ageStats a iadas:AgeStatistics .
    
    {
      # Option 1 (PRIORITAIRE): Âges moyens dans la plage
      ?ageStats iadas:hasMeanValue ?meanAgeRaw .
      BIND(IF(REGEX(?meanAgeRaw, "^M="), REPLACE(?meanAgeRaw, "M=([0-9.,]+).*", "$1"), "") AS ?meanAgeStr)
      FILTER(?meanAgeStr != "" && xsd:decimal(REPLACE(?meanAgeStr, ",", ".")) >= ${filters.minAge} && xsd:decimal(REPLACE(?meanAgeStr, ",", ".")) <= ${filters.maxAge})
    }
    UNION
    {
      # Option 2 (INCLUSIF): Plages qui chevauchent
      ?ageStats iadas:hasRange ?rangeStr .
      BIND(IF(REGEX(?rangeStr, "^["), REPLACE(?rangeStr, "[([0-9.]+)-.*", "$1"), "") AS ?minAgeStr)
      BIND(IF(REGEX(?rangeStr, "^["), REPLACE(?rangeStr, ".*-([0-9.]+)]", "$1"), "") AS ?maxAgeStr)
      FILTER(?minAgeStr != "" && ?maxAgeStr != "")
      BIND(xsd:decimal(REPLACE(?minAgeStr, ",", ".")) AS ?minAge)
      BIND(xsd:decimal(REPLACE(?maxAgeStr, ",", ".")) AS ?maxAge)
      FILTER(?maxAge >= ${filters.minAge} && ?minAge <= ${filters.maxAge})
      # Éviter doublons avec les moyennes
      FILTER NOT EXISTS {
        ?ageStats iadas:hasMeanValue ?meanCheckRaw .
        BIND(IF(REGEX(?meanCheckRaw, "^M="), REPLACE(?meanCheckRaw, "M=([0-9.,]+).*", "$1"), "") AS ?meanCheck)
        FILTER(?meanCheck != "" && xsd:decimal(?meanCheck) >= ${filters.minAge} && xsd:decimal(?meanCheck) <= ${filters.maxAge})
      }
    }`;
        
        console.log(` Filtre âge inclusif: moyennes ${filters.minAge}-${filters.maxAge} + chevauchements`);
      }
      
    } else {
      // Cas normal : filtrer sur les VRAIES propriétés minAge/maxAge
      query += `
    
    # Filtrer sur les vraies propriétés minAge et maxAge
    ?analysis iadas:hasPopulation ?population .
    ?population iadas:hasStatistics ?ageStats .
    ?ageStats a iadas:AgeStatistics .`;

      if (filters.minAge !== undefined && filters.maxAge !== undefined) {
        // Les deux : minAge ET maxAge
        query += `
    ?ageStats iadas:hasRange ?rangeStr .
    BIND(IF(REGEX(?rangeStr, "^["), REPLACE(?rangeStr, "[([0-9.]+)-.*", "$1"), "") AS ?minAgeStr)
    BIND(IF(REGEX(?rangeStr, "^["), REPLACE(?rangeStr, ".*-([0-9.]+)]", "$1"), "") AS ?maxAgeStr)
    BIND(xsd:decimal(REPLACE(?minAgeStr, ",", ".")) AS ?minAge)
    BIND(xsd:decimal(REPLACE(?maxAgeStr, ",", ".")) AS ?maxAge)
    FILTER(?minAge >= ${filters.minAge} && ?maxAge <= ${filters.maxAge})`;


      } else if (filters.minAge !== undefined) {
        // Seulement minAge
        query += `
    ?ageStats iadas:hasRange ?rangeStr .
    BIND(IF(REGEX(?rangeStr, "^["), REPLACE(?rangeStr, "[([0-9.]+)-.*", "$1"), "") AS ?minAgeStr)
    BIND(xsd:decimal(?minAgeStr) AS ?minAge)
    FILTER(?minAge >= ${filters.minAge})`;


      } else if (filters.maxAge !== undefined) {
        // Seulement maxAge
        query += `
    ?ageStats iadas:hasRange ?rangeStr .
    BIND(IF(REGEX(?rangeStr, "^["), REPLACE(?rangeStr, ".*-([0-9.]+)]", "$1"), "") AS ?maxAgeStr)
    BIND(xsd:decimal(?maxAgeStr) AS ?maxAge)
    FILTER(?maxAge <= ${filters.maxAge})`;

      }
    }
  }

  // === FILTRES DE FRÉQUENCE - AVEC SÉLECTIONS MULTIPLES ===
  if (filters.meanExFR !== undefined) {
    // Cas spécial : moyenne de fréquence → recherche ± 1
    const moyenne = parseFloat(filters.meanExFR);
    const minFreq = moyenne - 1;
    const maxFreq = moyenne + 1;

    // Si on n'a pas déjà ajouté ?population, l'ajouter
    if (!query.includes('?analysis iadas:hasPopulation ?population')) {
      query += `
    
    # Filtrer sur la fréquence moyenne ± 1 (avec normalisation)
    ?analysis iadas:hasPopulation ?population .`;
    }
    query += `
    ?population iadas:exerciseFreqStats ?freqStats .
    ?freqStats iadas:meanExFR ?meanExFRStr .
    OPTIONAL { ?freqStats iadas:freqUnit ?freqUnit }
    OPTIONAL { ?freqStats iadas:freqBase ?freqBase }
    FILTER(?meanExFRStr != "" && ?meanExFRStr != "N.A.")
    
    # Normalisation automatique vers heures/semaine
    BIND(
      IF(?freqUnit = "minutes" && ?freqBase = "week", xsd:decimal(REPLACE(?meanExFRStr, ",", ".")) / 60,
      IF(?freqUnit = "minutes" && ?freqBase = "day", (xsd:decimal(REPLACE(?meanExFRStr, ",", ".")) / 60) * 7,
      IF(?freqUnit = "hours" && ?freqBase = "day", xsd:decimal(REPLACE(?meanExFRStr, ",", ".")) * 7,
      IF(?freqUnit = "hours" && ?freqBase = "week", xsd:decimal(REPLACE(?meanExFRStr, ",", ".")),
      IF(?freqUnit = "days" && ?freqBase = "week", xsd:decimal(REPLACE(?meanExFRStr, ",", ".")) * 24,
      IF(?freqUnit = "sessions" && ?freqBase = "week", xsd:decimal(REPLACE(?meanExFRStr, ",", ".")) * 1.5,
      IF(xsd:decimal(REPLACE(?meanExFRStr, ",", ".")) < 50, xsd:decimal(REPLACE(?meanExFRStr, ",", ".")), xsd:decimal(REPLACE(?meanExFRStr, ",", ".")) / 60)))))))
      AS ?normalizedFreq
    )
    
    FILTER(?normalizedFreq >= ${minFreq} && ?normalizedFreq <= ${maxFreq})`;

    console.log(` Filtre fréquence moyenne normalisé: ${moyenne} ± 1 = [${minFreq}, ${maxFreq}] h/sem`);

  } else if (filters.frequencyCategories && filters.frequencyCategories.length > 0) {
    // NOUVEAU : Sélections multiples de fréquences
    const frequencyRanges = {
      'faible': { minExFR: 0, maxExFR: 4.9 },
      'moderee': { minExFR: 5, maxExFR: 10 },
      'elevee': { minExFR: 10.1, maxExFR: 15 },
      'intensive': { minExFR: 15.1, maxExFR: 50 }
    };

    const allowOverlap = filters.allowOverlap !== false;
    
    // Construire les conditions pour chaque fréquence sélectionnée
    const freqConditions = filters.frequencyCategories.map(category => {
      const range = frequencyRanges[category];
      if (!range) return '';
      
      if (allowOverlap) {
        return `{
          # Fréquence ${category} - Mode inclusif avec normalisation
          ?analysis iadas:hasPopulation ?population .
          ?population iadas:exerciseFreqStats ?freqStats .
          {
            # Fréquences moyennes normalisées dans la plage ${range.minExFR}-${range.maxExFR}
            ?freqStats iadas:meanExFR ?meanExFRStr .
            OPTIONAL { ?freqStats iadas:freqUnit ?freqUnit }
            OPTIONAL { ?freqStats iadas:freqBase ?freqBase }
            FILTER(?meanExFRStr != "")
            
            BIND(
              IF(?freqUnit = "minutes" && ?freqBase = "week", xsd:decimal(REPLACE(?meanExFRStr, ",", ".")) / 60,
              IF(?freqUnit = "days" && ?freqBase = "week", xsd:decimal(REPLACE(?meanExFRStr, ",", ".")) * 24, 
              IF(?freqUnit = "hours" || (?freqUnit = "" && xsd:decimal(REPLACE(?meanExFRStr, ",", ".")) < 50), xsd:decimal(REPLACE(?meanExFRStr, ",", ".")),
              xsd:decimal(REPLACE(?meanExFRStr, ",", ".")))))
              AS ?normalizedMeanFreq
            )
            
            FILTER(?normalizedMeanFreq >= ${range.minExFR} && ?normalizedMeanFreq <= ${range.maxExFR})
          }
          UNION
          {
            # Plages qui chevauchent (normalisées)
            ?freqStats iadas:minExFR ?minExFRStr .
            ?freqStats iadas:maxExFR ?maxExFRStr .
            OPTIONAL { ?freqStats iadas:freqUnit ?freqUnit }
            OPTIONAL { ?freqStats iadas:freqBase ?freqBase }
            FILTER(?minExFRStr != "" && ?maxExFRStr != "")
            
            BIND(
              IF(?freqUnit = "minutes" && ?freqBase = "week", xsd:decimal(REPLACE(?minExFRStr, ",", ".")) / 60,
              IF(?freqUnit = "days" && ?freqBase = "week", xsd:decimal(REPLACE(?minExFRStr, ",", ".")) * 24, 
              IF(?freqUnit = "hours" || (?freqUnit = "" && xsd:decimal(REPLACE(?minExFRStr, ",", ".")) < 50), xsd:decimal(REPLACE(?minExFRStr, ",", ".")),
              xsd:decimal(REPLACE(?minExFRStr, ",", ".")))))
              AS ?normalizedMinFreq
            )
            
            BIND(
              IF(?freqUnit = "minutes" && ?freqBase = "week", xsd:decimal(REPLACE(?maxExFRStr, ",", ".")) / 60,
              IF(?freqUnit = "days" && ?freqBase = "week", xsd:decimal(REPLACE(?maxExFRStr, ",", ".")) * 24, 
              IF(?freqUnit = "hours" || (?freqUnit = "" && xsd:decimal(REPLACE(?maxExFRStr, ",", ".")) < 50), xsd:decimal(REPLACE(?maxExFRStr, ",", ".")),
              xsd:decimal(REPLACE(?maxExFRStr, ",", ".")))))
              AS ?normalizedMaxFreq
            )
            
            FILTER(?normalizedMaxFreq >= ${range.minExFR} && ?normalizedMinFreq <= ${range.maxExFR})
          }
        }`;
      } else {
        return `{
          # Fréquence ${category} - Mode strict avec normalisation
          ?analysis iadas:hasPopulation ?population .
          ?population iadas:exerciseFreqStats ?freqStats .
          ?freqStats iadas:meanExFR ?meanExFRStr .
          OPTIONAL { ?freqStats iadas:freqUnit ?freqUnit }
          OPTIONAL { ?freqStats iadas:freqBase ?freqBase }
          FILTER(?meanExFRStr != "")
          
          BIND(
            IF(?freqUnit = "minutes" && ?freqBase = "week", xsd:decimal(REPLACE(?meanExFRStr, ",", ".")) / 60,
            IF(?freqUnit = "days" && ?freqBase = "week", xsd:decimal(REPLACE(?meanExFRStr, ",", ".")) * 24, 
            IF(?freqUnit = "hours" || (?freqUnit = "" && xsd:decimal(REPLACE(?meanExFRStr, ",", ".")) < 50), xsd:decimal(REPLACE(?meanExFRStr, ",", ".")),
            xsd:decimal(REPLACE(?meanExFRStr, ",", ".")))))
            AS ?normalizedFreq
          )
          
          FILTER(?normalizedFreq >= ${range.minExFR} && ?normalizedFreq <= ${range.maxExFR})
        }`;
      }
    }).filter(condition => condition !== '');

    if (freqConditions.length > 0) {
      query += `
    
    # Filtres de fréquence multiples
    {
      ${freqConditions.join('\n      UNION\n      ')}
    }`;
      
      console.log(`🏃 Filtres de fréquence multiples appliqués: ${filters.frequencyCategories.join(', ')}`);
    }

  } else if (filters.minExFR !== undefined || filters.maxExFR !== undefined) {
    
    if (filters.includeMeanFreqInRange) {
      // CAS SPÉCIAL : Catégories prédéfinies avec option chevauchement
      if (!query.includes('?analysis iadas:hasPopulation ?population')) {
        query += `
    
    # Filtrer populations par fréquence
    ?analysis iadas:hasPopulation ?population .`;
      }
      
      if (filters.allowOverlap === false) {
        // Mode strict : seulement les moyennes avec normalisation d'unités
        query += `
    ?population iadas:exerciseFreqStats ?freqStats .
    ?freqStats iadas:meanExFR ?meanExFRStr .
    OPTIONAL { ?freqStats iadas:freqUnit ?freqUnit }
    OPTIONAL { ?freqStats iadas:freqBase ?freqBase }
    FILTER(?meanExFRStr != "")
    
    # Normalisation vers heures/semaine
    BIND(
      IF(?freqUnit = "minutes" && ?freqBase = "week", xsd:decimal(REPLACE(?meanExFRStr, ",", ".")) / 60,
      IF(?freqUnit = "days" && ?freqBase = "week", xsd:decimal(REPLACE(?meanExFRStr, ",", ".")) * 24, 
      IF(?freqUnit = "hours" || (?freqUnit = "" && xsd:decimal(REPLACE(?meanExFRStr, ",", ".")) < 50), xsd:decimal(REPLACE(?meanExFRStr, ",", ".")),
      xsd:decimal(REPLACE(?meanExFRStr, ",", ".")))))
      AS ?normalizedFreq
    )
    
    FILTER(?normalizedFreq >= ${filters.minExFR} && ?normalizedFreq <= ${filters.maxExFR})`;
        
        console.log(` Filtre fréquence strict normalisé: moyennes ${filters.minExFR}-${filters.maxExFR}h/sem`);
        
      } else {
        // Mode inclusif : moyennes + chevauchements avec normalisation
        query += `
    ?population iadas:exerciseFreqStats ?freqStats .
    
    {
      # Option 1: Fréquences moyennes normalisées
      ?freqStats iadas:meanExFR ?meanExFRStr .
      OPTIONAL { ?freqStats iadas:freqUnit ?freqUnit }
      OPTIONAL { ?freqStats iadas:freqBase ?freqBase }
      FILTER(?meanExFRStr != "")
      
      # Normalisation vers heures/semaine
      BIND(
        IF(?freqUnit = "minutes" && ?freqBase = "week", xsd:decimal(REPLACE(?meanExFRStr, ",", ".")) / 60,
        IF(?freqUnit = "days" && ?freqBase = "week", xsd:decimal(REPLACE(?meanExFRStr, ",", ".")) * 24, 
        IF(?freqUnit = "hours" || (?freqUnit = "" && xsd:decimal(REPLACE(?meanExFRStr, ",", ".")) < 50), xsd:decimal(REPLACE(?meanExFRStr, ",", ".")),
        xsd:decimal(REPLACE(?meanExFRStr, ",", ".")))))
        AS ?normalizedMeanFreq
      )
      
      FILTER(?normalizedMeanFreq >= ${filters.minExFR} && ?normalizedMeanFreq <= ${filters.maxExFR})
    }
    UNION
    {
      # Option 2: Plages qui chevauchent (normalisées)
      ?freqStats iadas:minExFR ?minExFRStr .
      ?freqStats iadas:maxExFR ?maxExFRStr .
      OPTIONAL { ?freqStats iadas:freqUnit ?freqUnit }
      OPTIONAL { ?freqStats iadas:freqBase ?freqBase }
      FILTER(?minExFRStr != "" && ?maxExFRStr != "")
      
      # Normalisation des bornes
      BIND(
        IF(?freqUnit = "minutes" && ?freqBase = "week", xsd:decimal(REPLACE(?minExFRStr, ",", ".")) / 60,
        IF(?freqUnit = "days" && ?freqBase = "week", xsd:decimal(REPLACE(?minExFRStr, ",", ".")) * 24, 
        IF(?freqUnit = "hours" || (?freqUnit = "" && xsd:decimal(REPLACE(?minExFRStr, ",", ".")) < 50), xsd:decimal(REPLACE(?minExFRStr, ",", ".")),
        xsd:decimal(REPLACE(?minExFRStr, ",", ".")))))
        AS ?normalizedMinFreq
      )
      
      BIND(
        IF(?freqUnit = "minutes" && ?freqBase = "week", xsd:decimal(REPLACE(?maxExFRStr, ",", ".")) / 60,
        IF(?freqUnit = "days" && ?freqBase = "week", xsd:decimal(REPLACE(?maxExFRStr, ",", ".")) * 24, 
        IF(?freqUnit = "hours" || (?freqUnit = "" && xsd:decimal(REPLACE(?maxExFRStr, ",", ".")) < 50), xsd:decimal(REPLACE(?maxExFRStr, ",", ".")),
        xsd:decimal(REPLACE(?maxExFRStr, ",", ".")))))
        AS ?normalizedMaxFreq
      )
      
      FILTER(?normalizedMaxFreq >= ${filters.minExFR} && ?normalizedMinFreq <= ${filters.maxExFR})
      
      # Éviter doublons avec moyennes
      FILTER NOT EXISTS {
        ?freqStats iadas:meanExFR ?meanCheck .
        OPTIONAL { ?freqStats iadas:freqUnit ?freqUnitCheck }
        OPTIONAL { ?freqStats iadas:freqBase ?freqBaseCheck }
        FILTER(?meanCheck != "")
        BIND(
          IF(?freqUnitCheck = "minutes" && ?freqBaseCheck = "week", xsd:decimal(?meanCheck) / 60,
          IF(?freqUnitCheck = "days" && ?freqBaseCheck = "week", xsd:decimal(?meanCheck) * 24, 
          IF(?freqUnitCheck = "hours" || (?freqUnitCheck = "" && xsd:decimal(?meanCheck) < 50), xsd:decimal(?meanCheck),
          xsd:decimal(?meanCheck))))
          AS ?normalizedMeanCheck
        )
        FILTER(?normalizedMeanCheck >= ${filters.minExFR} && ?normalizedMeanCheck <= ${filters.maxExFR})
      }
    }`;
        
        console.log(` Filtre fréquence inclusif normalisé: moyennes + chevauchements ${filters.minExFR}-${filters.maxExFR}h/sem`);
      }
      
    } else {
      // Cas normal : filtrer sur les VRAIES propriétés minExFR/maxExFR
      if (!query.includes('?analysis iadas:hasPopulation ?population')) {
        query += `
    
    # Filtrer sur les vraies propriétés minExFR et maxExFR
    ?analysis iadas:hasPopulation ?population .`;
      }
      query += `
    ?population iadas:exerciseFreqStats ?freqStats .`;

      if (filters.minExFR !== undefined && filters.maxExFR !== undefined) {
        // Les deux : minExFR ET maxExFR
        query += `
    ?freqStats iadas:minExFR ?minExFRStr .
    ?freqStats iadas:maxExFR ?maxExFRStr .
    BIND(xsd:decimal(REPLACE(?minExFRStr, ",", ".")) AS ?minExFR)
    BIND(xsd:decimal(REPLACE(?maxExFRStr, ",", ".")) AS ?maxExFR)
    FILTER(?minExFR >= ${filters.minExFR} && ?maxExFR <= ${filters.maxExFR})`;

        console.log(` Filtre plage fréquence: population dans [${filters.minExFR}, ${filters.maxExFR}] h/sem`);

      } else if (filters.minExFR !== undefined) {
        // Seulement minExFR
        query += `
    ?freqStats iadas:minExFR ?minExFRStr .
    BIND(xsd:decimal(REPLACE(?minExFRStr, ",", ".")) AS ?minExFR)
    FILTER(?minExFR >= ${filters.minExFR})`;

        console.log(` Filtre fréquence minimum: minExFR >= ${filters.minExFR}`);

      } else if (filters.maxExFR !== undefined) {
        // Seulement maxExFR
        query += `
    ?freqStats iadas:maxExFR ?maxExFRStr .
    BIND(xsd:decimal(REPLACE(?maxExFRStr, ",", ".")) AS ?maxExFR)
    FILTER(?maxExFR <= ${filters.maxExFR})`;

        console.log(` Filtre fréquence maximum: maxExFR <= ${filters.maxExFR}`);
      }
    }
  }

  // === FILTRES D'EXPÉRIENCE - AVEC SÉLECTIONS MULTIPLES ===
  if (filters.meanYOE !== undefined) {
    // Cas spécial : moyenne d'expérience → recherche ± 1
    const moyenne = parseFloat(filters.meanYOE);
    const minExp = moyenne - 1;
    const maxExp = moyenne + 1;

    if (!query.includes('?analysis iadas:hasPopulation ?population')) {
      query += `
    
    # Filtrer sur l'expérience moyenne ± 1 (avec normalisation)
    ?analysis iadas:hasPopulation ?population .`;
    }
    query += `
    ?population iadas:experienceStats ?expStats .
    ?expStats iadas:meanYOE ?meanYOEStr .
    OPTIONAL { ?expStats iadas:expUnit ?expUnit }
    FILTER(?meanYOEStr != "" && ?meanYOEStr != "N.A.")
    
    # Normalisation automatique vers années
    BIND(
      IF(?expUnit = "months", xsd:decimal(REPLACE(?meanYOEStr, ",", ".")) / 12,
      IF(?expUnit = "weeks", xsd:decimal(REPLACE(?meanYOEStr, ",", ".")) / 52,
      IF(?expUnit = "days", xsd:decimal(REPLACE(?meanYOEStr, ",", ".")) / 365,
      IF(?expUnit = "years" || ?expUnit = "" || !BOUND(?expUnit), xsd:decimal(REPLACE(?meanYOEStr, ",", ".")),
      xsd:decimal(REPLACE(?meanYOEStr, ",", "."))))))
      AS ?normalizedExp
    )
    
    FILTER(?normalizedExp >= ${minExp} && ?normalizedExp <= ${maxExp})`;

    console.log(` Filtre expérience moyenne normalisé: ${moyenne} ± 1 = [${minExp}, ${maxExp}] ans`);

  } else if (filters.experienceCategories && filters.experienceCategories.length > 0) {
    // NOUVEAU : Sélections multiples d'expériences
    const experienceRanges = {
      'debutant': { minYOE: 0, maxYOE: 1.9 },
      'intermediaire': { minYOE: 2, maxYOE: 7 },
      'experimente': { minYOE: 7.1, maxYOE: 15 },
      'expert': { minYOE: 15.1, maxYOE: 50 }
    };

    const allowOverlap = filters.allowOverlap !== false;
    
    // Construire les conditions pour chaque expérience sélectionnée
    const expConditions = filters.experienceCategories.map(category => {
      const range = experienceRanges[category];
      if (!range) return '';
      
      if (allowOverlap) {
        return `{
          # Expérience ${category} - Mode inclusif avec normalisation
          ?analysis iadas:hasPopulation ?population .
          ?population iadas:experienceStats ?expStats .
          {
            # Expériences moyennes normalisées dans la plage ${range.minYOE}-${range.maxYOE}
            ?expStats iadas:meanYOE ?meanYOEStr .
            OPTIONAL { ?expStats iadas:expUnit ?expUnit }
            FILTER(?meanYOEStr != "" && ?meanYOEStr != "N.A.")
            
            BIND(
              IF(?expUnit = "months", xsd:decimal(REPLACE(?meanYOEStr, ",", ".")) / 12,
              IF(?expUnit = "weeks", xsd:decimal(REPLACE(?meanYOEStr, ",", ".")) / 52,
              IF(?expUnit = "days", xsd:decimal(REPLACE(?meanYOEStr, ",", ".")) / 365,
              IF(?expUnit = "years" || ?expUnit = "" || !BOUND(?expUnit), xsd:decimal(REPLACE(?meanYOEStr, ",", ".")),
              xsd:decimal(REPLACE(?meanYOEStr, ",", "."))))))
              AS ?normalizedMeanExp
            )
            
            FILTER(?normalizedMeanExp >= ${range.minYOE} && ?normalizedMeanExp <= ${range.maxYOE})
          }
          UNION
          {
            # Plages qui chevauchent (normalisées)
            ?expStats iadas:minYOE ?minYOEStr .
            ?expStats iadas:maxYOE ?maxYOEStr .
            OPTIONAL { ?expStats iadas:expUnit ?expUnit }
            FILTER(?minYOEStr != "" && ?maxYOEStr != "" && ?minYOEStr != "N.A." && ?maxYOEStr != "N.A.")
            
            BIND(
              IF(?expUnit = "months", xsd:decimal(REPLACE(?minYOEStr, ",", ".")) / 12,
              IF(?expUnit = "weeks", xsd:decimal(REPLACE(?minYOEStr, ",", ".")) / 52,
              IF(?expUnit = "days", xsd:decimal(REPLACE(?minYOEStr, ",", ".")) / 365,
              IF(?expUnit = "years" || ?expUnit = "" || !BOUND(?expUnit), xsd:decimal(REPLACE(?minYOEStr, ",", ".")),
              xsd:decimal(REPLACE(?minYOEStr, ",", "."))))))
              AS ?normalizedMinExp
            )
            
            BIND(
              IF(?expUnit = "months", xsd:decimal(REPLACE(?maxYOEStr, ",", ".")) / 12,
              IF(?expUnit = "weeks", xsd:decimal(REPLACE(?maxYOEStr, ",", ".")) / 52,
              IF(?expUnit = "days", xsd:decimal(REPLACE(?maxYOEStr, ",", ".")) / 365,
              IF(?expUnit = "years" || ?expUnit = "" || !BOUND(?expUnit), xsd:decimal(REPLACE(?maxYOEStr, ",", ".")),
              xsd:decimal(REPLACE(?maxYOEStr, ",", "."))))))
              AS ?normalizedMaxExp
            )
            
            FILTER(?normalizedMaxExp >= ${range.minYOE} && ?normalizedMinExp <= ${range.maxYOE})
          }
        }`;
      } else {
        return `{
          # Expérience ${category} - Mode strict avec normalisation
          ?analysis iadas:hasPopulation ?population .
          ?population iadas:experienceStats ?expStats .
          ?expStats iadas:meanYOE ?meanYOEStr .
          OPTIONAL { ?expStats iadas:expUnit ?expUnit }
          FILTER(?meanYOEStr != "" && ?meanYOEStr != "N.A.")
          
          BIND(
            IF(?expUnit = "months", xsd:decimal(REPLACE(?meanYOEStr, ",", ".")) / 12,
            IF(?expUnit = "weeks", xsd:decimal(REPLACE(?meanYOEStr, ",", ".")) / 52,
            IF(?expUnit = "days", xsd:decimal(REPLACE(?meanYOEStr, ",", ".")) / 365,
            IF(?expUnit = "years" || ?expUnit = "" || !BOUND(?expUnit), xsd:decimal(REPLACE(?meanYOEStr, ",", ".")),
            xsd:decimal(REPLACE(?meanYOEStr, ",", "."))))))
            AS ?normalizedExp
          )
          
          FILTER(?normalizedExp >= ${range.minYOE} && ?normalizedExp <= ${range.maxYOE})
        }`;
      }
    }).filter(condition => condition !== '');

    if (expConditions.length > 0) {
      query += `
    
    # Filtres d'expérience multiples
    {
      ${expConditions.join('\n      UNION\n      ')}
    }`;
      
      console.log(`🎯 Filtres d'expérience multiples appliqués: ${filters.experienceCategories.join(', ')}`);
    }

  } else if (filters.minYOE !== undefined || filters.maxYOE !== undefined) {
    
    if (filters.includeMeanExpInRange) {
      // CAS SPÉCIAL : Catégories prédéfinies avec option chevauchement
      if (!query.includes('?analysis iadas:hasPopulation ?population')) {
        query += `
    
    # Filtrer populations par expérience
    ?analysis iadas:hasPopulation ?population .`;
      }
      
      if (filters.allowOverlap === false) {
        // Mode strict : seulement les moyennes avec normalisation complète
        query += `
    ?population iadas:experienceStats ?expStats .
    ?expStats iadas:meanYOE ?meanYOEStr .
    OPTIONAL { ?expStats iadas:expUnit ?expUnit }
    FILTER(?meanYOEStr != "" && ?meanYOEStr != "N.A.")
    
    # Normalisation complète vers années
    BIND(
      IF(?expUnit = "months", xsd:decimal(REPLACE(?meanYOEStr, ",", ".")) / 12,
      IF(?expUnit = "weeks", xsd:decimal(REPLACE(?meanYOEStr, ",", ".")) / 52,
      IF(?expUnit = "days", xsd:decimal(REPLACE(?meanYOEStr, ",", ".")) / 365,
      IF(?expUnit = "years" || ?expUnit = "" || !BOUND(?expUnit), xsd:decimal(REPLACE(?meanYOEStr, ",", ".")),
      xsd:decimal(REPLACE(?meanYOEStr, ",", "."))))))
      AS ?normalizedExp
    )
    FILTER(?normalizedExp >= ${filters.minYOE} && ?normalizedExp <= ${filters.maxYOE})`;
        
        console.log(` Filtre expérience strict normalisé: seulement moyennes ${filters.minYOE}-${filters.maxYOE} ans`);
        
      } else {
        // Mode inclusif : moyennes + chevauchements avec normalisation complète
        query += `
    ?population iadas:experienceStats ?expStats .
    
    {
      # Option 1: Expériences moyennes normalisées
      ?expStats iadas:meanYOE ?meanYOEStr .
      OPTIONAL { ?expStats iadas:expUnit ?expUnit }
      FILTER(?meanYOEStr != "" && ?meanYOEStr != "N.A.")
      
      BIND(
        IF(?expUnit = "months", xsd:decimal(REPLACE(?meanYOEStr, ",", ".")) / 12,
        IF(?expUnit = "weeks", xsd:decimal(REPLACE(?meanYOEStr, ",", ".")) / 52,
        IF(?expUnit = "days", xsd:decimal(REPLACE(?meanYOEStr, ",", ".")) / 365,
        IF(?expUnit = "years" || ?expUnit = "" || !BOUND(?expUnit), xsd:decimal(REPLACE(?meanYOEStr, ",", ".")),
        xsd:decimal(REPLACE(?meanYOEStr, ",", "."))))))
        AS ?normalizedMeanExp
      )
      FILTER(?normalizedMeanExp >= ${filters.minYOE} && ?normalizedMeanExp <= ${filters.maxYOE})
    }
    UNION
    {
      # Option 2: Plages qui chevauchent (normalisées)
      ?expStats iadas:minYOE ?minYOEStr .
      ?expStats iadas:maxYOE ?maxYOEStr .
      OPTIONAL { ?expStats iadas:expUnit ?expUnit }
      FILTER(?minYOEStr != "" && ?maxYOEStr != "" && ?minYOEStr != "N.A." && ?maxYOEStr != "N.A.")
      
      BIND(
        IF(?expUnit = "months", xsd:decimal(REPLACE(?minYOEStr, ",", ".")) / 12,
        IF(?expUnit = "weeks", xsd:decimal(REPLACE(?minYOEStr, ",", ".")) / 52,
        IF(?expUnit = "days", xsd:decimal(REPLACE(?minYOEStr, ",", ".")) / 365,
        IF(?expUnit = "years" || ?expUnit = "" || !BOUND(?expUnit), xsd:decimal(REPLACE(?minYOEStr, ",", ".")),
        xsd:decimal(REPLACE(?minYOEStr, ",", "."))))))
        AS ?normalizedMinExp
      )
      
      BIND(
        IF(?expUnit = "months", xsd:decimal(REPLACE(?maxYOEStr, ",", ".")) / 12,
        IF(?expUnit = "weeks", xsd:decimal(REPLACE(?maxYOEStr, ",", ".")) / 52,
        IF(?expUnit = "days", xsd:decimal(REPLACE(?maxYOEStr, ",", ".")) / 365,
        IF(?expUnit = "years" || ?expUnit = "" || !BOUND(?expUnit), xsd:decimal(REPLACE(?maxYOEStr, ",", ".")),
        xsd:decimal(REPLACE(?maxYOEStr, ",", "."))))))
        AS ?normalizedMaxExp
      )
      
      FILTER(?normalizedMaxExp >= ${filters.minYOE} && ?normalizedMinExp <= ${filters.maxYOE})
      
      # Éviter doublons avec moyennes
      FILTER NOT EXISTS {
        ?expStats iadas:meanYOE ?meanCheck .
        OPTIONAL { ?expStats iadas:expUnit ?expUnitCheck }
        FILTER(?meanCheck != "" && ?meanCheck != "N.A.")
        BIND(
          IF(?expUnitCheck = "months", xsd:decimal(?meanCheck) / 12,
          IF(?expUnitCheck = "weeks", xsd:decimal(?meanCheck) / 52,
          IF(?expUnitCheck = "days", xsd:decimal(?meanCheck) / 365,
          IF(?expUnitCheck = "years" || ?expUnitCheck = "" || !BOUND(?expUnitCheck), xsd:decimal(?meanCheck),
          xsd:decimal(?meanCheck)))))
          AS ?normalizedMeanExpCheck
        )
        FILTER(?normalizedMeanExpCheck >= ${filters.minYOE} && ?normalizedMeanExpCheck <= ${filters.maxYOE})
      }
    }`;
        
        console.log(` Filtre expérience inclusif normalisé: moyennes + chevauchements ${filters.minYOE}-${filters.maxYOE} ans`);
      }
      
    } else {
      // Cas normal : filtrer sur les VRAIES propriétés minYOE/maxYOE
      if (!query.includes('?analysis iadas:hasPopulation ?population')) {
        query += `
    
    # Filtrer sur les vraies propriétés minYOE et maxYOE
    ?analysis iadas:hasPopulation ?population .`;
      }
      query += `
    ?population iadas:experienceStats ?expStats .`;

      if (filters.minYOE !== undefined && filters.maxYOE !== undefined) {
        // Les deux : minYOE ET maxYOE
        query += `
    ?expStats iadas:minYOE ?minYOEStr .
    ?expStats iadas:maxYOE ?maxYOEStr .
    BIND(xsd:decimal(REPLACE(?minYOEStr, ",", ".")) AS ?minYOE)
    BIND(xsd:decimal(REPLACE(?maxYOEStr, ",", ".")) AS ?maxYOE)
    FILTER(?minYOE >= ${filters.minYOE} && ?maxYOE <= ${filters.maxYOE})`;

        console.log(` Filtre plage expérience: population dans [${filters.minYOE}, ${filters.maxYOE}] ans`);

      } else if (filters.minYOE !== undefined) {
        // Seulement minYOE
        query += `
    ?expStats iadas:minYOE ?minYOEStr .
    BIND(xsd:decimal(REPLACE(?minYOEStr, ",", ".")) AS ?minYOE)
    FILTER(?minYOE >= ${filters.minYOE})`;

        console.log(` Filtre expérience minimum: minYOE >= ${filters.minYOE}`);

      } else if (filters.maxYOE !== undefined) {
        // Seulement maxYOE
        query += `
    ?expStats iadas:maxYOE ?maxYOEStr .
    BIND(xsd:decimal(REPLACE(?maxYOEStr, ",", ".")) AS ?maxYOE)
    FILTER(?maxYOE <= ${filters.maxYOE})`;

        console.log(` Filtre expérience maximum: maxYOE <= ${filters.maxYOE}`);
      }
    }
  }

  // === AUTRES FILTRES EXISTANTS ===

  // Filtre genre
  if (filters.gender && filters.gender !== '') {
    // Si on n'a pas déjà ajouté ?population, l'ajouter
    if (!query.includes('?analysis iadas:hasPopulation ?population')) {
      query += `
    
    # Filtrer sur les populations par genre
    ?analysis iadas:hasPopulation ?population .`;
    }
    query += `
    ?population iadas:gender "${filters.gender}" .`;
    console.log(" Filtre genre ajouté:", filters.gender);
  }

  // Filtre catégorie VD
  if (filters.categoryVD && filters.categoryVD !== '') {
    query += `
    
    # Filtrer sur les VD de catégorie via SKOS (prefLabel matching)
    ?vdFilterSKOS skos:prefLabel ?vdLabel .
    ?vdFilterSKOS skos:broader+ ?vdTopCatFilter .
    ?vdTopCatFilter skos:prefLabel "${filters.categoryVD}" .`;
    console.log(" Filtre catégorie VD ajouté:", filters.categoryVD);
  }

  // Filtre catégorie VI 
  if (filters.categoryVI && filters.categoryVI !== '') {
    query += `
    
    # Filtrer sur les VI de catégorie spécifique
    FILTER(?categoryVI = "${filters.categoryVI}")`;
    console.log(" Filtre catégorie VI ajouté:", filters.categoryVI);
  }

  // Filtre catégories sport multiples
  if (filters.sportCategories && filters.sportCategories.length > 0) {
    const sportCategoryConditions = filters.sportCategories.map(category => 
      `?sport iadas:sportPracticeType "${category}"`
    );
    
    query += `
    
    # Filtrer sur les catégories de sport multiples
    ?analysis iadas:hasSport ?sport .
    FILTER(${sportCategoryConditions.join(' || ')})`;
    
    console.log("🏅 Filtres catégories sport multiples ajoutés:", filters.sportCategories.join(', '));
  }

  // Filtre sports multiples
  if (filters.selectedSports && filters.selectedSports.length > 0) {
    const sportConditions = filters.selectedSports.map(sport => 
      `CONTAINS(LCASE(?sportName), "${sport.toLowerCase()}")`
    );
    
    query += `
    
    # Filtrer sur les sports multiples
    ?analysis iadas:hasSport ?sportURI .
    BIND(REPLACE(STR(?sportURI), ".*sport-vocab/", "") AS ?sportName)
    FILTER(${sportConditions.join(' || ')})`;
    
    console.log("⚽ Filtres sports multiples ajoutés:", filters.selectedSports.join(', '));
  }

  // Filtre sport unique (compatibilité)
  if (filters.sportType && filters.sportType !== '' && !filters.selectedSports) {
    query += `
    
    # Filtrer sur les sports
    ?analysis iadas:hasSport ?sportURI .
    BIND(REPLACE(STR(?sportURI), ".*sport-vocab/", "") AS ?sportName)
    FILTER(CONTAINS(LCASE(?sportName), "${filters.sportType.toLowerCase()}"))`;
    console.log(" Filtre sport ajouté:", filters.sportType);
  }

  // Filtre VI spécifique
  if (filters.selectedVI && filters.selectedVI !== '') {
    query += `
    
    # Filtrer sur VI spécifique
    FILTER(?vi = "${filters.selectedVI}")`;
    console.log(" Filtre VI spécifique ajouté:", filters.selectedVI);
  }

  // Filtre VD spécifique
  if (filters.selectedVD && filters.selectedVD !== '') {
    query += `
    
    # Filtrer sur VD spécifique
    FILTER(?vd = "${filters.selectedVD}")`;
    console.log(" Filtre VD spécifique ajouté:", filters.selectedVD);
  }

  // Filtre résultat relation
  if (filters.relationDirection && filters.relationDirection !== '') {
    query += `
    
    # Filtrer sur résultat de relation spécifique
    ?analysis iadas:relationDirection "${filters.relationDirection}" .
    BIND("${filters.relationDirection}" AS ?relationDirection)`;
    console.log(" Filtre relation ajouté:", filters.relationDirection);
  } else {
    // Récupérer tous les résultats de relation
    query += `
    
    # Récupérer le résultat de relation (OPTIONAL)
    OPTIONAL { 
      ?analysis iadas:relationDirection ?relationDirection 
    }`;
  }

  // Toujours récupérer médiateur et modérateur
  query += `
    
    # Médiateur et modérateur (optionnels)
    OPTIONAL { ?analysis iadas:hasMediator ?mediator }
    OPTIONAL { ?analysis iadas:hasModerator ?moderator }`;

  // Finaliser la requête
  query += `
}
ORDER BY ?analysis`;

  // Ajouter LIMIT si pas de filtres spécifiques
  const activeFilters = Object.keys(filters).filter(key =>
    filters[key] && filters[key] !== '' && key !== 'queryType'
  ).length;

  if (activeFilters === 0) {
    query += `
LIMIT 1500`;
    console.log(" Aucun filtre actif - LIMIT 1500 ajouté");
  } else {
    console.log(`${activeFilters} filtres actifs détectés - pas de LIMIT ajouté`);
  }

  console.log(" REQUÊTE GÉNÉRÉE :");
  console.log(query);

  return query;
}

// Fonction pour exécuter une requête SPARQL UPDATE
async function executeSparqlUpdate(sparqlQuery) {
  console.log(' Exécution requête SPARQL UPDATE...');
  console.log(' Requête:', sparqlQuery.substring(0, 200) + '...');

  try {
    const response = await fetch(FUSEKI_UPDATE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sparql-update',
        'Accept': 'text/plain',
        'Authorization': `Basic ${Buffer.from("admin:admin").toString('base64')}`
      },
      body: sparqlQuery,
      timeout: FUSEKI_TIMEOUT
    });

    console.log(` Réponse UPDATE: Status ${response.status}`);

    if (response.ok) {
      const responseText = await response.text();
      console.log(' UPDATE réussi:', responseText || 'Success');
      return {
        success: true,
        message: responseText || 'Update successful',
        status: response.status
      };
    } else {
      const errorText = await response.text();
      console.error(' Erreur UPDATE:', errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

  } catch (error) {
    console.error('Erreur lors de l\'UPDATE:', error.message);
    throw error;
  }
}

// Fonction pour exécuter plusieurs requêtes UPDATE en séquence
async function executeMultipleSparqlUpdates(queries) {
  console.log(` Exécution de ${Object.keys(queries).length} requêtes UPDATE...`);

  const results = {};
  const errors = [];

  for (const [queryName, query] of Object.entries(queries)) {
    try {
      console.log(`\n Exécution: ${queryName}`);
      const result = await executeSparqlUpdate(query);
      results[queryName] = result;
      console.log(` ${queryName}: Succès`);

      // Petit délai entre les requêtes pour éviter la surcharge
      await new Promise(resolve => setTimeout(resolve, 200));

    } catch (error) {
      console.error(` ${queryName}: Échec -`, error.message);
      errors.push({
        queryName: queryName,
        error: error.message,
        query: query.substring(0, 200) + '...'
      });
    }
  }

  return {
    results: results,
    errors: errors,
    totalQueries: Object.keys(queries).length,
    successCount: Object.keys(results).length,
    errorCount: errors.length
  };
}

function generateCompetenceQuery(questionId) {

  // Vérifications de base
  if (!questionId) {
    console.error(" ERREUR: questionId est vide/null/undefined !");
    console.log(" Tentative de récupération d'un ID par défaut...");
    questionId = 'q1'; // Fallback
    console.log(" ID par défaut assigné:", questionId);
  }

  const prefixes = `
PREFIX iadas: <http://ns.inria.fr/iadas/ontology/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX iadas-data: <http://ns.inria.fr/iadas/data/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>`;

  console.log(" Prefixes SPARQL définis");

  let query = '';
  let selectedCase = 'aucun';
  let expectedResults = 'inconnu';

  console.log(" Entrée dans le switch avec questionId:", questionId);

  switch (questionId) {
    case 'q1':
      console.log(" CASE Q1 DÉTECTÉ: Pour une ACAD spécifique, facteurs psychosociaux");
      selectedCase = 'q1 - ACAD → Facteurs psychosociaux';
      expectedResults = '800-1000 relations (toutes catégories)';

      query = `${prefixes}

SELECT DISTINCT ?vd ?vi ?categoryVI ?categoryVD ?relationDirection ?mediator ?moderator ?analysis 
WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation .
    ?relation iadas:hasIndependentVariable ?variableVI ;
              iadas:hasDependentVariable ?variableVD .
    
    ?variableVI iadas:refersToVariable ?viURI .
    BIND(REPLACE(STR(?viURI), ".*ACAD-vocab/", "") AS ?vi)
    BIND(REPLACE(?vi, '_', ' ') AS ?viLabel)
    OPTIONAL { SELECT ?viLabel (MIN(REPLACE(REPLACE(STR(?catVIURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVI) WHERE { ?viConcept skos:prefLabel ?viLabel . ?viConcept skos:broader ?catVIURIRaw } GROUP BY ?viLabel }
    
    ?variableVD iadas:refersToVariable ?vdURI .
    BIND(REPLACE(STR(?vdURI), ".*ACAD-vocab/", "") AS ?vd)
    BIND(REPLACE(?vd, '_', ' ') AS ?vdLabel)
    OPTIONAL { SELECT ?vdLabel (MIN(REPLACE(REPLACE(STR(?catVDURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVD) WHERE { ?vdConcept skos:prefLabel ?vdLabel . ?vdConcept skos:broader ?catVDURIRaw } GROUP BY ?vdLabel }
    
    OPTIONAL { ?analysis iadas:relationDirection ?relationDirection }
    OPTIONAL { ?analysis iadas:hasMediator ?mediator }
    OPTIONAL { ?analysis iadas:hasModerator ?moderator }
}
ORDER BY ?vd ?vi
LIMIT 10000`;
      break;

    case 'q2-protecteur':
      console.log(" CASE Q2-PROTECTEUR DÉTECTÉ: Facteurs protecteurs → ACAD");
      selectedCase = 'q2-protecteur - Facteurs protecteurs UNIQUEMENT';
      expectedResults = '200-400 relations avec relationDirection = "-"';

      query = `${prefixes}

SELECT DISTINCT ?vi ?vd ?categoryVI ?categoryVD ?analysis ?relationDirection
WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation .
    
    ?relation iadas:hasIndependentVariable ?variableVI ;
              iadas:hasDependentVariable ?variableVD .
    ?analysis iadas:relationDirection "-" .
    
    ?variableVI iadas:refersToVariable ?viURI .
    BIND(REPLACE(STR(?viURI), ".*ACAD-vocab/", "") AS ?vi)
    BIND(REPLACE(?vi, '_', ' ') AS ?viLabel)
    OPTIONAL { SELECT ?viLabel (MIN(REPLACE(REPLACE(STR(?catVIURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVI) WHERE { ?viConcept skos:prefLabel ?viLabel . ?viConcept skos:broader ?catVIURIRaw } GROUP BY ?viLabel }
    
    ?variableVD iadas:refersToVariable ?vdURI .
    BIND(REPLACE(STR(?vdURI), ".*ACAD-vocab/", "") AS ?vd)
    BIND(REPLACE(?vd, '_', ' ') AS ?vdLabel)
    OPTIONAL { SELECT ?vdLabel (MIN(REPLACE(REPLACE(STR(?catVDURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVD) WHERE { ?vdConcept skos:prefLabel ?vdLabel . ?vdConcept skos:broader ?catVDURIRaw } GROUP BY ?vdLabel }
    
    BIND("-" AS ?relationDirection)
}
ORDER BY ?vi ?vd
`;
      break;

    case 'q2-risque':
      console.log(" CASE Q2-RISQUE DÉTECTÉ: Facteurs de risque → ACAD");
      selectedCase = 'q2-risque - Facteurs de risque UNIQUEMENT';
      expectedResults = '300-600 relations avec relationDirection = "+"';

      query = `${prefixes}

SELECT DISTINCT ?vi ?vd ?categoryVI ?categoryVD ?analysis ?relationDirection
WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation .
    
    ?relation iadas:hasIndependentVariable ?variableVI ;
              iadas:hasDependentVariable ?variableVD .
    ?analysis iadas:relationDirection "+" .
    
    ?variableVI iadas:refersToVariable ?viURI .
    BIND(REPLACE(STR(?viURI), ".*ACAD-vocab/", "") AS ?vi)
    BIND(REPLACE(?vi, '_', ' ') AS ?viLabel)
    OPTIONAL { SELECT ?viLabel (MIN(REPLACE(REPLACE(STR(?catVIURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVI) WHERE { ?viConcept skos:prefLabel ?viLabel . ?viConcept skos:broader ?catVIURIRaw } GROUP BY ?viLabel }
    
    ?variableVD iadas:refersToVariable ?vdURI .
    BIND(REPLACE(STR(?vdURI), ".*ACAD-vocab/", "") AS ?vd)
    BIND(REPLACE(?vd, '_', ' ') AS ?vdLabel)
    OPTIONAL { SELECT ?vdLabel (MIN(REPLACE(REPLACE(STR(?catVDURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVD) WHERE { ?vdConcept skos:prefLabel ?vdLabel . ?vdConcept skos:broader ?catVDURIRaw } GROUP BY ?vdLabel }
    
    BIND("+" AS ?relationDirection)
}
ORDER BY ?vi ?vd
`;
      break;

    case 'q2-ambigu':
      console.log(" CASE Q2-AMBIGU DÉTECTÉ: Facteurs ambigus → ACAD");
      selectedCase = 'q2-ambigu - Facteurs ambigus UNIQUEMENT';
      expectedResults = '100-300 relations avec relationDirection = "NS"';

      query = `${prefixes}

SELECT DISTINCT ?vi ?vd ?categoryVI ?categoryVD ?analysis ?relationDirection
WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation .
    
    ?relation iadas:hasIndependentVariable ?variableVI ;
              iadas:hasDependentVariable ?variableVD .
    ?analysis iadas:relationDirection "NS" .
    
    ?variableVI iadas:refersToVariable ?viURI .
    BIND(REPLACE(STR(?viURI), ".*ACAD-vocab/", "") AS ?vi)
    BIND(REPLACE(?vi, '_', ' ') AS ?viLabel)
    OPTIONAL { SELECT ?viLabel (MIN(REPLACE(REPLACE(STR(?catVIURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVI) WHERE { ?viConcept skos:prefLabel ?viLabel . ?viConcept skos:broader ?catVIURIRaw } GROUP BY ?viLabel }
    
    ?variableVD iadas:refersToVariable ?vdURI .
    BIND(REPLACE(STR(?vdURI), ".*ACAD-vocab/", "") AS ?vd)
    BIND(REPLACE(?vd, '_', ' ') AS ?vdLabel)
    OPTIONAL { SELECT ?vdLabel (MIN(REPLACE(REPLACE(STR(?catVDURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVD) WHERE { ?vdConcept skos:prefLabel ?vdLabel . ?vdConcept skos:broader ?catVDURIRaw } GROUP BY ?vdLabel }
    
    BIND("NS" AS ?relationDirection)
}
ORDER BY ?vi ?vd
`;
      break;

    case 'q3-intrapersonnels':
      console.log(" CASE Q3-INTRA DÉTECTÉ: Facteurs intrapersonnels → ACAD");
      selectedCase = 'q3-intrapersonnels - Catégorie Intrapersonal factor related to DEAB';
      expectedResults = '200-500 relations de cette catégorie';

      query = `${prefixes}

SELECT DISTINCT ?vi ?vd ?categoryVI ?categoryVD ?relationDirection ?analysis
WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation .

    ?relation iadas:hasIndependentVariable ?variableVI ;
              iadas:hasDependentVariable ?variableVD .

    ?variableVI iadas:refersToVariable ?viURI .
    BIND(REPLACE(STR(?viURI), ".*ACAD-vocab/", "") AS ?vi)
    BIND(REPLACE(?vi, '_', ' ') AS ?viLabel)

    ?viConcept skos:prefLabel ?viLabel .
    ?viConcept skos:broader+ ?viTopCat .
    ?viTopCat skos:prefLabel "Intrapersonal factor related to DEAB" .

    OPTIONAL { SELECT ?viLabel (MIN(REPLACE(REPLACE(STR(?catVIURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVI) WHERE { ?viConcept2 skos:prefLabel ?viLabel . ?viConcept2 skos:broader ?catVIURIRaw } GROUP BY ?viLabel }

    ?variableVD iadas:refersToVariable ?vdURI .
    BIND(REPLACE(STR(?vdURI), ".*ACAD-vocab/", "") AS ?vd)
    BIND(REPLACE(?vd, '_', ' ') AS ?vdLabel)
    OPTIONAL { SELECT ?vdLabel (MIN(REPLACE(REPLACE(STR(?catVDURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVD) WHERE { ?vdConcept skos:prefLabel ?vdLabel . ?vdConcept skos:broader ?catVDURIRaw } GROUP BY ?vdLabel }
    OPTIONAL { ?analysis iadas:relationDirection ?relationDirection }
}
ORDER BY ?vi ?vd
LIMIT 300`;
      break;

    case 'q3-interpersonnels':
      console.log(" CASE Q3-INTER DÉTECTÉ: Facteurs interpersonnels → ACAD");
      selectedCase = 'q3-interpersonnels - Catégorie Interpersonal factor related to DEAB';
      expectedResults = '200-300 relations de cette catégorie';

      query = `${prefixes}

SELECT DISTINCT ?vi ?vd ?categoryVI ?categoryVD ?relationDirection ?analysis
WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation .

    ?relation iadas:hasIndependentVariable ?variableVI ;
              iadas:hasDependentVariable ?variableVD .

    ?variableVI iadas:refersToVariable ?viURI .
    BIND(REPLACE(STR(?viURI), ".*ACAD-vocab/", "") AS ?vi)
    BIND(REPLACE(?vi, '_', ' ') AS ?viLabel)

    ?viConcept skos:prefLabel ?viLabel .
    ?viConcept skos:broader+ ?viTopCat .
    ?viTopCat skos:prefLabel "Interpersonal factor related to DEAB" .

    OPTIONAL { SELECT ?viLabel (MIN(REPLACE(REPLACE(STR(?catVIURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVI) WHERE { ?viConcept2 skos:prefLabel ?viLabel . ?viConcept2 skos:broader ?catVIURIRaw } GROUP BY ?viLabel }

    ?variableVD iadas:refersToVariable ?vdURI .
    BIND(REPLACE(STR(?vdURI), ".*ACAD-vocab/", "") AS ?vd)
    BIND(REPLACE(?vd, '_', ' ') AS ?vdLabel)
    OPTIONAL { SELECT ?vdLabel (MIN(REPLACE(REPLACE(STR(?catVDURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVD) WHERE { ?vdConcept skos:prefLabel ?vdLabel . ?vdConcept skos:broader ?catVDURIRaw } GROUP BY ?vdLabel }
    OPTIONAL { ?analysis iadas:relationDirection ?relationDirection }
}
ORDER BY ?vi ?vd
LIMIT 300`;
      break;

    case 'q3-socioenvironnementaux':
      console.log(" CASE Q3-SOCIO DÉTECTÉ: Facteurs socio-environnementaux → ACAD");
      selectedCase = 'q3-socioenvironnementaux - Catégorie Sociocultural factor related to DEAB';
      expectedResults = '50-200 relations de cette catégorie';

      query = `${prefixes}

SELECT DISTINCT ?vi ?vd ?categoryVI ?categoryVD ?relationDirection ?analysis
WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation .

    ?relation iadas:hasIndependentVariable ?variableVI ;
              iadas:hasDependentVariable ?variableVD .

    ?variableVI iadas:refersToVariable ?viURI .
    BIND(REPLACE(STR(?viURI), ".*ACAD-vocab/", "") AS ?vi)
    BIND(REPLACE(?vi, '_', ' ') AS ?viLabel)

    ?viConcept skos:prefLabel ?viLabel .
    ?viConcept skos:broader+ ?viTopCat .
    ?viTopCat skos:prefLabel "Sociocultural factor related to DEAB" .

    OPTIONAL { SELECT ?viLabel (MIN(REPLACE(REPLACE(STR(?catVIURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVI) WHERE { ?viConcept2 skos:prefLabel ?viLabel . ?viConcept2 skos:broader ?catVIURIRaw } GROUP BY ?viLabel }

    ?variableVD iadas:refersToVariable ?vdURI .
    BIND(REPLACE(STR(?vdURI), ".*ACAD-vocab/", "") AS ?vd)
    BIND(REPLACE(?vd, '_', ' ') AS ?vdLabel)
    OPTIONAL { SELECT ?vdLabel (MIN(REPLACE(REPLACE(STR(?catVDURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVD) WHERE { ?vdConcept skos:prefLabel ?vdLabel . ?vdConcept skos:broader ?catVDURIRaw } GROUP BY ?vdLabel }
    OPTIONAL { ?analysis iadas:relationDirection ?relationDirection }
}
ORDER BY ?vi ?vd
LIMIT 300`;
      break;

    case 'q3-autres':
      console.log(" CASE Q3-AUTRES DÉTECTÉ: Autres comportements → ACAD");
      selectedCase = 'q3-autres - Catégorie Other behaviors';
      expectedResults = '50-150 relations de cette catégorie';

      query = `${prefixes}

SELECT DISTINCT ?vi ?vd ?categoryVI ?categoryVD ?relationDirection ?analysis
WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation .

    ?relation iadas:hasIndependentVariable ?variableVI ;
              iadas:hasDependentVariable ?variableVD .

    ?variableVI iadas:refersToVariable ?viURI .
    BIND(REPLACE(STR(?viURI), ".*ACAD-vocab/", "") AS ?vi)
    BIND(REPLACE(?vi, '_', ' ') AS ?viLabel)

    ?viConcept skos:prefLabel ?viLabel .
    ?viConcept skos:broader+ ?viTopCat .
    ?viTopCat skos:prefLabel "Other behaviors" .

    OPTIONAL { SELECT ?viLabel (MIN(REPLACE(REPLACE(STR(?catVIURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVI) WHERE { ?viConcept2 skos:prefLabel ?viLabel . ?viConcept2 skos:broader ?catVIURIRaw } GROUP BY ?viLabel }

    ?variableVD iadas:refersToVariable ?vdURI .
    BIND(REPLACE(STR(?vdURI), ".*ACAD-vocab/", "") AS ?vd)
    BIND(REPLACE(?vd, '_', ' ') AS ?vdLabel)
    OPTIONAL { SELECT ?vdLabel (MIN(REPLACE(REPLACE(STR(?catVDURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVD) WHERE { ?vdConcept skos:prefLabel ?vdLabel . ?vdConcept skos:broader ?catVDURIRaw } GROUP BY ?vdLabel }
    OPTIONAL { ?analysis iadas:relationDirection ?relationDirection }
}
ORDER BY ?vi ?vd
LIMIT 300`;
      break;

    case 'q4-male':
      console.log(" CASE Q4-MALE DÉTECTÉ: Relations ACAD-facteurs pour populations masculines");
      selectedCase = 'q4-male - Populations masculines';
      expectedResults = '300-600 relations pour populations masculines';

      query = `${prefixes}

SELECT DISTINCT ?vi ?vd ?categoryVI ?categoryVD ?relationDirection ?analysis ?gender
WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation .
    
    ?relation iadas:hasIndependentVariable ?variableVI ;
              iadas:hasDependentVariable ?variableVD .
    
    ?variableVI iadas:refersToVariable ?viURI .
    BIND(REPLACE(STR(?viURI), ".*ACAD-vocab/", "") AS ?vi)
    BIND(REPLACE(?vi, '_', ' ') AS ?viLabel)
    OPTIONAL { SELECT ?viLabel (MIN(REPLACE(REPLACE(STR(?catVIURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVI) WHERE { ?viConcept skos:prefLabel ?viLabel . ?viConcept skos:broader ?catVIURIRaw } GROUP BY ?viLabel }
    
    ?variableVD iadas:refersToVariable ?vdURI .
    BIND(REPLACE(STR(?vdURI), ".*ACAD-vocab/", "") AS ?vd)
    BIND(REPLACE(?vd, '_', ' ') AS ?vdLabel)
    OPTIONAL { SELECT ?vdLabel (MIN(REPLACE(REPLACE(STR(?catVDURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVD) WHERE { ?vdConcept skos:prefLabel ?vdLabel . ?vdConcept skos:broader ?catVDURIRaw } GROUP BY ?vdLabel }
    
    ?analysis iadas:hasPopulation ?population .
    ?population iadas:gender "Male" .
    
    OPTIONAL { ?analysis iadas:relationDirection ?relationDirection }
    BIND("Male" AS ?gender)
}
ORDER BY ?vi ?vd
`;
      break;

    case 'q4-female':
      console.log(" CASE Q4-FEMALE DÉTECTÉ: Relations ACAD-facteurs pour populations féminines");
      selectedCase = 'q4-female - Populations féminines';
      expectedResults = '200-400 relations pour populations féminines';

      query = `${prefixes}

SELECT DISTINCT ?vi ?vd ?categoryVI ?categoryVD ?relationDirection ?analysis ?gender
WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation .
    
    ?relation iadas:hasIndependentVariable ?variableVI ;
              iadas:hasDependentVariable ?variableVD .
    
    ?variableVI iadas:refersToVariable ?viURI .
    BIND(REPLACE(STR(?viURI), ".*ACAD-vocab/", "") AS ?vi)
    BIND(REPLACE(?vi, '_', ' ') AS ?viLabel)
    OPTIONAL { SELECT ?viLabel (MIN(REPLACE(REPLACE(STR(?catVIURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVI) WHERE { ?viConcept skos:prefLabel ?viLabel . ?viConcept skos:broader ?catVIURIRaw } GROUP BY ?viLabel }
    
    ?variableVD iadas:refersToVariable ?vdURI .
    BIND(REPLACE(STR(?vdURI), ".*ACAD-vocab/", "") AS ?vd)
    BIND(REPLACE(?vd, '_', ' ') AS ?vdLabel)
    OPTIONAL { SELECT ?vdLabel (MIN(REPLACE(REPLACE(STR(?catVDURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVD) WHERE { ?vdConcept skos:prefLabel ?vdLabel . ?vdConcept skos:broader ?catVDURIRaw } GROUP BY ?vdLabel }
    
    ?analysis iadas:hasPopulation ?population .
    ?population iadas:gender "Female" .
    
    OPTIONAL { ?analysis iadas:relationDirection ?relationDirection }
    BIND("Female" AS ?gender)
}
ORDER BY ?vi ?vd
`;
      break;

    case 'q4-mixed':
      console.log(" CASE Q4-MIXED DÉTECTÉ: Relations ACAD-facteurs pour populations mixtes");
      selectedCase = 'q4-mixed - Populations mixtes';
      expectedResults = '100-300 relations pour populations mixtes';

      query = `${prefixes}

SELECT DISTINCT ?vi ?vd ?categoryVI ?categoryVD ?relationDirection ?analysis ?gender
WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation .
    
    ?relation iadas:hasIndependentVariable ?variableVI ;
              iadas:hasDependentVariable ?variableVD .
    
    ?variableVI iadas:refersToVariable ?viURI .
    BIND(REPLACE(STR(?viURI), ".*ACAD-vocab/", "") AS ?vi)
    BIND(REPLACE(?vi, '_', ' ') AS ?viLabel)
    OPTIONAL { SELECT ?viLabel (MIN(REPLACE(REPLACE(STR(?catVIURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVI) WHERE { ?viConcept skos:prefLabel ?viLabel . ?viConcept skos:broader ?catVIURIRaw } GROUP BY ?viLabel }
    
    ?variableVD iadas:refersToVariable ?vdURI .
    BIND(REPLACE(STR(?vdURI), ".*ACAD-vocab/", "") AS ?vd)
    BIND(REPLACE(?vd, '_', ' ') AS ?vdLabel)
    OPTIONAL { SELECT ?vdLabel (MIN(REPLACE(REPLACE(STR(?catVDURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVD) WHERE { ?vdConcept skos:prefLabel ?vdLabel . ?vdConcept skos:broader ?catVDURIRaw } GROUP BY ?vdLabel }
    
    ?analysis iadas:hasPopulation ?population .
    ?population iadas:gender "Mixed" .
    
    OPTIONAL { ?analysis iadas:relationDirection ?relationDirection }
    BIND("Mixed" AS ?gender)
}
ORDER BY ?vi ?vd
`;
      break;

    case 'q5-individual':
      console.log(" CASE Q5-INDIVIDUAL DÉTECTÉ: Relations ACAD-facteurs pour sports individuels");
      selectedCase = 'q5-individual - Sports individuels';
      expectedResults = '400-800 relations pour sports individuels';

      query = `${prefixes}

SELECT DISTINCT ?vi ?vd ?categoryVI ?categoryVD ?relationDirection ?analysis ?sportType
WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation .
    
    ?relation iadas:hasIndependentVariable ?variableVI ;
              iadas:hasDependentVariable ?variableVD .
    
    ?variableVI iadas:refersToVariable ?viURI .
    BIND(REPLACE(STR(?viURI), ".*ACAD-vocab/", "") AS ?vi)
    BIND(REPLACE(?vi, '_', ' ') AS ?viLabel)
    OPTIONAL { SELECT ?viLabel (MIN(REPLACE(REPLACE(STR(?catVIURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVI) WHERE { ?viConcept skos:prefLabel ?viLabel . ?viConcept skos:broader ?catVIURIRaw } GROUP BY ?viLabel }
    
    ?variableVD iadas:refersToVariable ?vdURI .
    BIND(REPLACE(STR(?vdURI), ".*ACAD-vocab/", "") AS ?vd)
    BIND(REPLACE(?vd, '_', ' ') AS ?vdLabel)
    OPTIONAL { SELECT ?vdLabel (MIN(REPLACE(REPLACE(STR(?catVDURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVD) WHERE { ?vdConcept skos:prefLabel ?vdLabel . ?vdConcept skos:broader ?catVDURIRaw } GROUP BY ?vdLabel }
    
    ?analysis iadas:sportPracticeType "Individual sport" .
    
    OPTIONAL { ?analysis iadas:relationDirection ?relationDirection }
    BIND("Individual sport" AS ?sportType)
}
ORDER BY ?vi ?vd
`;
      break;

    case 'q5-team':
      console.log(" CASE Q5-TEAM DÉTECTÉ: Relations ACAD-facteurs pour sports d'équipe");
      selectedCase = 'q5-team - Sports d\'équipe';
      expectedResults = '100-200 relations pour sports d\'équipe';

      query = `${prefixes}

SELECT DISTINCT ?vi ?vd ?categoryVI ?categoryVD ?relationDirection ?analysis ?sportType
WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation .
    
    ?relation iadas:hasIndependentVariable ?variableVI ;
              iadas:hasDependentVariable ?variableVD .
    
    ?variableVI iadas:refersToVariable ?viURI .
    BIND(REPLACE(STR(?viURI), ".*ACAD-vocab/", "") AS ?vi)
    BIND(REPLACE(?vi, '_', ' ') AS ?viLabel)
    OPTIONAL { SELECT ?viLabel (MIN(REPLACE(REPLACE(STR(?catVIURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVI) WHERE { ?viConcept skos:prefLabel ?viLabel . ?viConcept skos:broader ?catVIURIRaw } GROUP BY ?viLabel }
    
    ?variableVD iadas:refersToVariable ?vdURI .
    BIND(REPLACE(STR(?vdURI), ".*ACAD-vocab/", "") AS ?vd)
    BIND(REPLACE(?vd, '_', ' ') AS ?vdLabel)
    OPTIONAL { SELECT ?vdLabel (MIN(REPLACE(REPLACE(STR(?catVDURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVD) WHERE { ?vdConcept skos:prefLabel ?vdLabel . ?vdConcept skos:broader ?catVDURIRaw } GROUP BY ?vdLabel }
    
    ?analysis iadas:sportPracticeType "Team sport" .
    
    OPTIONAL { ?analysis iadas:relationDirection ?relationDirection }
    BIND("Team sport" AS ?sportType)
}
ORDER BY ?vi ?vd
`;
      break;

    case 'q5-mixed':
      console.log(" CASE Q5-MIXED DÉTECTÉ: Relations ACAD-facteurs pour sports mixtes");
      selectedCase = 'q5-mixed - Sports mixtes';
      expectedResults = '300-600 relations pour sports mixtes';

      query = `${prefixes}

SELECT DISTINCT ?vi ?vd ?categoryVI ?categoryVD ?relationDirection ?analysis ?sportType
WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation .
    
    ?relation iadas:hasIndependentVariable ?variableVI ;
              iadas:hasDependentVariable ?variableVD .
    
    ?variableVI iadas:refersToVariable ?viURI .
    BIND(REPLACE(STR(?viURI), ".*ACAD-vocab/", "") AS ?vi)
    BIND(REPLACE(?vi, '_', ' ') AS ?viLabel)
    OPTIONAL { SELECT ?viLabel (MIN(REPLACE(REPLACE(STR(?catVIURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVI) WHERE { ?viConcept skos:prefLabel ?viLabel . ?viConcept skos:broader ?catVIURIRaw } GROUP BY ?viLabel }
    
    ?variableVD iadas:refersToVariable ?vdURI .
    BIND(REPLACE(STR(?vdURI), ".*ACAD-vocab/", "") AS ?vd)
    BIND(REPLACE(?vd, '_', ' ') AS ?vdLabel)
    OPTIONAL { SELECT ?vdLabel (MIN(REPLACE(REPLACE(STR(?catVDURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVD) WHERE { ?vdConcept skos:prefLabel ?vdLabel . ?vdConcept skos:broader ?catVDURIRaw } GROUP BY ?vdLabel }
    
    ?analysis iadas:sportPracticeType "Mixed sport" .
    
    OPTIONAL { ?analysis iadas:relationDirection ?relationDirection }
    BIND("Mixed sport" AS ?sportType)
}
ORDER BY ?vi ?vd
`;
      break;

    case 'q5-aesthetic':
      console.log(" CASE Q5-AESTHETIC DÉTECTÉ: Relations ACAD-facteurs pour sports esthétiques");
      selectedCase = 'q5-aesthetic - Sports esthétiques';
      expectedResults = '50-100 relations pour sports esthétiques';

      query = `${prefixes}

SELECT DISTINCT ?vi ?vd ?categoryVI ?categoryVD ?relationDirection ?analysis ?sportType
WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation .
    
    ?relation iadas:hasIndependentVariable ?variableVI ;
              iadas:hasDependentVariable ?variableVD .
    
    ?variableVI iadas:refersToVariable ?viURI .
    BIND(REPLACE(STR(?viURI), ".*ACAD-vocab/", "") AS ?vi)
    BIND(REPLACE(?vi, '_', ' ') AS ?viLabel)
    OPTIONAL { SELECT ?viLabel (MIN(REPLACE(REPLACE(STR(?catVIURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVI) WHERE { ?viConcept skos:prefLabel ?viLabel . ?viConcept skos:broader ?catVIURIRaw } GROUP BY ?viLabel }
    
    ?variableVD iadas:refersToVariable ?vdURI .
    BIND(REPLACE(STR(?vdURI), ".*ACAD-vocab/", "") AS ?vd)
    BIND(REPLACE(?vd, '_', ' ') AS ?vdLabel)
    OPTIONAL { SELECT ?vdLabel (MIN(REPLACE(REPLACE(STR(?catVDURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVD) WHERE { ?vdConcept skos:prefLabel ?vdLabel . ?vdConcept skos:broader ?catVDURIRaw } GROUP BY ?vdLabel }
    
    ?analysis iadas:sportPracticeType "Aesthetic sport" .
    
    OPTIONAL { ?analysis iadas:relationDirection ?relationDirection }
    BIND("Aesthetic sport" AS ?sportType)
}
ORDER BY ?vi ?vd
`;
      break;

    case 'q6-female':
      console.log(" CASE Q6-FEMALE DÉTECTÉ: Relations ACAD-facteurs - Femmes");
      selectedCase = 'q6-female - Relations chez les femmes';
      expectedResults = '400-800 relations pour populations féminines';

      query = `${prefixes}

SELECT DISTINCT ?vi ?vd ?categoryVI ?categoryVD ?analysis ?relationDirection ?gender
WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation ;
              iadas:hasPopulation ?population .
    
    ?population iadas:gender "Female" .
    
    ?relation iadas:hasIndependentVariable ?variableVI ;
              iadas:hasDependentVariable ?variableVD .
    
    ?variableVI iadas:refersToVariable ?viURI .
    BIND(REPLACE(STR(?viURI), ".*ACAD-vocab/", "") AS ?vi)
    BIND(REPLACE(?vi, '_', ' ') AS ?viLabel)
    OPTIONAL { SELECT ?viLabel (MIN(REPLACE(REPLACE(STR(?catVIURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVI) WHERE { ?viConcept skos:prefLabel ?viLabel . ?viConcept skos:broader ?catVIURIRaw } GROUP BY ?viLabel }
    
    ?variableVD iadas:refersToVariable ?vdURI .
    BIND(REPLACE(STR(?vdURI), ".*ACAD-vocab/", "") AS ?vd)
    BIND(REPLACE(?vd, '_', ' ') AS ?vdLabel)
    OPTIONAL { SELECT ?vdLabel (MIN(REPLACE(REPLACE(STR(?catVDURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVD) WHERE { ?vdConcept skos:prefLabel ?vdLabel . ?vdConcept skos:broader ?catVDURIRaw } GROUP BY ?vdLabel }
    
    OPTIONAL { ?analysis iadas:relationDirection ?relationDirection }
    BIND("Female" AS ?gender)
}
ORDER BY ?vi ?vd
`;
      break;

    case 'q6-male':
      console.log(" CASE Q6-MALE DÉTECTÉ: Relations ACAD-facteurs - Hommes");
      selectedCase = 'q6-male - Relations chez les hommes';
      expectedResults = '300-600 relations pour populations masculines';

      query = `${prefixes}

SELECT DISTINCT ?vi ?vd ?categoryVI ?categoryVD ?analysis ?relationDirection ?gender
WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation ;
              iadas:hasPopulation ?population .
    
    ?population iadas:gender "Male" .
    
    ?relation iadas:hasIndependentVariable ?variableVI ;
              iadas:hasDependentVariable ?variableVD .
    
    ?variableVI iadas:refersToVariable ?viURI .
    BIND(REPLACE(STR(?viURI), ".*ACAD-vocab/", "") AS ?vi)
    BIND(REPLACE(?vi, '_', ' ') AS ?viLabel)
    OPTIONAL { SELECT ?viLabel (MIN(REPLACE(REPLACE(STR(?catVIURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVI) WHERE { ?viConcept skos:prefLabel ?viLabel . ?viConcept skos:broader ?catVIURIRaw } GROUP BY ?viLabel }
    
    ?variableVD iadas:refersToVariable ?vdURI .
    BIND(REPLACE(STR(?vdURI), ".*ACAD-vocab/", "") AS ?vd)
    BIND(REPLACE(?vd, '_', ' ') AS ?vdLabel)
    OPTIONAL { SELECT ?vdLabel (MIN(REPLACE(REPLACE(STR(?catVDURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVD) WHERE { ?vdConcept skos:prefLabel ?vdLabel . ?vdConcept skos:broader ?catVDURIRaw } GROUP BY ?vdLabel }
    
    OPTIONAL { ?analysis iadas:relationDirection ?relationDirection }
    BIND("Male" AS ?gender)
}
ORDER BY ?vi ?vd
`;
      break;

    case 'q6-mixed':
      console.log(" CASE Q6-MIXED DÉTECTÉ: Relations ACAD-facteurs - Populations mixtes");
      selectedCase = 'q6-mixed - Relations pour populations mixtes';
      expectedResults = '200-400 relations pour populations mixtes';

      query = `${prefixes}

SELECT DISTINCT ?vi ?vd ?categoryVI ?categoryVD ?analysis ?relationDirection ?gender
WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation ;
              iadas:hasPopulation ?population .
    
    ?population iadas:gender "Mixed" .
    
    ?relation iadas:hasIndependentVariable ?variableVI ;
              iadas:hasDependentVariable ?variableVD .
    
    ?variableVI iadas:refersToVariable ?viURI .
    BIND(REPLACE(STR(?viURI), ".*ACAD-vocab/", "") AS ?vi)
    BIND(REPLACE(?vi, '_', ' ') AS ?viLabel)
    OPTIONAL { SELECT ?viLabel (MIN(REPLACE(REPLACE(STR(?catVIURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVI) WHERE { ?viConcept skos:prefLabel ?viLabel . ?viConcept skos:broader ?catVIURIRaw } GROUP BY ?viLabel }
    
    ?variableVD iadas:refersToVariable ?vdURI .
    BIND(REPLACE(STR(?vdURI), ".*ACAD-vocab/", "") AS ?vd)
    BIND(REPLACE(?vd, '_', ' ') AS ?vdLabel)
    OPTIONAL { SELECT ?vdLabel (MIN(REPLACE(REPLACE(STR(?catVDURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVD) WHERE { ?vdConcept skos:prefLabel ?vdLabel . ?vdConcept skos:broader ?catVDURIRaw } GROUP BY ?vdLabel }
    
    OPTIONAL { ?analysis iadas:relationDirection ?relationDirection }
    BIND("Mixed" AS ?gender)
}
ORDER BY ?vi ?vd
`;
      break;

    case 'q7-volleyball-men-21':
      console.log(" CASE Q7-VOLLEYBALL-MEN-21 DÉTECTÉ: Hommes volleyball âge moyen 21");
      selectedCase = 'q7-volleyball-men-21 - Hommes pratiquant volleyball avec âge moyen 21 ans';
      expectedResults = '10-50 relations spécifiques';

      query = `${prefixes}

SELECT DISTINCT ?vi ?vd ?categoryVI ?categoryVD ?analysis ?relationDirection ?gender ?sport ?meanAge
WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation ;
              iadas:hasPopulation ?population ;
              iadas:hasSport ?sport_info .
    
    ?population iadas:gender "Male" .
    ?population iadas:hasStatistics ?ageStats .
    ?ageStats a iadas:AgeStatistics .
    
    ?ageStats iadas:hasMeanValue ?meanAgeRaw .
    BIND(xsd:decimal(REPLACE(REPLACE(?meanAgeRaw, ".*M=([0-9]+)[,.]([0-9]+).*", "$1.$2"), ",", ".")) AS ?meanAge)
    FILTER(?meanAge >= 18 && ?meanAge <= 22)
    
    BIND(REPLACE(STR(?sport_info), ".*sport-vocab/", "") AS ?sport)
    FILTER(CONTAINS(LCASE(?sport), "volleyball") || CONTAINS(LCASE(?sport), "volley"))
    
    ?relation iadas:hasIndependentVariable ?variableVI ;
              iadas:hasDependentVariable ?variableVD .
    
    ?variableVI iadas:refersToVariable ?viURI .
    BIND(REPLACE(STR(?viURI), ".*ACAD-vocab/", "") AS ?vi)
    BIND(REPLACE(?vi, '_', ' ') AS ?viLabel)
    OPTIONAL { SELECT ?viLabel (MIN(REPLACE(REPLACE(STR(?catVIURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVI) WHERE { ?viConcept skos:prefLabel ?viLabel . ?viConcept skos:broader ?catVIURIRaw } GROUP BY ?viLabel }
    
    ?variableVD iadas:refersToVariable ?vdURI .
    BIND(REPLACE(STR(?vdURI), ".*ACAD-vocab/", "") AS ?vd)
    BIND(REPLACE(?vd, '_', ' ') AS ?vdLabel)
    OPTIONAL { SELECT ?vdLabel (MIN(REPLACE(REPLACE(STR(?catVDURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVD) WHERE { ?vdConcept skos:prefLabel ?vdLabel . ?vdConcept skos:broader ?catVDURIRaw } GROUP BY ?vdLabel }
    
    OPTIONAL { ?analysis iadas:relationDirection ?relationDirection }
    BIND("Male" AS ?gender)
}
ORDER BY ?meanAge ?vi ?vd
`;
      break;

    case 'q8-individual':
      console.log(" CASE Q8-INDIVIDUAL DÉTECTÉ: Sports individuels");
      selectedCase = 'q8-individual - Sports individuels';
      expectedResults = '300-600 relations pour sports individuels';

      query = `${prefixes}

SELECT DISTINCT ?vi ?vd ?categoryVI ?categoryVD ?analysis ?relationDirection ?sportCategory
WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation ;
              iadas:hasSport ?sport_info .
    
    ?analysis iadas:sportPracticeType "Individual sport" .
    
    ?relation iadas:hasIndependentVariable ?variableVI ;
              iadas:hasDependentVariable ?variableVD .
    
    ?variableVI iadas:refersToVariable ?viURI .
    BIND(REPLACE(STR(?viURI), ".*ACAD-vocab/", "") AS ?vi)
    BIND(REPLACE(?vi, '_', ' ') AS ?viLabel)
    OPTIONAL { SELECT ?viLabel (MIN(REPLACE(REPLACE(STR(?catVIURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVI) WHERE { ?viConcept skos:prefLabel ?viLabel . ?viConcept skos:broader ?catVIURIRaw } GROUP BY ?viLabel }
    
    ?variableVD iadas:refersToVariable ?vdURI .
    BIND(REPLACE(STR(?vdURI), ".*ACAD-vocab/", "") AS ?vd)
    BIND(REPLACE(?vd, '_', ' ') AS ?vdLabel)
    OPTIONAL { SELECT ?vdLabel (MIN(REPLACE(REPLACE(STR(?catVDURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVD) WHERE { ?vdConcept skos:prefLabel ?vdLabel . ?vdConcept skos:broader ?catVDURIRaw } GROUP BY ?vdLabel }
    
    OPTIONAL { ?analysis iadas:relationDirection ?relationDirection }
    BIND("Individual sport" AS ?sportCategory)
}
ORDER BY ?vi ?vd
`;
      break;

    case 'q8-team':
      console.log(" CASE Q8-TEAM DÉTECTÉ: Sports d'équipe");
      selectedCase = 'q8-team - Sports d équipe';
      expectedResults = '150-300 relations pour sports d équipe';

      query = `${prefixes}

SELECT DISTINCT ?vi ?vd ?categoryVI ?categoryVD ?analysis ?relationDirection ?sportCategory
WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation ;
              iadas:hasSport ?sport_info .
    
    ?analysis iadas:sportPracticeType "Team sport" .
    
    ?relation iadas:hasIndependentVariable ?variableVI ;
              iadas:hasDependentVariable ?variableVD .
    
    ?variableVI iadas:refersToVariable ?viURI .
    BIND(REPLACE(STR(?viURI), ".*ACAD-vocab/", "") AS ?vi)
    BIND(REPLACE(?vi, '_', ' ') AS ?viLabel)
    OPTIONAL { SELECT ?viLabel (MIN(REPLACE(REPLACE(STR(?catVIURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVI) WHERE { ?viConcept skos:prefLabel ?viLabel . ?viConcept skos:broader ?catVIURIRaw } GROUP BY ?viLabel }
    
    ?variableVD iadas:refersToVariable ?vdURI .
    BIND(REPLACE(STR(?vdURI), ".*ACAD-vocab/", "") AS ?vd)
    BIND(REPLACE(?vd, '_', ' ') AS ?vdLabel)
    OPTIONAL { SELECT ?vdLabel (MIN(REPLACE(REPLACE(STR(?catVDURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVD) WHERE { ?vdConcept skos:prefLabel ?vdLabel . ?vdConcept skos:broader ?catVDURIRaw } GROUP BY ?vdLabel }
    
    OPTIONAL { ?analysis iadas:relationDirection ?relationDirection }
    BIND("Team sport" AS ?sportCategory)
}
ORDER BY ?vi ?vd
`;
      break;

    case 'q8-mixed':
      console.log(" CASE Q8-MIXED DÉTECTÉ: Sports mixtes");
      selectedCase = 'q8-mixed - Sports mixtes';
      expectedResults = '400-700 relations pour sports mixtes';

      query = `${prefixes}

SELECT DISTINCT ?vi ?vd ?categoryVI ?categoryVD ?analysis ?relationDirection ?sportCategory
WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation ;
              iadas:hasSport ?sport_info .
    
    ?analysis iadas:sportPracticeType "Mixed sport" .
    
    ?relation iadas:hasIndependentVariable ?variableVI ;
              iadas:hasDependentVariable ?variableVD .
    
    ?variableVI iadas:refersToVariable ?viURI .
    BIND(REPLACE(STR(?viURI), ".*ACAD-vocab/", "") AS ?vi)
    BIND(REPLACE(?vi, '_', ' ') AS ?viLabel)
    OPTIONAL { SELECT ?viLabel (MIN(REPLACE(REPLACE(STR(?catVIURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVI) WHERE { ?viConcept skos:prefLabel ?viLabel . ?viConcept skos:broader ?catVIURIRaw } GROUP BY ?viLabel }
    
    ?variableVD iadas:refersToVariable ?vdURI .
    BIND(REPLACE(STR(?vdURI), ".*ACAD-vocab/", "") AS ?vd)
    BIND(REPLACE(?vd, '_', ' ') AS ?vdLabel)
    OPTIONAL { SELECT ?vdLabel (MIN(REPLACE(REPLACE(STR(?catVDURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVD) WHERE { ?vdConcept skos:prefLabel ?vdLabel . ?vdConcept skos:broader ?catVDURIRaw } GROUP BY ?vdLabel }
    
    OPTIONAL { ?analysis iadas:relationDirection ?relationDirection }
    BIND("Mixed sport" AS ?sportCategory)
}
ORDER BY ?vi ?vd
`;
      break;

    case 'q8-aesthetic':
      console.log(" CASE Q8-AESTHETIC DÉTECTÉ: Sports esthétiques");
      selectedCase = 'q8-aesthetic - Sports esthétiques';
      expectedResults = '250-500 relations pour sports esthétiques';

      query = `${prefixes}

SELECT DISTINCT ?vi ?vd ?categoryVI ?categoryVD ?analysis ?relationDirection ?sportCategory
WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation ;
              iadas:hasSport ?sport_info .
    
    ?analysis iadas:sportPracticeType "Aesthetic" .
    
    ?relation iadas:hasIndependentVariable ?variableVI ;
              iadas:hasDependentVariable ?variableVD .
    
    ?variableVI iadas:refersToVariable ?viURI .
    BIND(REPLACE(STR(?viURI), ".*ACAD-vocab/", "") AS ?vi)
    BIND(REPLACE(?vi, '_', ' ') AS ?viLabel)
    OPTIONAL { SELECT ?viLabel (MIN(REPLACE(REPLACE(STR(?catVIURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVI) WHERE { ?viConcept skos:prefLabel ?viLabel . ?viConcept skos:broader ?catVIURIRaw } GROUP BY ?viLabel }
    
    ?variableVD iadas:refersToVariable ?vdURI .
    BIND(REPLACE(STR(?vdURI), ".*ACAD-vocab/", "") AS ?vd)
    BIND(REPLACE(?vd, '_', ' ') AS ?vdLabel)
    OPTIONAL { SELECT ?vdLabel (MIN(REPLACE(REPLACE(STR(?catVDURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVD) WHERE { ?vdConcept skos:prefLabel ?vdLabel . ?vdConcept skos:broader ?catVDURIRaw } GROUP BY ?vdLabel }
    
    OPTIONAL { ?analysis iadas:relationDirection ?relationDirection }
    BIND("Aesthetic" AS ?sportCategory)
}
ORDER BY ?vi ?vd
`;
      break;

    default:
      console.error(" CASE DEFAULT DÉCLENCHÉ !");
      console.error(" Question ID non reconnue:", questionId);
      console.error(" Valeurs possibles attendues:");
      console.error("   - q1, q2-protecteur, q2-risque, q2-ambigu");
      console.error("   - q3-intrapersonnels, q3-interpersonnels");
      console.error("   - q3-socioenvironnementaux, q3-autres");
      console.error("   - q6-female, q6-male, q6-mixed");
      console.error("   - q7-volleyball-men-21");
      console.error("   - q8-individual, q8-team, q8-mixed, q8-aesthetic");
      console.log("🔧 Utilisation d'une requête par défaut...");

      selectedCase = 'DEFAULT - Requête générale de secours';
      expectedResults = '100-200 relations générales';

      // Requête par défaut plus ciblée
      query = `${prefixes}

SELECT DISTINCT ?analysis ?vi ?vd ?categoryVI ?categoryVD ?relationDirection 
WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation .
    
    ?relation iadas:hasIndependentVariable ?variableVI ;
              iadas:hasDependentVariable ?variableVD .
    
    ?variableVI iadas:refersToVariable ?viURI .
    BIND(REPLACE(STR(?viURI), ".*ACAD-vocab/", "") AS ?vi)
    BIND(REPLACE(?vi, '_', ' ') AS ?viLabel)
    OPTIONAL { SELECT ?viLabel (MIN(REPLACE(REPLACE(STR(?catVIURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVI) WHERE { ?viConcept skos:prefLabel ?viLabel . ?viConcept skos:broader ?catVIURIRaw } GROUP BY ?viLabel }
    
    ?variableVD iadas:refersToVariable ?vdURI .
    BIND(REPLACE(STR(?vdURI), ".*ACAD-vocab/", "") AS ?vd)
    BIND(REPLACE(?vd, '_', ' ') AS ?vdLabel)
    OPTIONAL { SELECT ?vdLabel (MIN(REPLACE(REPLACE(STR(?catVDURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVD) WHERE { ?vdConcept skos:prefLabel ?vdLabel . ?vdConcept skos:broader ?catVDURIRaw } GROUP BY ?vdLabel }
    
    OPTIONAL { ?analysis iadas:relationDirection ?relationDirection }
}
ORDER BY ?analysis
LIMIT 200`;
      break;
  }



  return query;
}

function getFilterDescription(questionId) {
  const descriptions = {
    'q1': 'Toutes les relations ACAD ↔ Facteurs',
    'q2-protecteur': 'Uniquement relations PROTECTRICES (-)',
    'q2-risque': 'Uniquement relations de RISQUE (+)',
    'q2-ambigu': 'Uniquement relations AMBIGUËS (NS)',
    'q3-intrapersonnels': 'Uniquement facteurs INTRAPERSONNELS',
    'q3-interpersonnels': 'Uniquement facteurs INTERPERSONNELS',
    'q3-socioenvironnementaux': 'Uniquement facteurs SOCIO-ENVIRONNEMENTAUX',
    'q3-autres': 'Uniquement AUTRES COMPORTEMENTS',
    'q6-female': 'Relations chez les FEMMES',
    'q6-male': 'Relations chez les HOMMES',
    'q6-mixed': 'Relations populations MIXTES',
    'q7-volleyball-men-21': 'Hommes volleyball âge moyen 21 ans',
    'q8-individual': 'Relations SPORTS INDIVIDUELS',
    'q8-team': 'Relations SPORTS D\'ÉQUIPE',
    'q8-mixed': 'Relations SPORTS MIXTES',
    'q8-aesthetic': 'Relations SPORTS ESTHÉTIQUES'
  };

  return descriptions[questionId] || 'Requête générale par défaut';
}

// Fonction de fallback simplifiée
function generateFallbackQuery() {
  console.log(" GÉNÉRATION REQUÊTE DE FALLBACK");

  return `
PREFIX iadas: <http://ns.inria.fr/iadas/ontology/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX iadas-data: <http://ns.inria.fr/iadas/data/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

SELECT ?analysis ?vi ?vd ?categoryVI ?categoryVD ?mediator ?moderator ?relationDirection WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation .
    ?relation iadas:hasIndependentVariable ?variableVI ;
              iadas:hasDependentVariable ?variableVD .
    
    ?variableVI iadas:refersToVariable ?viURI .
    BIND(REPLACE(STR(?viURI), ".*ACAD-vocab/", "") AS ?vi)
    BIND(REPLACE(?vi, '_', ' ') AS ?viLabel)
    OPTIONAL { SELECT ?viLabel (MIN(REPLACE(REPLACE(STR(?catVIURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVI) WHERE { ?viConcept skos:prefLabel ?viLabel . ?viConcept skos:broader ?catVIURIRaw } GROUP BY ?viLabel }
    
    ?variableVD iadas:refersToVariable ?vdURI .
    BIND(REPLACE(STR(?vdURI), ".*ACAD-vocab/", "") AS ?vd)
    BIND(REPLACE(?vd, '_', ' ') AS ?vdLabel)
    OPTIONAL { SELECT ?vdLabel (MIN(REPLACE(REPLACE(STR(?catVDURIRaw), ".*/", ""), "%20", " ")) AS ?categoryVD) WHERE { ?vdConcept skos:prefLabel ?vdLabel . ?vdConcept skos:broader ?catVDURIRaw } GROUP BY ?vdLabel }
    
    OPTIONAL { ?analysis iadas:relationDirection ?relationDirection }
    OPTIONAL { ?analysis iadas:hasMediator ?mediator }
    OPTIONAL { ?analysis iadas:hasModerator ?moderator }
}
ORDER BY ?analysis
LIMIT 100`;
}

// Serveur HTTP complet
http.createServer(async (req, res) => {
  // Headers CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url.startsWith('/api/interface-data') && req.method === 'GET') {
    try {
      console.log('\n=== RÉCUPÉRATION DONNÉES INTERFACE ===');
      
      const urlParts = req.url.split('?');
      const params = new URLSearchParams(urlParts[1] || '');
      
      console.log('Paramètres de filtrage:', Object.fromEntries(params));
      
      const fusekiEndpoint = 'http://fuseki:3030/ds/sparql';
      
      // Requêtes pour alimenter l'interface depuis les ontologies hiérarchiques
      const queries = {
        acads: `
PREFIX iadas: <http://ns.inria.fr/iadas/ontology/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?acad (COUNT(*) as ?count) 
WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation .
    ?relation iadas:hasDependentVariable ?vd .
    ?vd iadas:refersToVariable ?vdURI .
    BIND(REPLACE(STR(?vdURI), ".*ACAD-vocab/", "") AS ?acad)
}
GROUP BY ?acad
ORDER BY DESC(?count)`,

        factorsVI: `
PREFIX iadas: <http://ns.inria.fr/iadas/ontology/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

SELECT DISTINCT ?vi (COUNT(*) as ?count)
WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation .
    ?relation iadas:hasIndependentVariable ?variableVI .
    
    ?variableVI iadas:refersToVariable ?viURI .
    BIND(REPLACE(STR(?viURI), ".*ACAD-vocab/", "") AS ?vi)
    
    ${params.get('categoryVI') ? `?viFilterSKOS skos:prefLabel ?viLabel . ?viFilterSKOS skos:broader+ ?viTopCat . ?viTopCat skos:prefLabel "${params.get('categoryVI')}" .` : ''}
}
GROUP BY ?vi
ORDER BY DESC(?count)`,

        factorsVD: `
PREFIX iadas: <http://ns.inria.fr/iadas/ontology/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

SELECT DISTINCT ?vd (COUNT(*) as ?count)
WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation .
    ?relation iadas:hasDependentVariable ?variableVD .
    
    ?variableVD iadas:refersToVariable ?vdURI .
    BIND(REPLACE(STR(?vdURI), ".*ACAD-vocab/", "") AS ?vd)
    
    ${params.get('categoryVD') ? `?vdFilterSKOS skos:prefLabel ?vdLabel . ?vdFilterSKOS skos:broader+ ?vdTopCat . ?vdTopCat skos:prefLabel "${params.get('categoryVD')}" .` : ''}
}
GROUP BY ?vd
ORDER BY DESC(?count)`,

        categoriesVD: `
PREFIX iadas: <http://ns.inria.fr/iadas/ontology/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?category (COUNT(*) as ?count)
WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation .
    ?relation iadas:hasDependentVariable ?variableVD .
    ?variableVD iadas:refersToVariable ?vdCatURI .
    ?vdCatURI skos:broader+ ?catURI .
    FILTER NOT EXISTS { ?catURI skos:broader ?x }
    ?catURI skos:prefLabel ?category .
}
GROUP BY ?category
ORDER BY DESC(?count)`,

        categoriesVI: `
PREFIX iadas: <http://ns.inria.fr/iadas/ontology/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

SELECT DISTINCT ?category (COUNT(*) as ?count)
WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasRelation ?relation .
    ?relation iadas:hasIndependentVariable ?variableVI .
    ?variableVI iadas:refersToVariable ?viURI .
    ?viURI skos:broader+ ?catURI .
    FILTER NOT EXISTS { ?catURI skos:broader ?x }
    ?catURI skos:prefLabel ?category .
}
GROUP BY ?category
ORDER BY DESC(?count)`,

        sports: `
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX iadas: <http://ns.inria.fr/iadas/ontology/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?sport
WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:hasSport ?sportURI .
    BIND(REPLACE(STR(?sportURI), ".*sport-vocab/", "") AS ?sport)
    ${params.get('sportCategory') ? `
    ?analysis iadas:sportPracticeType "${params.get('sportCategory')}" .
    ` : ''}
}
ORDER BY ?sport`,

        sportCategories: `
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX iadas: <http://ns.inria.fr/iadas/ontology/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?category 
WHERE {
    ?analysis a iadas:Analysis .
    ?analysis iadas:sportPracticeType ?category .
}
ORDER BY ?category`,

        countries: `
PREFIX iadas: <http://ns.inria.fr/iadas/ontology/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?country (COUNT(*) as ?count)
WHERE {
    ?analysis a iadas:Analysis .
    ?article a iadas:SportPsychologyArticle .
    ?article iadas:hasAnalysis ?analysis .
    ?article iadas:country ?country .
}
GROUP BY ?country
ORDER BY DESC(?count)`
      };

      // Exécuter toutes les requêtes en parallèle
      const results = {};
      
      for (const [key, query] of Object.entries(queries)) {
        try {
          console.log(`Exécution requête: ${key}`);
          const data = await executeWithRetry(fusekiEndpoint, query, 2);
          results[key] = data.results?.bindings || [];
          console.log(`${key}: ${results[key].length} résultats`);
        } catch (error) {
          console.error(`Erreur requête ${key}:`, error.message);
          results[key] = [];
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: results,
        timestamp: new Date().toISOString()
      }));

    } catch (error) {
      console.error('Erreur récupération données interface:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }));
    }
    return;
  }

  if (req.url === '/api/export/turtle' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', async () => {
      try {
        console.log('\n=== EXPORT TURTLE DEMANDÉ ===');
        const requestData = JSON.parse(body);
        
        if (!requestData.sparqlResults) {
          throw new Error('Données SPARQL manquantes');
        }
        
        const turtleData = convertSparqlToTurtle(requestData.sparqlResults, requestData.metadata || {});
        
        res.writeHead(200, { 'Content-Type': 'text/turtle; charset=utf-8' });
        res.end(turtleData);
        
      } catch (error) {
        console.error('Erreur export Turtle:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Erreur lors de l\'export Turtle',
          message: error.message
        }));
      }
    });
    return;
  }

  if (req.url === '/delete-analysis' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', async () => {
      const startTime = Date.now();

      try {
        console.log('\n=== DÉBUT DELETE ANALYSIS ===');
        console.log('Timestamp:', new Date().toISOString());

        const requestData = JSON.parse(body);
        console.log('📋 Données reçues:', {
          hasQuery: !!requestData.rawSparqlQuery,
          operation: requestData.operation,
          analysisId: requestData.analysisId
        });

        // Vérifier les données reçues
        if (!requestData.rawSparqlQuery) {
          throw new Error('Aucune requête SPARQL fournie');
        }

        if (requestData.operation !== 'delete') {
          throw new Error('Opération de suppression non spécifiée');
        }

        // Exécuter la requête DELETE
        console.log('🗑️ Exécution de la requête DELETE...');
        const deleteResult = await executeSparqlUpdate(requestData.rawSparqlQuery);

        const totalTime = Date.now() - startTime;

        console.log(`✅ SUPPRESSION RÉUSSIE en ${totalTime}ms`);
        console.log(`📊 Analyse ${requestData.analysisId} supprimée`);

        // Réponse de succès
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: `Analyse ${requestData.analysisId} supprimée avec succès !`,
          result: deleteResult,
          executionTime: totalTime,
          analysisId: requestData.analysisId,
          timestamp: new Date().toISOString()
        }));

      } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error('\n💥 ERREUR CRITIQUE DELETE ANALYSIS:');
        console.error(`   Message: ${error.message}`);
        console.error(`   Temps écoulé: ${totalTime}ms`);

        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          message: 'Erreur serveur lors de la suppression de l\'analyse',
          error: error.message,
          executionTime: totalTime,
          timestamp: new Date().toISOString()
        }));
      }
    });
    return;
  }

  if (req.url === '/update-analysis' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', async () => {
      const startTime = Date.now();

      try {
        console.log('\n=== DÉBUT UPDATE ANALYSIS ===');
        console.log('Timestamp:', new Date().toISOString());

        const requestData = JSON.parse(body);
        console.log(' Données reçues:', {
          hasFormData: !!requestData.formData,
          hasSparqlQueries: !!requestData.sparqlQueries,
          queryCount: requestData.sparqlQueries ? Object.keys(requestData.sparqlQueries).length : 0
        });

        // Vérifier les données reçues
        if (!requestData.sparqlQueries) {
          throw new Error('Aucune requête SPARQL fournie');
        }

        const queries = requestData.sparqlQueries;

        // Exécuter toutes les requêtes UPDATE
        const updateResults = await executeMultipleSparqlUpdates(queries);

        const totalTime = Date.now() - startTime;

        

        if (updateResults.errors.length > 0) {
          updateResults.errors.forEach(err => {
            console.log(`   - ${err.queryName}: ${err.error}`);
          });
        }

        // Réponse selon le succès
        if (updateResults.errorCount === 0) {
          // Succès complet
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            message: `Analyse ajoutée avec succès! ${updateResults.successCount} objets créés.`,
            results: updateResults,
            executionTime: totalTime,
            analysisId: requestData.formData?.analysisId || 'unknown',
            timestamp: new Date().toISOString()
          }));

        } else if (updateResults.successCount > 0) {
          // Succès partiel
          res.writeHead(207, { 'Content-Type': 'application/json' }); // 207 Multi-Status
          res.end(JSON.stringify({
            success: false,
            message: `Analyse partiellement ajoutée. ${updateResults.successCount}/${updateResults.totalQueries} objets créés.`,
            results: updateResults,
            executionTime: totalTime,
            analysisId: requestData.formData?.analysisId || 'unknown',
            timestamp: new Date().toISOString()
          }));

        } else {
          // Échec complet
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            message: 'Échec complet de l\'ajout de l\'analyse.',
            results: updateResults,
            executionTime: totalTime,
            analysisId: requestData.formData?.analysisId || 'unknown',
            timestamp: new Date().toISOString()
          }));
        }

      } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error('\n ERREUR CRITIQUE UPDATE ANALYSIS:');
        console.error(`   Message: ${error.message}`);
        console.error(`   Temps écoulé: ${totalTime}ms`);

        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          message: 'Erreur serveur lors de l\'ajout de l\'analyse',
          error: error.message,
          executionTime: totalTime,
          timestamp: new Date().toISOString()
        }));
      }
    });
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', async () => {
      const startTime = Date.now();
      let sparqlQuery = null;
      let usedFallback = false;

      try {
        const requestPayload = JSON.parse(body);
        console.log(" DÉBUT DU TRAITEMENT");
        console.log(" Timestamp:", new Date().toISOString());

        // Configuration Fuseki
        const fusekiEndpoint = 'http://fuseki:3030/ds/sparql';

       
        if (requestPayload.queryType === 'predefined_competence') {
        
          sparqlQuery = generateCompetenceQuery(requestPayload.questionId);

          if (!sparqlQuery) {
            throw new Error(`Question de compétence non reconnue: ${requestPayload.questionId}`);
          }

          console.log(" Requête de compétence générée avec succès");
          console.log(" Longueur de la requête:", sparqlQuery.length, "caractères");

        } else if (requestPayload.queryType === 'raw_sparql') {
          console.log(" REQUÊTE SPARQL BRUTE");

          sparqlQuery = requestPayload.rawSparqlQuery;
          console.log(" Requête SPARQL brute utilisée");

        } else if (requestPayload.queryType === 'hierarchy') {
          console.log(" REQUÊTE HIÉRARCHIE");
          console.log(" Concept:", requestPayload.concept);

          sparqlQuery = generateHierarchyQuery(requestPayload.concept);

        } else {
          console.log("REQUÊTE DE RECHERCHE NORMALE (avec filtres)");

          // Utiliser generateSparqlQuery SEULEMENT pour les requêtes normales
          sparqlQuery = generateSparqlQuery(requestPayload);
          console.log(" Requête avec filtres générée");
        }

        console.log(" Type final de requête déterminé");
        console.log(" Requête finale prête pour exécution");

        // 🔥 WARMUP CONDITIONNEL (seulement si pas fait au démarrage)
        if (!isFusekiWarmed) {
          console.log("WARMUP NÉCESSAIRE - Fuseki pas encore chaud...");
          const warmupSuccess = await warmupFuseki(fusekiEndpoint);
          if (!warmupSuccess) {
            console.log(" Warmup échoué - on continue quand même...");
          } else {
            console.log(" Warmup réussi - Fuseki est prêt !");
          }
        } else {
          console.log(" WARMUP SKIPPÉ - Fuseki déjà chaud depuis le démarrage !");
        }

        if (!sparqlQuery || sparqlQuery.trim() === '') {
          throw new Error("Requête SPARQL vide générée");
        }

        console.log(" Exécution requête principale...");

        let data;
        try {
          data = await executeWithRetry(fusekiEndpoint, sparqlQuery, MAX_RETRIES);

        } catch (mainError) {
          console.log(" TENTATIVE FALLBACK après échec principal...");

          try {
            // Essayer la requête fallback
            const fallbackQuery = generateFallbackQuery();
            data = await executeWithRetry(fusekiEndpoint, fallbackQuery, 2);
            usedFallback = true;
            console.log(" FALLBACK RÉUSSI");

            // Ajouter un warning
            data.warning = "Requête simplifiée utilisée à cause d'un timeout";

          } catch (fallbackError) {
            console.error(" FALLBACK AUSSI ÉCHOUÉ:", fallbackError.message);
            throw mainError; // Relancer l'erreur principale
          }
        }

        const queryTime = Date.now() - startTime;
        const resultCount = data.results?.bindings?.length || 0;

        console.log(" SUCCÈS COMPLET!");
        console.log(` Résultats trouvés: ${resultCount}`);
        console.log(` Temps total: ${queryTime}ms`);

        if (resultCount > 0) {
          const firstResult = data.results.bindings[0];
          const availableVars = Object.keys(firstResult);
          const expectedVars = ['analysis', 'vi', 'vd', 'categoryVI', 'categoryVD', 'mediator', 'moderator', 'relationDirection'];

          console.log(" VÉRIFICATION COMPATIBILITÉ PARSER:");
          console.log(`   Variables disponibles: ${availableVars.join(', ')}`);
          console.log(`   Variables attendues: ${expectedVars.join(', ')}`);

          expectedVars.forEach(varName => {
            const present = availableVars.includes(varName);
            const sampleValue = firstResult[varName]?.value || 'VIDE';
            console.log(`   ${present ? '✅' : '❌'} ${varName}: ${present ? sampleValue : 'MANQUANT'}`);
          });

          // Statistiques de complétude
          const stats = {};
          expectedVars.forEach(varName => {
            const count = data.results.bindings.filter(b => b[varName]?.value).length;
            stats[varName] = {
              count: count,
              percentage: ((count / resultCount) * 100).toFixed(1)
            };
          });

          Object.entries(stats).forEach(([varName, stat]) => {
            console.log(`   ${varName}: ${stat.count}/${resultCount} (${stat.percentage}%)`);
          });
        }

        // Ajouter métadonnées étendues
        data.performance = {
          queryTime: queryTime,
          resultCount: resultCount,
          usedFallback: usedFallback,
          usedRetry: true,
          maxRetries: MAX_RETRIES,
          timestamp: new Date().toISOString(),
          parserCompatible: true,
          availableVariables: resultCount > 0 ? Object.keys(data.results.bindings[0]) : [],
          fusekiWarmed: isFusekiWarmed
        };

        // Ajouter la requête SPARQL générée dans la réponse
        data.generatedQuery = sparqlQuery;
        data.query = sparqlQuery; // Alias pour compatibilité
        data.sparqlQuery = sparqlQuery; // Autre alias

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));

      } catch (err) {
        const totalTime = Date.now() - startTime;
        console.error(" ERREUR CRITIQUE FINALE:");
        console.error(`   Message: ${err.message}`);
        console.error(`   Temps écoulé: ${totalTime}ms`);

        let statusCode = 500;
        let errorType = 'internal_error';

        if (err.message.includes('timeout') || totalTime > FUSEKI_TIMEOUT) {
          statusCode = 408;
          errorType = 'timeout';
        } else if (err.message.includes('503')) {
          statusCode = 503;
          errorType = 'service_unavailable';
        } else if (err.message.includes('JSON')) {
          statusCode = 400;
          errorType = 'invalid_request';
        }

        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Erreur SPARQL Generator avec Retry',
          type: errorType,
          message: err.message,
          timestamp: new Date().toISOString(),
          queryTime: totalTime,
          debugging: {
            usedFallback: usedFallback,
            maxRetries: MAX_RETRIES,
            queryLength: sparqlQuery?.length || 0,
            endpoint: 'fuseki:3030/ds/sparql',
            warmupAttempted: true,
            fusekiWarmed: isFusekiWarmed
          }
        }));
      }
    });
  } else {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Méthode non autorisée');
  }
}).listen(8003, '0.0.0.0', () => {
  

  warmupPromise = performStartupWarmup();
});