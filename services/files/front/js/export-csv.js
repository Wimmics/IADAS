/**
 * Utilitaire d'export CSV pour les résultats SPARQL (format JSON W3C)
 * Compatible avec les pages competence-page et doctor-page
 */

function exportSparqlToCSV(sparqlData, filename) {
    if (!sparqlData || !sparqlData.results || !sparqlData.results.bindings || sparqlData.results.bindings.length === 0) {
        alert('Aucune donnée à exporter');
        return;
    }

    const bindings = sparqlData.results.bindings;
    const headers = sparqlData.head.vars;

    function escapeCell(val) {
        const s = (val || '').replace(/"/g, '""');
        return '"' + s + '"';
    }

    const rows = [headers.map(escapeCell)];
    bindings.forEach(row => {
        rows.push(headers.map(h => escapeCell(row[h] ? row[h].value : '')));
    });

    const csvContent = rows.map(r => r.join(';')).join('\r\n');
    const bom = '﻿'; // BOM UTF-8 pour Excel (empêche les problèmes d'accents)
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'export.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
