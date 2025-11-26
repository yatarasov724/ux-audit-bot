const express = require('express');
const path = require('path');

// Load utilities - lighthouse is loaded dynamically, so no errors on startup
const { runAudit, runLighthouse } = require('./utils/audit');
const { runUXAudit } = require('./utils/ux-audit');

const app = express();
const port = process.env.PORT || 3000;

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

// Healthcheck endpoint (simple and fast)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files AFTER API routes
app.use('/lang', express.static('lang')); // Serve translation files
app.use(express.static('public')); // Serve static files from public directory

// Serve index.html for root route (fallback)
app.get('/', (req, res) => {
  try {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } catch (err) {
    console.error('Error serving index.html:', err);
    res.status(500).send('Error loading page');
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Start server with error handling
try {
  app.listen(port, '0.0.0.0', () => {
    console.log(`Бот UX‑аудита запущен на http://0.0.0.0:${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`PORT: ${port}`);
  });
} catch (err) {
  console.error('Failed to start server:', err);
  process.exit(1);
}
