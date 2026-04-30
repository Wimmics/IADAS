// Moteur de rendu D3.js pour graphe réseau ontologique
// Modifié pour utiliser les couleurs du parser + panneau latéral + liens courbés + chargement forcé Excel

class GraphRenderer {
  constructor(container, parsedData) {
    this.container = container;
    this.parsedData = parsedData;
    this.margin = { top: 20, right: 30, bottom: 40, left: 50 };
    this.updateDimensions();
    this.simulation = null;
    this.hierarchyNodes = [];
    this.hierarchyLinks = [];
    this.hierarchyVisible = false;
    this.currentHierarchyConcept = null;
    this.longClickTimer = null;
    this.longClickNode = null;
    this.longClickEvent = null;
    this.longClickInProgress = false;
    
    // État de la légende - vérifie localStorage pour la persistance
    this.legendCollapsed = localStorage.getItem('ia-das-legend-collapsed') === 'true';
  }

  updateDimensions() {
    const containerRect = this.container.getBoundingClientRect();
    this.width = Math.max(containerRect.width - this.margin.left - this.margin.right, 600);
    this.height = Math.max(containerRect.height - this.margin.top - this.margin.bottom, 400);
  }

  handleResize() {
    this.updateDimensions();
    // Redessiner le graphique si nécessaire
    if (this.svg) {
      this.svg.attr('width', this.width + this.margin.left + this.margin.right)
        .attr('height', this.height + this.margin.top + this.margin.bottom);
    }
  }

  render() {
    // FORCER le graphe réseau pour toutes les données ontologiques
    this.createSVG();
    this.renderNetworkGraph();
    this.addColorLegend();
  }

