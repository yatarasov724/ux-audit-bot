const express = require('express');
const auditApi = require('./pages/api/audit');

const app = express();
const port = 3000;

// Роут для проверки
app.get('/', (req, res) => {
  res.send('UX Audit Bot is running');
});

// Подключение ручки audit
app.get('/api/audit', auditApi);

app.listen(port, () => {
  console.log(`✅ Server is running at http://localhost:${port}`);
});
