// Parser pour affichage ontologique avec filtrage intelligent des liens
class SPARQLDataParser {
  
  // Palettes de couleurs par catégorie
  static acadColorPalette = {
    "DEAB": "#f54542ff",        // Rouge foncé pour DEAB
    "Multiple": "#821111ff",    // Rouge moyen pour Multiple
    "default": "#F44336"      // Rouge par défaut
  };

  static factorColorPalette = {
    "Interpersonal factor related to DEAB": "#00112bff",    // Bleu très foncé
    "Intrapersonal factor related to DEAB": "#0050acff",    // Bleu foncé
    "Other behaviors": "#72a4d7ff",                          // Bleu moyen
    "Sociocultural factor related to DEAB": "#bee0fdff",    // Bleu clair
    "default": "#64B5F6"                                   // Bleu très clair par défaut
  };

  static relationColorPalette = {
    "+": "#E53E3E",          // Rouge pour risque
    "-": "#38A169",          // Vert pour protecteur
    "NS": "#718096",         // Gris pour non significatif
    "default": "#A0AEC0"     // Gris clair par défaut
  };

  static parse(sparqlData) {
    if (!sparqlData || !sparqlData.results || !sparqlData.results.bindings) {
      throw new Error('Format de données SPARQL invalide');
    }
    
    const vars = sparqlData.head.vars;
    const bindings = sparqlData.results.bindings;
    
    return {
      variables: vars,
      data: bindings.map(binding => this.parseBinding(binding, vars)),
      networkData: this.createConcreteOntologyNetwork(bindings, vars),
      rawData: sparqlData
    };
  }
  
  static parseBinding(binding, vars) {
    const parsed = {};
    
    vars.forEach(varName => {
      if (binding[varName]) {
        parsed[varName] = this.parseValue(binding[varName]);
      } else {
        parsed[varName] = null;
      }
    });
    
    return parsed;
  }
  
  static parseValue(sparqlValue) {
    const value = sparqlValue.value;
    const type = sparqlValue.type;
    const datatype = sparqlValue.datatype;
    
    if (type === 'literal') {
      if (datatype) {
        if (datatype.includes('decimal') || datatype.includes('double') || datatype.includes('float')) {
          return parseFloat(value);
        }
        if (datatype.includes('integer') || datatype.includes('int')) {
          return parseInt(value);
        }
        if (datatype.includes('boolean')) {
          return value === 'true';
        }
      }
      return value;
    }
    
    return value;
  }

  // Extraire l'ID d'analyse depuis l'URI
  static extractAnalysisId(analysisUri) {
    if (!analysisUri) return 'unknown';
    
    const match = analysisUri.match(/Analysis_(.+)$/);
    return match ? match[1] : 'unknown';
  }

  static getColorByCategory(type, category) {
    
    switch (type) {
      case 'acad':
      case 'VD':
        const acadColor = this.acadColorPalette[category] || this.acadColorPalette.default;
        console.log(`   → Couleur ACAD: ${acadColor}`);
        return acadColor;
        
      case 'factor':
      case 'VI':
        const factorColor = this.factorColorPalette[category] || this.factorColorPalette.default;
        console.log(`   → Couleur Facteur: ${factorColor}`);
        return factorColor;
        
      case 'mediator':
        return '#FFD700'; // Jaune pour médiateurs
        
      case 'moderator':
        return '#FF8C00'; // Orange pour modérateurs
        
      default:
        return '#808080'; // Gris par défaut
    }
  }

  static getRelationColor(relation) {
    const color = this.relationColorPalette[relation] || this.relationColorPalette.default;
    return color;
  }
  
