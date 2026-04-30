// JavaScript pour la page de reconstruction d'ontologie
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Page de reconstruction d\'ontologie chargée');
    
    // État des fichiers uploadés
    const uploadedFiles = {
        sport: null,
        class: null,
        data: null
    };
    
    // Éléments DOM
    const sportUpload = document.getElementById('sportUpload');
    const classUpload = document.getElementById('classUpload');
    const dataUpload = document.getElementById('dataUpload');
    const rebuildBtn = document.getElementById('rebuildBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const progressSection = document.getElementById('progressSection');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const consoleContent = document.getElementById('consoleContent');
    
    // Configuration API - Via le gateway principal  
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const serverURL = isLocal ? 'http://localhost:8000' : 'http://51.44.188.162:8000';
    
    // ================== GESTION DES UPLOADS ==================
    
    function setupUploadZone(uploadZone, fileInput, fileType) {
        // Click pour ouvrir le sélecteur
        uploadZone.addEventListener('click', () => {
            fileInput.click();
        });
        
        // Drag & Drop
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('dragover');
        });
        
        uploadZone.addEventListener('dragleave', () => {
            uploadZone.classList.remove('dragover');
        });
        
        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('dragover');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleFileSelection(files[0], fileType, uploadZone);
            }
        });
        
        // Changement de fichier
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileSelection(e.target.files[0], fileType, uploadZone);
            }
        });
    }
    
    function handleFileSelection(file, fileType, uploadZone) {
        console.log(`📁 Fichier sélectionné: ${file.name} (${fileType})`);
        
        // Validation
        if (!file.name.endsWith('.csv')) {
            alert('❌ Seuls les fichiers CSV sont acceptés');
            return;
        }
        
        // Validation du nom de fichier
        const expectedNames = {
            sport: 'Sport-Hierarchy.csv',
            class: 'Class-Hierarchy-V1.csv',  
            data: 'IA-DAS-Data.csv'
        };
        
        if (!file.name.includes(expectedNames[fileType].split('.')[0])) {
            const confirmed = confirm(`⚠️ Le fichier ne correspond pas au nom attendu (${expectedNames[fileType]}).\nVoulez-vous continuer ?`);
            if (!confirmed) return;
        }
        
        // Stocker le fichier
        uploadedFiles[fileType] = file;
        
        // Mettre à jour l'interface
        uploadZone.classList.add('uploaded');
        const statusElement = uploadZone.querySelector('.upload-status');
        statusElement.textContent = `✅ ${file.name} (${formatFileSize(file.size)})`;
        
        // Vérifier si tous les fichiers sont uploadés
        checkAllFilesUploaded();
        
        logToConsole(`✅ Fichier ${fileType} prêt: ${file.name}`);
    }
    
    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
    
    function checkAllFilesUploaded() {
        const allUploaded = uploadedFiles.sport && uploadedFiles.class && uploadedFiles.data;
        rebuildBtn.disabled = !allUploaded;
        
        if (allUploaded) {
            rebuildBtn.style.backgroundColor = '#e74c3c';
            logToConsole('🎯 Tous les fichiers sont prêts pour la reconstruction');
        }
    }
    
    // ================== GESTION DE LA RECONSTRUCTION ==================
    
    async function startReconstruction() {
        console.log('🚀 Démarrage de la reconstruction');
        
        // Afficher la section de progression
        progressSection.style.display = 'block';
        rebuildBtn.disabled = true;
        
        // Réinitialiser la console
        consoleContent.textContent = 'Initialisation de la reconstruction...\n';
        updateProgress(0, 'Préparation...');
        
        try {
            // Créer FormData avec les 3 fichiers
            const formData = new FormData();
            formData.append('sportHierarchy', uploadedFiles.sport);
            formData.append('classHierarchy', uploadedFiles.class);
            formData.append('mainData', uploadedFiles.data);
            
            logToConsole('📤 Upload des fichiers CSV vers le serveur...');
            updateProgress(10, 'Upload des fichiers...');
            
            // Envoyer au serveur
            const response = await fetch(`${serverURL}/rebuild-ontology`, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`Erreur serveur: ${response.status} ${response.statusText}`);
            }
            
            // Traitement des réponses en streaming si possible
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            
            if (reader) {
                await processStreamingResponse(reader, decoder);
            } else {
                // Fallback pour réponse simple
                const result = await response.json();
                handleReconstructionResult(result);
            }
            
        } catch (error) {
            console.error('❌ Erreur reconstruction:', error);
            logToConsole(`❌ ERREUR: ${error.message}`);
            updateProgress(0, 'Erreur !');
            rebuildBtn.disabled = false;
        }
    }
    
    async function processStreamingResponse(reader, decoder) {
        let buffer = '';
        
        while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;
            
            // Décoder les données reçues
            buffer += decoder.decode(value, { stream: true });
            
            // Traiter les lignes complètes
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Garder la ligne incomplète
            
            for (const line of lines) {
                if (line.trim()) {
                    processProgressLine(line.trim());
                }
            }
        }
        
        // Traiter le reste du buffer
        if (buffer.trim()) {
            processProgressLine(buffer.trim());
        }
    }
    
    function processProgressLine(line) {
        try {
            const data = JSON.parse(line);
            
            if (data.progress !== undefined) {
                updateProgress(data.progress, data.message || 'En cours...');
            }
            
            if (data.log) {
                logToConsole(data.log);
            }
            
            if (data.error) {
                logToConsole(`❌ ${data.error}`);
            }
            
            if (data.success) {
                updateProgress(100, 'Reconstruction terminée !');
                logToConsole('🎉 Reconstruction terminée avec succès !');
                
                // Mettre à jour la date de dernière mise à jour
                if (typeof window.updateHomePageDate === 'function') {
                    window.updateHomePageDate();
                }
                
                setTimeout(() => {
                    alert('✅ Ontologie reconstruite avec succès !\nVous pouvez maintenant utiliser la nouvelle ontologie.');
                    window.location.href = './update-page.html';
                }, 2000);
            }
            
        } catch (e) {
            // Ligne non-JSON, probablement un log simple
            logToConsole(line);
        }
    }
    
    function handleReconstructionResult(result) {
        if (result.success) {
            updateProgress(100, 'Terminé !');
            logToConsole('🎉 Reconstruction terminée avec succès !');
            
            // Mettre à jour la date de dernière mise à jour
            if (typeof window.updateHomePageDate === 'function') {
                window.updateHomePageDate();
            }
            
            setTimeout(() => {
                alert('✅ Ontologie reconstruite !');
                window.location.href = './update-page.html';
            }, 1000);
        } else {
            logToConsole(`❌ Erreur: ${result.error || 'Erreur inconnue'}`);
            updateProgress(0, 'Erreur');
            rebuildBtn.disabled = false;
        }
    }
    
    // ================== UTILITAIRES UI ==================
    
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
    
    // Configuration des zones d'upload
    setupUploadZone(sportUpload, document.getElementById('sportFile'), 'sport');
    setupUploadZone(classUpload, document.getElementById('classFile'), 'class');
    setupUploadZone(dataUpload, document.getElementById('dataFile'), 'data');
    
    // Bouton de reconstruction
    rebuildBtn.addEventListener('click', () => {
        const confirmed = confirm(
            '⚠️ ATTENTION !\n\n' +
            'Cette opération va COMPLÈTEMENT remplacer l\'ontologie existante.\n' +
            'Toutes les données actuelles seront SUPPRIMÉES.\n\n' +
            'Êtes-vous absolument certain de vouloir continuer ?'
        );
        
        if (confirmed) {
            startReconstruction();
        }
    });
    
    // Bouton d'annulation
    cancelBtn.addEventListener('click', () => {
        const confirmed = confirm('Annuler et retourner à la page de mise à jour ?');
        if (confirmed) {
            window.location.href = './update-page.html';
        }
    });
    
    // Log initial
    logToConsole('🎯 Interface de reconstruction prête');
    logToConsole('📋 Veuillez uploader les 3 fichiers CSV requis');
});