// Animation typewriter pour le logo subtitle
document.addEventListener('DOMContentLoaded', function() {
    const subtitle = document.getElementById('logoSubtitle');
    if (!subtitle) return;
    
    const fullText = "IA-DAS : Utilisation de l'Intelligence Artificielle pour mieux Détecter et prévenir les Attitudes et comportements alimentaires dysfonctionnels en Sport";
    let currentIndex = 0;
    
    // Ajouter la classe typewriter pour l'effet de curseur
    subtitle.classList.add('typewriter');
    
    // Fonction typewriter
    function typeWriter() {
        if (currentIndex < fullText.length) {
            subtitle.textContent = fullText.substring(0, currentIndex + 1);
            currentIndex++;
            setTimeout(typeWriter, 3000 / fullText.length); // 3 secondes au total
        } else {
            // Animation terminée, supprimer le curseur clignotant
            subtitle.classList.remove('typewriter');
        }
    }
    
    // Démarrer l'animation après un petit délai
    setTimeout(typeWriter, 500);
});