// CSV Loader - Chargement des données détaillées
class CSVLoader {
  
  static csvData = null;
  static isLoaded = false;

  // Charger le CSV au démarrage
  static async loadCSVData(csvPath = './data/IA-DAS-Data1.csv') {
    try {
      const response = await fetch(csvPath);
      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status} - Fichier non trouvé: ${csvPath}`);
      }
      
      const csvText = await response.text();
      const lines = csvText.split('\n');
      const headers = lines[0].split(';').map(h => h.trim().replace(/"/g, '')); // Enlever guillemets
      
      const data = [];
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '') continue; // Ignorer lignes vides
        
        const values = lines[i].split(';').map(v => v.trim().replace(/"/g, ''));
        const row = {};
        
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        
        const analysisId = row['Analysis_ID'];
        
        if (analysisId && analysisId !== '' && analysisId !== 'N.A.' && analysisId !== 'NA') {
          data.push(row);
        }
      }
      
      this.csvData = data;
      this.isLoaded = true;
      
      return data;
      
    } catch (error) {
      this.csvData = [];
      this.isLoaded = false;
      return [];
    }
  }

  static parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current); // Ajouter le dernier élément
    return result;
  }

  // Rechercher une analyse par ID
  static findAnalysisById(analysisId) {
    if (!this.isLoaded || !this.csvData) {
      return null;
    }

    let cleanId = analysisId.toString()
      .replace(/^Analysis_/, '')    // Enlever préfixe
      .replace(/\.0$/, '')          // Enlever .0 à la fin
      .replace('.', ',');           // Convertir point en virgule (format français)
    
    // Chercher l'analyse avec différentes variantes
    const found = this.csvData.find(row => {
      const rowId = row['Analysis_ID'];
      if (!rowId) return false;
      
      const cleanRowId = rowId.toString().trim();
      
      // Tests de correspondance multiples
      const matches = [
        cleanRowId === analysisId,           // Exact match
        cleanRowId === cleanId,              // ID nettoyé
        cleanRowId.replace(',', '.') === analysisId,  // Virgule → point
        cleanRowId.replace(',', '.') === cleanId,     // Virgule → point nettoyé
        `Analysis_${cleanRowId}` === analysisId,      // Avec préfixe
        parseFloat(cleanRowId.replace(',', '.')) === parseFloat(analysisId.toString().replace(',', '.'))  // Comparaison numérique
      ];
      
      return matches.some(m => m);
    });

    return found;
  }

  // Obtenir toutes les données
  static getAllData() {
    return this.csvData || [];
  }

  static isCSVLoaded() {
    return this.isLoaded;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await CSVLoader.loadCSVData();
  window.csvLoader = CSVLoader; // Disponible globalement
});