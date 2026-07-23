/**
 * Statistiques sur le resultat d'une requete SPARQL (format JSON W3C)
 * Calculees cote client, uniquement a partir des lignes deja retournees
 * par la requete en cours (aucun nouvel appel serveur).
 * Compatible avec les pages competence-page et doctor-page.
 *
 * Visualisations (donut/barres) alignees sur celles de la page Stats globale
 * (stats-page.html) - demande encadrantes 24/07/2026 : mêmes visualisations
 * pour les stats des requetes (personnalisees/guidees) que pour les stats
 * globales.
 */

// Meme palette que stats-page.html, pour une apparence coherente entre les deux pages.
const QUERY_STATS_COLORS = { strong: '#1a5276', moderate: '#2e86c1', weak: '#85c1e9', negligible: '#d6eaf8', ns: '#f39c12', na: '#bdc3c7', nonClasse: '#7f8c8d' };
const QUERY_STATS_QUALITATIVE = ['#1a5276', '#2e86c1', '#85c1e9', '#48c9b0', '#f4d03f', '#e67e22', '#c0392b', '#8e44ad', '#7f8c8d', '#27ae60'];
const queryStatsChartInstances = {};

function colorForLabel(label, index) {
    const key = String(label).toLowerCase();
    if (key === 'strong') return QUERY_STATS_COLORS.strong;
    if (key === 'moderate') return QUERY_STATS_COLORS.moderate;
    if (key === 'weak') return QUERY_STATS_COLORS.weak;
    if (key === 'negligible') return QUERY_STATS_COLORS.negligible;
    if (key === 'ns') return QUERY_STATS_COLORS.ns;
    if (key === 'na' || key === 'n.a.') return QUERY_STATS_COLORS.na;
    if (key.startsWith('non class') || key.startsWith('non renseign')) return QUERY_STATS_COLORS.nonClasse;
    return QUERY_STATS_QUALITATIVE[index % QUERY_STATS_QUALITATIVE.length];
}

function renderQueryStatsDonut(canvasId, counts, total) {
    if (queryStatsChartInstances[canvasId]) { queryStatsChartInstances[canvasId].destroy(); }
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const labels = entries.map(([label]) => label);
    const values = entries.map(([, n]) => n);
    const colors = labels.map((label, i) => colorForLabel(label, i));
    queryStatsChartInstances[canvasId] = new Chart(document.getElementById(canvasId), {
        type: 'doughnut',
        data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 2 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 11 } } },
                tooltip: { callbacks: { label: ctx => ` ${ctx.label} : ${ctx.raw.toLocaleString('fr-FR')} (${total ? Math.round(ctx.raw / total * 100) : 0}%)` } }
            }
        }
    });
}

function renderQueryStatsBar(canvasId, counts) {
    if (queryStatsChartInstances[canvasId]) { queryStatsChartInstances[canvasId].destroy(); }
    const entries = Object.entries(counts);
    const labels = entries.map(([label]) => label.length > 32 ? label.slice(0, 30) + '…' : label);
    const values = entries.map(([, n]) => n);
    const colors = labels.map((label, i) => colorForLabel(label, i));
    queryStatsChartInstances[canvasId] = new Chart(document.getElementById(canvasId), {
        type: 'bar',
        data: { labels, datasets: [{ data: values, backgroundColor: colors }] },
        options: {
            indexAxis: 'y',
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { ticks: { font: { size: 11 } } }, y: { ticks: { font: { size: 11 } } } }
        }
    });
}

function computeQueryStats(sparqlData) {
    const vars = sparqlData?.head?.vars || [];
    const bindings = sparqlData?.results?.bindings || [];
    const total = bindings.length;
    const blocks = [];
    const kpis = [];

    function valueOf(binding, name) {
        const v = binding[name]?.value;
        return v === undefined || v === null ? '' : v;
    }

    kpis.push({ label: 'Résultats', value: total.toLocaleString('fr-FR'), sub: 'lignes dans ce résultat' });

    // Repartition complete (une categorie par valeur distincte rencontree)
    function distribution(varName, title, emptyLabel) {
        if (!vars.includes(varName) || total === 0) return;
        const counts = {};
        bindings.forEach(b => {
            let v = valueOf(b, varName);
            if (!v || v === 'N.A.') v = emptyLabel || 'Non renseigné';
            counts[v] = (counts[v] || 0) + 1;
        });
        blocks.push({ title, counts, total });
        return counts;
    }

    // Presence/absence uniquement (utile pour mediator/moderator ou le texte varie a chaque ligne)
    function presence(varName, label) {
        if (!vars.includes(varName) || total === 0) return;
        let withCount = 0;
        bindings.forEach(b => {
            const v = valueOf(b, varName);
            if (v && v !== 'N.A.') withCount++;
        });
        blocks.push({
            title: label,
            counts: { [`Avec ${label.toLowerCase()}`]: withCount, [`Sans ${label.toLowerCase()}`]: total - withCount },
            total
        });
        return withCount;
    }

    // Top valeurs d'une colonne categorielle (ex: categoryVI, categoryVD)
    function topValues(varName, title, limit) {
        if (!vars.includes(varName) || total === 0) return;
        const counts = {};
        bindings.forEach(b => {
            let v = valueOf(b, varName) || 'Non renseigné';
            counts[v] = (counts[v] || 0) + 1;
        });
        const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        const top = entries.slice(0, limit || 8);
        if (entries.length > top.length) {
            const rest = entries.slice(top.length).reduce((s, [, n]) => s + n, 0);
            top.push([`Autres (${entries.length - (limit || 8)} catégories)`, rest]);
        }
        blocks.push({ title, counts: Object.fromEntries(top), total, noSort: true });
    }

    const dirCounts = distribution('relationDirection', 'Direction de la relation');
    if (dirCounts) {
        const nonNS = total - (dirCounts['NS'] || 0);
        kpis.push({ label: 'Relations significatives', value: `${Math.round(nonNS / total * 100)}%`, sub: `${nonNS.toLocaleString('fr-FR')} sur ${total.toLocaleString('fr-FR')}`, color: 'green' });
    }

    const esCounts = distribution('effectSize', 'EffectSize', 'Non classifié');
    if (esCounts) {
        const classified = total - (esCounts['Non classifié'] || 0);
        kpis.push({ label: 'Couverture effectSize', value: `${Math.round(classified / total * 100)}%`, sub: `${classified.toLocaleString('fr-FR')} classifiées`, color: 'green' });
    }

    const medCount = presence('mediator', 'Médiateur');
    if (medCount !== undefined) {
        kpis.push({ label: 'Avec médiateur', value: `${Math.round(medCount / total * 100)}%`, sub: `${medCount.toLocaleString('fr-FR')} analyses` });
    }

    const modCount = presence('moderator', 'Modérateur');
    if (modCount !== undefined) {
        kpis.push({ label: 'Avec modérateur', value: `${Math.round(modCount / total * 100)}%`, sub: `${modCount.toLocaleString('fr-FR')} analyses` });
    }

    topValues('categoryVI', 'Top catégories VI');
    topValues('categoryVD', 'Top catégories VD');

    return { total, kpis, blocks };
}

