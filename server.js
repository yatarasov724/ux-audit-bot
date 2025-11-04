const express = require('express');
const index = require('./pages/index');
const auditApi = require('./pages/api/audit');

const app = express();
const port = 3000;

app.get('/', index);
app.get('/api/audit', auditApi);

app.listen(port, () => {
  console.log(`UX Audit Bot running at http://localhost:${port}`);
});
