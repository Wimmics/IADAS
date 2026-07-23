// url will be used to parse the url (captain obvious at your service).
const url = require('url');
// fs stands for FileSystem, it's the module to use to manipulate files on the disk.
const fs = require('fs');
// path is used only for its parse method, which creates an object containing useful information about the path.
const path = require('path');

// We will limit the search of files in the front folder (../../front from here).
// Note that fs methods consider the current folder to be the one where the app is run, that's why we don't need the "../.." before front.
const baseFrontPath = '/front';
// If the user requests a directory, a file can be returned by default.
const defaultFileIfFolder = "index.html";

/* Dict associating files' extension to a MIME type browsers understand. The reason why this is needed is that only
** the file's content is sent to the browser, so it cannot know for sure what kind of file it was to begin with,
** and so how to interpret it. To help, we will send the type of file in addition to its content.
** Note that the list is not exhaustive, you may need it to add some other MIME types (google is your friend). */
const mimeTypes = {
    '.ico': 'image/x-icon',
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.md': 'text/plain',
    'default': 'application/octet-stream'
};

// Chemins qui ne sont pas des fichiers statiques mais des appels API proxifies
// par la passerelle (port 8000) en production. Depuis le fix routing (cce27de,
// 12/07/2026), le frontend construit des chemins relatifs pour ces appels en
// s'attendant a etre servi via la passerelle - donc si quelqu'un accede
// directement au port 8002 (ancienne habitude), ces appels 404 sans redirection.
const API_PATH_PREFIXES = ['/api/', '/stats', '/update-analysis', '/delete-analysis', '/rebuild-ontology'];

function isApiPath(pathname) {
    // Egalite exacte, ou prefixe suivi d'un "/" - evite qu'un fichier statique
    // comme "/stats-page.html" ne soit pris pour l'API "/stats" (boucle de
    // redirection avec la passerelle, cf ERR_TOO_MANY_REDIRECTS).
    return API_PATH_PREFIXES.some(p => pathname === p || pathname.startsWith(p.endsWith('/') ? p : p + '/'));
}

// Main method, exported at the end of the file. It's the one that will be called when a file is requested.
function manageRequest(request, response) {
    const requestUrl = url.parse(request.url);
    if (isApiPath(requestUrl.pathname)) {
        // 307 (pas 302) : garantit que la methode (POST) et le corps de la requete
        // sont preserves lors de la redirection, contrairement a 302 historiquement.
        const host = (request.headers.host || 'localhost:8002').split(':')[0];
        response.statusCode = 307;
        response.setHeader('Location', `http://${host}:8000${request.url}`);
        response.end();
        return;
    }

    // First let's parse the URL, extract the path, and parse it into an easy-to-use object.
    // We add the baseFrontPath at the beginning to limit the places to search for files.
    const parsedUrl = url.parse(baseFrontPath + request.url);
    let pathName = `.${parsedUrl.pathname}`;
    let extension = path.parse(pathName).ext;
    // Uncomment the line below if you want to check in the console what url.parse() and path.parse() create.
    //console.log(parsedUrl, pathName, path.parse(pathName));

    // Let's check if the file exists.
    fs.exists(pathName, async function (exist) {
        if (!exist) {
            send404(pathName, response);
            return;
        }

        // If it is a directory, we will return the default file.
        if (fs.statSync(pathName).isDirectory()) {
            pathName += `/${defaultFileIfFolder}`;
            extension = `.${defaultFileIfFolder.split(".")[1]}`;
        }

        // Let's read the file from the file system and send it to the user.
        fs.readFile(pathName, function(error, data){
            // The reading may fail if a folder was targeted but doesn't contain the default file.
            if (error) {
                console.log(`Error getting the file: ${pathName}: ${error}`);
                send404(pathName, response);
            } else {
                // If the file is OK, let's set the MIME type and send it.
                response.setHeader('Content-type', mimeTypes[extension] || mimeTypes['default'] );
                response.end(data);
            }
        });
    });
}

function send404(path, response) {
    // Note that you can create a beautiful html page and return that page instead of the simple message below.
    response.statusCode = 404;
    response.end(`File ${path} not found!`);
}

exports.manage = manageRequest;