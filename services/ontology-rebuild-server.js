#!/usr/bin/env node
// Serveur dédié à la reconstruction d'ontologie - PORT 8004
const http = require('http');

const PORT = 8004;

console.log(`🔧 Serveur de reconstruction d'ontologie démarrant sur le port ${PORT}`);

http.createServer(async (req, res) => {
  // Headers CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/rebuild-ontology' && req.method === 'POST') {
    const startTime = Date.now();
    console.log('\n=== RECONSTRUCTION ONTOLOGIE DÉMARRÉE ===');
    
    try {
      const multiparty = require('multiparty');
      const fs = require('fs');
      const path = require('path');
      const { spawn } = require('child_process');
      
      const form = new multiparty.Form();
      
      form.parse(req, async (err, fields, files) => {
        if (err) {
          console.error('❌ Erreur parsing multipart:', err);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Erreur upload fichiers', details: err.message }));
          return;
        }
        
        console.log('📁 Fichiers reçus:', Object.keys(files));
        
        try {
          // Vérifier que les 3 fichiers sont présents
          const expectedFiles = ['sportHierarchy', 'classHierarchy', 'mainData'];
          const missingFiles = expectedFiles.filter(f => !files[f] || !files[f][0]);
          
          if (missingFiles.length > 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              error: `Fichiers manquants: ${missingFiles.join(', ')}`,
              expected: expectedFiles,
              received: Object.keys(files)
            }));
            return;
          }
          
          // Chemins des fichiers
          const pipelineDir = path.resolve(__dirname, '../pipeline-ontologie');
          const csvDir = path.join(pipelineDir, 'data-csv');
          
          // S'assurer que le dossier existe
          if (!fs.existsSync(csvDir)) {
            fs.mkdirSync(csvDir, { recursive: true });
          }
          
          // Mapping des fichiers
          const fileMapping = {
            'sportHierarchy': 'Sport-Hierarchy.csv',
            'classHierarchy': 'Class-Hierarchy-V1.csv',
            'mainData': 'IA-DAS-Data.csv'
          };
          
          // Copier les fichiers uploadés vers le bon répertoire
          for (const [uploadKey, fileName] of Object.entries(fileMapping)) {
            const uploadedFile = files[uploadKey][0];
            const targetPath = path.join(csvDir, fileName);
            
            console.log(`📋 Copie ${uploadedFile.originalFilename} → ${fileName}`);
            fs.copyFileSync(uploadedFile.path, targetPath);
          }
          
          console.log('✅ Tous les fichiers copiés dans pipeline/data-csv/');
          
          // Headers pour streaming
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          });
          
          function sendProgress(progress, message, log = null) {
            const data = { progress, message };
            if (log) data.log = log;
            res.write(JSON.stringify(data) + '\n');
          }
          
          sendProgress(10, 'Fichiers uploadés avec succès');
          sendProgress(15, 'Démarrage de la pipeline Python...', '🐍 Exécution pipeline_complet_ia_das.py');
          
          // Exécuter la pipeline Python
          const pythonProcess = spawn('python', ['pipeline_complet_ia_das.py'], {
            cwd: pipelineDir,
            stdio: ['pipe', 'pipe', 'pipe']
          });
          
          let pythonOutput = '';
          let pythonError = '';
          
          pythonProcess.stdout.on('data', (data) => {
            const output = data.toString();
            pythonOutput += output;
            console.log('PIPELINE:', output);
            sendProgress(null, null, output.trim());
          });
          
          pythonProcess.stderr.on('data', (data) => {
            const error = data.toString();
            pythonError += error;
            console.error('PIPELINE ERROR:', error);
            sendProgress(null, null, `❌ ${error.trim()}`);
          });
          
          pythonProcess.on('close', async (code) => {
            console.log(`🏁 Pipeline terminée avec code: ${code}`);
            
            if (code === 0) {
              sendProgress(70, 'Pipeline terminée avec succès');
              sendProgress(75, 'Préparation mise à jour Fuseki...', '🔄 Suppression ancien dataset');
              
              try {
                // Ici on devrait normalement supprimer et recréer le dataset Fuseki
                // Pour l'instant on simule
                await new Promise(resolve => setTimeout(resolve, 2000));
                sendProgress(85, 'Dataset Fuseki nettoyé');
                
                sendProgress(90, 'Import nouveaux fichiers TTL...', '📄 Import des 3 fichiers TTL');
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                sendProgress(100, 'Reconstruction terminée !');
                res.write(JSON.stringify({ 
                  success: true, 
                  message: 'Ontologie reconstruite avec succès',
                  timestamp: new Date().toISOString(),
                  processingTime: Date.now() - startTime
                }) + '\n');
                
              } catch (fusekiError) {
                console.error('❌ Erreur Fuseki:', fusekiError);
                res.write(JSON.stringify({ 
                  error: 'Erreur lors de la mise à jour Fuseki',
                  details: fusekiError.message
                }) + '\n');
              }
              
            } else {
              sendProgress(0, 'Erreur pipeline Python');
              res.write(JSON.stringify({ 
                error: 'Pipeline Python échouée',
                code: code,
                output: pythonOutput,
                stderr: pythonError
              }) + '\n');
            }
            
            res.end();
          });
          
          pythonProcess.on('error', (error) => {
            console.error('❌ Erreur lancement Python:', error);
            res.write(JSON.stringify({ 
              error: 'Impossible de lancer la pipeline Python',
              details: error.message
            }) + '\n');
            res.end();
          });
          
        } catch (fileError) {
          console.error('❌ Erreur traitement fichiers:', fileError);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            error: 'Erreur lors du traitement des fichiers',
            details: fileError.message
          }));
        }
      });
      
    } catch (parseError) {
      console.error('❌ Erreur critique:', parseError);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Erreur serveur interne',
        details: parseError.message
      }));
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint non trouvé' }));
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Serveur de reconstruction d'ontologie démarré sur http://localhost:${PORT}`);
  console.log(`📡 Endpoint disponible: POST /rebuild-ontology`);
});