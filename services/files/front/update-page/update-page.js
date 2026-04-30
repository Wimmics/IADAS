// JavaScript pour la page de mise à jour de l'ontologie
document.addEventListener('DOMContentLoaded', function() {
    console.log(' Page de mise à jour chargée');
    
    // Récupération des boutons
    const addAnalysisBtn = document.getElementById('addAnalysisBtn');
    const modifyAnalysisBtn = document.getElementById('modifyAnalysisBtn');
    const rebuildOntologyBtn = document.getElementById('rebuildOntologyBtn');
    
    // Gestionnaire pour "Ajouter une analyse"
    if (addAnalysisBtn) {
        addAnalysisBtn.addEventListener('click', function() {
            console.log(' Bouton Ajouter une analyse cliqué');
            
            // Redirection vers la page de formulaire d'ajout
            window.location.href = './add-analysis.html';
        });
        
        console.log(' Gestionnaire "Ajouter" attaché');
    } else {
        console.error('Bouton "Ajouter une analyse" non trouvé');
    }
    
    // Gestionnaire pour "Modifier une analyse"
    if (modifyAnalysisBtn) {
        modifyAnalysisBtn.addEventListener('click', function() {
            console.log(' Bouton Modifier une analyse cliqué');
            
            // Redirection vers la page de sélection/modification
            window.location.href = './modify-analysis.html';
        });
        
        console.log('Gestionnaire "Modifier" attaché');
    } else {
        console.error(' Bouton "Modifier une analyse" non trouvé');
    }
    
    // Gestionnaire pour "Reconstruire ontologie"
    if (rebuildOntologyBtn) {
        rebuildOntologyBtn.addEventListener('click', function() {
            console.log(' Bouton Reconstruire ontologie cliqué');
            
            // Redirection vers la page d'import CSV
            window.location.href = './import-ontology.html';
        });
        
        console.log(' Gestionnaire "Reconstruire" attaché');
    } else {
        console.error(' Bouton "Reconstruire ontologie" non trouvé');
    }
    
    // Animation au survol des boutons
    const actionButtons = document.querySelectorAll('.action-btn');
    
    actionButtons.forEach(button => {
        button.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-2px)';
        });
        
        button.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
        });
    });
    
    console.log(' Animations des boutons configurées');
});