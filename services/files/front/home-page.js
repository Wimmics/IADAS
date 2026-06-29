// Fonctionnalité de date de dernière mise à jour
document.addEventListener('DOMContentLoaded', function() {
    loadLastUpdateDate();
    loadQualityBanner();
});

async function loadLastUpdateDate() {
    try {
        // Vérifier d'abord si on a une date stockée localement
        const storedUpdate = localStorage.getItem('lastOntologyUpdate');
        
        if (storedUpdate) {
            const lastUpdate = new Date(storedUpdate);
            const options = { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            };
            
            const formattedDate = lastUpdate.toLocaleDateString('fr-FR', options);
            document.getElementById('lastUpdateDate').textContent = formattedDate;
            return;
        }
        
        // Récupérer la date de dernière mise à jour depuis l'API
        const response = await fetch('/api/ontology/last-update');
        
        if (response.ok) {
            const data = await response.json();
            const lastUpdate = new Date(data.lastUpdate);
            
            // Formater la date en français
            const options = { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            };
            
            const formattedDate = lastUpdate.toLocaleDateString('fr-FR', options);
            document.getElementById('lastUpdateDate').textContent = formattedDate;
        } else {
            // Si l'API n'est pas disponible, utiliser une date par défaut
            console.warn('API de mise à jour non disponible, utilisation de la date courante');
            setDefaultUpdateDate();
        }
    } catch (error) {
        console.error('Erreur lors de la récupération de la date de mise à jour:', error);
        setDefaultUpdateDate();
    }
}

function setDefaultUpdateDate() {
    // Utiliser la date actuelle comme fallback
    const now = new Date();
    const options = { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    
    const formattedDate = now.toLocaleDateString('fr-FR', options);
    document.getElementById('lastUpdateDate').textContent = formattedDate;
}

// Fonction globale pour forcer la mise à jour de la date depuis d'autres pages
function updateHomePageDate() {
    // Stocker la date actuelle dans le localStorage
    const now = new Date();
    localStorage.setItem('lastOntologyUpdate', now.toISOString());
    
    // Si on est sur la page d'accueil, mettre à jour immédiatement
    const lastUpdateElement = document.getElementById('lastUpdateDate');
    if (lastUpdateElement) {
        const options = { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        
        const formattedDate = now.toLocaleDateString('fr-FR', options);
        lastUpdateElement.textContent = formattedDate;
    }
}

// Rendre la fonction accessible globalement
window.updateHomePageDate = updateHomePageDate;

function loadQualityBanner() {
    const banner = document.getElementById('qualityBanner');
    if (!banner) return;

    const raw = localStorage.getItem('qualitySummary');
    if (!raw) {
        banner.style.display = 'none';
        return;
    }

    let q;
    try { q = JSON.parse(raw); } catch { banner.style.display = 'none'; return; }

    const issues = (q.cycles || 0) + (q.doublons || 0);
    const date = q.timestamp ? new Date(q.timestamp).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

    let icon, text, bg, color, border;
    if (issues === 0) {
        icon = '✓'; text = 'Ontologie en bon état'; bg = '#d4edda'; color = '#155724'; border = '#28a745';
    } else if (issues <= 2) {
        icon = '⚠'; text = `${issues} anomalie(s) détectée(s)`; bg = '#fff3cd'; color = '#856404'; border = '#ffc107';
    } else {
        icon = '✕'; text = `${issues} anomalies — vérification requise`; bg = '#f8d7da'; color = '#721c24'; border = '#dc3545';
    }

    banner.style.cssText = `display:flex; align-items:center; gap:8px; margin-top:10px; border-radius:6px; padding:9px 12px; font-size:13px; background:${bg}; color:${color}; border:1px solid ${border};`;
    banner.innerHTML = `<strong style="font-size:16px">${icon}</strong> <span>${text}</span><span style="margin-left:auto; font-size:11px; opacity:0.7">${date}</span>`;
}