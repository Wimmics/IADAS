document.addEventListener('DOMContentLoaded', function () {
    loadLastUpdateDate();
    loadHistory();

    // Le bandeau qualité reste désactivé sur l'accueil.
});

// La date réelle devra être fournie par le serveur.
// Une date du navigateur ne garantit pas la dernière mise à jour.
function loadLastUpdateDate() {
    const element = document.getElementById('lastUpdateDate');

    if (element) {
        element.textContent = 'Date non disponible';
    }
}

// Conservée pour les éventuels appels existants.
function setDefaultUpdateDate() {
    loadLastUpdateDate();
}

function updateHomePageDate() {
    loadLastUpdateDate();
}

window.updateHomePageDate = updateHomePageDate;

// Historique local à ce navigateur.
function loadHistory() {
    const section = document.getElementById('historySection');
    const list = document.getElementById('historyList');

    if (!section || !list) return;

    let history;

    try {
        history = JSON.parse(
            localStorage.getItem('updateHistory') || '[]'
        );
    } catch (error) {
        section.style.display = 'none';
        return;
    }

    if (!Array.isArray(history)) {
        section.style.display = 'none';
        return;
    }

    const entries = history.filter(entry =>
        entry &&
        typeof entry.date === 'string' &&
        !Number.isNaN(new Date(entry.date).getTime())
    ).slice(0, 5);

    list.replaceChildren();

    if (entries.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';

    for (const entry of entries) {
        const label = new Date(entry.date).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const analyses = Number.isInteger(entry.analyses) &&
            entry.analyses >= 0
            ? ` — ${entry.analyses.toLocaleString('fr-FR')} analyses`
            : '';

        const item = document.createElement('li');
        item.style.cssText =
            'padding:3px 0; border-bottom:1px solid #eee;';
        item.textContent = `📅 ${label}${analyses}`;
        list.appendChild(item);
    }
}

function toggleHistory() {
    const list = document.getElementById('historyList');
    const chevron = document.getElementById('historyChevron');

    if (!list) return;

    const open = list.style.display !== 'none';
    list.style.display = open ? 'none' : 'block';

    if (chevron) {
        chevron.textContent = open ? '▼' : '▲';
    }
}

window.toggleHistory = toggleHistory;

async function refreshQualityBanner() {
    try {
        const res = await fetch('api/quality-check');

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();

        if (data.error) {
            throw new Error(data.error);
        }

        localStorage.setItem('qualitySummary', JSON.stringify({
            doublons: data.doublons || 0,
            broken: data.broken || 0,
            cycles: data.cycles || 0,
            timestamp: data.timestamp || new Date().toISOString()
        }));
    } catch (error) {
        console.warn('Quality check non disponible:', error.message);

        // Ne pas présenter un ancien résultat comme un contrôle actuel.
        const banner = document.getElementById('qualityBanner');
        if (banner) {
            banner.style.display = 'none';
        }
        return;
    }

    loadQualityBanner();
}

function loadQualityBanner() {
    const banner = document.getElementById('qualityBanner');

    if (!banner) return;

    let quality;

    try {
        quality = JSON.parse(localStorage.getItem('qualitySummary'));

        if (!quality || typeof quality !== 'object') {
            banner.style.display = 'none';
            return;
        }
    } catch (error) {
        banner.style.display = 'none';
        return;
    }

    const toCount = value => {
        const count = Number(value);
        return Number.isInteger(count) && count >= 0 ? count : 0;
    };

    const doublons = toCount(quality.doublons);
    const broken = toCount(quality.broken);
    const cycles = toCount(quality.cycles);
    const issues = doublons + broken + cycles;

    const timestamp = quality.timestamp
        ? new Date(quality.timestamp)
        : null;

    const date = timestamp && !Number.isNaN(timestamp.getTime())
        ? timestamp.toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        })
        : '';

    let icon, text, bg, color, border;

    if (issues === 0) {
        icon = '✓';
        text = 'Ontologie en bon état';
        bg = '#d4edda';
        color = '#155724';
        border = '#28a745';
    } else if (issues <= 2) {
        icon = '⚠';
        text = `${issues} problème(s) de qualité détecté(s)`;
        bg = '#fff3cd';
        color = '#856404';
        border = '#ffc107';
    } else {
        icon = '✕';
        text = `${issues} problèmes de qualité — vérification requise`;
        bg = '#f8d7da';
        color = '#721c24';
        border = '#dc3545';
    }

    const brokenLine = broken > 0
        ? `<div style="font-size:11px; margin-top:3px; opacity:0.75;">
            dont ${broken} analyse(s) avec référence de variable cassée
            (concept introuvable dans le thésaurus)
           </div>`
        : '';

    banner.style.cssText = `
        display:flex;
        flex-direction:column;
        margin-top:10px;
        border-radius:6px;
        padding:9px 12px;
        font-size:13px;
        background:${bg};
        color:${color};
        border:1px solid ${border};
    `;

    banner.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px;">
            <strong style="font-size:16px">${icon}</strong>
            <span>${text}</span>
            <span style="margin-left:auto; font-size:11px; opacity:0.7">
                ${date}
            </span>
        </div>
        ${brokenLine}
    `;
}