  createSVG() {
    // Supprimer l'ancien SVG et légende s'ils existent
    d3.select(this.container).select('svg').remove();
    d3.select(this.container).select('.graph-legend').remove();

    this.svg = d3.select(this.container)
      .append('svg')
      .attr('width', this.width + this.margin.left + this.margin.right)
      .attr('height', this.height + this.margin.top + this.margin.bottom);

    // Ajouter le zoom
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        this.g.attr('transform', event.transform);
      });

    this.svg.call(zoom);

    this.g = this.svg.append('g')
      .attr('transform', `translate(${this.margin.left},${this.margin.top})`);
  }

  renderNetworkGraph() {

    const networkData = this.parsedData.networkData;
    const nodes = [...networkData.nodes];
    const links = [...networkData.links];


    const processedLinks = this.calculateLinkCurves(links);

    // Créer la simulation de force
    this.simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(processedLinks).id(d => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(this.width / 2, this.height / 2))
      .force('collision', d3.forceCollide().radius(d => d.size + 10));

    // Créer les liens
    const link = this.g.append('g')
      .attr('class', 'links')
      .selectAll('path')
      .data(processedLinks)
      .enter().append('path')
      .attr('class', 'link')
      .style('fill', 'none')
      .style('stroke', d => d.color || '#aaa')
      .style('stroke-width', 3)
      .style('opacity', 0.8);

    // Labels des liens
    const linkLabels = this.g.append('g')
      .attr('class', 'link-labels')
      .selectAll('text')
      .data(processedLinks)
      .enter().append('text')
      .attr('class', 'link-label')
      .style('font-size', '10px')
      .style('fill', '#666')
      .style('text-anchor', 'middle')
      .style('pointer-events', 'none')
      .text(d => d.label);

    // Dessiner les nœuds
    const node = this.g.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodes)
      .enter().append('g')
      .attr('class', 'node-group')
      .call(d3.drag()
        .on('start', (event, d) => this.dragstarted(event, d))
        .on('drag', (event, d) => this.dragged(event, d))
        .on('end', (event, d) => this.dragended(event, d)));

    // Cercles des nœuds
    node.append('circle')
      .attr('r', d => d.size)
      .style('fill', d => d.color || '#808080')
      .style('stroke', '#fff')
      .style('stroke-width', d => d.type === 'entity' ? 3 : 2)
      .style('cursor', 'pointer');

    // Labels des nœuds
    const nodeLabels = this.g.append('g')
      .attr('class', 'node-labels')
      .selectAll('text')
      .data(nodes)
      .enter().append('text')
      .attr('class', 'node-label')
      .style('font-size', '12px')
      .style('font-weight', d => d.type === 'entity' ? 'bold' : 'normal')
      .style('fill', '#333')
      .style('text-anchor', 'middle')
      .style('pointer-events', 'none')
      .text(d => this.truncateLabel(d.label, 40));

    // ✅ GESTIONNAIRES D'ÉVÉNEMENTS CORRIGÉS

    node
      .on('mouseover', (event, d) => {
        if (!this.longClickInProgress) { // ← Ne pas afficher tooltip pendant clic prolongé
          this.showTooltip(event, d);
        }
      })
      .on('mouseout', (event, d) => {
        this.hideTooltip();
      })
      .on('dblclick', (event, d) => {
        event.stopPropagation();
        event.preventDefault();
        this.cancelLongClickTimer();
        this.openAnalysisPanel(d);
      })
      // ✅ ÉVÉNEMENTS CLIC PROLONGÉ CORRIGÉS
      .on('mousedown', (event, d) => {
        console.log(`⬇ MOUSEDOWN sur: ${d.label} - DÉMARRAGE CLIC PROLONGÉ`);
        event.preventDefault(); // ← Empêcher la sélection de texte
        this.startLongClickTimer(event, d);
      })
      .on('mouseup', (event, d) => {
        console.log(`⬆ MOUSEUP sur: ${d.label} - ARRÊT CLIC PROLONGÉ`);
        this.cancelLongClickTimer();
      })
      .on('mouseleave', (event, d) => {
        console.log(` MOUSELEAVE de: ${d.label} - ANNULATION CLIC PROLONGÉ`);
        this.cancelLongClickTimer();
        this.hideTooltip();
      })
      // ✅ NOUVEAU: Gestion du simple clic (fixation du nœud)
      .on('click', (event, d) => {
        if (!this.longClickInProgress) {
          // Délai pour distinguer simple clic du double-clic
          setTimeout(() => {
            if (event.detail === 1) { // Simple clic seulement
              d.fx = d.fx ? null : d.x;
              d.fy = d.fy ? null : d.y;
              this.simulation.alpha(0.3).restart();
              console.log(` Nœud ${d.fx ? 'fixé' : 'libéré'}: ${d.label}`);
            }
          }, 200);
        }
      });

    console.log(' TOUS les gestionnaires d\'événements attachés aux nœuds');

    // Animation tick avec synchronisation hiérarchie
    this.simulation.on('tick', () => {
      // Mettre à jour les chemins courbés
      link.attr('d', d => this.createCurvedPath(d));

      // Mettre à jour les labels sur les courbes
      linkLabels
        .attr('x', d => this.getCurveMidpoint(d).x)
        .attr('y', d => this.getCurveMidpoint(d).y);

      // Mettre à jour les nœuds
      node.attr('transform', d => `translate(${d.x},${d.y})`);
      nodeLabels.attr('transform', d => `translate(${d.x},${d.y + d.size + 15})`);

      // ✅ SYNCHRONISER LA HIÉRARCHIE
      this.updateHierarchyPositions();
    });

    console.log(' === FIN RENDERNETWORKGRAPH - TOUT EST PRÊT ===');
  }

  // ✅ FONCTIONS CLIC PROLONGÉ CORRIGÉES
  startLongClickTimer(event, nodeData) {
    console.log(` Début clic prolongé sur: ${nodeData.label}`);

    // Nettoyer tout état précédent
    this.cancelLongClickTimer();

    // Stocker l'état
    this.longClickNode = nodeData;
    this.longClickEvent = event;
    this.longClickInProgress = true;

    // Afficher l'indicateur visuel
    this.showLongClickProgress(nodeData);

    // Démarrer le timer
    this.longClickTimer = setTimeout(() => {
      this.hideLongClickProgress();
      this.longClickInProgress = false;
      this.handleHierarchyRequest(event, nodeData);
      this.longClickTimer = null;
    }, 1200); // ← 1.2 secondes pour être sûr
  }

  cancelLongClickTimer() {
    if (this.longClickTimer) {
      clearTimeout(this.longClickTimer);
      this.longClickTimer = null;
    }

    // Nettoyer l'état
    this.longClickInProgress = false;
    this.longClickNode = null;
    this.longClickEvent = null;

    // Cacher l'indicateur visuel
    this.hideLongClickProgress();
  }

  showLongClickProgress(nodeData) {
    // Supprimer l'ancien indicateur s'il existe
    this.g.selectAll('.long-click-progress').remove();

    const progressGroup = this.g.append('g')
      .attr('class', 'long-click-progress')
      .attr('transform', `translate(${nodeData.x}, ${nodeData.y})`);

    // Cercle de fond
    progressGroup.append('circle')
      .attr('r', nodeData.size + 8)
      .style('fill', 'none')
      .style('stroke', '#FF9800')
      .style('stroke-width', 3)
      .style('opacity', 0.3);

    // Cercle de progression
    const circumference = 2 * Math.PI * (nodeData.size + 8);
    const progressCircle = progressGroup.append('circle')
      .attr('r', nodeData.size + 8)
      .style('fill', 'none')
      .style('stroke', '#FF9800')
      .style('stroke-width', 4)
      .style('stroke-linecap', 'round')
      .style('opacity', 0.8)
      .style('stroke-dasharray', `0 ${circumference}`)
      .style('transform', 'rotate(-90deg)'); // ← Commencer en haut

    // Animation de progression
    progressCircle
      .transition()
      .duration(1200) // ← Même durée que le timer
      .ease(d3.easeLinear)
      .style('stroke-dasharray', `${circumference} 0`);

    // Texte informatif
    progressGroup.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-35px')
      .style('font-size', '11px')
      .style('fill', '#FF9800')
      .style('font-weight', 'bold')
      .style('pointer-events', 'none')
      .text('🌳 Hiérarchie');
  }

  hideLongClickProgress() {
    this.g.selectAll('.long-click-progress').remove();
  }

  // ... reste du code inchangé (openAnalysisPanel, handleHierarchyRequest, etc.) ...

  async handleHierarchyRequest(event, nodeData) {

    try {
      // Cacher la hiérarchie actuelle si visible
      if (this.hierarchyVisible) {
        this.hideHierarchy();
      }

      // Vérifier que le service hiérarchie est disponible
      if (typeof window.hierarchyService === 'undefined') {
        this.showHierarchyError(nodeData, 'Service hiérarchie non disponible');
        return;
      }

      // Afficher un indicateur de chargement
      this.showHierarchyLoading(nodeData);

      // Récupérer la hiérarchie
      const hierarchyData = await window.hierarchyService.getHierarchy(nodeData.label);

      // Cacher l'indicateur de chargement
      this.hideHierarchyLoading();

      if (!hierarchyData.success) {
        this.showHierarchyError(nodeData, 'Aucune hiérarchie trouvée');
        return;
      }

      // Vérifier s'il y a des données hiérarchiques
      const stats = window.hierarchyService.getHierarchyStats(hierarchyData);
      if (stats.isEmpty) {
        this.showHierarchyError(nodeData, 'Concept sans hiérarchie parent/enfant');
        return;
      }

      // Afficher la hiérarchie
      this.showHierarchy(nodeData, hierarchyData);

    } catch (error) {
      console.error(` Erreur lors de la récupération hiérarchie:`, error);
      this.hideHierarchyLoading();
      this.showHierarchyError(nodeData, error.message);
    }
  }
  updateDimensions() {
    const containerRect = this.container.getBoundingClientRect();

    // Utiliser la taille du conteneur ou une taille par défaut
    this.width = Math.max(containerRect.width - this.margin.left - this.margin.right, 600);
    this.height = Math.max(containerRect.height - this.margin.top - this.margin.bottom, 400);

    // Si le conteneur n'a pas de taille, utiliser la fenêtre
    if (containerRect.width <= 0) {
      this.width = window.innerWidth - this.margin.left - this.margin.right - 100;
    }
    if (containerRect.height <= 0) {
      this.height = window.innerHeight - this.margin.top - this.margin.bottom - 200;
    }
  }

  renderNetworkGraph() {
    const networkData = this.parsedData.networkData;
    const nodes = [...networkData.nodes]; // Copie pour D3
    const links = [...networkData.links]; // Copie pour D3


    // Debug : Afficher les nœuds avec leur taille
    nodes.forEach(node => {
    });

    // Debug : Afficher les couleurs des liens
    links.forEach(link => {
    });

    const processedLinks = this.calculateLinkCurves(links);

    // Créer la simulation de force
    this.simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(processedLinks).id(d => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(this.width / 2, this.height / 2))
      .force('collision', d3.forceCollide().radius(d => d.size + 10));

    const link = this.g.append('g')
      .attr('class', 'links')
      .selectAll('path') // ← CHANGEMENT : path au lieu de line
      .data(processedLinks)
      .enter().append('path')
      .attr('class', 'link')
      .style('fill', 'none')
      .style('stroke', d => {
        return d.color || '#aaa'; // Utiliser la couleur du parser ou gris par défaut
      })
      .style('stroke-width', 3) // Plus épais pour mieux voir les couleurs
      .style('opacity', 0.8);

    // Labels des liens (repositionnés pour les courbes)
    const linkLabels = this.g.append('g')
      .attr('class', 'link-labels')
      .selectAll('text')
      .data(processedLinks)
      .enter().append('text')
      .attr('class', 'link-label')
      .style('font-size', '10px')
      .style('fill', '#666')
      .style('text-anchor', 'middle')
      .style('pointer-events', 'none')
      .text(d => d.label);

    // Dessiner les nœuds AVEC les couleurs du parser
    const node = this.g.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodes)
      .enter().append('g')
      .attr('class', 'node-group')
      .call(d3.drag()
        .on('start', (event, d) => this.dragstarted(event, d))
        .on('drag', (event, d) => this.dragged(event, d))
        .on('end', (event, d) => this.dragended(event, d)));

    // Cercles des nœuds avec couleurs du parser
    node.append('circle')
      .attr('r', d => d.size)
      .style('fill', d => {
        return d.color || '#808080'; // Utiliser la couleur du parser ou gris par défaut
      })
      .style('stroke', '#fff')
      .style('stroke-width', d => d.type === 'entity' ? 3 : 2)
      .style('cursor', 'pointer'); // ← NOUVEAU : Indique que c'est cliquable

    // Labels des nœuds
    const nodeLabels = this.g.append('g')
      .attr('class', 'node-labels')
      .selectAll('text')
      .data(nodes)
      .enter().append('text')
      .attr('class', 'node-label')
      .style('font-size', '12px')
      .style('font-weight', d => d.type === 'entity' ? 'bold' : 'normal')
      .style('fill', '#333')
      .style('text-anchor', 'middle')
      .style('pointer-events', 'none')
      .text(d => this.truncateLabel(d.label, 40));

    // Tooltip amélioré avec catégories et instruction
    node.on('mouseover', (event, d) => this.showTooltip(event, d))
      .on('mouseout', () => this.hideTooltip());

    node.on('dblclick', (event, d) => {

      // Empêcher les autres comportements
      event.stopPropagation();
      event.preventDefault();

      // Ouvrir le panneau avec les données
      this.openAnalysisPanel(d);
    });

    node.on('mousedown', (event, d) => {
      event.preventDefault(); // ← Empêcher la sélection de texte
      this.startLongClickTimer(event, d);
    })
    node.on('mouseup', (event, d) => {
      this.cancelLongClickTimer();
    })
    node.on('mouseleave', (event, d) => {
      this.cancelLongClickTimer();
      this.hideTooltip();
    })

    node.on('contextmenu', (event, d) => {
      event.preventDefault();
      console.log(` Menu contextuel désactivé sur: ${d.label}`);
    });

    node.on('click', (event, d) => {
      setTimeout(() => {
        if (event.detail === 1) { 
          d.fx = d.fx ? null : d.x;
          d.fy = d.fy ? null : d.y;
          this.simulation.alpha(0.3).restart();
          console.log(` Nœud ${d.fx ? 'fixé' : 'libéré'}: ${d.label}`);
        }
      }, 200);
    });

    this.simulation.on('tick', () => {
      // Mettre à jour les chemins courbés
      link.attr('d', d => this.createCurvedPath(d));

      // Mettre à jour les labels sur les courbes
      linkLabels
        .attr('x', d => this.getCurveMidpoint(d).x)
        .attr('y', d => this.getCurveMidpoint(d).y);

      // Mettre à jour les nœuds
      node.attr('transform', d => `translate(${d.x},${d.y})`);
      nodeLabels.attr('transform', d => `translate(${d.x},${d.y + d.size + 15})`);
    });
  }

  calculateLinkCurves(links) {
    // Grouper les liens par paire source-target
    const linkGroups = new Map();

    links.forEach(link => {
      const key = `${link.source}_${link.target}`;
      const reverseKey = `${link.target}_${link.source}`;

      // Utiliser la clé dans un sens cohérent
      const groupKey = key < reverseKey ? key : reverseKey;

      if (!linkGroups.has(groupKey)) {
        linkGroups.set(groupKey, []);
      }
      linkGroups.get(groupKey).push(link);
    });

    // Assigner des courbes à chaque groupe
    const processedLinks = [];

    linkGroups.forEach((groupLinks, groupKey) => {
      const linkCount = groupLinks.length;

      groupLinks.forEach((link, index) => {
        // Calculer l'offset de courbe
        let curveOffset = 0;

        if (linkCount > 1) {
          // Répartir les liens autour de la ligne droite
          const step = 60 / (linkCount - 1); // 60 pixels d'étalement maximum
          curveOffset = (index - (linkCount - 1) / 2) * step;
        }

        processedLinks.push({
          ...link,
          curveOffset: curveOffset,
          linkIndex: index,
          totalLinks: linkCount
        });

      });
    });

    return processedLinks;
  }

  createCurvedPath(d) {
    const sourceX = d.source.x;
    const sourceY = d.source.y;
    const targetX = d.target.x;
    const targetY = d.target.y;

    // Si pas de courbe, ligne droite
    if (!d.curveOffset || d.curveOffset === 0) {
      return `M${sourceX},${sourceY}L${targetX},${targetY}`;
    }

    // Calculer le point de contrôle pour la courbe
    const midX = (sourceX + targetX) / 2;
    const midY = (sourceY + targetY) / 2;

    // Vecteur perpendiculaire pour l'offset
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length === 0) return `M${sourceX},${sourceY}L${targetX},${targetY}`;

    // Point de contrôle décalé perpendiculairement
    const offsetX = midX + (-dy / length) * d.curveOffset;
    const offsetY = midY + (dx / length) * d.curveOffset;

    // Créer une courbe quadratique
    return `M${sourceX},${sourceY}Q${offsetX},${offsetY} ${targetX},${targetY}`;
  }

  getCurveMidpoint(d) {
    const sourceX = d.source.x;
    const sourceY = d.source.y;
    const targetX = d.target.x;
    const targetY = d.target.y;

    if (!d.curveOffset || d.curveOffset === 0) {
      return {
        x: (sourceX + targetX) / 2,
        y: (sourceY + targetY) / 2
      };
    }

    // Calculer le point milieu de la courbe
    const midX = (sourceX + targetX) / 2;
    const midY = (sourceY + targetY) / 2;

    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length === 0) return { x: midX, y: midY };

    const offsetX = midX + (-dy / length) * d.curveOffset * 0.5; // Milieu de la courbe
    const offsetY = midY + (dx / length) * d.curveOffset * 0.5;

    return { x: offsetX, y: offsetY };
  }

  openAnalysisPanel(nodeData) {

    // Vérifier que le panneau est disponible
    if (typeof window.analysisPanel === 'undefined') {
      console.error('AnalysisPanel non disponible ! Assurez-vous qu\'il est chargé.');
      alert('Erreur: Le panneau d\'analyse n\'est pas disponible.\n\nVérifiez que analysis-panel.js est chargé.');
      return;
    }

    // Vérifier que FusekiAnalysisRetriever est disponible
    if (typeof window.fusekiRetriever === 'undefined') {
      console.error('FusekiAnalysisRetriever non disponible ! Assurez-vous qu\'il est chargé.');
      alert('Erreur: Le système de récupération Fuseki n\'est pas disponible.\n\nVérifiez que fuseki-analysis-retriever.js est chargé.');
      return;
    }

    // Utiliser FusekiAnalysisRetriever au lieu de la logique CSV locale
    window.fusekiRetriever.getAllAnalysesData(nodeData)
      .then(allAnalysesData => {

        // Ouvrir le panneau avec toutes les analyses
        window.analysisPanel.openMultipleAnalyses(nodeData.label, allAnalysesData);
      })
      .catch(error => {
        console.error(` Erreur lors de la récupération des analyses pour ${nodeData.label}:`, error);

        // Afficher un message d'erreur mais ouvrir quand même le panneau avec des données d'erreur
        const errorAnalyses = nodeData.analyses ? nodeData.analyses.map(id => ({
          id: id,
          title: `Analyse ${id}`,
          vi: 'N/A',
          vd: 'N/A',
          relation: 'N/A',
          moderator: 'N/A',
          mediator: 'N/A',
          categoryVI: 'N/A',
          categoryVD: 'N/A',
          source: 'error',
          error: error.message,
          rawData: {
            Analysis_ID: id,
            Title: `Analyse ${id} (erreur Fuseki)`,
            Authors: 'Erreur de récupération',
            'Year ': 'N/A',
            ERROR: error.message
          }
        })) : [];

        // Ouvrir le panneau même en cas d'erreur pour informer l'utilisateur
        window.analysisPanel.openMultipleAnalyses(
          `${nodeData.label} (Erreur Fuseki)`,
          errorAnalyses
        );

        // Optionnel : afficher une notification
        if (confirm(`Erreur lors de la récupération des données depuis Fuseki:\n\n${error.message}\n\nVoulez-vous réessayer ?`)) {
          // Réessayer après un délai
          setTimeout(() => this.openAnalysisPanel(nodeData), 1000);
        }
      });
  }

 

  // Méthode utilitaire pour créer une analyse d'erreur
  createErrorAnalysis(analysisId, errorMessage) {
    return {
      id: analysisId,
      title: `Analyse ${analysisId}`,
      vi: 'N/A',
      vd: 'N/A',
      relation: 'N/A',
      moderator: 'N/A',
      mediator: 'N/A',
      categoryVI: 'N/A',
      categoryVD: 'N/A',
      error: errorMessage,
      rawData: {
        Analysis_ID: analysisId,
        Title: `Analyse ${analysisId} (erreur)`,
        Authors: 'Données non disponibles',
        Year: 'N/A'
      }
    };
  }

  // Fonctions de drag (inchangées)
  dragstarted(event, d) {
    if (!event.active) this.simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  dragended(event, d) {
    if (!event.active) this.simulation.alphaTarget(0);
    // Ne pas libérer automatiquement - laisser l'utilisateur cliquer
  }

  truncateLabel(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  showTooltip(event, d) {
    // Supprimer l'ancien tooltip
    d3.selectAll('.tooltip').remove();

    const tooltip = d3.select('body').append('div')
      .attr('class', 'tooltip')
      .style('position', 'absolute')
      .style('background', 'rgba(0, 0, 0, 0.9)')
      .style('color', 'white')
      .style('padding', '10px')
      .style('border-radius', '5px')
      .style('pointer-events', 'none')
      .style('font-size', '12px')
      .style('opacity', 0);

    let tooltipText = `<strong>${d.label}</strong><br/>`;
    tooltipText += `Type: ${d.type}<br/>`;
    if (d.category) tooltipText += `Catégorie: ${d.category}<br/>`;
    if (d.analyses) tooltipText += `Analyses: ${d.analyses.length}<br/>`;
    else if (d.analysisId) tooltipText += `Analyse: ${d.analysisId}<br/>`;
    tooltipText += `<em>Double-clic pour ouvrir le panneau</em>`;

    tooltip.html(tooltipText)
      .style('left', (event.pageX + 10) + 'px')
      .style('top', (event.pageY - 10) + 'px')
      .transition()
      .duration(200)
      .style('opacity', 1);
  }

  hideTooltip() {
    d3.selectAll('.tooltip')
      .transition()
      .duration(200)
      .style('opacity', 0)
      .remove();
  }

  // addControls() {
  //   const controls = d3.select(this.container)
  //     .insert('div', ':first-child')
  //     .attr('class', 'graph-controls')
  //     .style('margin-bottom', '10px');

  //   // Légende des couleurs
  //   this.addColorLegend(controls);

  //   // Instructions d'interaction
  //   this.addInteractionInstructions(controls);

  //   // Informations
  //   controls.append('span')
  //     .style('margin-left', '20px')
  //     .text(`${this.parsedData.networkData.nodes.length} nœuds, ${this.parsedData.networkData.links.length} liens`);
  // }

  addColorLegend() {
    // Créer un conteneur pour la légende en dehors du SVG
    const legendContainer = d3.select(this.container)
      .insert('div', 'svg')
      .attr('class', 'graph-legend')
      .style('background-color', '#f8f9fa')
      .style('border', '1px solid #dee2e6')
      .style('border-radius', '8px')
      .style('padding', '15px')
      .style('margin-bottom', '15px')
      .style('font-family', '"Segoe UI", sans-serif')
      .style('box-shadow', '0 2px 4px rgba(0,0,0,0.1)');

    // En-tête avec titre et bouton fermer
    const headerDiv = legendContainer.append('div')
      .style('display', 'flex')
      .style('justify-content', 'space-between')
      .style('align-items', 'center')
      .style('margin-bottom', '15px');

    // Titre de la légende
    headerDiv.append('h4')
      .style('margin', '0')
      .style('font-size', '16px')
      .style('font-weight', 'bold')
      .style('color', '#2c3e50')
      .style('border-bottom', '2px solid #3498db')
      .style('padding-bottom', '5px')
      .text('🎨 Légende des couleurs');

    // Bouton pour fermer/ouvrir la légende
    const toggleButton = headerDiv.append('button')
      .style('background', 'none')
      .style('border', '1px solid #dee2e6')
      .style('border-radius', '4px')
      .style('padding', '5px 8px')
      .style('cursor', 'pointer')
      .style('font-size', '14px')
      .style('color', '#6c757d')
      .style('transition', 'all 0.2s ease')
      .text('─')
      .attr('title', 'Fermer la légende');

    // Conteneur pour le contenu de la légende
    const contentContainer = legendContainer.append('div')
      .attr('class', 'legend-content');

    // Section Variables Dépendantes (ACADS)
    const acadSection = contentContainer.append('div')
      .style('margin-bottom', '20px');

    acadSection.append('h5')
      .style('margin', '0 0 10px 0')
      .style('font-size', '14px')
      .style('font-weight', 'bold')
      .style('color', '#27ae60')
      .text('Variables Dépendantes (ACADS)');

    const acadLegend = acadSection.append('div')
      .style('display', 'flex')
      .style('flex-wrap', 'wrap')
      .style('gap', '15px');

    // Éléments ACADS avec couleurs du parser
    const acadItems = [
      { label: 'DEAB', color: '#f54542', description: 'Troubles du comportement alimentaire définis' },
      { label: 'Multiple', color: '#821111', description: 'Analyses concernant plusieurs ACADS' }
    ];

    acadItems.forEach(item => {
      const itemDiv = acadLegend.append('div')
        .style('display', 'flex')
        .style('align-items', 'center')
        .style('gap', '8px');

      itemDiv.append('div')
        .style('width', '16px')
        .style('height', '16px')
        .style('background-color', item.color)
        .style('border-radius', '50%')
        .style('border', '2px solid white')
        .style('box-shadow', '0 0 3px rgba(0,0,0,0.3)');

      itemDiv.append('span')
        .style('font-size', '12px')
        .style('font-weight', 'bold')
        .style('color', '#2c3e50')
        .text(item.label);

      itemDiv.append('span')
        .style('font-size', '11px')
        .style('color', '#7f8c8d')
        .text(`- ${item.description}`);
    });

    // Section Variables Indépendantes (Facteurs)
    const factorSection = contentContainer.append('div')
      .style('margin-bottom', '20px');

    factorSection.append('h5')
      .style('margin', '0 0 10px 0')
      .style('font-size', '14px')
      .style('font-weight', 'bold')
      .style('color', '#27ae60')
      .text('Variables Indépendantes (Facteurs)');

    const factorLegend = factorSection.append('div')
      .style('display', 'flex')
      .style('flex-direction', 'column')
      .style('gap', '8px');

    // Éléments Facteurs avec couleurs du parser
    const factorItems = [
      { label: 'Interpersonnel DEAB', color: '#00112b', description: 'Relations sociales, famille, pairs' },
      { label: 'Intrapersonnel DEAB', color: '#0050ac', description: 'Facteurs psychologiques individuels' },
      { label: 'Autres comportements', color: '#72a4d7', description: 'Comportements non spécifiques aux DEAB' },
      { label: 'Socioculturel DEAB', color: '#bee0fd', description: 'Facteurs culturels et sociétaux' }
    ];

    factorItems.forEach(item => {
      const itemDiv = factorLegend.append('div')
        .style('display', 'flex')
        .style('align-items', 'center')
        .style('gap', '8px')
        .style('margin-bottom', '3px');

      itemDiv.append('div')
        .style('width', '16px')
        .style('height', '16px')
        .style('background-color', item.color)
        .style('border-radius', '50%')
        .style('border', '2px solid white')
        .style('box-shadow', '0 0 3px rgba(0,0,0,0.3)');

      itemDiv.append('span')
        .style('font-size', '12px')
        .style('font-weight', 'bold')
        .style('color', '#2c3e50')
        .text(item.label);

      itemDiv.append('span')
        .style('font-size', '11px')
        .style('color', '#7f8c8d')
        .text(`- ${item.description}`);
    });

    // Section Médiateurs/Modérateurs
    const mediatorSection = contentContainer.append('div')
      .style('margin-bottom', '15px');

    mediatorSection.append('h5')
      .style('margin', '0 0 10px 0')
      .style('font-size', '14px')
      .style('font-weight', 'bold')
      .style('color', '#27ae60')
      .text('Médiateurs et Modérateurs');

    const mediatorLegend = mediatorSection.append('div')
      .style('display', 'flex')
      .style('flex-wrap', 'wrap')
      .style('gap', '15px');

    const mediatorItems = [
      { label: 'Médiateur', color: '#FFD700', description: 'Variable intermédiaire' },
      { label: 'Modérateur', color: '#FF8C00', description: 'Variable modifiante' }
    ];

    mediatorItems.forEach(item => {
      const itemDiv = mediatorLegend.append('div')
        .style('display', 'flex')
        .style('align-items', 'center')
        .style('gap', '8px');

      itemDiv.append('div')
        .style('width', '16px')
        .style('height', '16px')
        .style('background-color', item.color)
        .style('border-radius', '50%')
        .style('border', '2px solid white')
        .style('box-shadow', '0 0 3px rgba(0,0,0,0.3)');

      itemDiv.append('span')
        .style('font-size', '12px')
        .style('font-weight', 'bold')
        .style('color', '#2c3e50')
        .text(item.label);

      itemDiv.append('span')
        .style('font-size', '11px')
        .style('color', '#7f8c8d')
        .text(`- ${item.description}`);
    });

    // Section Relations (couleurs des liens)
    const relationSection = contentContainer.append('div');

    relationSection.append('h5')
      .style('margin', '0 0 10px 0')
      .style('font-size', '14px')
      .style('font-weight', 'bold')
      .style('color', '#27ae60')
      .text('Types de relations (couleurs des liens)');

    const relationLegend = relationSection.append('div')
      .style('display', 'flex')
      .style('flex-wrap', 'wrap')
      .style('gap', '15px');

    const relationItems = [
      { label: 'Facteur de risque (+)', color: '#E53E3E', description: 'Relation positive' },
      { label: 'Facteur protecteur (-)', color: '#38A169', description: 'Relation négative/protectrice' },
      { label: 'Non significatif (NS)', color: '#718096', description: 'Relation non significative' }
    ];

    relationItems.forEach(item => {
      const itemDiv = relationLegend.append('div')
        .style('display', 'flex')
        .style('align-items', 'center')
        .style('gap', '8px');

      itemDiv.append('div')
        .style('width', '20px')
        .style('height', '3px')
        .style('background-color', item.color)
        .style('border-radius', '2px');

      itemDiv.append('span')
        .style('font-size', '12px')
        .style('font-weight', 'bold')
        .style('color', '#2c3e50')
        .text(item.label);

      itemDiv.append('span')
        .style('font-size', '11px')
        .style('color', '#7f8c8d')
        .text(`- ${item.description}`);
    });

    // Instructions d'interaction
    const instructionSection = contentContainer.append('div')
      .style('margin-top', '15px')
      .style('padding-top', '15px')
      .style('border-top', '1px solid #dee2e6');

    instructionSection.append('h5')
      .style('margin', '0 0 8px 0')
      .style('font-size', '13px')
      .style('font-weight', 'bold')
      .style('color', '#e67e22')
      .text('💡 Interactions');

    const instructions = instructionSection.append('div')
      .style('font-size', '11px')
      .style('color', '#7f8c8d')
      .style('line-height', '1.4');

    instructions.append('div').text('• Double-clic sur un nœud : Ouvrir le panneau d\'analyses');
    instructions.append('div').text('• Clic prolongé : Afficher la hiérarchie');
    instructions.append('div').text('• Clic simple : Fixer/libérer un nœud');
    instructions.append('div').text('• Survol : Afficher les informations');

    // Appliquer l'état initial de la légende (fermé/ouvert)
    if (this.legendCollapsed) {
      contentContainer.style('display', 'none');
      toggleButton.text('+').attr('title', 'Ouvrir la légende');
    }

    // Ajouter l'événement de clic sur le bouton toggle
    toggleButton.on('click', () => {
      const isCurrentlyCollapsed = contentContainer.style('display') === 'none';
      
      if (isCurrentlyCollapsed) {
        // Ouvrir la légende
        contentContainer.style('display', 'block');
        toggleButton.text('─').attr('title', 'Fermer la légende');
        this.legendCollapsed = false;
      } else {
        // Fermer la légende
        contentContainer.style('display', 'none');
        toggleButton.text('+').attr('title', 'Ouvrir la légende');
        this.legendCollapsed = true;
      }
      
      // Sauvegarder l'état dans localStorage
      localStorage.setItem('ia-das-legend-collapsed', this.legendCollapsed.toString());
    });

    // Effet hover sur le bouton
    toggleButton
      .on('mouseenter', function() {
        d3.select(this)
          .style('background-color', '#e9ecef')
          .style('border-color', '#adb5bd');
      })
      .on('mouseleave', function() {
        d3.select(this)
          .style('background-color', 'transparent')
          .style('border-color', '#dee2e6');
      });
  }

  addInteractionInstructions(controls) {

  }

  startLongClickTimer(event, nodeData) {

    this.cancelLongClickTimer();
    this.longClickNode = nodeData;
    this.longClickEvent = event;
    this.showLongClickProgress(nodeData);

    this.longClickTimer = setTimeout(() => {
      this.hideLongClickProgress();
      this.handleHierarchyRequest(event, nodeData);
      this.longClickTimer = null;
    }, 800);
  }

  cancelLongClickTimer() {
    if (this.longClickTimer) {
      clearTimeout(this.longClickTimer);
      this.longClickTimer = null;
      this.hideLongClickProgress();
    }
  }

  showLongClickProgress(nodeData) {
    this.g.selectAll('.long-click-progress').remove();

    const progressGroup = this.g.append('g')
      .attr('class', 'long-click-progress')
      .attr('transform', `translate(${nodeData.x}, ${nodeData.y})`);

    progressGroup.append('circle')
      .attr('r', nodeData.size + 8)
      .style('fill', 'none')
      .style('stroke', '#FF9800')
      .style('stroke-width', 3)
      .style('opacity', 0.3);

    const progressCircle = progressGroup.append('circle')
      .attr('r', nodeData.size + 8)
      .style('fill', 'none')
      .style('stroke', '#FF9800')
      .style('stroke-width', 4)
      .style('stroke-linecap', 'round')
      .style('opacity', 0.8)
      .style('stroke-dasharray', `0 ${2 * Math.PI * (nodeData.size + 8)}`);

    progressCircle
      .transition()
      .duration(800)
      .ease(d3.easeLinear)
      .style('stroke-dasharray', `${2 * Math.PI * (nodeData.size + 8)} 0`);
  }

  hideLongClickProgress() {
    this.g.selectAll('.long-click-progress').remove();
  }

  async handleHierarchyRequest(event, nodeData) {
  

    try {
      // Cacher la hiérarchie actuelle si visible
      if (this.hierarchyVisible) {
        this.hideHierarchy();
      }

      // Vérifier que le service hiérarchie est disponible
      if (typeof window.hierarchyService === 'undefined') {
        console.error('HierarchyService non disponible !');
        this.showHierarchyError(nodeData, 'Service hiérarchie non disponible');
        return;
      }

      // Afficher un indicateur de chargement
      this.showHierarchyLoading(nodeData);

      // Récupérer la hiérarchie
      console.log(`Récupération hiérarchie pour: "${nodeData.label}"`);
      const hierarchyData = await window.hierarchyService.getHierarchy(nodeData.label);

      // Cacher l'indicateur de chargement
      this.hideHierarchyLoading();

      if (!hierarchyData.success) {
        console.warn(`Pas de hiérarchie trouvée pour: ${nodeData.label}`);
        this.showHierarchyError(nodeData, 'Aucune hiérarchie trouvée');
        return;
      }

      // Vérifier s'il y a des données hiérarchiques
      const stats = window.hierarchyService.getHierarchyStats(hierarchyData);
      if (stats.isEmpty) {
        console.log(` Concept sans hiérarchie: ${nodeData.label}`);
        this.showHierarchyError(nodeData, 'Concept sans hiérarchie parent/enfant');
        return;
      }

      // Afficher la hiérarchie
      console.log(` Affichage hiérarchie: ${stats.parentCount} parents, ${stats.childCount} enfants`);
      this.showHierarchy(nodeData, hierarchyData);

    } catch (error) {
      console.error(` Erreur lors de la récupération hiérarchie:`, error);
      this.hideHierarchyLoading();
      this.showHierarchyError(nodeData, error.message);
    }
  }

  // ========================================
  // 4. FONCTION: Afficher indicateur de chargement
  // ========================================
  showHierarchyLoading(centerNode) {

    // Créer un nœud de chargement temporaire
    const loadingNode = {
      id: 'hierarchy_loading',
      x: centerNode.x + 60,
      y: centerNode.y,
      fx: centerNode.x + 60,
      fy: centerNode.y
    };

    // Ajouter le nœud de chargement visuellement
    const loadingGroup = this.g.append('g')
      .attr('class', 'hierarchy-loading')
      .attr('transform', `translate(${loadingNode.x}, ${loadingNode.y})`);

    // Cercle de chargement animé
    loadingGroup.append('circle')
      .attr('r', 15)
      .style('fill', '#FFA500')
      .style('stroke', '#FF8C00')
      .style('stroke-width', 2)
      .style('opacity', 0.8);

    // Texte "..."
    loadingGroup.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .style('font-size', '12px')
      .style('fill', 'white')
      .style('font-weight', 'bold')
      .text('...');

    // Animation de rotation
    loadingGroup
      .transition()
      .duration(1000)
      .ease(d3.easeLinear)
      .attrTween('transform', () => {
        return (t) => {
          const angle = t * 360;
          return `translate(${loadingNode.x}, ${loadingNode.y}) rotate(${angle})`;
        };
      })
      .on('end', function () {
        // Répéter l'animation si le nœud existe encore
        if (d3.select(this).node()) {
          d3.select(this).transition().duration(1000).ease(d3.easeLinear)
            .attrTween('transform', () => (t) => {
              const angle = t * 360;
              return `translate(${loadingNode.x}, ${loadingNode.y}) rotate(${angle})`;
            })
            .on('end', arguments.callee);
        }
      });
  }

  // ========================================
  // 5. FONCTION: Cacher indicateur de chargement
  // ========================================
  hideHierarchyLoading() {
    this.g.selectAll('.hierarchy-loading').remove();
  }

  // ========================================
  // 6. FONCTION: Afficher la hiérarchie
  // ========================================
  showHierarchy(centerNode, hierarchyData) {
    console.log('🌳 Affichage hiérarchie diagonale pour:', centerNode.label);
    this.hierarchyVisible = true;
    this.currentHierarchyConcept = centerNode.label;
    this.hierarchyCenterNode = centerNode; // Stocker pour synchronisation

    // Nettoyer les éléments hiérarchiques précédents
    this.cleanupHierarchy();

    const allHierarchyNodes = [];
    const allHierarchyLinks = [];

    // === CRÉER LES NŒUDS PARENTS (DIAGONAL BAS-GAUCHE) ===
    const parentLevelDistance = 70; // Distance entre niveaux
    
    hierarchyData.children.forEach((parent, index) => {
      const level = index + 1; // Niveau de profondeur
      const distance = parentLevelDistance * level;
      
      // Position diagonale bas-gauche
      const angleRad = (225 * Math.PI) / 180; // 225° = bas-gauche
      const x = centerNode.x + Math.cos(angleRad) * distance;
      const y = centerNode.y + Math.sin(angleRad) * distance;

      const parentNode = {
        id: `hierarchy_parent_${index}`,
        label: parent.label,
        uri: parent.uri,
        type: 'hierarchy_parent',
        level: level,
        relativeX: Math.cos(angleRad) * distance, // Position relative au centre
        relativeY: Math.sin(angleRad) * distance,
        x: x,
        y: y,
        originalData: parent
      };

      allHierarchyNodes.push(parentNode);

      // Lien hiérarchique : Généralisation du centre vers le parent
      allHierarchyLinks.push({
        source: centerNode,
        target: parentNode,
        type: 'hierarchy_parent_link',
        id: `hierarchy_parent_link_${index}`,
        direction: 'center_to_parent', // Généralisation vers le parent
        level: level
      });
    });

    // === CRÉER LES NŒUDS ENFANTS (DIAGONAL HAUT-DROITE - OPPOSÉ AUX PARENTS) ===
    const childLevelDistance = 70;
    
    hierarchyData.parents.forEach((child, index) => {
      const level = index + 1;
      const distance = childLevelDistance * level;
      
      // Position diagonale haut-droite (opposé aux parents)
      const angleRad = (315 * Math.PI) / 180; // 315° = haut-droite
      const x = centerNode.x + Math.cos(angleRad) * distance;
      const y = centerNode.y + Math.sin(angleRad) * distance;

      const childNode = {
        id: `hierarchy_child_${index}`,
        label: child.label,
        uri: child.uri,
        type: 'hierarchy_child',
        level: level,
        relativeX: Math.cos(angleRad) * distance,
        relativeY: Math.sin(angleRad) * distance,
        x: x,
        y: y,
        originalData: child
      };

      allHierarchyNodes.push(childNode);

      // Lien hiérarchique : Spécialisation de l'enfant vers le centre
      allHierarchyLinks.push({
        source: childNode,
        target: centerNode,
        type: 'hierarchy_child_link',
        id: `hierarchy_child_link_${index}`,
        direction: 'child_to_center', // Spécialisation de l'enfant vers le centre
        level: level
      });
    });

    // Stocker pour nettoyage ultérieur
    this.hierarchyNodes = allHierarchyNodes;
    this.hierarchyLinks = allHierarchyLinks;

    // === AFFICHAGE VISUEL ===
    this.renderHierarchyNodesDiagonal(allHierarchyNodes);
    this.renderHierarchyLinksDiagonal(allHierarchyLinks);
    this.addArrowMarkers(); // Ajouter les définitions de flèches

    // === SYNCHRONISATION AVEC SIMULATION ===
    this.setupHierarchySync();

    console.log(`✅ Hiérarchie diagonale: ${hierarchyData.children.length} parents, ${hierarchyData.parents.length} enfants`);
  }

  // ========================================
  // 7. FONCTION: Rendu visuel des nœuds hiérarchiques
  // ========================================
  renderHierarchyNodesDiagonal(hierarchyNodes) {
    console.log('📐 Rendu nœuds diagonaux:', hierarchyNodes.length);

    const hierarchyGroup = this.g.append('g').attr('class', 'hierarchy-nodes');

    const nodeGroups = hierarchyGroup.selectAll('.hierarchy-node')
      .data(hierarchyNodes)
      .enter().append('g')
      .attr('class', 'hierarchy-node')
      .attr('transform', d => `translate(${d.x}, ${d.y})`);

    // Cercles des nœuds avec couleurs vertes pour toute la hiérarchie
    nodeGroups.append('circle')
      .attr('r', d => Math.max(12, 20 - d.level * 2)) // Plus petit à mesure qu'on s'éloigne
      .style('fill', d => {
        // Dégradé de vert pour toute la hiérarchie
        const intensity = Math.max(0.4, 1 - d.level * 0.15);
        if (d.type === 'hierarchy_parent') {
          return `rgba(46, 125, 50, ${intensity})`; // Vert foncé pour parents
        } else {
          return `rgba(76, 175, 80, ${intensity})`; // Vert clair pour enfants
        }
      })
      .style('stroke', '#2E7D32')
      .style('stroke-width', 2)
      .style('opacity', 0.9)
      .style('cursor', 'pointer');

    // Labels dans les cercles
    nodeGroups.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .style('font-size', d => Math.max(8, 12 - d.level))
      .style('font-weight', 'bold')
      .style('fill', 'white')
      .style('pointer-events', 'none')
      .text(d => this.truncateLabel(d.label, Math.max(4, 8 - d.level)));

    // Labels complets à côté avec position adaptée
    nodeGroups.append('text')
      .attr('text-anchor', d => d.type === 'hierarchy_parent' ? 'end' : 'start')
      .attr('dx', d => d.type === 'hierarchy_parent' ? -25 : 25)
      .attr('dy', '0.35em')
      .style('font-size', '11px')
      .style('fill', '#2E7D32') // Vert pour tous les labels
      .style('font-weight', 'bold')
      .style('pointer-events', 'none')
      .text(d => d.label);

    // Indicateurs de niveau N1, N2, N3 supprimés pour plus de clarté

    // Animation d'apparition en cascade
    nodeGroups.style('opacity', 0)
      .transition()
      .duration(400)
      .delay((d, i) => i * 150)
      .style('opacity', 1);

    // Tooltip amélioré
    nodeGroups.on('mouseover', (event, d) => {
      this.showHierarchyTooltipDiagonal(event, d);
    }).on('mouseout', () => {
      this.hideTooltip();
    });
  }


  renderHierarchyLinksDiagonal(hierarchyLinks) {
    console.log('🏹 Rendu liens diagonaux avec flèches:', hierarchyLinks.length);

    const linksGroup = this.g.append('g').attr('class', 'hierarchy-links');

    const links = linksGroup.selectAll('.hierarchy-link')
      .data(hierarchyLinks)
      .enter().append('line')
      .attr('class', 'hierarchy-link')
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y)
      .style('stroke', d => {
        // Couleur verte pour tous les liens
        const intensity = Math.max(0.6, 1 - d.level * 0.1);
        return `rgba(46, 125, 50, ${intensity})`;
      })
      .style('stroke-width', d => Math.max(2, 4 - d.level * 0.5))
      .style('opacity', 0.8)
      .attr('marker-end', d => 
        d.direction === 'center_to_parent' ? 'url(#arrow-specialization)' : 
        d.direction === 'child_to_center' ? 'url(#arrow-specialization)' : 
        'url(#arrow-specialization)')
      .style('stroke-dasharray', d => d.level > 1 ? '4,2' : 'none'); // Pointillés pour niveaux éloignés

    // Animation d'apparition en cascade
    links.style('opacity', 0)
      .transition()
      .duration(300)
      .delay((d, i) => i * 100)
      .style('opacity', 0.8);
  }

  // Ajouter les définitions de flèches SVG
  addArrowMarkers() {
    // Supprimer les anciens marqueurs s'ils existent
    this.svg.select('defs').remove();
    
    const defs = this.svg.append('defs');

    // Flèche unique pour la spécialisation hiérarchique - Verte
    defs.append('marker')
      .attr('id', 'arrow-specialization')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .style('fill', '#2E7D32')
      .style('opacity', 0.8);
  }

  // ========================================
  // 9. FONCTIONS: Gestion des erreurs et nettoyage
  // ========================================
  showHierarchyError(nodeData, errorMessage) {

    // Afficher temporairement un message d'erreur
    const errorGroup = this.g.append('g')
      .attr('class', 'hierarchy-error')
      .attr('transform', `translate(${nodeData.x + 60}, ${nodeData.y})`);

    errorGroup.append('circle')
      .attr('r', 20)
      .style('fill', '#F44336')
      .style('stroke', '#D32F2F')
      .style('stroke-width', 2)
      .style('opacity', 0.9);

    errorGroup.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .style('font-size', '16px')
      .style('fill', 'white')
      .text('❌');

    errorGroup.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '35px')
      .style('font-size', '10px')
      .style('fill', '#F44336')
      .style('font-weight', 'bold')
      .text('Pas de hiérarchie');

    // Supprimer automatiquement après 3 secondes
    setTimeout(() => {
      errorGroup.transition().duration(500).style('opacity', 0).remove();
    }, 3000);
  }

  hideHierarchy() {
    this.cleanupHierarchy();
    this.hierarchyVisible = false;
    this.currentHierarchyConcept = null;
  }

  cleanupHierarchy() {
    this.g.selectAll('.hierarchy-nodes').remove();
    this.g.selectAll('.hierarchy-links').remove();
    this.g.selectAll('.hierarchy-loading').remove();
    this.g.selectAll('.hierarchy-error').remove();
    this.hierarchyNodes = [];
    this.hierarchyLinks = [];
  }

  setupHierarchyCloseHandlers() {
    // Fermer en cliquant ailleurs
    d3.select('body').on('click.hierarchy', (event) => {
      if (!event.target.closest('.hierarchy-node') && !event.target.closest('.node-group')) {
        this.hideHierarchy();
      }
    });

    // Fermer avec Échap
    d3.select('body').on('keydown.hierarchy', (event) => {
      if (event.key === 'Escape' && this.hierarchyVisible) {
        this.hideHierarchy();
      }
    });
  }

  // Fonction de synchronisation des positions hiérarchiques
  setupHierarchySync() {
    // Cette fonction sera appelée dans le tick de simulation
  }

  updateHierarchyPositions() {
    if (!this.hierarchyVisible || !this.hierarchyCenterNode || !this.hierarchyNodes.length) {
      return;
    }

    // Mettre à jour les positions des nœuds hiérarchiques
    this.hierarchyNodes.forEach(node => {
      node.x = this.hierarchyCenterNode.x + node.relativeX;
      node.y = this.hierarchyCenterNode.y + node.relativeY;
    });

    // Appliquer visuellement les nouvelles positions
    this.g.selectAll('.hierarchy-node')
      .attr('transform', d => `translate(${d.x}, ${d.y})`);

    // Mettre à jour les liens
    this.g.selectAll('.hierarchy-link')
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);
  }

  showHierarchyTooltipDiagonal(event, d) {
    d3.selectAll('.tooltip').remove();

    const tooltip = d3.select('body').append('div')
      .attr('class', 'tooltip')
      .style('position', 'absolute')
      .style('background', d => d.type === 'hierarchy_parent' ? 'rgba(25, 118, 210, 0.95)' : 'rgba(56, 142, 60, 0.95)')
      .style('color', 'white')
      .style('padding', '8px 12px')
      .style('border-radius', '5px')
      .style('pointer-events', 'none')
      .style('font-size', '12px')
      .style('opacity', 0);

    const relationText = d.type === 'hierarchy_parent' 
      ? `Parent (niveau ${d.level})` 
      : `Enfant (niveau ${d.level})`;
    const tooltipText = `<strong>${d.label}</strong><br/>${relationText} de "${this.currentHierarchyConcept}"<br/><em>Hiérarchie ontologique</em>`;

    tooltip.html(tooltipText)
      .style('left', (event.pageX + 10) + 'px')
      .style('top', (event.pageY - 10) + 'px')
      .transition()
      .duration(200)
      .style('opacity', 1);
  }

  showHierarchyTooltip(event, d) {
    d3.selectAll('.tooltip').remove();

    const tooltip = d3.select('body').append('div')
      .attr('class', 'tooltip')
      .style('position', 'absolute')
      .style('background', 'rgba(46, 125, 50, 0.95)')
      .style('color', 'white')
      .style('padding', '8px 12px')
      .style('border-radius', '5px')
      .style('pointer-events', 'none')
      .style('font-size', '12px')
      .style('opacity', 0);

    const relationText = d.type === 'hierarchy_parent' ? 'Parent de' : 'Enfant de';
    const tooltipText = `<strong>${d.label}</strong><br/>${relationText} "${this.currentHierarchyConcept}"<br/><em>Concept ontologique</em>`;

    tooltip.html(tooltipText)
      .style('left', (event.pageX + 10) + 'px')
      .style('top', (event.pageY - 10) + 'px')
      .transition()
      .duration(200)
      .style('opacity', 1);
  }

}