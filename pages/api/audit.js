const { runAudit } = require('../../utils/audit');

module.exports = async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing URL' });
  }

  try {
    const result = await runAudit(url);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: 'Audit failed', details: err.message });
  }
};
