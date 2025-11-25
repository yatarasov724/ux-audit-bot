const puppeteer = require('puppeteer');

// Helper function to wait (replacement for deprecated waitForTimeout)
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Normalize URL - add https:// if protocol is missing
function normalizeUrl(url) {
  if (!url) return url;
  url = url.trim();
  if (!url.match(/^https?:\/\//i)) {
    url = 'https://' + url;
  }
  return url;
}

// Calculate contrast ratio between two colors
function getContrastRatio(color1, color2) {
  // Simplified contrast calculation
  // In real implementation, would need to parse RGB and calculate luminance
  return 4.5; // Placeholder
}

// Check if element is visible
function isElementVisible(element) {
  if (!element) return false;
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && 
         style.visibility !== 'hidden' && 
         style.opacity !== '0' &&
         element.offsetWidth > 0 &&
         element.offsetHeight > 0;
}

// Extract text content safely
function getTextContent(element) {
  if (!element) return '';
  return element.textContent?.trim() || '';
}

async function runUXAudit(url, lang = 'ru') {
  let browser = null;
  
  try {
    // Normalize URL
    url = normalizeUrl(url);
    
    // Validate URL format
    try {
      new URL(url);
    } catch (e) {
      throw new Error(`Invalid URL format: ${url}`);
    }

    console.log('Launching browser for UX audit...');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    
    // Set viewport for desktop
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Navigate to page
    console.log(`Navigating to: ${url}`);
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });

    // Wait a bit for dynamic content
    await wait(2000);

    // Run all checks in parallel
    const [
      visualHierarchy,
      navigation,
      typography,
      interactivity,
      mobileAdaptation,
      accessibility
    ] = await Promise.all([
      checkVisualHierarchy(page),
      checkNavigation(page),
      checkTypography(page),
      checkInteractivity(page),
      checkMobileAdaptation(page),
      checkAccessibility(page)
    ]);

    const result = {
      url,
      timestamp: new Date().toISOString(),
      criteria: [
        {
          criterion: 'Визуальная иерархия',
          criterionKey: 'Visual Hierarchy',
          issues: visualHierarchy.issues,
          score: visualHierarchy.score,
          details: visualHierarchy.details
        },
        {
          criterion: 'Навигация',
          criterionKey: 'Navigation',
          issues: navigation.issues,
          score: navigation.score,
          details: navigation.details
        },
        {
          criterion: 'Типографика и читаемость',
          criterionKey: 'Typography & Readability',
          issues: typography.issues,
          score: typography.score,
          details: typography.details
        },
        {
          criterion: 'Интерактивность',
          criterionKey: 'Interactivity',
          issues: interactivity.issues,
          score: interactivity.score,
          details: interactivity.details
        },
        {
          criterion: 'Мобильная адаптивность',
          criterionKey: 'Mobile Adaptation',
          issues: mobileAdaptation.issues,
          score: mobileAdaptation.score,
          details: mobileAdaptation.details
        },
        {
          criterion: 'Доступность',
          criterionKey: 'Accessibility',
          issues: accessibility.issues,
          score: accessibility.score,
          details: accessibility.details
        }
      ]
    };

    // Calculate summary
    const totalIssues = result.criteria.reduce((sum, c) => sum + c.issues.length, 0);
    const criteriaWithIssues = result.criteria.filter(c => c.issues.length > 0).length;
    const averageScore = result.criteria.reduce((sum, c) => sum + (c.score || 0), 0) / result.criteria.length;

    result.summary = {
      totalIssues,
      criteriaWithIssues,
      criteriaTotal: result.criteria.length,
      averageScore: Math.round(averageScore),
      passed: totalIssues === 0
    };

    console.log('UX audit completed successfully');
    return result;
  } catch (error) {
    console.error('UX audit error details:', error);
    throw new Error(`UX audit failed: ${error.message}`);
  } finally {
    if (browser) {
      try {
        await browser.close();
        console.log('Browser closed');
      } catch (closeError) {
        console.error('Error closing browser:', closeError);
      }
    }
  }
}

