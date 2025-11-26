const express = require('express');
const path = require('path');

console.log('Starting server initialization...');

// Load utilities with error handling
let runAudit, runLighthouse, runUXAudit;

try {
  console.log('Loading audit utils...');
  const auditUtils = require('./utils/audit');
  runAudit = auditUtils.runAudit;
  runLighthouse = auditUtils.runLighthouse;
  console.log('Audit utils loaded successfully');
} catch (err) {
  console.error('Error loading audit utils:', err);
  // Server will still start, but audit endpoints will fail gracefully
}

try {
  console.log('Loading UX audit utils...');
  const uxAuditUtils = require('./utils/ux-audit');
  runUXAudit = uxAuditUtils.runUXAudit;
  console.log('UX audit utils loaded successfully');
} catch (err) {
  console.error('Error loading UX audit utils:', err);
  // Server will still start, but UX audit endpoint will fail gracefully
}

const app = express();
const port = process.env.PORT || 3000;

console.log(`Server port: ${port}`);

// Request logging middleware - log ALL requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - IP: ${req.ip} - Host: ${req.get('host')}`);
  console.log(`Request headers:`, JSON.stringify(req.headers, null, 2));
  next();
});

// Increase timeout for Lighthouse requests (can take 30-60 seconds)
app.use(express.json({ limit: '10mb' }));

// Set timeout for all requests
app.use((req, res, next) => {
  req.setTimeout(120000); // 2 minutes
  res.setTimeout(120000);
  next();
});

// Normalize URL - add https:// if protocol is missing
function normalizeUrl(url) {
  if (!url) return url;
  
  url = url.trim();
  
  // If URL doesn't start with http:// or https://, add https://
  if (!url.match(/^https?:\/\//i)) {
    url = 'https://' + url;
  }
  
  return url;
}

// API endpoint for regular audit
app.get('/api/audit', async (req, res) => {
  const { url, platform = 'web', lang = 'ru' } = req.query;

  // Validate language
  const validLang = (lang === 'en' || lang === 'ru') ? lang : 'ru';
  const translations = require(`./lang/${validLang}.json`);

  if (!url) {
    return res.status(400).json({ error: translations.api.missingUrlParameter });
  }

  // Normalize URL (add https:// if missing)
  const normalizedUrl = normalizeUrl(url);

  // Validate platform parameter
  if (platform !== 'web' && platform !== 'mobile') {
    return res.status(400).json({ error: translations.api.invalidPlatform });
  }

  try {
    if (!runAudit) {
      return res.status(503).json({ error: 'Audit service is not available', details: 'Module not loaded' });
    }
    const result = await runAudit(normalizedUrl, platform, validLang);
    res.status(200).json(result);
  } catch (err) {
    console.error('Audit error:', err);
    res.status(500).json({ error: translations.api.auditFailed, details: err.message });
  }
});

// API endpoint for Lighthouse audit
app.get('/api/lighthouse', async (req, res) => {
  const { url, lang = 'ru' } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  // Validate language
  const validLang = (lang === 'en' || lang === 'ru') ? lang : 'ru';

  // Normalize URL (add https:// if missing)
  const normalizedUrl = normalizeUrl(url);

  try {
    if (!runLighthouse) {
      return res.status(503).json({ error: 'Lighthouse service is not available', details: 'Module not loaded' });
    }
    console.log(`Starting Lighthouse audit for: ${normalizedUrl}`);
    const result = await runLighthouse(normalizedUrl, validLang);
    console.log(`Lighthouse audit completed for: ${normalizedUrl}`);
    res.status(200).json(result);
  } catch (err) {
    console.error('Lighthouse audit error:', err);
    res.status(500).json({ 
      error: 'Lighthouse audit failed', 
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// API endpoint for UX audit
app.get('/api/ux-audit', async (req, res) => {
  const { url, lang = 'ru' } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  // Validate language
  const validLang = (lang === 'en' || lang === 'ru') ? lang : 'ru';

  // Normalize URL (add https:// if missing)
  const normalizedUrl = normalizeUrl(url);

  try {
    if (!runUXAudit) {
      return res.status(503).json({ error: 'UX audit service is not available', details: 'Module not loaded' });
    }
    console.log(`Starting UX audit for: ${normalizedUrl}`);
    const result = await runUXAudit(normalizedUrl, validLang);
    console.log(`UX audit completed for: ${normalizedUrl}`);
    res.status(200).json(result);
  } catch (err) {
    console.error('UX audit error:', err);
    res.status(500).json({ 
      error: 'UX audit failed', 
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// Healthcheck endpoint (simple and fast) - should be first to respond quickly
app.get('/health', (req, res) => {
  console.log('Healthcheck called');
  try {
    res.status(200).json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      port: port,
      modules: {
        audit: !!runAudit,
        lighthouse: !!runLighthouse,
        uxAudit: !!runUXAudit
      }
    });
    console.log('Healthcheck response sent');
  } catch (err) {
    console.error('Error in healthcheck:', err);
    res.status(500).json({ error: 'Healthcheck failed', message: err.message });
  }
});

// Serve index.html for root route FIRST (before static files)
app.get('/', (req, res) => {
  console.log('=== ROOT ROUTE HANDLER CALLED ===');
  console.log('Request URL:', req.url);
  console.log('Request path:', req.path);
  console.log('Request originalUrl:', req.originalUrl);
  
  try {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    console.log('Serving index.html from:', indexPath);
    console.log('__dirname:', __dirname);
    
    // Check if file exists
    const fs = require('fs');
    const fileExists = fs.existsSync(indexPath);
    console.log('File exists:', fileExists);
    
    if (!fileExists) {
      console.error('index.html not found at:', indexPath);
      // List files in public directory
      const publicDir = path.join(__dirname, 'public');
      console.log('Public directory:', publicDir);
      if (fs.existsSync(publicDir)) {
        const files = fs.readdirSync(publicDir);
        console.log('Files in public directory:', files);
      }
      return res.status(404).send('index.html not found at: ' + indexPath);
    }
    
    console.log('Sending index.html file...');
    res.sendFile(indexPath, (err) => {
      if (err) {
        console.error('Error sending index.html:', err);
        console.error('Error stack:', err.stack);
        if (!res.headersSent) {
          res.status(500).send('Error loading page: ' + err.message);
        }
      } else {
        console.log('✅ index.html sent successfully');
      }
    });
  } catch (err) {
    console.error('Error serving index.html:', err);
    console.error('Error stack:', err.stack);
    if (!res.headersSent) {
      res.status(500).send('Error loading page: ' + err.message);
    }
  }
});

// Serve static files AFTER API routes and root route
app.use('/lang', express.static('lang')); // Serve translation files
app.use(express.static('public')); // Serve static files from public directory

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Start server with error handling
console.log('Setting up server routes...');

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // Don't exit, let the server try to continue
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit, let the server try to continue
});

try {
  console.log(`Attempting to start server on port ${port}...`);
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`✅ Бот UX‑аудита запущен на http://0.0.0.0:${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`PORT: ${port}`);
    console.log('Server is ready to accept connections');
  });

  server.on('error', (err) => {
    console.error('Server error:', err);
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use`);
    }
  });
} catch (err) {
  console.error('Failed to start server:', err);
  console.error('Error stack:', err.stack);
  process.exit(1);
}
