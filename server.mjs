import http from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateStudentComments,
  generateZaloMessage,
  generateMeetingPlan,
  generateEarlyWarning
} from './server_ai.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const staticRoot = join(root, 'dist');
const dataDir = join(root, 'data');
const stateFilePath = join(dataDir, 'class_state.json');
const portArgument = process.argv.indexOf('--port');
const port = Number((portArgument >= 0 ? process.argv[portArgument + 1] : undefined) || process.env.DEFAULT_APP_PORT || (process.env.PORT && process.env.PORT !== '8080' ? process.env.PORT : 3000));

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

// In-memory master state cache for ultra-fast sync
let masterState = null;
let masterUpdatedAt = 0;
let masterVersion = 1;
let isSaving = false;
let pendingSave = false;

// Active SSE client connections for real-time broadcasts
const sseClients = new Set();

async function initServerStorage() {
  try {
    await mkdir(dataDir, { recursive: true });
    const raw = await readFile(stateFilePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      masterState = parsed.state || parsed;
      masterUpdatedAt = Number(parsed.updatedAt || masterState.__lastUpdatedAt || Date.now());
      masterVersion = Number(parsed.version || 1);
      console.log(`[GVCN PRO Sync] Loaded persistent class data from disk (${Object.keys(masterState || {}).length} keys, updatedAt: ${new Date(masterUpdatedAt).toISOString()})`);
    }
  } catch (err) {
    console.log('[GVCN PRO Sync] Initialized clean server storage.');
  }
}

async function persistMasterStateToDisk() {
  if (isSaving) {
    pendingSave = true;
    return;
  }
  isSaving = true;
  try {
    const payload = JSON.stringify({
      version: masterVersion,
      updatedAt: masterUpdatedAt,
      state: masterState
    }, null, 2);
    await writeFile(stateFilePath, payload, 'utf-8');
  } catch (err) {
    console.error('[GVCN PRO Sync] Error writing state to disk:', err);
  } finally {
    isSaving = false;
    if (pendingSave) {
      pendingSave = false;
      persistMasterStateToDisk();
    }
  }
}

function broadcastToClients(eventType, data, excludeRes = null) {
  const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    if (client !== excludeRes) {
      try {
        client.write(message);
      } catch (err) {
        sseClients.delete(client);
      }
    }
  }
}

// Reconcile arrays and sub-objects intelligently
function mergeStateObjects(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;

  const result = { ...existing, ...incoming };

  // Reconcile students: preserve all students and merge history lists
  if (Array.isArray(incoming.students)) {
    const existingStudentsMap = new Map((existing.students || []).map(s => [String(s.id), s]));
    result.students = incoming.students.map(inSt => {
      const exSt = existingStudentsMap.get(String(inSt.id));
      if (!exSt) return inSt;
      
      // Merge scoring history unique by ID or timestamp+reason
      const histMap = new Map();
      (exSt.history || []).forEach(h => {
        const key = h.id || `${h.date}_${h.points}_${h.reason}`;
        histMap.set(key, h);
      });
      (inSt.history || []).forEach(h => {
        const key = h.id || `${h.date}_${h.points}_${h.reason}`;
        histMap.set(key, h);
      });
      
      return {
        ...exSt,
        ...inSt,
        history: Array.from(histMap.values()).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      };
    });
  }

  // Reconcile attendance records
  if (incoming.attendanceRecords && typeof incoming.attendanceRecords === 'object') {
    result.attendanceRecords = {
      ...(existing.attendanceRecords || {}),
      ...incoming.attendanceRecords
    };
    // Deep merge each day
    Object.keys(incoming.attendanceRecords).forEach(date => {
      result.attendanceRecords[date] = {
        ...((existing.attendanceRecords && existing.attendanceRecords[date]) || {}),
        ...incoming.attendanceRecords[date]
      };
    });
  }

  // Reconcile daily locks
  if (incoming.dailyScoringLocks && typeof incoming.dailyScoringLocks === 'object') {
    result.dailyScoringLocks = {
      ...(existing.dailyScoringLocks || {}),
      ...incoming.dailyScoringLocks
    };
  }

  // Reconcile class fund transactions
  if (incoming.classFund && typeof incoming.classFund === 'object') {
    const exFund = existing.classFund || {};
    const inFund = incoming.classFund;
    const txMap = new Map();
    (exFund.ledger || []).forEach(t => txMap.set(String(t.id), t));
    (inFund.ledger || []).forEach(t => txMap.set(String(t.id), t));

    const campMap = new Map();
    (exFund.campaigns || []).forEach(c => campMap.set(String(c.id), c));
    (inFund.campaigns || []).forEach(c => campMap.set(String(c.id), c));

    result.classFund = {
      ...exFund,
      ...inFund,
      ledger: Array.from(txMap.values()).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)),
      campaigns: Array.from(campMap.values())
    };
  }

  // Reconcile accounts & audit log
  if (incoming.authConfig && typeof incoming.authConfig === 'object') {
    const exAuth = existing.authConfig || {};
    const inAuth = incoming.authConfig;
    const accMap = new Map();
    (exAuth.accounts || []).forEach(a => accMap.set(String(a.id), a));
    (inAuth.accounts || []).forEach(a => accMap.set(String(a.id), a));
    result.authConfig = {
      ...exAuth,
      ...inAuth,
      accounts: Array.from(accMap.values())
    };
  }

  if (Array.isArray(incoming.authAuditLog)) {
    const logMap = new Map();
    (existing.authAuditLog || []).forEach(l => logMap.set(l.id || `${l.time}_${l.action}`, l));
    incoming.authAuditLog.forEach(l => logMap.set(l.id || `${l.time}_${l.action}`, l));
    result.authAuditLog = Array.from(logMap.values()).sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0)).slice(0, 1000);
  }

  return result;
}