// Check visual hierarchy
async function checkVisualHierarchy(page) {
  const issues = [];
  const details = {};

  const hierarchyData = await page.evaluate(() => {
    const headings = {
      h1: Array.from(document.querySelectorAll('h1')).filter(el => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      }),
      h2: Array.from(document.querySelectorAll('h2')).filter(el => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      }),
      h3: Array.from(document.querySelectorAll('h3')).filter(el => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      })
    };

    // Check heading structure
    const h1Count = headings.h1.length;
    const hasMultipleH1 = h1Count > 1;
    const hasNoH1 = h1Count === 0;
    
    // Check heading sizes consistency
    const headingSizes = {};
    headings.h1.forEach(h => {
      const size = window.getComputedStyle(h).fontSize;
      headingSizes.h1 = headingSizes.h1 || [];
      headingSizes.h1.push(parseFloat(size));
    });
    headings.h2.forEach(h => {
      const size = window.getComputedStyle(h).fontSize;
      headingSizes.h2 = headingSizes.h2 || [];
      headingSizes.h2.push(parseFloat(size));
    });

    // Check for CTA buttons
    const ctaSelectors = ['button', 'a[class*="cta"]', 'a[class*="button"]', '[class*="call-to-action"]'];
    const ctas = [];
    ctaSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        const text = el.textContent?.toLowerCase() || '';
        if (text.includes('купить') || text.includes('заказать') || text.includes('начать') || 
            text.includes('buy') || text.includes('order') || text.includes('start') ||
            text.includes('подробнее') || text.includes('learn more')) {
          ctas.push({
            text: el.textContent?.trim().substring(0, 50),
            visible: el.offsetWidth > 0 && el.offsetHeight > 0
          });
        }
      });
    });

    return {
      h1Count,
      hasMultipleH1,
      hasNoH1,
      headingSizes,
      ctaCount: ctas.filter(c => c.visible).length,
      hasCTA: ctas.filter(c => c.visible).length > 0
    };
  });

  details.headings = {
    h1Count: hierarchyData.h1Count,
    hasMultipleH1: hierarchyData.hasMultipleH1,
    hasNoH1: hierarchyData.hasNoH1
  };

  if (hierarchyData.hasNoH1) {
    issues.push('Отсутствует заголовок H1 на странице');
  }
  if (hierarchyData.hasMultipleH1) {
    issues.push(`Найдено ${hierarchyData.h1Count} заголовков H1 (должен быть только один)`);
  }
  if (!hierarchyData.hasCTA) {
    issues.push('Не найден четкий призыв к действию (CTA) на странице');
  }

  const score = issues.length === 0 ? 100 : Math.max(0, 100 - (issues.length * 25));
  return { issues, score, details };
}

// Check navigation
async function checkNavigation(page) {
  const issues = [];
  const details = {};

  const navData = await page.evaluate(() => {
    // Find main navigation
    const navSelectors = ['nav', '[role="navigation"]', 'header nav', '.navigation', '.menu', '.nav'];
    let mainNav = null;
    for (const selector of navSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        if (el.offsetWidth > 0 && el.offsetHeight > 0) {
          mainNav = el;
          break;
        }
      }
      if (mainNav) break;
    }

    // Check for sticky header
    const header = document.querySelector('header');
    const isSticky = header && window.getComputedStyle(header).position === 'fixed';

    // Count navigation links
    const navLinks = mainNav ? mainNav.querySelectorAll('a') : [];
    const visibleLinks = Array.from(navLinks).filter(link => {
      const style = window.getComputedStyle(link);
      return style.display !== 'none' && style.visibility !== 'hidden' && 
             link.offsetWidth > 0 && link.offsetHeight > 0;
    });

    // Check for breadcrumbs
    const breadcrumbSelectors = ['[aria-label*="breadcrumb"]', '.breadcrumb', '[class*="breadcrumb"]'];
    let hasBreadcrumbs = false;
    for (const selector of breadcrumbSelectors) {
      if (document.querySelector(selector)) {
        hasBreadcrumbs = true;
        break;
      }
    }

    // Check for search
    const searchSelectors = ['input[type="search"]', '[role="search"]', '.search', '[class*="search"]'];
    let hasSearch = false;
    for (const selector of searchSelectors) {
      const el = document.querySelector(selector);
      if (el && el.offsetWidth > 0 && el.offsetHeight > 0) {
        hasSearch = true;
        break;
      }
    }

    return {
      hasMainNav: !!mainNav,
      isSticky,
      navLinksCount: visibleLinks.length,
      hasBreadcrumbs,
      hasSearch
    };
  });

  details.navigation = navData;

  if (!navData.hasMainNav) {
    issues.push('Не найдено основное меню навигации');
  }
  if (navData.navLinksCount === 0) {
    issues.push('В меню навигации отсутствуют ссылки');
  }
  if (!navData.isSticky && navData.hasMainNav) {
    issues.push('Меню навигации не закреплено (sticky header) - может быть неудобно на длинных страницах');
  }

  const score = issues.length === 0 ? 100 : Math.max(0, 100 - (issues.length * 20));
  return { issues, score, details };
}

