import http from 'node:http';
import fs from 'node:fs';
import path, { parse } from 'node:path';
import url, { URL, URLSearchParams } from 'node:url';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const CLIENT_ID = "9d4c757250534e47ab9339c5c16f228f";
const CLIENT_SECRET ="66db214de7e34e62bc028907380d1cd5";
const VERIFY_URL="http://localhost:8000/api"

if (!CLIENT_ID) {
  console.error('Missing "TINK_CLIENT_ID"');
  process.exit(1);
}

if (!CLIENT_SECRET) {
  console.error('Missing "TINK_CLIENT_SECRET"');
  process.exit(1);
}

const hostname = 'localhost';
const port = 3003;

const apiUrl = 'https://api.tink.com';

function respondWithError(res, err) {
  res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({
    error: err.message,
  }));
}

function respondWithJson(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(data)); 
}

async function parseResponse(res) {
  if (!res.ok) {
    throw new Error(`Request failed with "${res.status}"`);
  }

  const data = await res.json();
  return data;
}

function serveStaticContent(req, res) {
  const p = path.join(__dirname,'.',req.url);
  const contentType = req.url.endsWith('.js') ? 'text/javascript' : 'text/css';
  res.setHeader('Content-Type', contentType);

  var stream = fs.createReadStream(p);
  stream.on('error', () => {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end();
  });

  stream.pipe(res);
}

async function fetchAccessToken(code) {
  const body = new URLSearchParams({
    code: code,
    client_id: CLIENT_ID, // Your OAuth client identifier.
    client_secret: CLIENT_SECRET, // Your OAuth client secret. Always handle the secret with care.
    grant_type: 'authorization_code'
  });

  const res = await fetch(`${apiUrl}/api/v1/oauth/token`, {
    method: 'POST',
    body,
  });

  return parseResponse(res);
}

async function authenticatedApiProxyHandler(req, res, parsedUrl) {
  const apiPath = parsedUrl.pathname.replace('/api-proxy', '');
  const response = await fetch(`${apiUrl}${apiPath}`, {
    method: req.method,
    headers: {
      Authorization: req.headers.authorization
    },
  });

  return parseResponse(response);
}
async function verify_user(token) {
  let respond = {};
  try {
    const response = await fetch(`${VERIFY_URL}/auth/verify_user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: token }),
    });

    const data = await response.json();

    respond = data;
  } catch (error) {
    console.log(error);
  }

  return respond.message;
}

const server = http.createServer(async (req, res) => {
  console.info(`${req.method}: `, req.url);
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

  if (parsedUrl.pathname.endsWith('/api/v1/oauth/token') && req.method === 'POST') {
    const codeParam = parsedUrl.searchParams.get('code');
    try {
      if (!codeParam) {
        throw new Error('Missing required parameter "code"');
      }
      const response = await fetchAccessToken(codeParam);
      respondWithJson(res, response);
    } catch (err) {
      respondWithError(res, err);
    }
  }

  if (req.url=='/verify_token' && req.method === 'GET') {
    try {
      const response=await verify_user(req.headers.authorization.slice(7));
      respondWithJson(res, response);
    } catch (err) {
      respondWithError(res, err);
    }
  }

  if (parsedUrl.pathname.startsWith('/api-proxy')) {
    try {
      const response = await authenticatedApiProxyHandler(req, res, parsedUrl);
      respondWithJson(res, response);
    } catch (err) {
      respondWithError(res, err);
    }
  }

  if (req.url.indexOf('/static') === 0) {
    return serveStaticContent(req, res);
  }

  res.writeHead(200, { 'content-type': 'text/html' });
  fs.createReadStream('index.html').pipe(res);
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
