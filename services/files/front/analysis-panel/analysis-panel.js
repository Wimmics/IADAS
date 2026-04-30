class AnalysisPanel {
  
  constructor() {
    this.isOpen = false;
    this.currentAnalysisId = null;
    this.currentNodeName = null;
    this.currentAnalysesData = null;
    this.panelElement = null;
    this.overlayElement = null;
    this.templateCache = new Map();
    this.pdfExportEnabled = false;
    this.loadJsPDF();
    this.init();
  }

  async init() {
    try {
      await this.loadTemplate();
      this.createPanelElements();
      this.attachEventListeners();
      console.log(" AnalysisPanel initialisé avec succès");
    } catch (error) {
      console.error(" Erreur lors de l'initialisation d'AnalysisPanel:", error);
    }
  }


  async loadJsPDF() {
  try {
    if (!window.jsPDF) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      script.onload = () => {
        this.pdfExportEnabled = true;
        console.log(" jsPDF chargé avec succès");
      };
      document.head.appendChild(script);
    } else {
      this.pdfExportEnabled = true;
    }
  } catch (error) {
    console.error("Erreur chargement jsPDF:", error);
  }
}


  async loadTemplate() {
    try {
      const response = await fetch('./analysis-panel.html');
      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`);
      }
      
      const templateHTML = await response.text();
      
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = templateHTML;
      
      this.templateCache.set('main', tempDiv.querySelector('.analysis-panel-content').outerHTML);
      this.templateCache.set('content', tempDiv.querySelector('#analysis-content-template').innerHTML);
      this.templateCache.set('loading', tempDiv.querySelector('#analysis-loading-template').innerHTML);
      
      console.log(" Templates HTML chargés");
      
    } catch (error) {
      console.error(" Erreur lors du chargement du template:", error);
      this.createFallbackTemplate();
    }
  }

  createFallbackTemplate() {
    console.log(" Utilisation du template de secours");
    
    this.templateCache.set('main', `
      <div class="analysis-panel-content">
        <div class="analysis-panel-header">
          <h2 class="analysis-panel-title"> Détails de l'Analyse</h2>
          <button id="close-analysis-panel" class="analysis-panel-close">×</button>
        </div>
        <div id="analysis-content">
          <div class="analysis-empty">
            <p>Double-cliquez sur un nœud du graphique pour voir les détails</p>
          </div>
        </div>
      </div>
    `);
  }

  createPanelElements() {
    this.overlayElement = document.createElement('div');
    this.overlayElement.id = 'analysis-overlay';

    this.panelElement = document.createElement('div');
    this.panelElement.id = 'analysis-panel';
    
    this.panelElement.innerHTML = this.templateCache.get('main');

    document.body.appendChild(this.overlayElement);
    document.body.appendChild(this.panelElement);
  }

  attachEventListeners() {
    const closeButton = this.panelElement.querySelector('#close-analysis-panel');
    if (closeButton) {
      closeButton.addEventListener('click', () => this.close());
    }

    this.panelElement.addEventListener('click', (e) => e.stopPropagation());
  }

  openMultipleAnalyses(nodeName, analysesData) {
   
    this.currentNodeName = nodeName;
    this.currentAnalysesData = analysesData;
    this.isOpen = true;

    this.overlayElement.classList.add('show');
    this.panelElement.classList.add('open');

    this.renderAnalysesList(nodeName, analysesData);
  }

  open(analysisId, analysisData = null) {
    
    this.currentAnalysisId = analysisId;
    this.isOpen = true;

    this.overlayElement.classList.add('show');
    this.panelElement.classList.add('open');

    if (analysisData) {
      this.renderContent(analysisData);
    } else {
      this.showLoadingState(analysisId);
      setTimeout(() => this.loadContentFromId(analysisId), 500);
    }
  }

  close() {
    
    this.isOpen = false;
    this.currentAnalysisId = null;

    this.overlayElement.classList.remove('show');
    this.panelElement.classList.remove('open');
  }

  showLoadingState(analysisId) {
    const contentDiv = this.panelElement.querySelector('#analysis-content');
    const loadingTemplate = this.templateCache.get('loading');
    
    if (loadingTemplate) {
      contentDiv.innerHTML = loadingTemplate;
      
      const loadingIdSpan = contentDiv.querySelector('.loading-analysis-id');
      if (loadingIdSpan) {
        loadingIdSpan.textContent = analysisId;
      }
    } else {
      contentDiv.innerHTML = `
        <div class="analysis-loading">
          <p>Chargement de l'analyse ${analysisId}...</p>
        </div>
      `;
    }
  }

  renderAnalysesList(nodeName, analysesData) {

  const contentDiv = this.panelElement.querySelector('#analysis-content');
  
  let listHTML = `
    <div style="padding: 10px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
        <h3 style="color: #2980b9; margin: 0;">
           Analyses liées à "${nodeName}" (${analysesData.length})
        </h3>
        <button onclick="window.analysisPanel.exportAnalysesToPDF()" 
                style="
                  background: #3c7be7ff; 
                  color: white; 
                  border: none; 
                  padding: 8px 15px; 
                  border-radius: 5px; 
                  cursor: pointer; 
                  font-size: 12px;
                  display: flex;
                  align-items: center;
                  gap: 5px;
                "
                ${!this.pdfExportEnabled ? 'disabled title="jsPDF en cours de chargement..."' : ''}>
           Exporter PDF
        </button>
      </div>
      
      <div style="max-height: 500px; overflow-y: auto;">
  `;
  
  analysesData.forEach((analysis, index) => {
    const apaTitle = this.formatAPATitle(analysis);
    
    listHTML += `
      <div class="analysis-item" 
           style="
             border: 1px solid #ddd; 
             border-radius: 8px; 
             padding: 15px; 
             margin-bottom: 10px; 
             background: #fafafa;
             cursor: pointer;
             transition: all 0.2s ease;
           "
           onmouseover="this.style.background='#f0f0f0'; this.style.borderColor='#007bff';"
           onmouseout="this.style.background='#fafafa'; this.style.borderColor='#ddd';"
           onclick="window.analysisPanel.showAnalysisDetail('${analysis.id}')">
        
        <div style="font-weight: bold; color: #2c3e50; margin-bottom: 8px;">
          ${apaTitle}
        </div>
        
        <div style="font-size: 12px; color: #666; margin-bottom: 8px;">
          ID: ${analysis.id} • Relation: 
          <span style="color: ${this.getRelationColor(analysis.relation)}; font-weight: bold;">
            ${this.getRelationText(analysis.relation)}
          </span>
        </div>
        
        <div style="font-size: 11px; color: #888;">
          VI: ${analysis.vi} → VD: ${analysis.vd}
          ${analysis.moderator !== 'N/A' ? ` • Modérateur: ${analysis.moderator}` : ''}
          ${analysis.mediator !== 'N/A' ? ` • Médiateur: ${analysis.mediator}` : ''}
        </div>
      </div>
    `;
  });
  
  listHTML += `
      </div>
      
      <div style="text-align: center; margin-top: 15px; padding-top: 15px; border-top: 1px solid #ddd;">
        <button onclick="window.analysisPanel.close()" style="
          background: #95a5a6;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 14px;
        ">
          Fermer
        </button>
      </div>
    </div>
  `;
  
  contentDiv.innerHTML = listHTML;
}

exportAnalysesToPDF(queryInfo = null) {
  console.log('🔍 DEBUG: Début exportAnalysesToPDF');
  console.log('🔍 window.jspdf exists:', !!window.jspdf);
  console.log('🔍 window.jspdf value:', window.jspdf);
  
  if (!window.jspdf) {
    console.error('❌ jsPDF non disponible');
    alert("PDF non disponible. Rechargez la page.");
    return;
  }

  try {
    console.log('✅ Tentative création jsPDF...');
    const doc = new window.jspdf.jsPDF();
    console.log('✅ jsPDF créé avec succès:', doc);
    
    // Configuration des polices pour les caractères spéciaux
    // Utiliser une police qui supporte les caractères Unicode étendus
    try {
      doc.addFont('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;700&display=swap', 'NotoSans', 'normal');
      doc.setFont('NotoSans');
    } catch (fontError) {
      console.warn('❌ Police personnalisée non disponible, utilisation de la police par défaut');
      // Fallback: utiliser helvetica qui supporte mieux l'Unicode
      doc.setFont('helvetica');
    }
    
    // Configuration
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const lineHeight = 6;
    let y = margin;
    
    // Titre principal - Plus grand et centré
    doc.setFontSize(20);
    doc.setFont(undefined, 'bold');
    const mainTitle = `Analyses traitant de "${this.currentNodeName}"`;
    const titleWidth = doc.getTextWidth(mainTitle);
    doc.text(mainTitle, (pageWidth - titleWidth) / 2, y);
    y += lineHeight * 2;
    
    y += lineHeight * 1.5;
    
    // Informations générales - Dans un encadré étendu
    const uniqueArticles = [...new Set(this.currentAnalysesData.map(a => a.rawData?.DOI || a.rawData?.Title || a.id))];
    const exportDate = new Date().toLocaleDateString('fr-FR');
    const lastUpdateDate = new Date().toLocaleDateString('fr-FR'); // TODO: récupérer la vraie date de mise à jour
    const queryText = queryInfo?.query || `Analyses liées à "${this.currentNodeName}"`;
    
    // Calculer la hauteur nécessaire pour l'encadré
    const encadreHeight = queryInfo ? lineHeight * 6 : lineHeight * 5;
    
    doc.setDrawColor(52, 152, 219); // Bleu
    doc.setLineWidth(0.5);
    doc.rect(margin, y, pageWidth - 2 * margin, encadreHeight);
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Nombre d'analyses (relations): ${this.currentAnalysesData.length}`, margin + 5, y + lineHeight);
    doc.text(`Nombre d'articles considérés: ${uniqueArticles.length}`, margin + 5, y + lineHeight * 2);
    doc.text(`Date d'export: ${exportDate}`, margin + 5, y + lineHeight * 3);
    doc.text(`Dernière mise à jour: ${lastUpdateDate}`, margin + 5, y + lineHeight * 4);
    
    // Ajouter la requête si disponible
    if (queryInfo) {
      doc.setFont(undefined, 'italic');
      doc.text(`Requête: ${queryText}`, margin + 5, y + lineHeight * 5);
      doc.setFont(undefined, 'normal');
    }
    
    y += encadreHeight + lineHeight;
    
    // Parcourir chaque analyse
    this.currentAnalysesData.forEach((analysis, index) => {
      // Vérifier si on a assez de place (estimation ~40mm par analyse)
      if (y > pageHeight - 60) {
        doc.addPage();
        y = margin;
      }
      
      // === RÉFÉRENCE APA DOMINANTE ===
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(44, 62, 80); // Bleu foncé
      
      const apaReference = this.formatAPATitle(analysis);
      const apaLines = doc.splitTextToSize(apaReference, pageWidth - 2 * margin);
      
      // Encadré discret pour la référence APA
      const apaHeight = apaLines.length * lineHeight + 8;
      doc.setFillColor(248, 249, 250); // Gris très clair
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.3);
      doc.rect(margin, y - 2, pageWidth - 2 * margin, apaHeight, 'FD');
      
      // Texte de la référence APA
      doc.text(apaLines, margin + 5, y + lineHeight);
      y += apaHeight + 3;
      
      // ID d'analyse - Plus discret
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(150, 150, 150); // Gris
      doc.text(`[ID: ${analysis.id}]`, pageWidth - margin - doc.getTextWidth(`[ID: ${analysis.id}]`), y);
      y += lineHeight * 1.5;
      
      // === VARIABLES ET RELATION - Format compact ===
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(52, 73, 94); // Bleu-gris foncé
      doc.text("Variables et relation:", margin, y);
      y += lineHeight * 1.2;
      
      // Format compact sur une ligne: VI: XXX → + Facteur de risque → VD: YYY
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      
      // Construire la ligne compacte
      const relationText = this.getRelationText(analysis.relation);
      const compactLine = `VI: ${analysis.vi} → ${relationText} → VD: ${analysis.vd}`;
      
      // Vérifier si ça tient sur une ligne
      const maxWidth = pageWidth - 2 * margin - 16;
      const lineWidth = doc.getTextWidth(compactLine);
      
      if (lineWidth <= maxWidth) {
        // Tout sur une ligne avec couleurs
        doc.setTextColor(21, 101, 192); // Bleu pour VI
        doc.text(`VI: ${analysis.vi}`, margin + 8, y);
        
        const viWidth = doc.getTextWidth(`VI: ${analysis.vi}`);
        doc.setTextColor(100, 100, 100); // Gris pour flèche
        doc.text(` → `, margin + 8 + viWidth, y);
        
        const arrowWidth = doc.getTextWidth(` → `);
        const relationColor = this.getRelationColorRGB(analysis.relation);
        doc.setTextColor(relationColor.r, relationColor.g, relationColor.b);
        doc.text(relationText, margin + 8 + viWidth + arrowWidth, y);
        
        const relationWidth = doc.getTextWidth(relationText);
        doc.setTextColor(100, 100, 100); // Gris pour flèche
        doc.text(` → `, margin + 8 + viWidth + arrowWidth + relationWidth, y);
        
        const arrow2Width = doc.getTextWidth(` → `);
        doc.setTextColor(198, 40, 40); // Rouge pour VD
        doc.text(`VD: ${analysis.vd}`, margin + 8 + viWidth + arrowWidth + relationWidth + arrow2Width, y);
        
        y += lineHeight * 1.5;
      } else {
        // Si trop long, diviser en deux lignes
        doc.setTextColor(21, 101, 192);
        doc.text(`VI: ${analysis.vi}`, margin + 8, y);
        y += lineHeight;
        
        const relationColor = this.getRelationColorRGB(analysis.relation);
        doc.setTextColor(relationColor.r, relationColor.g, relationColor.b);
        doc.text(`${relationText}`, margin + 8, y);
        
        doc.setTextColor(198, 40, 40);
        const relationTextWidth = doc.getTextWidth(relationText);
        doc.text(` → VD: ${analysis.vd}`, margin + 8 + relationTextWidth, y);
        y += lineHeight * 1.5;
      }
      
      // Modérateurs/Médiateurs - Si présents, format compact aussi
      if ((analysis.moderator && analysis.moderator !== 'N/A') || 
          (analysis.mediator && analysis.mediator !== 'N/A')) {
        
        doc.setFontSize(8);
        doc.setFont(undefined, 'italic');
        doc.setTextColor(120, 120, 120);
        
        let modMedLine = '';
        if (analysis.moderator && analysis.moderator !== 'N/A') {
          modMedLine += `Modérateur: ${analysis.moderator}`;
        }
        if (analysis.mediator && analysis.mediator !== 'N/A') {
          if (modMedLine) modMedLine += ' | ';
          modMedLine += `Médiateur: ${analysis.mediator}`;
        }
        
        doc.text(modMedLine, margin + 8, y);
        y += lineHeight * 1.2;
      }
      
      // === STATISTIQUES DÉTAILLÉES ===
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(100, 100, 100);
      
      let statsLine = '';
      const data = analysis.rawData || {};
      
      // Degré de relation
      if (data.Degre_de_relation && data.Degre_de_relation !== 'N/A') {
        statsLine += `Degré: ${data.Degre_de_relation}`;
      }
      
      // Type d'analyse
      if (data.Type_of_analysis && data.Type_of_analysis !== 'N/A') {
        if (statsLine) statsLine += ' | ';
        statsLine += `Type: ${data.Type_of_analysis}`;
      }
      
      // Valeurs statistiques (r, p, beta)
      let statValues = [];
      if (data.Degre_r && data.Degre_r !== 'N/A') {
        statValues.push(`r=${data.Degre_r}`);
      }
      if (data['Degre_p '] && data['Degre_p '] !== 'N/A') {
        const pSign = data.Signe_p && data.Signe_p !== 'N/A' ? data.Signe_p : '';
        statValues.push(`p${pSign}${data['Degre_p ']}`);
      }
      if (data.Degre_beta && data.Degre_beta !== 'N/A') {
        statValues.push(`β=${data.Degre_beta}`);
      }
      
      if (statValues.length > 0) {
        if (statsLine) statsLine += ' | ';
        statsLine += statValues.join(', ');
      }
      
      if (statsLine) {
        doc.text(statsLine, margin + 8, y);
        y += lineHeight * 1.2;
      }
      
      // Ligne de séparation entre analyses
      if (index < this.currentAnalysesData.length - 1) {
        doc.setDrawColor(230, 230, 230);
        doc.setLineWidth(0.2);
        doc.line(margin + 20, y, pageWidth - margin - 20, y);
        y += lineHeight * 1.5;
      } else {
        y += lineHeight;
      }
    });
    
    // === PIED DE PAGE ÉLÉGANT ===
    const footerY = pageHeight - 15;
    doc.setDrawColor(52, 152, 219);
    doc.setLineWidth(0.5);
    doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);
    
    doc.setFontSize(8);
    doc.setFont(undefined, 'italic');
    doc.setTextColor(120, 120, 120);
    const footerText = `Généré par IA-DAS Ontologie Analysis Panel - ${new Date().toLocaleString('fr-FR')}`;
    const footerWidth = doc.getTextWidth(footerText);
    doc.text(footerText, (pageWidth - footerWidth) / 2, footerY);
    
    // Sauvegarder le PDF
    console.log('💾 Tentative sauvegarde PDF...');
    const fileName = `Analyses_${this.currentNodeName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    console.log('💾 Nom fichier:', fileName);
    
    doc.save(fileName);
    console.log('✅ PDF sauvegardé avec succès');
    
    this.showExportSuccess(fileName);
    
  } catch (error) {
    console.error("❌ ERREUR EXPORT PDF:", error);
    console.error("❌ Stack trace:", error.stack);
    console.error("❌ Message:", error.message);
    console.error("❌ Type:", error.name);
    alert("Erreur lors de la génération du PDF. Consultez la console pour plus de détails.");
  }
}

getRelationColorRGB(relation) {
  switch(relation) {
    case '+': 
      return { r: 231, g: 76, b: 60 }; 
    case '-': 
      return { r: 39, g: 174, b: 96 }; 
    case 'NS': 
      return { r: 149, g: 165, b: 166 }; 
    default: 
      return { r: 160, g: 174, b: 192 }; 
  }
}


showExportSuccess(fileName) {
  // Créer une notification temporaire
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #2ecc71;
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    z-index: 10000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    font-size: 14px;
    max-width: 300px;
  `;
  notification.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 5px;"> Export réussi!</div>
    <div style="font-size: 12px;">Fichier: ${fileName}</div>
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 4000);
}

