/**
 * Statistiques sur le resultat d'une requete SPARQL (format JSON W3C)
 * Calculees cote client, uniquement a partir des lignes deja retournees
 * par la requete en cours (aucun nouvel appel serveur).
 * Compatible avec les pages competence-page et doctor-page.
 */

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

    stats.blocks.forEach(block => {
        let entries = Object.entries(block.counts);
        if (!block.noSort) entries = entries.sort((a, b) => b[1] - a[1]);
        html += `<h4 style="margin:16px 0 6px 0; font-size:0.95em; color:#1a3a5c">${block.title}</h4>`;
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
}
