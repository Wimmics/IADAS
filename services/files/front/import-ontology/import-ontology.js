document.addEventListener('DOMContentLoaded', function() {

    const uploadedFiles = {
        sport: null,
        class: null,
        data: null
    };

    const sportUpload = document.getElementById('sportUpload');
    const classUpload = document.getElementById('classUpload');
    const dataUpload = document.getElementById('dataUpload');
    const rebuildBtn = document.getElementById('rebuildBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const confirmRebuildBtn = document.getElementById('confirmRebuildBtn');
    const backToUploadBtn = document.getElementById('backToUploadBtn');
    const validationSection = document.getElementById('validationSection');
    const progressSection = document.getElementById('progressSection');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const consoleContent = document.getElementById('consoleContent');

    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const serverURL = isLocal ? 'http://localhost:8000' : 'http://51.44.188.162:8000';

    // ================== UPLOAD ==================

    function setupUploadZone(uploadZone, fileInput, fileType) {
        uploadZone.addEventListener('click', () => fileInput.click());

        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('dragover');
        });
        uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) handleFileSelection(e.dataTransfer.files[0], fileType, uploadZone);
        });
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) handleFileSelection(e.target.files[0], fileType, uploadZone);
        });
    }

    function handleFileSelection(file, fileType, uploadZone) {
        if (!file.name.endsWith('.csv')) {
            alert('Seuls les fichiers CSV sont acceptés');
            return;
        }
        const expectedNames = { sport: 'Sport-Hierarchy.csv', class: 'Class-Hierarchy-V1.csv', data: 'IA-DAS-Data.csv' };
        if (!file.name.includes(expectedNames[fileType].split('.')[0])) {
            const confirmed = confirm(`Le fichier ne correspond pas au nom attendu (${expectedNames[fileType]}).\nVoulez-vous continuer ?`);
            if (!confirmed) return;
        }
        uploadedFiles[fileType] = file;
        uploadZone.classList.add('uploaded');
        uploadZone.querySelector('.upload-status').textContent = `✅ ${file.name} (${formatFileSize(file.size)})`;
        checkAllFilesUploaded();
        logToConsole(`Fichier ${fileType} prêt : ${file.name}`);
    }

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function checkAllFilesUploaded() {
        const allUploaded = uploadedFiles.sport && uploadedFiles.class && uploadedFiles.data;
        rebuildBtn.disabled = !allUploaded;
        if (allUploaded) logToConsole('Tous les fichiers sont prêts — cliquez sur "Valider les données"');
    }

    // ================== VALIDATION ==================

    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file, 'utf-8');
        });
    }

    function parseCSV(text, delimiter = ';') {
        // Parser respectant les champs entre guillemets (y compris multi-lignes)
        const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const rawRows = [];
        let row = '';
        let inQuotes = false;
        for (const ch of normalized) {
            if (ch === '"') { inQuotes = !inQuotes; row += ch; }
            else if (ch === '\n' && !inQuotes) { if (row.trim()) rawRows.push(row); row = ''; }
            else { row += ch; }
        }
        if (row.trim()) rawRows.push(row);
        if (rawRows.length === 0) return [];

        function splitRow(line) {
            const vals = [];
            let val = '';
            let inQ = false;
            for (const ch of line) {
                if (ch === '"') { inQ = !inQ; }
                else if (ch === delimiter && !inQ) { vals.push(val.trim()); val = ''; }
                else { val += ch; }
            }
            vals.push(val.trim());
            return vals;
        }

        const headers = splitRow(rawRows[0]).map(h => h.replace(/^﻿/, '').replace(/^"|"$/g, ''));
        return rawRows.slice(1).map(line => {
            const vals = splitRow(line);
            return Object.fromEntries(headers.map((h, i) => [h, (vals[i] || '').replace(/^"|"$/g, '')]));
        });
    }

    async function runValidation() {
        rebuildBtn.disabled = true;
        rebuildBtn.textContent = 'Analyse en cours...';
        logToConsole('Lecture et analyse des fichiers CSV...');

        try {
            const [dataText, classText] = await Promise.all([
                readFileAsText(uploadedFiles.data),
                readFileAsText(uploadedFiles.class)
            ]);

            const dataRows = parseCSV(dataText).filter(r => Object.values(r).some(v => v));
            const classRows = parseCSV(classText);

            // Construire le référentiel de noms de concepts de la hiérarchie (exact + insensible à la casse)
            const hierarchyConcepts = new Set();
            const hierarchyLower = new Map(); // clé lowercase → valeur exacte dans la hiérarchie
            ['CLASS', 'sub-class 1', 'sub-class 2', 'sub-class 3', 'sub-class 4', 'sub-class 5'].forEach(col => {
                classRows.forEach(row => {
                    if (row[col]) {
                        const v = row[col].trim();
                        hierarchyConcepts.add(v);
                        hierarchyLower.set(v.toLowerCase(), v);
                    }
                });
            });

            // Colonnes obligatoires
            const requiredCols = ['DOI', 'VD', 'VI', 'ACADS', 'Sport_name', 'Sex', 'N'];
            const headers = Object.keys(dataRows[0] || {});
            const missingCols = requiredCols.filter(c => !headers.includes(c));

            // Statistiques
            const nbAnalyses = dataRows.length;
            const uniqueVDs = [...new Set(dataRows.map(r => r['VD']).filter(Boolean))];
            const uniqueVIs = [...new Set(dataRows.map(r => r['VI']).filter(Boolean))];
            const uniqueACADS = [...new Set(dataRows.map(r => r['ACADS']).filter(Boolean))];

            // Synonymes connus via skos:altLabel dans skos-acad-enrichment.ttl
            const KNOWN_ALT_LABELS = new Set([
                'Coach leadership style negative feedback',
                'Compulsive spending',
                'Negative reaction to imperfection',
                'Psychotic disorder',
                'Self-regulation of eating attitude',
                'Orthorexic eating behavior',
                'Restrictive eating',
                'Eating pathology',
                'Restrained eating',
                'Dietary restraint',
            ]);

            // Classer les VD inconnues : casse différente / synonyme altLabel / vraiment absentes
            const IGNORED_VDS = new Set(['N.A.', 'n.a.', 'NA', 'N/A', 'n/a', '-', '']);
            const caseMismatch = []; // { inData, inHierarchy }
            const knownAltLabels = [];
            const trulyAbsent = [];
            uniqueVDs.forEach(vd => {
                if (hierarchyConcepts.has(vd) || IGNORED_VDS.has(vd)) return;
                const match = hierarchyLower.get(vd.toLowerCase());
                if (match) caseMismatch.push({ inData: vd, inHierarchy: match });
                else if (KNOWN_ALT_LABELS.has(vd)) knownAltLabels.push(vd);
                else trulyAbsent.push(vd);
            });

            // Lignes avec champs critiques vides
            const emptyVD = dataRows.filter(r => !r['VD']).length;
            const emptyVI = dataRows.filter(r => !r['VI']).length;
            const emptyACADS = dataRows.filter(r => !r['ACADS']).length;

            showValidationReport({
                nbAnalyses, uniqueVDs, uniqueVIs, uniqueACADS,
                caseMismatch, knownAltLabels, trulyAbsent, missingCols, emptyVD, emptyVI, emptyACADS
            });

        } catch (err) {
            logToConsole(`Erreur lors de la validation : ${err.message}`);
            rebuildBtn.disabled = false;
            rebuildBtn.textContent = 'Valider les données';
        }
    }

    function showValidationReport(r) {
        const hasErrors = r.missingCols.length > 0;
        const hasWarnings = r.caseMismatch.length > 0 || r.trulyAbsent.length > 0 || r.emptyVD > 0 || r.emptyVI > 0 || r.emptyACADS > 0 || r.knownAltLabels.length > 0;

        let verdictClass, verdictText;
        if (hasErrors) {
            verdictClass = 'verdict-error';
            verdictText = `Erreurs critiques détectées — colonnes obligatoires manquantes`;
        } else if (hasWarnings) {
            verdictClass = 'verdict-warning';
            verdictText = `Fichier acceptable avec avertissements — vérifiez les points signalés`;
        } else {
            verdictClass = 'verdict-ok';
            verdictText = `Fichier valide — prêt pour la reconstruction`;
        }

        const caseMismatchHtml = r.caseMismatch.length > 0 ? `
            <div class="unknown-variables mismatch">
                <h4>Problèmes de casse (${r.caseMismatch.length}) — même concept, orthographe différente</h4>
                <p style="font-size:12px;color:#7b6000;margin-bottom:8px;">Ces VD existent dans la hiérarchie mais avec une casse différente. Correction recommandée dans IA-DAS-Data.csv.</p>
                <table style="width:100%;font-size:13px;border-collapse:collapse;">
                    <tr style="font-weight:bold;border-bottom:1px solid #e0c070;">
                        <td style="padding:4px 8px;">Dans les données</td>
                        <td style="padding:4px 8px;">Dans la hiérarchie</td>
                    </tr>
                    ${r.caseMismatch.map(m => `
                    <tr style="border-bottom:1px solid #ffeeba;">
                        <td style="padding:4px 8px;color:#c0392b;">${m.inData}</td>
                        <td style="padding:4px 8px;color:#27ae60;">${m.inHierarchy}</td>
                    </tr>`).join('')}
                </table>
            </div>` : '';

        const knownAltLabelsHtml = r.knownAltLabels.length > 0 ? `
            <div class="unknown-variables altlabel">
                <h4>Synonymes connus via altLabel (${r.knownAltLabels.length}) — OK, déjà enregistrés dans l'ontologie</h4>
                <p style="font-size:12px;color:#1a5276;margin-bottom:8px;">Ces VD ne sont pas dans la hiérarchie CSV mais ont un <code>skos:altLabel</code> dans l'ontologie. Elles sont reconnues.</p>
                <ul>${r.knownAltLabels.map(v => `<li>${v}</li>`).join('')}</ul>
            </div>` : '';

        const trulyAbsentHtml = r.trulyAbsent.length > 0 ? `
            <div class="unknown-variables absent">
                <h4>VD absentes de la hiérarchie (${r.trulyAbsent.length}) — à valider avec les encadrantes</h4>
                <p style="font-size:12px;color:#856404;margin-bottom:8px;">Ces VD n'ont aucune correspondance dans Class-Hierarchy-V1.csv. Vérifier si elles doivent être ajoutées.</p>
                <ul>${r.trulyAbsent.slice(0, 20).map(v => `<li>${v}</li>`).join('')}
                    ${r.trulyAbsent.length > 20 ? `<li style="font-style:italic">...et ${r.trulyAbsent.length - 20} autres</li>` : ''}
                </ul>
            </div>` : '';

        document.getElementById('validationContent').innerHTML = `
            <div class="validation-stats">
                <div class="stat-card">
                    <div class="stat-number">${r.nbAnalyses.toLocaleString()}</div>
                    <div class="stat-label">Analyses</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${r.uniqueVDs.length}</div>
                    <div class="stat-label">VD uniques</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${r.uniqueVIs.length}</div>
                    <div class="stat-label">VI uniques</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${r.uniqueACADS.length}</div>
                    <div class="stat-label">ACADS uniques</div>
                </div>
            </div>

            <div class="validation-checks">
                ${r.missingCols.length > 0
                    ? `<div class="check-item error"><span class="check-icon">✗</span>Colonnes manquantes : ${r.missingCols.join(', ')}</div>`
                    : `<div class="check-item ok"><span class="check-icon">✓</span>Toutes les colonnes obligatoires sont présentes</div>`
                }
                ${r.emptyVD > 0
                    ? `<div class="check-item warning"><span class="check-icon">⚠</span>${r.emptyVD} ligne(s) sans VD (variable dépendante vide)</div>`
                    : `<div class="check-item ok"><span class="check-icon">✓</span>Aucune ligne sans VD</div>`
                }
                ${r.emptyVI > 0
                    ? `<div class="check-item warning"><span class="check-icon">⚠</span>${r.emptyVI} ligne(s) sans VI (variable indépendante vide)</div>`
                    : `<div class="check-item ok"><span class="check-icon">✓</span>Aucune ligne sans VI</div>`
                }
                ${r.emptyACADS > 0
                    ? `<div class="check-item warning"><span class="check-icon">⚠</span>${r.emptyACADS} ligne(s) sans ACADS</div>`
                    : `<div class="check-item ok"><span class="check-icon">✓</span>Aucune ligne sans ACADS</div>`
                }
                ${r.caseMismatch.length > 0
                    ? `<div class="check-item warning"><span class="check-icon">⚠</span>${r.caseMismatch.length} VD avec problème de casse (concept existant mais orthographe différente)</div>`
                    : ''
                }
                ${r.knownAltLabels.length > 0
                    ? `<div class="check-item info"><span class="check-icon">ℹ</span>${r.knownAltLabels.length} VD reconnue(s) comme synonyme(s) (skos:altLabel)</div>`
                    : ''
                }
                ${r.trulyAbsent.length > 0
                    ? `<div class="check-item warning"><span class="check-icon">⚠</span>${r.trulyAbsent.length} VD absente(s) de la hiérarchie ACAD</div>`
                    : `<div class="check-item ok"><span class="check-icon">✓</span>Toutes les VD reconnues dans la hiérarchie ACAD</div>`
                }
            </div>

            ${caseMismatchHtml}
            ${knownAltLabelsHtml}
            ${trulyAbsentHtml}

            <div class="validation-verdict ${verdictClass}">${verdictText}</div>
        `;

        validationSection.style.display = 'block';
        validationSection.scrollIntoView({ behavior: 'smooth' });
        rebuildBtn.textContent = 'Valider les données';
        rebuildBtn.disabled = false;

        logToConsole(`Validation terminée : ${r.nbAnalyses} analyses, ${r.unknownVDs.length} VD inconnues, ${r.emptyVD + r.emptyVI} champs vides`);
    }

    // ================== RECONSTRUCTION ==================

    async function startReconstruction() {
        validationSection.style.display = 'none';
        progressSection.style.display = 'block';
        confirmRebuildBtn.disabled = true;

        consoleContent.textContent = 'Initialisation de la reconstruction...\n';
        updateProgress(0, 'Préparation...');

        try {
            const formData = new FormData();
            formData.append('sportHierarchy', uploadedFiles.sport);
            formData.append('classHierarchy', uploadedFiles.class);
            formData.append('mainData', uploadedFiles.data);

            logToConsole('Upload des fichiers CSV vers le serveur...');
            updateProgress(10, 'Upload des fichiers...');

            const response = await fetch(`${serverURL}/rebuild-ontology`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error(`Erreur serveur: ${response.status} ${response.statusText}`);

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (reader) {
                await processStreamingResponse(reader, decoder);
            } else {
                handleReconstructionResult(await response.json());
            }

        } catch (error) {
            logToConsole(`ERREUR: ${error.message}`);
            updateProgress(0, 'Erreur !');
            confirmRebuildBtn.disabled = false;
        }
    }

    async function processStreamingResponse(reader, decoder) {
        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines) {
                if (line.trim()) processProgressLine(line.trim());
            }
        }
        if (buffer.trim()) processProgressLine(buffer.trim());
    }

    function processProgressLine(line) {
        try {
            const data = JSON.parse(line);
            if (data.progress !== undefined) updateProgress(data.progress, data.message || 'En cours...');
            if (data.log) logToConsole(data.log);
            if (data.error) logToConsole(`ERREUR: ${data.error}`);
            if (data.success) {
                updateProgress(100, 'Reconstruction terminée !');
                logToConsole('Reconstruction terminée avec succès !');
                // Enregistrer l'entrée dans l'historique
                const history = JSON.parse(localStorage.getItem('updateHistory') || '[]');
                history.unshift({ date: new Date().toISOString(), analyses: null });
                localStorage.setItem('updateHistory', JSON.stringify(history.slice(0, 20)));
                setTimeout(() => {
                    alert('Ontologie reconstruite avec succès !\nVous pouvez maintenant utiliser la nouvelle ontologie.');
                    window.location.href = './index.html';
                }, 2000);
            }
        } catch (e) {
            logToConsole(line);
        }
    }

    function handleReconstructionResult(result) {
        if (result.success) {
            updateProgress(100, 'Terminé !');
            logToConsole('Reconstruction terminée avec succès !');
            setTimeout(() => {
                alert('Ontologie reconstruite !');
                window.location.href = './update-page.html';
            }, 1000);
        } else {
            logToConsole(`Erreur: ${result.error || 'Erreur inconnue'}`);
            updateProgress(0, 'Erreur');
            confirmRebuildBtn.disabled = false;
        }
    }

    // ================== UI ==================

    function updateProgress(percentage, message) {
        progressFill.style.width = `${percentage}%`;
        progressText.textContent = `${percentage}% - ${message}`;
    }

    function logToConsole(message) {
        const timestamp = new Date().toLocaleTimeString();
        consoleContent.textContent += `[${timestamp}] ${message}\n`;
        consoleContent.scrollTop = consoleContent.scrollHeight;
    }

    // ================== EVENT LISTENERS ==================

    setupUploadZone(sportUpload, document.getElementById('sportFile'), 'sport');
    setupUploadZone(classUpload, document.getElementById('classFile'), 'class');
    setupUploadZone(dataUpload, document.getElementById('dataFile'), 'data');

    rebuildBtn.addEventListener('click', runValidation);

    confirmRebuildBtn.addEventListener('click', () => {
        const confirmed = confirm(
            'ATTENTION !\n\nCette opération va COMPLÈTEMENT remplacer l\'ontologie existante.\nToutes les données actuelles seront SUPPRIMÉES.\n\nÊtes-vous absolument certain de vouloir continuer ?'
        );
        if (confirmed) startReconstruction();
    });

    backToUploadBtn.addEventListener('click', () => {
        validationSection.style.display = 'none';
        rebuildBtn.disabled = false;
    });

    cancelBtn.addEventListener('click', () => {
        if (confirm('Annuler et retourner à la page de mise à jour ?')) {
            window.location.href = './update-page.html';
        }
    });

    logToConsole('Interface de reconstruction prête');
    logToConsole('Veuillez uploader les 3 fichiers CSV requis');
});
