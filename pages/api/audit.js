const { runAudit } = require('../../utils/audit');
const translations = require('../../lang/ru.json');

module.exports = async (req, res) => {
  const { url, platform = 'web' } = req.query;

  if (!url) {
    return res.status(400).json({ error: translations.api.missingUrl });
  }

  // Validate platform parameter
  if (platform !== 'web' && platform !== 'mobile') {
    return res.status(400).json({ error: translations.api.invalidPlatform });
  }

  try {
    const result = await runAudit(url, platform);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: translations.api.auditFailed, details: err.message });
  }
};