function renderQueryStatsHTML(stats) {
    if (!stats || !stats.total) {
        return '<p style="color:#888">Aucune donnée à analyser.</p>';
    }

    let html = `<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:12px; margin-bottom:20px;">`;
    stats.kpis.forEach(k => {
        const border = k.color === 'green' ? '#27ae60' : '#2e6da4';
        html += `<div style="background:#fff; border-radius:8px; padding:14px 16px; box-shadow:0 1px 4px rgba(0,0,0,0.08); border-top:3px solid ${border};">
            <div style="font-size:24px; font-weight:700; color:#1a3a5c;">${k.value}</div>
            <div style="font-size:12px; color:#555; margin-top:2px;">${k.label}</div>
            <div style="font-size:10px; color:#999; margin-top:1px;">${k.sub || ''}</div>
        </div>`;
    });
    html += `</div>`;

    if (!stats.blocks.length) {
        html += `<p style="color:#888">Aucune des colonnes de ce résultat (relationDirection, effectSize, categoryVI, categoryVD, mediator, moderator) ne permet de calculer plus de détail.</p>`;
        return html;
    }

    stats.blocks.forEach((block, i) => {
        let entries = Object.entries(block.counts);
        if (!block.noSort) entries = entries.sort((a, b) => b[1] - a[1]);
        html += `<h4 style="margin:16px 0 6px 0; font-size:0.95em; color:#1a3a5c">${block.title}</h4>`;

        // Graphique (donut pour une repartition courte type effectSize/direction/presence,
        // barres horizontales pour les "top valeurs" categorielles) - meme logique que la
        // page Stats globale (stats-page.html).
        block.canvasId = `qstat-chart-${i}`;
        block.chartType = block.noSort ? 'bar' : 'donut';
        html += `<div style="background:#fff; border-radius:8px; padding:12px 16px; box-shadow:0 1px 4px rgba(0,0,0,0.08); margin-bottom:10px;">
            <div style="position:relative; height:${block.chartType === 'bar' ? Math.max(160, entries.length * 32) : 220}px;">
                <canvas id="${block.canvasId}"></canvas>
            </div>
        </div>`;

        html += `<table style="width:100%; border-collapse:collapse; margin-bottom:8px;">
            <thead><tr>
                <th style="text-align:left; border-bottom:2px solid #1a3a5c; padding:6px;">Valeur</th>
                <th style="text-align:right; border-bottom:2px solid #1a3a5c; padding:6px;">Nb</th>
                <th style="text-align:right; border-bottom:2px solid #1a3a5c; padding:6px;">%</th>
            </tr></thead><tbody>`;
        entries.forEach(([label, n]) => {
            const pct = block.total ? Math.round(n / block.total * 100) : 0;
            html += `<tr>
                <td style="padding:6px; border-bottom:1px solid #e5e9ef;">${label}</td>
                <td style="text-align:right; padding:6px; border-bottom:1px solid #e5e9ef;">${n.toLocaleString('fr-FR')}</td>
                <td style="text-align:right; padding:6px; border-bottom:1px solid #e5e9ef;">${pct}%</td>
            </tr>`;
        });
        html += `</tbody></table>`;
    });

    return html;
}

function displayQueryStatsInContainer(sparqlData, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const stats = computeQueryStats(sparqlData);
    container.innerHTML = renderQueryStatsHTML(stats);

    if (typeof Chart === 'undefined') return; // Chart.js non charge sur cette page
    stats.blocks.forEach(block => {
        if (!block.canvasId || !document.getElementById(block.canvasId)) return;
        if (block.chartType === 'bar') {
            renderQueryStatsBar(block.canvasId, block.counts);
        } else {
            renderQueryStatsDonut(block.canvasId, block.counts, block.total);
        }
    });
}