  static createConcreteOntologyNetwork(bindings, vars) {
    const nodes = [];
    const links = [];
    const nodeMap = new Map(); // Pour éviter les doublons de nœuds
    const allRelations = []; // Stocker TOUTES les relations avant filtrage
    
    console.log("=== PARSER AVEC FILTRAGE INTELLIGENT ===");
    console.log("Variables disponibles:", vars);
    console.log("Nombre de résultats:", bindings.length);
    
    bindings.forEach((binding, index) => {
      console.log(`\n--- Résultat ${index + 1} ---`);
      
      // Extraire toutes les données
      const analysisUri = binding.analysis ? this.parseValue(binding.analysis) : null;
      const analysisId = this.extractAnalysisId(analysisUri);
      const vi = binding.vi ? this.parseValue(binding.vi) : null;
      const vd = binding.vd ? this.parseValue(binding.vd) : null;
      const categoryVI = binding.categoryVI ? this.parseValue(binding.categoryVI) : null;
      const categoryVD = binding.categoryVD ? this.parseValue(binding.categoryVD) : null;
      const mediator = binding.mediator ? this.parseValue(binding.mediator) : null;
      const moderator = binding.moderator ? this.parseValue(binding.moderator) : null;
      const relation = binding.resultatRelation ? this.parseValue(binding.resultatRelation) : null;
      
      console.log(`Analysis ID: ${analysisId}`);
      console.log(`VI (facteur): ${vi} [Catégorie: ${categoryVI}]`);
      console.log(`VD (ACAD): ${vd} [Catégorie: ${categoryVD}]`);
      console.log(`Médiateur: ${mediator}`);
      console.log(`Modérateur: ${moderator}`);
      console.log(`Relation: ${relation}`);

      // Créer nœud facteur UNIQUE (pas par analyse)
      if (vi) {
        const factorNodeId = `factor_${vi}`;
        if (!nodeMap.has(factorNodeId)) {
          nodes.push({
            id: factorNodeId,
            label: vi,
            type: 'factor',
            category: categoryVI,
            size: 20, // Taille fixe
            color: this.getColorByCategory('factor', categoryVI),
            analyses: [] // Liste des analyses liées
          });
          nodeMap.set(factorNodeId, nodes.length - 1);
        }
        // Ajouter l'analyse à la liste
        const nodeIndex = nodeMap.get(factorNodeId);
        if (!nodes[nodeIndex].analyses.includes(analysisId)) {
          nodes[nodeIndex].analyses.push(analysisId);
        }
      }
      
      // Créer nœud ACAD UNIQUE (pas par analyse)
      if (vd) {
        const acadNodeId = `acad_${vd}`;
        if (!nodeMap.has(acadNodeId)) {
          nodes.push({
            id: acadNodeId,
            label: vd,
            type: 'acad',
            category: categoryVD,
            size: 20, // Taille fixe
            color: this.getColorByCategory('acad', categoryVD),
            analyses: []
          });
          nodeMap.set(acadNodeId, nodes.length - 1);
        }
        const nodeIndex = nodeMap.get(acadNodeId);
        if (!nodes[nodeIndex].analyses.includes(analysisId)) {
          nodes[nodeIndex].analyses.push(analysisId);
        }
      }
     
      // Créer nœud médiateur UNIQUE (pas par analyse)
      if (mediator && mediator !== 'N.A.' && mediator.trim() !== '') {
        const mediatorNodeId = `mediator_${mediator}`;
        if (!nodeMap.has(mediatorNodeId)) {
          nodes.push({
            id: mediatorNodeId,
            label: mediator,
            type: 'mediator',
            size: 15, // Taille fixe
            color: this.getColorByCategory('mediator', null),
            analyses: []
          });
          nodeMap.set(mediatorNodeId, nodes.length - 1);
        }
        const nodeIndex = nodeMap.get(mediatorNodeId);
        if (!nodes[nodeIndex].analyses.includes(analysisId)) {
          nodes[nodeIndex].analyses.push(analysisId);
        }
      }
   
      // Créer nœud modérateur UNIQUE (pas par analyse)
      if (moderator && moderator !== 'N.A.' && moderator.trim() !== '') {
        const moderatorNodeId = `moderator_${moderator}`;
        if (!nodeMap.has(moderatorNodeId)) {
          nodes.push({
            id: moderatorNodeId,
            label: moderator,
            type: 'moderator',
            size: 15, // Taille fixe
            color: this.getColorByCategory('moderator', null),
            analyses: []
          });
          nodeMap.set(moderatorNodeId, nodes.length - 1);
        }
        const nodeIndex = nodeMap.get(moderatorNodeId);
        if (!nodes[nodeIndex].analyses.includes(analysisId)) {
          nodes[nodeIndex].analyses.push(analysisId);
        }
      }
     
    if (vi && vd) {
      const hasMediator = mediator && mediator !== 'N.A.' && mediator.trim() !== '';
      const hasModerator = moderator && moderator !== 'N.A.' && moderator.trim() !== '';
      
      if (hasMediator) {
        // Relations via médiateur
        allRelations.push({
          source: `factor_${vi}`,
          target: `mediator_${mediator}`,
          relation: 'mediator',
          label: 'via médiateur',
          type: 'factor-mediator',
          analysisId: analysisId,
          color: '#f39c12'
        });
        
        allRelations.push({
          source: `mediator_${mediator}`,
          target: `acad_${vd}`,
          relation: relation || 'unknown',
          label: relation || 'relation',
          type: 'mediator-acad',
          analysisId: analysisId,
          color: this.getRelationColor(relation)
        });
        
      } else if (hasModerator) {
        // Relations via modérateur
        allRelations.push({
          source: `factor_${vi}`,
          target: `moderator_${moderator}`,
          relation: 'moderator',
          label: 'via modérateur',
          type: 'factor-moderator',
          analysisId: analysisId,
          color: '#e67e22'
        });
        
        allRelations.push({
          source: `moderator_${moderator}`,
          target: `acad_${vd}`,
          relation: relation || 'unknown',
          label: relation || 'relation',
          type: 'moderator-acad',
          analysisId: analysisId,
          color: this.getRelationColor(relation)
        });
        
      } else {
        // Relations directes
        allRelations.push({
          source: `factor_${vi}`,
          target: `acad_${vd}`,
          relation: relation || 'unknown',
          label: relation || 'relation',
          type: 'factor-acad',
          analysisId: analysisId,
          color: this.getRelationColor(relation)
        });
      }
    }
    }); 
    
    const filteredLinks = this.applySmartFiltering(allRelations);
    
    console.log(` RÉSULTAT FILTRÉ: ${nodes.length} nœuds, ${filteredLinks.length} liens (sur ${allRelations.length} originaux)`);
    console.log("Nœuds:", nodes);
    console.log("Liens filtrés:", filteredLinks);
    
    return { nodes, links: filteredLinks };
  }

