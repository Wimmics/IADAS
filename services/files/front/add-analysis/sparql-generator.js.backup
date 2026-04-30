// Générateur de requêtes SPARQL INSERT pour l'ontologie IA-DAS
class SPARQLGenerator {
    constructor() {
        this.prefixes = `
PREFIX iadas: <http://ia-das.org/onto#>
PREFIX iadas-data: <http://ia-das.org/data#>
PREFIX bibo: <http://purl.org/ontology/bibo/>
PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>`;
    }

    cleanValue(value) {
        if (!value || value === 'N.A.') return 'N.A.';
        return value.toString().replace(/"/g, '\\"').replace(/\n/g, '\\n');
    }

    // Générer un literal SPARQL avec type
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
            case 'date':
                return `"${cleanedValue}"^^xsd:date`;
            default:
                return `"${cleanedValue}"`;
        }
    }

    // Générer la requête pour l'Article
    generateArticleInsert(data) {
        const doi = this.cleanValue(data.doi);
        const articleURI = `iadas-data:Article_${doi.replace(/[^a-zA-Z0-9]/g, '_')}`;

        return `${this.prefixes}

INSERT DATA {
    ${articleURI} a iadas:SportPsychologyArticle ;
        bibo:doi ${this.literal(data.doi)} ;
        dcterms:title ${this.literal(data.title)} ;
        dcterms:creator ${this.literal(data.authors)} ;
        bibo:journal ${this.literal(data.journal)} ;
        dcterms:date ${this.literal(data.year)} ;
        iadas:country ${this.literal(data.country)} ;
        iadas:studyType ${this.literal(data.studyType)} ;
        iadas:hasAnalysis iadas-data:Analysis_${this.cleanValue(data.analysisId)} .
}`;
    }

    // Générer la requête pour l'Analyse
    generateAnalysisInsert(data) {
        const analysisId = this.cleanValue(data.analysisId);

        return `${this.prefixes}

INSERT DATA {
    iadas-data:Analysis_${analysisId} a iadas:Analysis ;
        iadas:analysisId ${this.literal(data.analysisId)} ;
        iadas:analysisMultiplicity ${this.literal(data.analysisMultiplicity)} ;
        iadas:relationDegree ${this.literal(data.relationDegree)} ;
        iadas:typeOfAnalysis ${this.literal(data.typeOfAnalysis)} ;
        iadas:authorConclusion ${this.literal(data.authorConclusion)} ;
        iadas:limites ${this.literal(data.limites)} ;
        iadas:perspectives ${this.literal(data.perspectives)} ;
        iadas:acads ${this.literal(data.acads)} ;
        iadas:sampleSizeMobilized ${this.literal(data.sampleSizeMobilized, 'integer')} ;
        iadas:hasModerator ${this.literal(data.moderator)} ;
        iadas:moderatorMeasure ${this.literal(data.moderatorMeasure)} ;
        iadas:hasMediator ${this.literal(data.mediator)} ;
        iadas:mediatorMeasure ${this.literal(data.mediatorMeasure)} ;
        iadas:hasPopulation iadas-data:Population_${analysisId} ;
        iadas:hasSport iadas-data:Sport_${analysisId} ;
        iadas:hasRelation iadas-data:Relations_${analysisId} .
}`;
    }

    // Générer la requête pour la Population
    generatePopulationInsert(data) {
        const analysisId = this.cleanValue(data.analysisId);

        return `${this.prefixes}

INSERT DATA {
    iadas-data:Population_${analysisId} a iadas:Population ;
        iadas:sampleSize ${this.literal(data.sampleSize, 'integer')} ;
        iadas:gender ${this.literal(data.gender)} ;
        iadas:population ${this.literal(data.population)} ;
        iadas:inclusionCriteria ${this.literal(data.inclusionCriteria)} ;
        iadas:hasSubgroup ${this.literal(data.hasSubgroup)} ;
        iadas:sportingPopulation ${this.literal(data.sportingPopulation)} ;
        
        iadas:ageStats iadas-data:AgeStats_${analysisId} ;
        iadas:bmiStats iadas-data:BmiStats_${analysisId} ;
        iadas:exerciseFreqStats iadas-data:ExFreqStats_${analysisId} ;
        iadas:experienceStats iadas-data:ExpStats_${analysisId} .
}`;
    }

    // Générer la requête pour les statistiques d'âge
    generateAgeStatsInsert(data) {
        const analysisId = this.cleanValue(data.analysisId);

        return `${this.prefixes}

INSERT DATA {
    iadas-data:AgeStats_${analysisId} a iadas:AgeStatistics ;
        iadas:ageDescription ${this.literal(data.ageDescription)} ;
        iadas:meanAge ${this.literal(data.meanAge, 'decimal')} ;
        iadas:sdAge ${this.literal(data.sdAge, 'decimal')} ;
        iadas:minAge ${this.literal(data.minAge, 'decimal')} ;
        iadas:maxAge ${this.literal(data.maxAge, 'decimal')} .
}`;
    }

    // Générer la requête pour les statistiques d'IMC
    generateBMIStatsInsert(data) {
        const analysisId = this.cleanValue(data.analysisId);

        return `${this.prefixes}

INSERT DATA {
    iadas-data:BmiStats_${analysisId} a iadas:BMIStatistics ;
        iadas:bmiDescription ${this.literal(data.bmiDescription)} ;
        iadas:meanBMI ${this.literal(data.meanBMI, 'decimal')} ;
        iadas:sdBMI ${this.literal(data.sdBMI, 'decimal')} ;
        iadas:minBMI ${this.literal(data.minBMI, 'decimal')} ;
        iadas:maxBMI ${this.literal(data.maxBMI, 'decimal')} .
}`;
    }

    generateExerciseStatsInsert(data) {
        const analysisId = this.cleanValue(data.analysisId);

        return `${this.prefixes}

INSERT DATA {
    iadas-data:ExFreqStats_${analysisId} a iadas:ExerciseFrequencyStatistics ;
        iadas:exerciseFreqDescription ${this.literal(data.exerciseFreqDescription)} ;
        iadas:meanExFR ${this.literal(data.meanExFR, 'decimal')} ;
        iadas:sdExFR ${this.literal(data.sdExFR, 'decimal')} ;
        iadas:minExFR ${this.literal(data.minExFR, 'decimal')} ;
        iadas:maxExFR ${this.literal(data.maxExFR, 'decimal')} ;
        iadas:freqUnit ${this.literal(data.freqUnit)} ;
        iadas:freqBase ${this.literal(data.freqBase)} .
}`;
    }

    generateExperienceStatsInsert(data) {
        const analysisId = this.cleanValue(data.analysisId);

        return `${this.prefixes}

INSERT DATA {
    iadas-data:ExpStats_${analysisId} a iadas:YearsOfExperienceStatistics ;
        iadas:experienceDescription ${this.literal(data.experienceDescription)} ;
        iadas:meanYOE ${this.literal(data.meanYOE, 'decimal')} ;
        iadas:sdYOE ${this.literal(data.sdYOE, 'decimal')} ;
        iadas:minYOE ${this.literal(data.minYOE, 'decimal')} ;
        iadas:maxYOE ${this.literal(data.maxYOE, 'decimal')} ;
        iadas:expUnit ${this.literal(data.expUnit)} .
}`;
    }

    generateSportInsert(data) {
        const analysisId = this.cleanValue(data.analysisId);

        return `${this.prefixes}

INSERT DATA {
    iadas-data:Sport_${analysisId} a iadas:Sport ;
        iadas:sportName ${this.literal(data.sportName)} ;
        iadas:sportLevel ${this.literal(data.sportLevel)} ;
        iadas:sportPracticeType ${this.literal(data.sportPracticeType)} ;
        iadas:sportSubcategory ${this.literal(data.sportSubcategory)} .
}`;
    }

    // Générer la requête pour la Variable Dépendante
    generateVDInsert(data) {
        const analysisId = this.cleanValue(data.analysisId);

        return `${this.prefixes}

INSERT DATA {
    iadas-data:Variable_VD_${analysisId} a iadas:Variable ;
        iadas:variableType "VD" ;
        iadas:hasCategory ${this.literal(data.vdCategory)} ;
        iadas:VD ${this.literal(data.vdName)} ;
        iadas:measure ${this.literal(data.vdMeasure)} ;
        iadas:subClass1 ${this.literal(data.vdSubClass1)} ;
        iadas:subClass2 ${this.literal(data.vdSubClass2)} ;
        iadas:subClass3 ${this.literal(data.vdSubClass3)} ;
        iadas:subClass4 ${this.literal(data.vdSubClass4)} ;
        iadas:finalClass ${this.literal(data.vdName)} .
}`;
    }

    generateVIInsert(data) {
        const analysisId = this.cleanValue(data.analysisId);

        return `${this.prefixes}

INSERT DATA {
    iadas-data:Variable_VI_${analysisId} a iadas:Variable ;
        iadas:variableType "VI" ;
        iadas:hasCategory ${this.literal(data.viCategory)} ;
        iadas:VI ${this.literal(data.viName)} ;
        iadas:measure ${this.literal(data.viMeasure)} ;
        iadas:subClass1 ${this.literal(data.viSubClass1)} ;
        iadas:subClass2 ${this.literal(data.viSubClass2)} ;
        iadas:subClass3 ${this.literal(data.viSubClass3)} ;
        iadas:subClass4 ${this.literal(data.viSubClass4)} ;
        iadas:finalClass ${this.literal(data.viName)} .
}`;
    }

    generateRelationsInsert(data) {
        const analysisId = this.cleanValue(data.analysisId);

        return `${this.prefixes}

INSERT DATA {
    iadas-data:Relations_${analysisId} a iadas:Relations ;
        iadas:degreR ${this.literal(data.degreR, 'decimal')} ;
        iadas:degreP ${this.literal(data.degreP, 'decimal')} ;
        iadas:signeP ${this.literal(data.signeP)} ;
        iadas:degreBeta ${this.literal(data.degreBeta, 'decimal')} ;
        iadas:degreR2 ${this.literal(data.degreR2, 'decimal')} ;
        iadas:resultatRelation ${this.literal(data.resultatRelation)} ;
        iadas:sousGroupeAnalyse ${this.literal(data.sousGroupeAnalyse)} ;
        iadas:sousGroupeAnalyse2 ${this.literal(data.sousGroupeAnalyse2)} ;
        iadas:relationDegreeSecondary ${this.literal(data.relationDegreeSecondary)} ;
        iadas:hasDependentVariable iadas-data:Variable_VD_${analysisId} ;
        iadas:hasIndependentVariable iadas-data:Variable_VI_${analysisId} .
}`;
    }

    generateAllInserts(data) {
        console.log('Génération de toutes les requêtes SPARQL...');
        
        const queries = {
            article: this.generateArticleInsert(data),
            analysis: this.generateAnalysisInsert(data),
            population: this.generatePopulationInsert(data),
            ageStats: this.generateAgeStatsInsert(data),
            bmiStats: this.generateBMIStatsInsert(data),
            exerciseStats: this.generateExerciseStatsInsert(data),
            experienceStats: this.generateExperienceStatsInsert(data),
            sport: this.generateSportInsert(data),
            variableVD: this.generateVDInsert(data),
            variableVI: this.generateVIInsert(data),
            relations: this.generateRelationsInsert(data)
        };

        console.log('Requêtes SPARQL générées:', Object.keys(queries));
        return queries;
    }

    generateCombinedInsert(data) {
        const analysisId = this.cleanValue(data.analysisId);
        const doi = this.cleanValue(data.doi);
        const articleURI = `iadas-data:Article_${doi.replace(/[^a-zA-Z0-9]/g, '_')}`;

        return `${this.prefixes}

INSERT DATA {
    # Article
    ${articleURI} a iadas:SportPsychologyArticle ;
        bibo:doi ${this.literal(data.doi)} ;
        dcterms:title ${this.literal(data.title)} ;
        dcterms:creator ${this.literal(data.authors)} ;
        bibo:journal ${this.literal(data.journal)} ;
        dcterms:date ${this.literal(data.year)} ;
        iadas:country ${this.literal(data.country)} ;
        iadas:studyType ${this.literal(data.studyType)} ;
        iadas:hasAnalysis iadas-data:Analysis_${analysisId} .

    # Analysis
    iadas-data:Analysis_${analysisId} a iadas:Analysis ;
        iadas:analysisId ${this.literal(data.analysisId)} ;
        iadas:analysisMultiplicity ${this.literal(data.analysisMultiplicity)} ;
        iadas:relationDegree ${this.literal(data.relationDegree)} ;
        iadas:typeOfAnalysis ${this.literal(data.typeOfAnalysis)} ;
        iadas:authorConclusion ${this.literal(data.authorConclusion)} ;
        iadas:limites ${this.literal(data.limites)} ;
        iadas:perspectives ${this.literal(data.perspectives)} ;
        iadas:acads ${this.literal(data.acads)} ;
        iadas:sampleSizeMobilized ${this.literal(data.sampleSizeMobilized, 'integer')} ;
        iadas:hasModerator ${this.literal(data.moderator)} ;
        iadas:moderatorMeasure ${this.literal(data.moderatorMeasure)} ;
        iadas:hasMediator ${this.literal(data.mediator)} ;
        iadas:mediatorMeasure ${this.literal(data.mediatorMeasure)} ;
        iadas:hasPopulation iadas-data:Population_${analysisId} ;
        iadas:hasSport iadas-data:Sport_${analysisId} ;
        iadas:hasRelation iadas-data:Relations_${analysisId} .

    # Population
    iadas-data:Population_${analysisId} a iadas:Population ;
        iadas:sampleSize ${this.literal(data.sampleSize, 'integer')} ;
        iadas:gender ${this.literal(data.gender)} ;
        iadas:population ${this.literal(data.population)} ;
        iadas:inclusionCriteria ${this.literal(data.inclusionCriteria)} ;
        iadas:hasSubgroup ${this.literal(data.hasSubgroup)} ;
        iadas:sportingPopulation ${this.literal(data.sportingPopulation)} ;
        
        iadas:ageStats iadas-data:AgeStats_${analysisId} ;
        iadas:bmiStats iadas-data:BmiStats_${analysisId} ;
        iadas:exerciseFreqStats iadas-data:ExFreqStats_${analysisId} ;
        iadas:experienceStats iadas-data:ExpStats_${analysisId} .

    # Age Statistics
    iadas-data:AgeStats_${analysisId} a iadas:AgeStatistics ;
        iadas:ageDescription ${this.literal(data.ageDescription)} ;
        iadas:meanAge ${this.literal(data.meanAge, 'decimal')} ;
        iadas:sdAge ${this.literal(data.sdAge, 'decimal')} ;
        iadas:minAge ${this.literal(data.minAge, 'decimal')} ;
        iadas:maxAge ${this.literal(data.maxAge, 'decimal')} .

    # BMI Statistics
    iadas-data:BmiStats_${analysisId} a iadas:BMIStatistics ;
        iadas:bmiDescription ${this.literal(data.bmiDescription)} ;
        iadas:meanBMI ${this.literal(data.meanBMI, 'decimal')} ;
        iadas:sdBMI ${this.literal(data.sdBMI, 'decimal')} ;
        iadas:minBMI ${this.literal(data.minBMI, 'decimal')} ;
        iadas:maxBMI ${this.literal(data.maxBMI, 'decimal')} .

    # Exercise Frequency Statistics
    iadas-data:ExFreqStats_${analysisId} a iadas:ExerciseFrequencyStatistics ;
        iadas:exerciseFreqDescription ${this.literal(data.exerciseFreqDescription)} ;
        iadas:meanExFR ${this.literal(data.meanExFR, 'decimal')} ;
        iadas:sdExFR ${this.literal(data.sdExFR, 'decimal')} ;
        iadas:minExFR ${this.literal(data.minExFR, 'decimal')} ;
        iadas:maxExFR ${this.literal(data.maxExFR, 'decimal')} ;
        iadas:freqUnit ${this.literal(data.freqUnit)} ;
        iadas:freqBase ${this.literal(data.freqBase)} .

    # Years of Experience Statistics
    iadas-data:ExpStats_${analysisId} a iadas:YearsOfExperienceStatistics ;
        iadas:experienceDescription ${this.literal(data.experienceDescription)} ;
        iadas:meanYOE ${this.literal(data.meanYOE, 'decimal')} ;
        iadas:sdYOE ${this.literal(data.sdYOE, 'decimal')} ;
        iadas:minYOE ${this.literal(data.minYOE, 'decimal')} ;
        iadas:maxYOE ${this.literal(data.maxYOE, 'decimal')} ;
        iadas:expUnit ${this.literal(data.expUnit)} .

    # Sport
    iadas-data:Sport_${analysisId} a iadas:Sport ;
        iadas:sportName ${this.literal(data.sportName)} ;
        iadas:sportLevel ${this.literal(data.sportLevel)} ;
        iadas:sportPracticeType ${this.literal(data.sportPracticeType)} ;
        iadas:sportSubcategory ${this.literal(data.sportSubcategory)} .

    # Variable Dépendante
    iadas-data:Variable_VD_${analysisId} a iadas:Variable ;
        iadas:variableType "VD" ;
        iadas:hasCategory ${this.literal(data.vdCategory)} ;
        iadas:VD ${this.literal(data.vdName)} ;
        iadas:measure ${this.literal(data.vdMeasure)} ;
        iadas:subClass1 ${this.literal(data.vdSubClass1)} ;
        iadas:subClass2 ${this.literal(data.vdSubClass2)} ;
        iadas:subClass3 ${this.literal(data.vdSubClass3)} ;
        iadas:subClass4 ${this.literal(data.vdSubClass4)} ;
        iadas:finalClass ${this.literal(data.vdName)} .

    # Variable Indépendante
    iadas-data:Variable_VI_${analysisId} a iadas:Variable ;
        iadas:variableType "VI" ;
        iadas:hasCategory ${this.literal(data.viCategory)} ;
        iadas:VI ${this.literal(data.viName)} ;
        iadas:measure ${this.literal(data.viMeasure)} ;
        iadas:subClass1 ${this.literal(data.viSubClass1)} ;
        iadas:subClass2 ${this.literal(data.viSubClass2)} ;
        iadas:subClass3 ${this.literal(data.viSubClass3)} ;
        iadas:subClass4 ${this.literal(data.viSubClass4)} ;
        iadas:finalClass ${this.literal(data.viName)} .

    # Relations
    iadas-data:Relations_${analysisId} a iadas:Relations ;
        iadas:degreR ${this.literal(data.degreR, 'decimal')} ;
        iadas:degreP ${this.literal(data.degreP, 'decimal')} ;
        iadas:signeP ${this.literal(data.signeP)} ;
        iadas:degreBeta ${this.literal(data.degreBeta, 'decimal')} ;
        iadas:degreR2 ${this.literal(data.degreR2, 'decimal')} ;
        iadas:resultatRelation ${this.literal(data.resultatRelation)} ;
        iadas:sousGroupeAnalyse ${this.literal(data.sousGroupeAnalyse)} ;
        iadas:sousGroupeAnalyse2 ${this.literal(data.sousGroupeAnalyse2)} ;
        iadas:relationDegreeSecondary ${this.literal(data.relationDegreeSecondary)} ;
        iadas:hasDependentVariable iadas-data:Variable_VD_${analysisId} ;
        iadas:hasIndependentVariable iadas-data:Variable_VI_${analysisId} .
}`;
    }
}

// Fonction utilitaire pour tester
window.testSPARQLGenerator = function(formData) {
    const generator = new SPARQLGenerator();
    const queries = generator.generateAllInserts(formData);
    
    console.log('=== REQUÊTES SPARQL GÉNÉRÉES ===');
    Object.entries(queries).forEach(([name, query]) => {
        console.log(`\n--- ${name.toUpperCase()} ---`);
        console.log(query);
    });
    
    return queries;
};

// Export pour utilisation
window.SPARQLGenerator = SPARQLGenerator;