function safePath(urlPath) {
  const decoded = decodeURIComponent((urlPath || '/').split('?')[0]);
  const cleaned = normalize(decoded).replace(/^([.][.][/\\])+/, '');
  return cleaned === '/' ? '/index.html' : cleaned;
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 50 * 1024 * 1024) { // 50MB limit
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = req.url || '/';

  // --- API ROUTE: GET SYNC STATE ---
  if (req.method === 'GET' && (url === '/api/sync/get' || url.startsWith('/api/sync/get?'))) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.end(JSON.stringify({
      success: true,
      hasData: !!masterState,
      updatedAt: masterUpdatedAt,
      version: masterVersion,
      activeClients: sseClients.size,
      state: masterState
    }));
    return;
  }

  // --- API ROUTES: GOOGLE GEMINI AI ASSISTANT (GVCN AI EDTECH) ---
  if (req.method === 'POST' && url === '/api/ai/comments') {
    try {
      const payload = await parseJsonBody(req);
      const result = await generateStudentComments(payload);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(result));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  if (req.method === 'POST' && url === '/api/ai/zalo') {
    try {
      const payload = await parseJsonBody(req);
      const result = await generateZaloMessage(payload);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(result));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  if (req.method === 'POST' && url === '/api/ai/meeting') {
    try {
      const payload = await parseJsonBody(req);
      const result = await generateMeetingPlan(payload);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(result));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  if (req.method === 'POST' && url === '/api/ai/early-warning') {
    try {
      const payload = await parseJsonBody(req);
      const result = await generateEarlyWarning(payload);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(result));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --- API ROUTE: SAVE / SYNC STATE ---
  if (req.method === 'POST' && (url === '/api/sync/save' || url === '/api/sync')) {
    try {
      const payload = await parseJsonBody(req);
      const incomingState = payload.state;
      const incomingTs = Number(payload.updatedAt || Date.now());
      const clientInfo = payload.clientInfo || {};

      if (!incomingState || typeof incomingState !== 'object') {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ success: false, error: 'Invalid state payload' }));
        return;
      }

      // Security: Passcode verification if configured
      const configuredPasscode = masterState?.settings?.adminPasscode;
      if (configuredPasscode) {
        const clientPass = req.headers['x-admin-passcode'] || payload.passcode;
        if (clientPass !== configuredPasscode) {
          res.statusCode = 403;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ success: false, error: 'Mã bảo vệ lớp học không chính xác' }));
          return;
        }
      }

      masterVersion++;
      masterUpdatedAt = Math.max(Date.now(), incomingTs);
      incomingState.__lastUpdatedAt = masterUpdatedAt;

      // Smart merge incoming state with existing master state
      masterState = mergeStateObjects(masterState, incomingState);
      masterState.__lastUpdatedAt = masterUpdatedAt;

      persistMasterStateToDisk();

      // Broadcast update to all other connected clients
      broadcastToClients('sync_update', {
        type: 'sync_update',
        version: masterVersion,
        updatedAt: masterUpdatedAt,
        clientInfo,
        state: masterState
      });

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({
        success: true,
        version: masterVersion,
        updatedAt: masterUpdatedAt,
        activeClients: sseClients.size
      }));
    } catch (err) {
      console.error('[GVCN PRO Sync] Error in /api/sync/save:', err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --- API ROUTE: REAL-TIME SSE STREAM ---
  if (req.method === 'GET' && (url === '/api/sync/events' || url === '/api/sync/stream')) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    res.write(`event: connected\ndata: ${JSON.stringify({ success: true, updatedAt: masterUpdatedAt, version: masterVersion })}\n\n`);
    sseClients.add(res);

    // Heartbeat every 25 seconds to keep connection alive through proxies
    const heartbeat = setInterval(() => {
      try {
        res.write(`: heartbeat ${Date.now()}\n\n`);
      } catch (_) {
        clearInterval(heartbeat);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
    return;
  }

  // --- STATIC FILE SERVING ---
  try {
    let rel = safePath(req.url);
    let filePath = join(staticRoot, rel.replace(/^[/\\]+/, ''));

    try {
      const s = await stat(filePath);
      if (s.isDirectory()) filePath = join(filePath, 'index.html');
    } catch {
      // Single-page fallback
      filePath = join(staticRoot, 'index.html');
    }

    const data = await readFile(filePath);
    res.statusCode = 200;
    res.setHeader('Content-Type', mime[extname(filePath).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', extname(filePath).toLowerCase() === '.html' ? 'no-cache, no-store, must-revalidate' : 'public, max-age=3600');
    res.end(data);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Unable to serve application.');
    console.error(err);
  }
});

await initServerStorage();

server.listen(port, '0.0.0.0', () => {
  console.log(`GVCN PRO Real-time Sync Server running on http://0.0.0.0:${port}`);
});