formatAPATitleForPDF(analysis) {
  // Utiliser directement la référence APA formatée depuis l'ontologie si disponible
  if (analysis.reference && analysis.reference.trim() !== '') {
    return analysis.reference;
  }
  
  // Sinon, vérifier dans rawData
  if (analysis.rawData?.reference && analysis.rawData.reference.trim() !== '') {
    return analysis.rawData.reference;
  }
  
  // Fallback : reconstruction manuelle (ancien comportement)
  const data = analysis.rawData || {};
  const authors = data.Authors || 'Auteur inconnu';
  const year = data['Year '] || 'Année inconnue';
  const title = data.Title || analysis.title || `Analyse ${analysis.id}`;
  const journal = data.Journal || '';
  
  let apaReference = `${authors} (${year}). ${title}`;
  if (journal) {
    apaReference += `. ${journal}`;
  }
  
  return apaReference;
}

  formatAPATitle(analysis) {
    // Utiliser directement la référence APA formatée depuis l'ontologie si disponible
    if (analysis.reference && analysis.reference.trim() !== '') {
      return analysis.reference;
    }
    
    // Sinon, vérifier dans rawData
    if (analysis.rawData?.reference && analysis.rawData.reference.trim() !== '') {
      return analysis.rawData.reference;
    }
    
    // Fallback : reconstruction manuelle (ancien comportement)
    const authors = analysis.rawData?.Authors || 'Auteur inconnu';
    const year = analysis.rawData?.['Year '] || 'Année inconnue';          
    const title = analysis.rawData?.Title || analysis.title || `Analyse ${analysis.id}`;
    
    const shortAuthors = authors.length > 50 ? authors.substring(0, 47) + '...' : authors;
    
    return `${shortAuthors} (${year}). ${title}`;
  }

  getRelationColor(relation) {
    switch(relation) {
      case '+': return '#E53E3E';
      case '-': return '#38A169';
      case 'NS': return '#718096';
      default: return '#A0AEC0';
    }
  }

