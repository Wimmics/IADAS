// Database Service - Gestion reconstruction ontologie IA-DAS
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

const PORT = 8005;

console.log(`🗄️ Database Service démarrant sur le port ${PORT}`);

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
          console.error('❌ Erreur parsing multipart:', err);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Erreur upload fichiers', details: err.message }));
          return;
        }
        
        console.log('📁 Fichiers reçus:', Object.keys(files));
        
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
          
          sendProgress(5, 'Sauvegarde des fichiers CSV...', '📁 Copie vers pipeline/data-csv/');
          
          // ÉTAPE 1: Sauvegarder les CSV vers pipeline (écrasement des anciens)
          const pipelineDir = path.resolve(__dirname, '/app/pipeline-ontologie');
          const csvDir = path.join(pipelineDir, 'data-csv');
          
          // Créer le dossier s'il n'existe pas
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
            console.log(`📋 ${fileName} → ${targetPath}`);
          }
          
          sendProgress(15, 'Exécution pipeline Python...', '🐍 Génération nouveaux fichiers TTL');
          
          // ÉTAPE 2: Exécuter pipeline Python
          const pythonProcess = spawn('python3', ['pipeline_complet_ia_das.py'], {
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
              sendProgress(50, 'Pipeline terminée, chargement dans Fuseki...');

              // ÉTAPE 3 : Upload HTTP direct vers Fuseki (sans Docker restart)
              const fusekiBase = process.env.FUSEKI_URL
                ? process.env.FUSEKI_URL.replace('/ds/sparql', '')
                : 'http://fuseki:3030';
              const fusekiAuth = 'Basic ' + Buffer.from('admin:admin').toString('base64');

              // Supprimer le dataset existant
              sendProgress(55, 'Suppression ancien dataset...', '🗑️ DELETE /ds');
              try {
                await fetch(`${fusekiBase}/$/datasets/ds`, {
                  method: 'DELETE',
                  headers: { Authorization: fusekiAuth }
                });
              } catch (e) { /* dataset peut ne pas exister */ }

              // Recréer le dataset
              sendProgress(60, 'Création nouveau dataset...', '🆕 POST /$/datasets');
              await fetch(`${fusekiBase}/$/datasets`, {
                method: 'POST',
                headers: { Authorization: fusekiAuth, 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'dbName=ds&dbType=tdb2'
              });

              // Charger les 4 fichiers TTL dans l'ordre
              const resultatsDir = path.join(pipelineDir, 'resultats');
              const skosFile = path.join(pipelineDir, 'skos-acad-enrichment.ttl');
              const ttlFiles = [
                { file: path.join(resultatsDir, 'ia-das-ontology-clean.ttl'),       label: 'ia-das-ontology-clean.ttl' },
                { file: path.join(resultatsDir, 'variable-hierarchy-clean.ttl'),    label: 'variable-hierarchy-clean.ttl' },
                { file: path.join(resultatsDir, 'sport-hierarchy-simple-clean.ttl'),label: 'sport-hierarchy-simple-clean.ttl' },
                { file: skosFile,                                                    label: 'skos-acad-enrichment.ttl' },
              ];

              let step = 65;
              for (const { file, label } of ttlFiles) {
                if (!fs.existsSync(file)) {
                  console.warn(`⚠️ Fichier manquant: ${file}`);
                  continue;
                }
                sendProgress(step, `Upload ${label}...`, `📤 ${label}`);
                const content = fs.readFileSync(file);
                const uploadRes = await fetch(`${fusekiBase}/ds/data?default`, {
                  method: 'POST',
                  headers: { Authorization: fusekiAuth, 'Content-Type': 'text/turtle' },
                  body: content
                });
                if (!uploadRes.ok) throw new Error(`Upload ${label} échoué: ${uploadRes.status}`);
                console.log(`✅ ${label} chargé`);
                step += 7;
              }

              sendProgress(100, 'Reconstruction terminée !', '✅ Ontologie rechargée dans Fuseki');
              res.write(JSON.stringify({
                success: true,
                message: 'Ontologie reconstruite avec succès',
                timestamp: new Date().toISOString(),
                processingTime: Date.now() - startTime
              }) + '\n');
              res.end();
              
            } catch (dbError) {
              console.error('❌ Erreur reconstruction DB:', dbError);
              res.write(JSON.stringify({ 
                error: 'Erreur lors de la reconstruction de la base de données',
                details: dbError.message
              }) + '\n');
              res.end();
            }
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
  } else if (req.url === '/stats' && req.method === 'GET') {
    console.log('\n=== CALCUL STATISTIQUES BDD ===');
    const pipelineDir = path.resolve(__dirname, '/app/pipeline-ontologie');
    const statsScript = path.resolve(__dirname, '/app/stats_bdd.py');

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });

    const py = spawn('python', [statsScript], {
      cwd: pipelineDir,
      env: { ...process.env, FUSEKI_URL: 'http://fuseki:3030/ds/sparql' }
    });
    let output = '';
    let errorOut = '';

    py.stdout.on('data', d => { output += d.toString(); });
    py.stderr.on('data', d => { errorOut += d.toString(); });

    py.on('close', code => {
      if (code !== 0) {
        res.end(JSON.stringify({ success: false, error: errorOut }));
      } else {
        res.end(JSON.stringify({ success: true, output, timestamp: new Date().toISOString() }));
      }
    });

  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint non trouvé' }));
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Database Service démarré sur http://localhost:${PORT}`);
  console.log(`📡 Endpoint: POST /rebuild-ontology`);
  console.log(`📊 Endpoint: GET  /stats`);
  console.log(`🎯 Fonction: Reconstruction dataset ds avec nouveaux CSV`);
  console.log(`🐳 Docker: Redémarrage automatique de fuseki-init`);
});