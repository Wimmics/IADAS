/**
 * Système de conversion d'unités pour IA-DAS
 * Convertit les différentes unités trouvées dans les données vers des unités standard
 */

class UnitConverter {
    constructor() {
        // Unités standard utilisées pour la normalisation
        this.standardUnits = {
            frequency: 'hours_per_week',    // heures par semaine
            experience: 'years'             // années
        };
        
        // Tables de conversion vers les unités standard
        this.frequencyConversions = {
            // Format: "unit/base" -> multiplicateur vers hours_per_week
            'hours/week': 1.0,
            'hours/day': 7.0,               // 7 jours par semaine
            'hours/month': 1.0 / 4.33,      // ~4.33 semaines par mois
            'minutes/week': 1.0 / 60,       // 60 minutes par heure
            'minutes/day': 7.0 / 60,        // 7 jours * 60 minutes
            'sessions/week': 1.5,           // Estimation: 1.5h par session
            'sessions/day': 7.0 * 1.5,      // 7 jours * 1.5h par session
            'times/week': 1.5,              // Même estimation que sessions
            'times/day': 7.0 * 1.5
        };
        
        this.experienceConversions = {
            // Format: "unit" -> multiplicateur vers années  
            'years': 1.0,
            'months': 1.0 / 12,             // 12 mois par année
            'weeks': 1.0 / 52,              // 52 semaines par année
            'days': 1.0 / 365               // 365 jours par année
        };
    }
    
    /**
     * Convertit une valeur de fréquence vers l'unité standard (hours/week)
     * @param {number} value - Valeur à convertir
     * @param {string} unit - Unité source (ex: "hours")
     * @param {string} base - Base temporelle source (ex: "week")
     * @returns {number} Valeur convertie en heures/semaine
     */
    convertFrequency(value, unit, base) {
        if (!value || value === 'N.A.' || !unit || !base) {
            return null;
        }
        
        // Normaliser les variations d'écriture
        const normalizedUnit = unit.toLowerCase().trim();
        const normalizedBase = base.toLowerCase().trim();
        
        // Créer la clé de conversion
        const conversionKey = `${normalizedUnit}/${normalizedBase}`;
        
        // Récupérer le facteur de conversion
        const conversionFactor = this.frequencyConversions[conversionKey];
        
        if (conversionFactor === undefined) {
            console.warn(`⚠️ Unité de fréquence non reconnue: ${conversionKey}`);
            // Retourner la valeur originale si on ne peut pas convertir
            return value;
        }
        
        const convertedValue = parseFloat(value) * conversionFactor;
        console.log(`🔄 Conversion fréquence: ${value} ${conversionKey} → ${convertedValue.toFixed(2)} hours/week`);
        
        return convertedValue;
    }
    
    /**
     * Convertit une valeur d'expérience vers l'unité standard (années)
     * @param {number} value - Valeur à convertir
     * @param {string} unit - Unité source (ex: "years", "months")
     * @returns {number} Valeur convertie en années
     */
    convertExperience(value, unit) {
        if (!value || value === 'N.A.' || !unit) {
            return null;
        }
        
        // Normaliser les variations d'écriture
        const normalizedUnit = unit.toLowerCase().trim();
        
        // Récupérer le facteur de conversion
        const conversionFactor = this.experienceConversions[normalizedUnit];
        
        if (conversionFactor === undefined) {
            console.warn(`⚠️ Unité d'expérience non reconnue: ${normalizedUnit}`);
            // Retourner la valeur originale si on ne peut pas convertir
            return value;
        }
        
        const convertedValue = parseFloat(value) * conversionFactor;
        console.log(`🔄 Conversion expérience: ${value} ${normalizedUnit} → ${convertedValue.toFixed(2)} years`);
        
        return convertedValue;
    }
    
    /**
     * Convertit une plage de fréquence vers l'unité standard
     * @param {Object} range - {min, max, mean, unit, base}
     * @returns {Object} Plage convertie {min, max, mean}
     */
    convertFrequencyRange(range) {
        const result = {};
        
        if (range.min !== undefined && range.min !== null) {
            result.min = this.convertFrequency(range.min, range.unit, range.base);
        }
        if (range.max !== undefined && range.max !== null) {
            result.max = this.convertFrequency(range.max, range.unit, range.base);
        }
        if (range.mean !== undefined && range.mean !== null) {
            result.mean = this.convertFrequency(range.mean, range.unit, range.base);
        }
        
        return result;
    }
    
    /**
     * Convertit une plage d'expérience vers l'unité standard
     * @param {Object} range - {min, max, mean, unit}
     * @returns {Object} Plage convertie {min, max, mean}
     */
    convertExperienceRange(range) {
        const result = {};
        
        if (range.min !== undefined && range.min !== null) {
            result.min = this.convertExperience(range.min, range.unit);
        }
        if (range.max !== undefined && range.max !== null) {
            result.max = this.convertExperience(range.max, range.unit);
        }
        if (range.mean !== undefined && range.mean !== null) {
            result.mean = this.convertExperience(range.mean, range.unit);
        }
        
        return result;
    }
    
    /**
     * Convertit les critères de recherche de l'utilisateur vers les unités standard
     * @param {Object} searchCriteria - Critères de recherche
     * @returns {Object} Critères convertis
     */
    convertSearchCriteria(searchCriteria) {
        const converted = { ...searchCriteria };
        
        // Convertir les critères de fréquence (assumés en hours/week par défaut)
        if (searchCriteria.minExFR !== undefined) {
            converted.minExFR = this.convertFrequency(searchCriteria.minExFR, 'hours', 'week');
        }
        if (searchCriteria.maxExFR !== undefined) {
            converted.maxExFR = this.convertFrequency(searchCriteria.maxExFR, 'hours', 'week');
        }
        if (searchCriteria.meanExFR !== undefined) {
            converted.meanExFR = this.convertFrequency(searchCriteria.meanExFR, 'hours', 'week');
        }
        
        // Convertir les critères d'expérience (assumés en années par défaut)
        if (searchCriteria.minYOE !== undefined) {
            converted.minYOE = this.convertExperience(searchCriteria.minYOE, 'years');
        }
        if (searchCriteria.maxYOE !== undefined) {
            converted.maxYOE = this.convertExperience(searchCriteria.maxYOE, 'years');
        }
        if (searchCriteria.meanYOE !== undefined) {
            converted.meanYOE = this.convertExperience(searchCriteria.meanYOE, 'years');
        }
        
        return converted;
    }
    
    /**
     * Ajoute de nouvelles unités de conversion
     * @param {string} type - 'frequency' ou 'experience'
     * @param {Object} conversions - Nouvelles conversions à ajouter
     */
    addConversions(type, conversions) {
        if (type === 'frequency') {
            Object.assign(this.frequencyConversions, conversions);
        } else if (type === 'experience') {
            Object.assign(this.experienceConversions, conversions);
        }
    }
    
    /**
     * Obtient toutes les unités supportées
     * @returns {Object} Liste des unités supportées
     */
    getSupportedUnits() {
        return {
            frequency: Object.keys(this.frequencyConversions),
            experience: Object.keys(this.experienceConversions),
            standard: this.standardUnits
        };
    }
}

// Export pour utilisation dans d'autres modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UnitConverter;
}

// Export pour utilisation dans le navigateur
if (typeof window !== 'undefined') {
    window.UnitConverter = UnitConverter;
}

// Créer une instance globale
const unitConverter = new UnitConverter();

console.log('📏 UnitConverter initialisé avec les unités supportées:', unitConverter.getSupportedUnits());