// Check typography
async function checkTypography(page) {
  const issues = [];
  const details = {};

  const typographyData = await page.evaluate(() => {
    // Get body text
    const body = document.body;
    const bodyStyle = window.getComputedStyle(body);
    const bodyFontSize = parseFloat(bodyStyle.fontSize);
    const bodyLineHeight = parseFloat(bodyStyle.lineHeight);
    const lineHeightRatio = bodyLineHeight / bodyFontSize;

    // Check paragraph text sizes
    const paragraphs = Array.from(document.querySelectorAll('p')).slice(0, 10);
    const paragraphSizes = paragraphs.map(p => {
      const style = window.getComputedStyle(p);
      return parseFloat(style.fontSize);
    });
    const avgParagraphSize = paragraphSizes.length > 0 
      ? paragraphSizes.reduce((a, b) => a + b, 0) / paragraphSizes.length 
      : bodyFontSize;

    // Check for very small text
    const smallTextElements = Array.from(document.querySelectorAll('*')).filter(el => {
      const style = window.getComputedStyle(el);
      const fontSize = parseFloat(style.fontSize);
      return fontSize < 14 && el.offsetWidth > 0 && el.offsetHeight > 0;
    });

    return {
      bodyFontSize,
      lineHeightRatio,
      avgParagraphSize,
      smallTextCount: smallTextElements.length
    };
  });

  details.typography = typographyData;

  // Check if values are valid numbers
  const bodyFontSize = typographyData.bodyFontSize && !isNaN(typographyData.bodyFontSize) ? typographyData.bodyFontSize : 16;
  const lineHeightRatio = typographyData.lineHeightRatio && !isNaN(typographyData.lineHeightRatio) ? typographyData.lineHeightRatio : 1.5;

  if (bodyFontSize < 14) {
    issues.push(`Размер основного шрифта слишком мал (${bodyFontSize.toFixed(1)}px, рекомендуется минимум 14-16px)`);
  }
  if (lineHeightRatio < 1.4) {
    issues.push(`Межстрочный интервал слишком мал (${lineHeightRatio.toFixed(2)}, рекомендуется минимум 1.4-1.6)`);
  }
  if (typographyData.smallTextCount > 5) {
    issues.push(`Найдено ${typographyData.smallTextCount} элементов с очень мелким текстом (<14px)`);
  }

  const score = issues.length === 0 ? 100 : Math.max(0, 100 - (issues.length * 25));
  return { issues, score, details };
}

// Check interactivity
async function checkInteractivity(page) {
  const issues = [];
  const details = {};

  const interactivityData = await page.evaluate(() => {
    // Check button sizes
    const buttons = Array.from(document.querySelectorAll('button, a[class*="button"], input[type="submit"], input[type="button"]'));
    const buttonSizes = buttons.map(btn => ({
      width: btn.offsetWidth,
      height: btn.offsetHeight,
      minSize: Math.min(btn.offsetWidth, btn.offsetHeight),
      text: btn.textContent?.trim().substring(0, 30) || ''
    }));

    const smallButtons = buttonSizes.filter(b => b.minSize < 44);

    // Check for hover states (CSS)
    const styleSheets = Array.from(document.styleSheets);
    let hasHoverStyles = false;
    try {
      for (const sheet of styleSheets) {
        const rules = sheet.cssRules || [];
        for (const rule of rules) {
          if (rule.selectorText && rule.selectorText.includes(':hover')) {
            hasHoverStyles = true;
            break;
          }
        }
        if (hasHoverStyles) break;
      }
    } catch (e) {
      // Cross-origin stylesheets may throw errors
    }

    // Check for focus states
    let hasFocusStyles = false;
    try {
      for (const sheet of styleSheets) {
        const rules = sheet.cssRules || [];
        for (const rule of rules) {
          if (rule.selectorText && rule.selectorText.includes(':focus')) {
            hasFocusStyles = true;
            break;
          }
        }
        if (hasFocusStyles) break;
      }
    } catch (e) {
      // Cross-origin stylesheets may throw errors
    }

    return {
      totalButtons: buttons.length,
      smallButtonsCount: smallButtons.length,
      smallButtons: smallButtons.slice(0, 5),
      hasHoverStyles,
      hasFocusStyles
    };
  });

  details.interactivity = interactivityData;

  if (interactivityData.smallButtonsCount > 0) {
    issues.push(`Найдено ${interactivityData.smallButtonsCount} кнопок с размером менее 44x44px (рекомендуемый минимум для удобства нажатия)`);
  }
  if (!interactivityData.hasHoverStyles && interactivityData.totalButtons > 0) {
    issues.push('Не обнаружены hover-эффекты для интерактивных элементов');
  }
  if (!interactivityData.hasFocusStyles) {
    issues.push('Не обнаружены focus-состояния для элементов формы (важно для доступности)');
  }

  const score = issues.length === 0 ? 100 : Math.max(0, 100 - (issues.length * 25));
  return { issues, score, details };
}

