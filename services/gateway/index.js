const http = require('http');
const httpProxy = require('http-proxy');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const proxy = httpProxy.createProxyServer();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8'; // 'password' hashe

http.createServer(function (request, response) {

    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');


    if (request.method === 'OPTIONS') {
        response.writeHead(200);
        response.end();
        return;
    }

    // Ensuite seulement on analyse l'URL (ignorer les paramètres GET)
    let urlWithoutParams = request.url.split("?")[0];
    let filePath = urlWithoutParams.split("/").filter(function (elem) {
        return elem !== "..";
    });

    try {
        if (filePath[1] === "api" && filePath[2] === "auth") {
            handleAuth(request, response);
        } else if (filePath[1] === "api" && (filePath[2] === "query" || filePath[2] === "interface-data")) {
            console.log("REST API call, redirecting to SPARQL Generator");
            console.log(`Request URL: ${request.url}`);
            proxy.web(request, response, { target: "http://sparql-generator:8003" });
        } else if (request.url === '/rebuild-ontology' && request.method === 'POST') {
            console.log("Ontology rebuild request, redirecting to database service");
            proxy.web(request, response, { target: "http://database-service:8005" });
        } else if (request.url.includes('update-page.html')) {
            // TEMPORAIRE: Protection côté client uniquement (voir rapport sécurité)
            console.log("Accès à update-page.html - redirection vers frontend");
            proxy.web(request, response, { target: "http://frontend:8002" });
        } else {
            console.log("Static file request, redirecting to frontend service");
            proxy.web(request, response, { target: "http://frontend:8002" });
        }
    } catch (error) {
        console.log(`Error while processing ${request.url}: ${error}`);
        response.statusCode = 400;
        response.end(`Something went wrong with your request: ${request.url}`);
    }

function handleAuth(request, response) {
    if (request.method === 'POST') {
        let body = '';
        request.on('data', chunk => {
            body += chunk.toString();
        });
        request.on('end', () => {
            try {
                const { password } = JSON.parse(body);
                const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
                
                if (passwordHash === ADMIN_PASSWORD_HASH) {
                    const token = jwt.sign(
                        { role: 'admin', exp: Math.floor(Date.now() / 1000) + (30 * 60) }, 
                        JWT_SECRET
                    );
                    response.writeHead(200, { 'Content-Type': 'application/json' });
                    response.end(JSON.stringify({ success: true, token }));
                } else {
                    response.writeHead(401, { 'Content-Type': 'application/json' });
                    response.end(JSON.stringify({ success: false, message: 'Mot de passe incorrect' }));
                }
            } catch (error) {
                response.writeHead(400, { 'Content-Type': 'application/json' });
                response.end(JSON.stringify({ success: false, message: 'Format invalide' }));
            }
        });
    } else {
        response.writeHead(405);
        response.end();
    }
}

function handleUpdatePageAccess(request, response) {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        response.writeHead(401, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ success: false, message: 'Token manquant' }));
        return;
    }

    const token = authHeader.substring(7);
    try {
        jwt.verify(token, JWT_SECRET);
        proxy.web(request, response, { target: "http://frontend:8002" });
    } catch (error) {
        response.writeHead(401, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ success: false, message: 'Token invalide ou expiré' }));
    }
}
}).listen(8000 , '0.0.0.0');