async showAnalysisDetail(analysisId) {
  console.log(`Affichage détail analyse: ${analysisId}`);
  
  // D'abord chercher dans les données déjà chargées
  let analysis = this.currentAnalysesData.find(a => a.id === analysisId);
  
  if (analysis && analysis.rawData && Object.keys(analysis.rawData).length > 5) {
    // Les données sont déjà complètes, on peut les afficher directement
    console.log(`Données complètes trouvées en mémoire pour ${analysisId}`);
    this.renderDetailedAnalysis(analysis);
    return;
  }
  
  // Les données ne sont pas complètes, on doit les recharger depuis Fuseki
  console.log(`Rechargement des données complètes depuis Fuseki pour ${analysisId}`);
  
  try {
    // Afficher un état de chargement
    this.showAnalysisLoadingState(analysisId);
    
    if (!window.fusekiRetriever) {
      throw new Error('FusekiAnalysisRetriever non disponible. Vérifiez que le module est chargé.');
    }
    
    // Récupérer les données complètes depuis Fuseki
    const completeAnalysis = await window.fusekiRetriever.getAnalysisData(analysisId);
    
    if (!completeAnalysis || completeAnalysis.error) {
      throw new Error(completeAnalysis?.error || 'Données non trouvées dans Fuseki');
    }
    
    console.log(` Données complètes récupérées depuis Fuseki pour ${analysisId}:`, completeAnalysis);
    
    // Mettre à jour les données en mémoire pour la prochaine fois
    const indexInCurrent = this.currentAnalysesData.findIndex(a => a.id === analysisId);
    if (indexInCurrent !== -1) {
      this.currentAnalysesData[indexInCurrent] = completeAnalysis;
    }
    
    // Afficher les données détaillées
    this.renderDetailedAnalysis(completeAnalysis);
    
  } catch (error) {
    this.showAnalysisError(analysisId, error.message);
  }
}


