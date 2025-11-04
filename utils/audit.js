const axios = require('axios');

async function runAudit(url) {
  // Здесь можно встроить Lighthouse, Puppeteer или заглушку:
  return {
    url,
    score: Math.random().toFixed(2),
    message: 'Аудит завершён успешно (заглушка)'
  };
}

module.exports = { runAudit };
