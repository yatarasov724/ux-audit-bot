const { runLighthouse } = require('./utils/audit');

async function testLighthouse() {
  console.log('Testing Lighthouse...\n');
  
  try {
    // Test with a simple, fast-loading website
    const testUrl = 'https://example.com';
    console.log(`Running Lighthouse audit for: ${testUrl}`);
    console.log('This may take a few seconds...\n');
    
    const result = await runLighthouse(testUrl);
    
    console.log('✅ Lighthouse audit completed successfully!\n');
    console.log('Results:');
    console.log(JSON.stringify(result, null, 2));
    
    console.log('\n📊 Scores Summary:');
    console.log(`  Performance: ${result.performance}/100`);
    console.log(`  Accessibility: ${result.accessibility}/100`);
    console.log(`  Best Practices: ${result.bestPractices}/100`);
    console.log(`  SEO: ${result.seo}/100`);
    
  } catch (error) {
    console.error('❌ Error running Lighthouse:');
    console.error(error.message);
    process.exit(1);
  }
}

testLighthouse();


