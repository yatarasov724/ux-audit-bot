// chrome-launcher is an ES module, will be imported dynamically

// Normalize URL - add https:// if protocol is missing
function normalizeUrl(url) {
  if (!url) return url;
  url = url.trim();
  if (!url.match(/^https?:\/\//i)) {
    url = 'https://' + url;
  }
  return url;
}

// Clean markdown links from text - remove [text](url) patterns
function cleanMarkdownLinks(text) {
  if (!text) return text;
  // Remove markdown links: [text](url) -> text
  return text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
}

// Translate Lighthouse issue titles and descriptions
function translateLighthouseIssue(issue, lang = 'ru') {
  try {
    const translations = require(`../lang/${lang}.json`);
    const lighthouseTranslations = translations.lighthouse || {};
    
    // Try to get translation by ID
    const translation = lighthouseTranslations[issue.id];
    
    if (translation) {
      return {
        title: translation.title || issue.title,
        description: translation.description || cleanMarkdownLinks(issue.description)
      };
    }
  } catch (e) {
    // If translation file doesn't exist, continue with English
  }
  
  // If no translation found, just clean the description
  return {
    title: issue.title,
    description: cleanMarkdownLinks(issue.description)
  };
}

async function runLighthouse(url, lang = 'ru') {
  let chrome = null;
  
  try {
    console.log(`[Lighthouse] Starting audit for: ${url}`);
    
    // Normalize URL (add https:// if missing)
    url = normalizeUrl(url);
    console.log(`[Lighthouse] Normalized URL: ${url}`);
    
    // Validate URL format
    try {
      new URL(url);
    } catch (e) {
      throw new Error(`Invalid URL format: ${url}`);
    }

    // Dynamically import chrome-launcher (ES module)
    console.log('[Lighthouse] Importing chrome-launcher...');
    let chromeLauncher;
    try {
      chromeLauncher = await import('chrome-launcher');
      console.log('[Lighthouse] chrome-launcher imported successfully');
    } catch (err) {
      console.error('[Lighthouse] Error importing chrome-launcher:', err);
      throw new Error(`Failed to import chrome-launcher: ${err.message}`);
    }
    
    // Launch Chrome in headless mode with additional flags for Railway/Docker
    console.log('[Lighthouse] Launching Chrome...');
    try {
      chrome = await chromeLauncher.default.launch({
        chromeFlags: [
          '--headless',
          '--no-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process'
        ]
      });
    } catch (err) {
      console.error('[Lighthouse] Error launching Chrome:', err);
      throw new Error(`Failed to launch Chrome: ${err.message}`);
    }

    if (!chrome || !chrome.port) {
      throw new Error('Failed to launch Chrome instance - no port assigned');
    }

    console.log(`[Lighthouse] Chrome launched successfully on port ${chrome.port}`);

    // Dynamically import Lighthouse (ES module)
    console.log('[Lighthouse] Importing Lighthouse...');
    let lighthouse;
    try {
      lighthouse = await import('lighthouse');
      console.log('[Lighthouse] Lighthouse imported successfully');
    } catch (err) {
      console.error('[Lighthouse] Error importing Lighthouse:', err);
      throw new Error(`Failed to import Lighthouse: ${err.message}`);
    }

    // Run Lighthouse
    const options = {
      logLevel: 'error',
      output: 'json',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      port: chrome.port
    };

    console.log(`[Lighthouse] Running Lighthouse audit for: ${url}`);
    console.log(`[Lighthouse] Options:`, JSON.stringify(options, null, 2));
    
    let runnerResult;
    try {
      runnerResult = await lighthouse.default(url, options);
      console.log('[Lighthouse] Lighthouse audit completed');
    } catch (err) {
      console.error('[Lighthouse] Error running Lighthouse:', err);
      throw new Error(`Lighthouse audit failed: ${err.message}`);
    }

    if (!runnerResult || !runnerResult.lhr) {
      throw new Error('Lighthouse returned invalid results');
    }

    // Extract scores and detailed information from the results
    const categories = runnerResult.lhr.categories;
    const audits = runnerResult.lhr.audits;
    
    if (!categories) {
      throw new Error('No categories found in Lighthouse results');
    }

    // Helper function to extract issues and opportunities from a category
    function extractCategoryDetails(categoryKey, categoryData) {
      if (!categoryData || !categoryData.auditRefs) {
        return [];
      }

      const issues = [];
      
      categoryData.auditRefs.forEach(auditRef => {
        const audit = audits[auditRef.id];
        if (!audit) return;

        // Skip metrics - we only want issues/opportunities
        if (audit.scoreDisplayMode === 'numeric') {
          return;
        }

        // Include audits that failed (score < 1) - these are real issues
        const score = audit.score;
        const isFailing = score !== null && score < 1;
        
        // Only include failing audits (real problems)
        if (isFailing) {
          // Translate and clean the issue
          const translated = translateLighthouseIssue({
            id: auditRef.id,
            title: audit.title,
            description: audit.description || ''
          }, lang);
          
          const issue = {
            id: auditRef.id,
            title: translated.title,
            description: translated.description,
            score: score !== null ? Math.round(score * 100) : null,
            displayValue: audit.displayValue || null,
            details: null
          };

          // Extract details if available
          if (audit.details) {
            if (audit.details.type === 'opportunity') {
              // For opportunities, extract savings
              if (audit.details.overallSavingsMs) {
                issue.savings = Math.round(audit.details.overallSavingsMs);
                issue.savingsUnit = 'ms';
              }
              if (audit.details.overallSavingsBytes) {
                issue.savingsBytes = Math.round(audit.details.overallSavingsBytes);
              }
            }
            
            // Extract items if available (like list of resources, nodes, etc.)
            if (audit.details.items && audit.details.items.length > 0) {
              issue.items = audit.details.items.slice(0, 5); // Limit to 5 items
              issue.itemsCount = audit.details.items.length;
            }
          }

          issues.push(issue);
        }
      });

      // Sort by score (worst first) or by importance
      return issues.sort((a, b) => {
        if (a.score !== null && b.score !== null) {
          return a.score - b.score;
        }
        if (a.score === null) return 1;
        if (b.score === null) return -1;
        return 0;
      });
    }

    // Extract details for each category
    const performanceIssues = extractCategoryDetails('performance', categories.performance);
    const accessibilityIssues = extractCategoryDetails('accessibility', categories.accessibility);
    const bestPracticesIssues = extractCategoryDetails('best-practices', categories['best-practices']);
    const seoIssues = extractCategoryDetails('seo', categories.seo);

    const result = {
      url,
      timestamp: new Date().toISOString(),
      performance: Math.round((categories.performance?.score || 0) * 100),
      accessibility: Math.round((categories.accessibility?.score || 0) * 100),
      bestPractices: Math.round((categories['best-practices']?.score || 0) * 100),
      seo: Math.round((categories.seo?.score || 0) * 100),
      issues: {
        performance: performanceIssues,
        accessibility: accessibilityIssues,
        bestPractices: bestPracticesIssues,
        seo: seoIssues
      }
    };

    console.log('Lighthouse audit completed successfully');
    return result;
  } catch (error) {
    console.error('[Lighthouse] Error details:', error);
    console.error('[Lighthouse] Error stack:', error.stack);
    throw new Error(`Lighthouse audit failed: ${error.message}`);
  } finally {
    // Close Chrome instance
    if (chrome) {
      try {
        console.log('[Lighthouse] Closing Chrome instance...');
        await chrome.kill();
        console.log('[Lighthouse] Chrome instance closed successfully');
      } catch (killError) {
        console.error('[Lighthouse] Error closing Chrome:', killError);
      }
    }
  }
}

async function runAudit(url, platform = 'web', lang = 'ru') {
  const translations = require(`../lang/${lang}.json`);
  // Simulate async operation with a small delay
  return new Promise((resolve) => {
    setTimeout(() => {
      // Define all possible issues by criterion (using English keys for internal logic)
      const allIssues = {
        'Layout & Structure': [
          ...(platform === 'web' ? ['contentWidthExceeds'] : []),
          ...(platform === 'mobile' ? ['horizontalScrolling'] : []),
          'inconsistentSpacing'
        ],
        'Navigation': [
          ...(platform === 'web' ? ['noStickyHeader'] : []),
          ...(platform === 'mobile' ? ['hamburgerMenuMissing'] : []),
          'confusingHierarchy'
        ],
        'Typography & Readability': [
          ...(platform === 'web' ? ['fontSizeTooSmall'] : []),
          ...(platform === 'mobile' ? ['poorReadability'] : []),
          'insufficientLineSpacing'
        ],
        'Accessibility': [
          'missingAltText',
          'lowContrast',
          'noKeyboardNav'
        ],
        'Mobile-specific': platform === 'mobile' ? [
          'tapTargetsTooSmall',
          'viewportMissing',
          'noResponsiveLayout'
        ] : [],
        'Visual hierarchy': [
          'inconsistentHeadings',
          'noClearCTA',
          'overuseOfBold'
        ]
      };

      // Generate mock results - randomly include some issues per criterion
      const criteria = Object.keys(allIssues).filter(criterion => {
        // Include mobile-specific only for mobile platform
        if (criterion === 'Mobile-specific' && platform !== 'mobile') {
          return false;
        }
        return true;
      });

      const results = criteria.map(criterion => {
        const possibleIssues = allIssues[criterion];
        if (possibleIssues.length === 0) {
          return {
            criterion: translations.criteria[criterion] || criterion,
            issues: []
          };
        }

        // Randomly select 0-2 issues per criterion (weighted toward having some issues)
        const numIssues = Math.random() < 0.3 ? 0 : Math.min(Math.floor(Math.random() * 2) + 1, possibleIssues.length);
        const selectedIssues = possibleIssues
          .sort(() => Math.random() - 0.5)
          .slice(0, numIssues);

        // Translate issues to Russian
        const translatedIssues = selectedIssues.map(issueKey => {
          const criterionKey = criterion;
          return translations.issues[criterionKey]?.[issueKey] || issueKey;
        });

        return {
          criterion: translations.criteria[criterion] || criterion,
          issues: translatedIssues.length > 0 ? translatedIssues : []
        };
      });

      // Calculate summary
      const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
      const criteriaWithIssues = results.filter(r => r.issues.length > 0).length;

      resolve({
        url,
        platform,
        timestamp: new Date().toISOString(),
        criteria: results,
        summary: {
          totalIssues,
          criteriaWithIssues,
          criteriaTotal: criteria.length,
          passed: totalIssues === 0
        }
      });
    }, 1000); // 1 second delay to simulate real audit
  });
}

module.exports = { runAudit, runLighthouse };
