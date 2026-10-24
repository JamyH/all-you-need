// Kleiner HTTPS-Helfer für die lokalen Riot-APIs (selbstsigniertes Zertifikat).
const https = require('https');

const localAgent = new https.Agent({ rejectUnauthorized: false });

function requestJson(method, url, headers = {}, body = undefined, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = https.request(
      url,
      {
        method,
        agent: localAgent,
        timeout: timeoutMs,
        headers: payload ? { ...headers, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : headers,
      },
      (res) => {
        let text = '';
        res.on('data', (c) => (text += c));
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`HTTP ${res.statusCode} ${url} ${text.slice(0, 200)}`));
          }
          if (!text) return resolve(null);
          try {
            resolve(JSON.parse(text));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const getJson = (url, headers = {}, timeoutMs = 2000) => requestJson('GET', url, headers, undefined, timeoutMs);

module.exports = { getJson, requestJson };
