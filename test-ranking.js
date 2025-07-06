// Test script to demonstrate the ranking functionality
const axios = require('axios');

const SERVER_URL = 'http://localhost:3000';

async function testRanking() {
  console.log('Testing CRAN Package Ranking Functionality\n');
  
  try {
    // Test 1: Get downloads with ranking for popular packages
    console.log('Test 1: Downloads with ranking for popular packages');
    const response1 = await axios.get(`${SERVER_URL}/api/downloads/ggplot2,dplyr?period=last-year&includeRanking=true`);
    
    response1.data.forEach(pkg => {
      console.log(`Package: ${pkg.package}`);
      if (pkg.ranking) {
        console.log(`  Percentile: ${pkg.ranking.percentile || 'N/A'}%`);
        console.log(`  Downloads: ${pkg.ranking.downloads?.toLocaleString() || 'N/A'}`);
        console.log(`  Method: ${pkg.ranking.estimated ? 'Estimated' : 'Precise (sample: ' + pkg.ranking.sampleSize + ')'}`);
      }
      console.log('');
    });

    // Test 2: Dedicated ranking endpoint
    console.log('Test 2: Dedicated ranking endpoint');
    const response2 = await axios.get(`${SERVER_URL}/api/ranking/shiny,data.table?period=last-year`);
    
    response2.data.forEach(pkg => {
      console.log(`Package: ${pkg.package}`);
      console.log(`  Percentile: ${pkg.percentile || 'N/A'}%`);
      console.log(`  Downloads: ${pkg.downloads?.toLocaleString() || 'N/A'}`);
      console.log(`  Method: ${pkg.estimated ? 'Estimated' : 'Precise (sample: ' + pkg.sampleSize + ')'}`);
      console.log('');
    });

    // Test 3: Test with less popular package
    console.log('Test 3: Less popular package ranking');
    const response3 = await axios.get(`${SERVER_URL}/api/ranking/devtools?period=last-year`);
    
    response3.data.forEach(pkg => {
      console.log(`Package: ${pkg.package}`);
      console.log(`  Percentile: ${pkg.percentile || 'N/A'}%`);
      console.log(`  Downloads: ${pkg.downloads?.toLocaleString() || 'N/A'}`);
      console.log(`  Method: ${pkg.estimated ? 'Estimated' : 'Precise (sample: ' + pkg.sampleSize + ')'}`);
      console.log('');
    });

  } catch (error) {
    console.error('Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

// Only run if server is available
async function checkServer() {
  try {
    await axios.get(`${SERVER_URL}/api/search/test`);
    return true;
  } catch (error) {
    return false;
  }
}

async function main() {
  const serverRunning = await checkServer();
  
  if (serverRunning) {
    await testRanking();
  } else {
    console.log('Server is not running. Please start with: npm start');
    console.log('\nTo test the ranking functionality:');
    console.log('1. Start the server: npm start');
    console.log('2. Run this test: node test-ranking.js');
    console.log('3. Open browser: http://localhost:3000');
    console.log('\nAPI Endpoints:');
    console.log('- GET /api/downloads/:packages?includeRanking=true&period=last-year');
    console.log('- GET /api/ranking/:packages?period=last-year');
    console.log('\nExample usage:');
    console.log('- http://localhost:3000/api/downloads/ggplot2?includeRanking=true');
    console.log('- http://localhost:3000/api/ranking/ggplot2,dplyr');
    console.log('\nFrontend Integration:');
    console.log('- Enter a package name (e.g., "ggplot2") in the web interface');
    console.log('- The percentile will appear in the "Popularity" card');
    console.log('- Higher percentile = more popular (99% = top 1%)');
    console.log('- For multiple packages, percentiles appear in individual summaries');
  }
}

main();