  static applySmartFiltering(allRelations) {
    
    // Grouper par paire source-target
    const relationGroups = new Map();
    
    allRelations.forEach(rel => {
      const pairKey = `${rel.source}_${rel.target}`;
      
      if (!relationGroups.has(pairKey)) {
        relationGroups.set(pairKey, {
          '+': [],
          '-': [],
          'NS': [],
          'mediator': [],
          'moderator': [],
          'unknown': []
        });
      }
      
      const group = relationGroups.get(pairKey);
      
      // ✅ CORRECTION : Gérer les relations undefined/null → mettre NS
      const relationType = rel.relation || 'NS';
      
      // ✅ CORRECTION : Vérifier que le type existe dans le groupe
      if (group[relationType]) {
        group[relationType].push(rel);
      } else {
        // Si le type n'existe pas, le mettre dans 'NS'
        group['NS'].push(rel);
        console.warn(` Type de relation inconnu: "${rel.relation}" → placé dans 'NS'`);
      }
    });
    
    const filteredLinks = [];
    
    relationGroups.forEach((group, pairKey) => {
      console.log(`\n Paire ${pairKey}:`);
      
      Object.keys(group).forEach(relationType => {
        const relations = group[relationType];
        
        if (relations.length > 0) {
          const representative = relations[0];
          
          const enrichedLink = {
            ...representative,
            id: `${pairKey}_${relationType}`,
            allAnalyses: relations.map(r => r.analysisId),
            count: relations.length,
            detailedLabel: relations.length > 1 
              ? `${representative.label} (${relations.length} analyses)`
              : representative.label
          };
          
          filteredLinks.push(enrichedLink);
          
          console.log(`    ${relationType}: ${relations.length} relations → 1 lien affiché`);
          console.log(`      Analyses: ${relations.map(r => r.analysisId).join(', ')}`);
        }
      });
    });
    
    console.log(` Filtrage terminé: ${allRelations.length} → ${filteredLinks.length} liens`);
    return filteredLinks;
}
  
  // Méthodes utilitaires inchangées
  static translateGender(gender) {
    const translations = {
      'Male': 'Hommes',
      'Female': 'Femmes',
      'Mixed': 'Mixte'
    };
    return translations[gender] || gender;
  }
  
  static translateRelation(relation) {
    const translations = {
      '+': 'Facteur de risque',
      '-': 'Facteur protecteur',
      'NS': 'Relation non significative'
    };
    return translations[relation] || relation;
  }
  
  static getRelationStrength(binding) {
    const degreR = binding.degreR ? this.parseValue(binding.degreR) : null;
    const degreP = binding.degreP ? this.parseValue(binding.degreP) : null;
    
    let strength = '';
    if (degreR) strength += `r=${degreR}`;
    if (degreP) strength += strength ? `, p=${degreP}` : `p=${degreP}`;
    
    return strength || 'Force inconnue';
  }
  
  static detectDataTypes(parsedData) {
    const types = {};
    
    parsedData.variables.forEach(varName => {
      const values = parsedData.data.map(row => row[varName]).filter(v => v !== null);
      
      if (values.length === 0) {
        types[varName] = 'empty';
        return;
      }
      
      const firstValue = values[0];
      
      if (typeof firstValue === 'number') {
        types[varName] = 'numeric';
      } else if (typeof firstValue === 'string') {
        types[varName] = 'categorical';
      } else if (typeof firstValue === 'object' && firstValue.uri) {
        types[varName] = 'uri';
      } else {
        types[varName] = 'unknown';
      }
    });
    
    return types;
  }
}