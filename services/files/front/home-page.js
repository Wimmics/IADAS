// Fonctionnalité de date de dernière mise à jour
document.addEventListener('DOMContentLoaded', function() {
    loadLastUpdateDate();
    loadHistory();
    // Bandeau qualité retire de la page d'accueil : etait visible par tous les visiteurs
    // (medecins/coachs) alors qu'il ne concerne que l'equipe qui gere les donnees, et
    // pouvait afficher un etat obsolete a cause du cache navigateur d'1h.
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

function loadHistory() {
    const section = document.getElementById('historySection');
    const list = document.getElementById('historyList');
    if (!section || !list) return;

    const history = JSON.parse(localStorage.getItem('updateHistory') || '[]');
    if (history.length === 0) { section.style.display = 'none'; return; }

    section.style.display = 'block';
    list.innerHTML = history.slice(0, 5).map(entry => {
        const d = new Date(entry.date);
        const label = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const analyses = entry.analyses ? ` — ${entry.analyses.toLocaleString('fr-FR')} analyses` : '';
        return `<li style="padding:3px 0; border-bottom:1px solid #eee;">📅 ${label}${analyses}</li>`;
    }).join('');
}

function toggleHistory() {
    const list = document.getElementById('historyList');
    const chevron = document.getElementById('historyChevron');
    if (!list) return;
    const open = list.style.display !== 'none';
    list.style.display = open ? 'none' : 'block';
    if (chevron) chevron.textContent = open ? '▼' : '▲';
}
window.toggleHistory = toggleHistory;

async function refreshQualityBanner() {
    // Toujours revérifier l'état réel à chaque chargement de page : la requête est rapide
    // (<1s), et un cache d'1h pouvait afficher un état obsolète (ex. "Ontologie en bon état"
    // alors que l'état réel avait changé entre-temps).
    try {
        const res = await fetch('/api/quality-check');
        if (!res.ok) throw new Error('unavailable');
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        localStorage.setItem('qualitySummary', JSON.stringify({
            doublons: data.doublons || 0,
            broken: data.broken || 0,
            cycles: 0,
            timestamp: data.timestamp || new Date().toISOString()
        }));
    } catch (e) {
        console.warn('Quality check non disponible:', e.message);
    }
    loadQualityBanner();
}

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

    const doublons = q.doublons || 0;
    const broken = q.broken || 0;
    const issues = doublons + broken + (q.cycles || 0);
    const date = q.timestamp ? new Date(q.timestamp).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

    let icon, text, bg, color, border;
    if (issues === 0) {
        icon = '✓'; text = 'Ontologie en bon état'; bg = '#d4edda'; color = '#155724'; border = '#28a745';
    } else if (issues <= 2) {
        icon = '⚠'; text = `${issues} problème(s) de qualité détecté(s)`; bg = '#fff3cd'; color = '#856404'; border = '#ffc107';
    } else {
        icon = '✕'; text = `${issues} problèmes de qualité — vérification requise`; bg = '#f8d7da'; color = '#721c24'; border = '#dc3545';
    }

    const brokenLine = broken > 0
        ? `<div style="font-size:11px; margin-top:3px; opacity:0.75;">dont ${broken} analyse(s) avec référence de variable cassée (concept introuvable dans le thésaurus)</div>`
        : '';

    banner.style.cssText = `display:flex; flex-direction:column; margin-top:10px; border-radius:6px; padding:9px 12px; font-size:13px; background:${bg}; color:${color}; border:1px solid ${border};`;
    banner.innerHTML = `<div style="display:flex; align-items:center; gap:8px;"><strong style="font-size:16px">${icon}</strong> <span>${text}</span><span style="margin-left:auto; font-size:11px; opacity:0.7">${date}</span></div>${brokenLine}`;
}