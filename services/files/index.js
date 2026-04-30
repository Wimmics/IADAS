const http = require('http');

const fileQuery = require('./logic.js');

http.createServer(function (request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  fileQuery.manage(request, response);
// For the server to be listening to request, it needs a port, which is set thanks to the listen function.
}).listen(8002, '0.0.0.0');