// Check mobile adaptation
async function checkMobileAdaptation(page) {
  const issues = [];
  const details = {};

  const mobileData = await page.evaluate(() => {
    // Check viewport meta tag
    const viewportMeta = document.querySelector('meta[name="viewport"]');
    const hasViewport = !!viewportMeta;

    // Check for responsive design indicators
    const hasMediaQueries = document.styleSheets.length > 0; // Simplified check

    // Check for horizontal scroll on mobile viewport
    const bodyWidth = document.body.scrollWidth;
    const windowWidth = window.innerWidth;
    const hasHorizontalScroll = bodyWidth > windowWidth;

    // Check for mobile menu (hamburger)
    const hamburgerSelectors = [
      '[class*="hamburger"]',
      '[class*="menu-toggle"]',
      '[aria-label*="menu"]',
      '.mobile-menu'
    ];
    let hasHamburger = false;
    for (const selector of hamburgerSelectors) {
      if (document.querySelector(selector)) {
        hasHamburger = true;
        break;
      }
    }

    return {
      hasViewport,
      hasMediaQueries,
      hasHorizontalScroll,
      bodyWidth,
      windowWidth,
      hasHamburger
    };
  });

  // Also check mobile viewport
  await page.setViewport({ width: 375, height: 667 }); // iPhone SE size
  await page.reload({ waitUntil: 'networkidle2' });
  await wait(1000);

  const mobileViewportData = await page.evaluate(() => {
    const bodyWidth = document.body.scrollWidth;
    const windowWidth = window.innerWidth;
    return {
      hasHorizontalScroll: bodyWidth > windowWidth,
      bodyWidth,
      windowWidth
    };
  });

  details.mobile = { ...mobileData, mobileViewport: mobileViewportData };

  if (!mobileData.hasViewport) {
    issues.push('Отсутствует мета-тег viewport (необходим для корректного отображения на мобильных устройствах)');
  }
  if (mobileViewportData.hasHorizontalScroll) {
    issues.push('Обнаружена горизонтальная прокрутка на мобильных устройствах (375px) - это плохой UX');
  }
  if (!mobileData.hasHamburger && mobileData.hasMediaQueries) {
    issues.push('Не обнаружено мобильное меню (hamburger menu) - навигация может быть неудобной на мобильных');
  }

  // Reset to desktop viewport
  await page.setViewport({ width: 1920, height: 1080 });

  const score = issues.length === 0 ? 100 : Math.max(0, 100 - (issues.length * 25));
  return { issues, score, details };
}

// Check accessibility
async function checkAccessibility(page) {
  const issues = [];
  const details = {};

  const accessibilityData = await page.evaluate(() => {
    // Check images without alt text
    const images = Array.from(document.querySelectorAll('img'));
    const imagesWithoutAlt = images.filter(img => {
      const alt = img.getAttribute('alt');
      return alt === null || alt.trim() === '';
    });

    // Check for ARIA labels
    const interactiveElements = Array.from(document.querySelectorAll('button, a, input, select, textarea'));
    const elementsWithoutAria = interactiveElements.filter(el => {
      return !el.getAttribute('aria-label') && 
             !el.getAttribute('aria-labelledby') &&
             (!el.textContent || el.textContent.trim() === '');
    });

    // Check for semantic HTML
    const hasMain = !!document.querySelector('main, [role="main"]');
    const hasHeader = !!document.querySelector('header, [role="banner"]');
    const hasFooter = !!document.querySelector('footer, [role="contentinfo"]');

    // Check form labels
    const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
    const inputsWithoutLabels = inputs.filter(input => {
      const id = input.id;
      if (!id) return true;
      const label = document.querySelector(`label[for="${id}"]`);
      return !label;
    });

    return {
      totalImages: images.length,
      imagesWithoutAlt: imagesWithoutAlt.length,
      totalInteractive: interactiveElements.length,
      elementsWithoutAria: elementsWithoutAria.length,
      hasMain,
      hasHeader,
      hasFooter,
      totalInputs: inputs.length,
      inputsWithoutLabels: inputsWithoutLabels.length
    };
  });

  details.accessibility = accessibilityData;

  if (accessibilityData.imagesWithoutAlt > 0) {
    issues.push(`Найдено ${accessibilityData.imagesWithoutAlt} изображений без альтернативного текста (alt)`);
  }
  if (!accessibilityData.hasMain) {
    issues.push('Отсутствует семантический элемент <main> или [role="main"]');
  }
  if (accessibilityData.inputsWithoutLabels > 0 && accessibilityData.totalInputs > 0) {
    issues.push(`Найдено ${accessibilityData.inputsWithoutLabels} полей формы без связанных меток (label)`);
  }
  if (accessibilityData.elementsWithoutAria > 5) {
    issues.push(`Найдено ${accessibilityData.elementsWithoutAria} интерактивных элементов без текста или ARIA-меток`);
  }

  const score = issues.length === 0 ? 100 : Math.max(0, 100 - (issues.length * 20));
  return { issues, score, details };
}

module.exports = { runUXAudit };

