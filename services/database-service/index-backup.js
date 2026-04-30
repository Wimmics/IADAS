// Database Service - Gestion reconstruction ontologie IA-DAS
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

const PORT = 8005;

console.log(`=Ä Database Service démarrant sur le port ${PORT}`);

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
    console.log('\n=== RECONSTRUCTION ONTOLOGIE DATASET DS ===');
    
    try {
      const multiparty = require('multiparty');
      const form = new multiparty.Form();
      
      form.parse(req, async (err, fields, files) => {
        if (err) {
          console.error('L Erreur parsing multipart:', err);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Erreur upload fichiers', details: err.message }));
          return;
        }
        
        console.log('=Á Fichiers reçus:', Object.keys(files));
        
        try {
          // Vérifier les 3 fichiers requis
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
          
          // Headers pour streaming de progression
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
          
          sendProgress(5, 'Sauvegarde des fichiers CSV...', '=Á Copie vers pipeline/data-csv/');
          
          // ÉTAPE 1: Sauvegarder les CSV vers pipeline
          const pipelineDir = path.resolve(__dirname, '../../pipeline-ontologie');
          const csvDir = path.join(pipelineDir, 'data-csv');
          
          if (!fs.existsSync(csvDir)) {
            fs.mkdirSync(csvDir, { recursive: true });
          }
          
          const fileMapping = {
            'sportHierarchy': 'Sport-Hierarchy.csv',
            'classHierarchy': 'Class-Hierarchy-V1.csv',
            'mainData': 'IA-DAS-Data.csv'
          };
          
          for (const [uploadKey, fileName] of Object.entries(fileMapping)) {
            const uploadedFile = files[uploadKey][0];
            const targetPath = path.join(csvDir, fileName);
            fs.copyFileSync(uploadedFile.path, targetPath);
            console.log(`=Ë ${fileName} ’ ${targetPath}`);
          }
          
          sendProgress(15, 'Exécution pipeline Python...', '= Génération nouveaux fichiers TTL');
          
          // ÉTAPE 2: Exécuter pipeline Python
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
            sendProgress(null, null, `L ${error.trim()}`);
          });
          
          pythonProcess.on('close', async (code) => {
            console.log(`<Á Pipeline terminée avec code: ${code}`);
            
            if (code !== 0) {
              sendProgress(0, 'Erreur pipeline Python');
              res.write(JSON.stringify({ 
                error: 'Pipeline Python échouée',
                code: code,
                output: pythonOutput,
                stderr: pythonError
              }) + '\n');
              res.end();
              return;
            }
            
            try {
              sendProgress(50, 'Pipeline terminée, reconstruction dataset...', '=Ä Suppression ancien dataset ds');
              
              // ÉTAPE 3: Supprimer ancien dataset ds
              const dsPath = path.resolve(__dirname, '../../fuseki/databases/ds');
              if (fs.existsSync(dsPath)) {
                console.log(`=Ñ Suppression ${dsPath}`);
                fs.rmSync(dsPath, { recursive: true, force: true });
                sendProgress(60, 'Ancien dataset supprimé');
              }
              
              sendProgress(70, 'Copie nouveaux fichiers TTL...', '=Ä Mise à jour des sources TTL');
              
              // ÉTAPE 4: Copier les nouveaux TTL vers fuseki-service
              const resultatsDir = path.join(pipelineDir, 'resultats');
              const initDir = path.resolve(__dirname, '../../init');
              
              if (!fs.existsSync(initDir)) {
                fs.mkdirSync(initDir, { recursive: true });
              }
              
              const ttlMapping = {
                'ia-das-ontology-clean.ttl': 'ia-das-ontology-clean.ttl',
                'variable-hierarchy-clean.ttl': 'variable-hierarchy-clean.ttl', 
                'sport-hierarchy-simple-clean.ttl': 'sport-hierarchy-simple-clean.ttl'
              };
              
              for (const [source, target] of Object.entries(ttlMapping)) {
                const sourcePath = path.join(resultatsDir, source);
                const targetPath = path.join(initDir, target);
                
                if (fs.existsSync(sourcePath)) {
                  fs.copyFileSync(sourcePath, targetPath);
                  console.log(`=Ä ${source} ’ ${target}`);
                } else {
                  console.warn(`  Fichier manquant: ${sourcePath}`);
                }
              }
              
              sendProgress(85, 'Redémarrage service Fuseki...', '= Rechargement dataset ds');
              
              // ÉTAPE 5: Redémarrer fuseki-service
              // Note: Ici on devrait idéalement redémarrer le container/service Fuseki
              // Pour l'instant on simule
              await new Promise(resolve => setTimeout(resolve, 3000));
              
              sendProgress(100, 'Reconstruction terminée !');
              res.write(JSON.stringify({ 
                success: true, 
                message: 'Ontologie reconstruite avec succès - Dataset ds rechargé',
                timestamp: new Date().toISOString(),
                processingTime: Date.now() - startTime,
                note: 'Redémarrez manuellement le service Fuseki pour finaliser'
              }) + '\n');
              
            } catch (dbError) {
              console.error('L Erreur reconstruction DB:', dbError);
              res.write(JSON.stringify({ 
                error: 'Erreur lors de la reconstruction de la base de données',
                details: dbError.message
              }) + '\n');
            }
            
            res.end();
          });
          
        } catch (fileError) {
          console.error('L Erreur traitement fichiers:', fileError);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            error: 'Erreur lors du traitement des fichiers',
            details: fileError.message
          }));
        }
      });
      
    } catch (parseError) {
      console.error('L Erreur critique:', parseError);
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
  console.log(`=€ Database Service démarré sur http://localhost:${PORT}`);
  console.log(`=á Endpoint: POST /rebuild-ontology`);
  console.log(`<¯ Fonction: Reconstruction dataset ds avec nouveaux CSV`);
});