showAnalysisLoadingState(analysisId) {
  const contentDiv = this.panelElement.querySelector('#analysis-content');
  
  contentDiv.innerHTML = `
    <div style="padding: 20px; text-align: center;">
      <div style="margin-bottom: 15px;">
        <div style="
          border: 3px solid #f3f3f3;
          border-top: 3px solid #3498db;
          border-radius: 50%;
          width: 30px;
          height: 30px;
          animation: spin 1s linear infinite;
          margin: 0 auto;
        "></div>
      </div>
      <h3 style="color: #2980b9; margin-bottom: 10px;">
         Chargement détaillé de l'analyse ${analysisId}
      </h3>
      <p style="color: #666; margin-bottom: 5px;">
        Récupération des données depuis Fuseki...
      </p>
      <p style="font-size: 12px; color: #999;">
        ⚡ Données toujours à jour depuis l'ontologie
      </p>
    </div>
    
    <style>
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    </style>
  `;
}

// Nouvelle méthode pour afficher les erreurs
showAnalysisError(analysisId, errorMessage) {
  const contentDiv = this.panelElement.querySelector('#analysis-content');
  
  contentDiv.innerHTML = `
    <div style="padding: 20px;">
      <div style="
        background: #fff3f3; 
        border: 1px solid #ffcdd2; 
        border-radius: 8px; 
        padding: 15px;
        margin-bottom: 15px;
      ">
        <h3 style="color: #d32f2f; margin: 0 0 10px 0;">
           Erreur de chargement
        </h3>
        <p style="margin: 0 0 10px 0;">
          <strong>Analyse:</strong> ${analysisId}
        </p>
        <p style="margin: 0 0 15px 0; color: #666;">
          <strong>Erreur:</strong> ${errorMessage}
        </p>
        
        <div style="font-size: 14px; color: #888;">
          <p><strong>Suggestions:</strong></p>
          <ul style="margin: 10px 0; padding-left: 20px;">
            <li>Vérifiez que le serveur SPARQL fonctionne (port 8003)</li>
            <li>L'analyse existe peut-être dans le CSV mais pas dans Fuseki</li>
            <li>Consultez la console pour plus de détails</li>
          </ul>
        </div>
      </div>
      
      <div style="text-align: center;">
        <button onclick="window.analysisPanel.renderAnalysesList('${this.currentNodeName}', window.analysisPanel.currentAnalysesData)" 
                style="
                  background: #3498db; 
                  color: white; 
                  border: none; 
                  padding: 10px 20px; 
                  border-radius: 5px; 
                  cursor: pointer; 
                  margin-right: 10px;
                ">
          ← Retour à la liste
        </button>
        <button onclick="window.analysisPanel.close()" 
                style="
                  background: #95a5a6; 
                  color: white; 
                  border: none; 
                  padding: 10px 20px; 
                  border-radius: 5px; 
                  cursor: pointer;
                ">
          Fermer
        </button>
      </div>
    </div>
  `;
}

  renderDetailedAnalysis(analysis) {
    console.log(" Rendu analyse détaillée:", analysis);

    const contentDiv = this.panelElement.querySelector('#analysis-content');
    const data = analysis.rawData || {};
    
    let detailHTML = `
      <div style="padding: 15px;">
        <div style="border-bottom: 2px solid #3498db; padding-bottom: 10px; margin-bottom: 20px;">
          <h2 style="color: #2980b9; margin: 0; font-size: 18px;">
             ${analysis.id} - Analyse Détaillée
          </h2>
          <button onclick="window.analysisPanel.renderAnalysesList('${this.currentNodeName}', window.analysisPanel.currentAnalysesData)" 
                  style="float: right; background: #95a5a6; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; margin-top: -25px;">
            ← Retour à la liste
          </button>
        </div>

        <div style="max-height: 600px; overflow-y: auto;">
    `;

    detailHTML += this.createDetailSection(" Identification", [
      ['DOI', data.DOI],
      ['Code', data.Code],
      ['Analysis ID', data.Analysis_ID],
      ['Titre', data.Title],
      ['Auteurs', data.Authors],
      ['Année', data['Year ']],
      ['Journal', data.Journal],
      ['Pays', data.Country]
    ]);

    detailHTML += this.createDetailSection(" Méthodologie", [
      ['Type d\'étude', data['Types of study']],
      ['N (échantillon)', data.N],
      ['Population', data.Population],
      ['Sexe', data.Sexe],
      ['Sous-groupe population', data['Population subgroup']],
      ['Critères inclusion', data['Inclusion criteria']],
      ['Type d\'analyse', data.Type_of_analysis],
      ['N mobilisé analyses', data['N_mobilise_dans_les analyse']]
    ]);

    detailHTML += this.createDetailSection(" Caractéristiques Population", [
      ['Âge', data.Age],
      ['Âge moyen analyse', data.AgeForAnalysis_Mean],
      ['SD âge', data.SDAnalysis],
      ['Âge min', data.MinAge],
      ['Âge max', data.MaxAge],
      ['IMC', data.BMI],
      ['IMC moyen', data.BMI_Mean],
      ['SD IMC', data.BMI_SD]
    ]);

    detailHTML += this.createDetailSection(" Pratique Sportive", [
      ['Type pratique sport', data['Type_of _sport_practice']],
      ['Sous-catégorie sport', data.Subcategory_of_sport],
      ['Nom du sport', data.Sport_name],
      ['Niveau sportif', data.Sport_level],
      ['Population sportive', data.Sporting_population],
      ['Fréquence exercice', data.Exercise_frequency],
      ['Fréquence moyenne', data.Freq_Mean],
      ['Années d\'expérience', data.Years_of_experience],
      ['Expérience moyenne', data.Exp_Mean]
    ]);

    detailHTML += this.createDetailSection(" Variables et Relations", [
      ['ACADS (VD)', data.ACADS],
      ['VD', data.VD],
      ['Mesure VD', data.Measure_VD],
      ['VI', data.VI],
      ['Mesure VI', data.Measure_VI],
      ['Médiateur', data.Mediator],
      ['Mesure Médiateur', data.Measure_Mediator],
      ['Modérateur', data.Moderator],
      ['Mesure Modérateur', data.Measure_Moderator]
    ]);

    detailHTML += this.createDetailSection(" Résultats Statistiques", [
      ['Degré relation', data.Degre_de_relation],
      ['Résultat relation', data.Resultat_de_relation],
      ['Degré r', data.Degre_r],
      ['Signe p', data.Signe_p],
      ['Degré p', data['Degre_p ']],
      ['Degré beta', data.Degre_beta],
      ['Degré RS', data.Degre_RS],
      ['Index', data.Index],
      ['Multiplicité analyse', data.Multiplicity_analyse]
    ]);

    detailHTML += this.createDetailSection(" Conclusions et Limites", [
      ['Conclusions auteurs', data.Authors_conclusions],
      ['Limites', data.Limites],
      ['Perspectives', data.Perspectives],
      ['Notes', data['Notes on jn']]
    ]);

    detailHTML += `
        </div>
        
        <div style="text-align: center; margin-top: 20px; padding-top: 15px; border-top: 1px solid #ddd;">
          <button onclick="window.analysisPanel.renderAnalysesList('${this.currentNodeName}', window.analysisPanel.currentAnalysesData)" 
                  style="background: #3498db; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin-right: 10px;">
            ← Retour à la liste
          </button>
          <button onclick="window.analysisPanel.close()" 
                  style="background: #95a5a6; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">
            Fermer
          </button>
        </div>
      </div>
    `;

    contentDiv.innerHTML = detailHTML;
  }

  createDetailSection(title, fields) {
    let sectionHTML = `
      <div style="margin-bottom: 20px; border: 1px solid #ddd; border-radius: 8px; padding: 15px; background: #f9f9f9;">
        <h3 style="color: #2c3e50; margin: 0 0 15px 0; font-size: 16px; border-bottom: 1px solid #bdc3c7; padding-bottom: 5px;">
          ${title}
        </h3>
        <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 8px; font-size: 13px;">
    `;

    fields.forEach(([label, value]) => {
      if (value && value.toString().trim() !== '' && value !== 'N/A') {
        sectionHTML += `
          <div style="font-weight: bold; color: #555;">${label}:</div>
          <div style="color: #333; word-wrap: break-word;">${value}</div>
        `;
      }
    });

    sectionHTML += `
        </div>
      </div>
    `;

    return sectionHTML;
  }

  renderContent(analysisData) {

    const contentDiv = this.panelElement.querySelector('#analysis-content');
    const contentTemplate = this.templateCache.get('content');
    
    if (contentTemplate) {
      contentDiv.innerHTML = contentTemplate;
      this.populateTemplate(contentDiv, analysisData);
    } else {
      this.renderFallbackContent(contentDiv, analysisData);
    }
  }

  populateTemplate(container, data) {
    this.setTextContent(container, '.analysis-id', data.id);
    this.setTextContent(container, '.analysis-title', data.title);

    this.setTextContent(container, '.vi-name', data.vi, '#1565C0');
    this.setTextContent(container, '.vi-category', 
      data.categoryVI !== 'N/A' ? `Catégorie: ${data.categoryVI}` : '');

    this.setTextContent(container, '.vd-name', data.vd, '#C62828');
    this.setTextContent(container, '.vd-category', 
      data.categoryVD !== 'N/A' ? `Catégorie: ${data.categoryVD}` : '');

    const relationBadge = container.querySelector('.relation-type');
    if (relationBadge) {
      relationBadge.textContent = this.getRelationText(data.relation);
      relationBadge.className = `relation-badge ${this.getRelationClass(data.relation)}`;
    }

    this.setTextContent(container, '.moderator-name', data.moderator);
    this.setTextContent(container, '.mediator-name', data.mediator);
  }

  setTextContent(container, selector, text, color = null) {
    const element = container.querySelector(selector);
    if (element) {
      element.textContent = text || 'N/A';
      if (color) {
        element.style.color = color;
      }
    }
  }

  renderFallbackContent(container, data) {
    container.innerHTML = `
      <div style="padding: 20px;">
        <h3>📊 Analyse ${data.id}</h3>
        <p><strong>VI:</strong> ${data.vi}</p>
        <p><strong>VD:</strong> ${data.vd}</p>
        <p><strong>Relation:</strong> ${data.relation}</p>
        <p><strong>Modérateur:</strong> ${data.moderator}</p>
        <p><strong>Médiateur:</strong> ${data.mediator}</p>
        <button onclick="window.analysisPanel.close()">Fermer</button>
      </div>
    `;
  }

  loadContentFromId(analysisId) {
    
    const mockData = {
      id: analysisId,
      title: `Analyse ${analysisId} - Titre APA à récupérer`,
      vi: 'Variable à récupérer',
      vd: 'Variable à récupérer',
      relation: '+',
      moderator: 'À déterminer',
      mediator: 'À déterminer',
      categoryVI: 'N/A',
      categoryVD: 'N/A'
    };
    
    setTimeout(() => {
      this.renderContent(mockData);
    }, 1000);
  }

  getRelationClass(relation) {
    switch(relation) {
      case '+': return 'risk';
      case '-': return 'protective';
      case 'NS': return 'non-significant';
      default: return 'default';
    }
  }

  getRelationText(relation) {
    switch(relation) {
      case '+': return '+ Facteur de risque';
      case '-': return '- Facteur protecteur';
      case 'NS': return 'NS Non significatif';
      default: return relation || 'Non défini';
    }
  }

  isOpened() {
    return this.isOpen;
  }

  getCurrentAnalysisId() {
    return this.currentAnalysisId;
  }

  exportAnalysis() {
    console.log(` Export analyse: ${this.currentAnalysisId}`);
    alert(`Fonctionnalité d'export à implémenter pour l'analyse ${this.currentAnalysisId}`);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.analysisPanel = new AnalysisPanel();
  console.log(" AnalysisPanel disponible globalement");
});