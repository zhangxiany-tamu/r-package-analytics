const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const BATCH_SIZE = 10; // Number of concurrent requests
const DELAY_BETWEEN_BATCHES = 500; // Delay in milliseconds
const OUTPUT_FILE = path.join(__dirname, '..', 'data', 'cran-descriptions.json');

async function fetchPackageDescriptions() {
    console.log('📦 Starting to fetch package descriptions from CRAN...');
    
    // Load the package list
    const packageListPath = path.join(__dirname, '..', 'data', 'cran-packages.json');
    if (!fs.existsSync(packageListPath)) {
        console.error('❌ Package list not found. Run fetch-package-names.js first.');
        process.exit(1);
    }
    
    const packageData = JSON.parse(fs.readFileSync(packageListPath, 'utf8'));
    const allPackages = packageData.packages;
    console.log(`📋 Found ${allPackages.length} packages to process`);
    
    // Check if we have existing data
    let existingData = {};
    let processedCount = 0;
    
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            const existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
            existingData = existing.packageData || {};
            processedCount = Object.keys(existingData).length;
            console.log(`📄 Found existing data for ${processedCount} packages`);
        } catch (error) {
            console.warn('⚠️ Could not read existing data file, starting fresh');
        }
    }
    
    const packageDescriptions = { ...existingData };
    let newCount = 0;
    let errorCount = 0;
    
    // Process packages in batches
    for (let i = 0; i < allPackages.length; i += BATCH_SIZE) {
        const batch = allPackages.slice(i, i + BATCH_SIZE);
        
        // Process batch concurrently
        const batchPromises = batch.map(async (packageName) => {
            // Skip if we already have this package
            if (packageDescriptions[packageName]) {
                return { packageName, status: 'skipped' };
            }
            
            try {
                const response = await axios.get(`https://crandb.r-pkg.org/${packageName}`, {
                    timeout: 10000
                });
                
                packageDescriptions[packageName] = {
                    title: response.data.Title || '',
                    description: response.data.Description || '',
                    version: response.data.Version || '',
                    author: response.data.Author || '',
                    maintainer: response.data.Maintainer || '',
                    lastUpdated: new Date().toISOString()
                };
                
                newCount++;
                return { packageName, status: 'success' };
            } catch (error) {
                errorCount++;
                console.warn(`⚠️ Failed to fetch ${packageName}: ${error.message}`);
                return { packageName, status: 'error', error: error.message };
            }
        });
        
        // Wait for batch to complete
        await Promise.all(batchPromises);
        
        // Progress update
        const totalProcessed = processedCount + newCount;
        const percentage = ((i + batch.length) / allPackages.length * 100).toFixed(1);
        console.log(`📊 Progress: ${percentage}% (${totalProcessed} total, ${newCount} new, ${errorCount} errors)`);
        
        // Save progress every 50 batches
        if ((i / BATCH_SIZE) % 50 === 0) {
            await saveData(packageDescriptions, processedCount + newCount, allPackages.length);
        }
        
        // Delay between batches to be respectful
        if (i + BATCH_SIZE < allPackages.length) {
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
    }
    
    // Save final results
    await saveData(packageDescriptions, processedCount + newCount, allPackages.length);
    
    console.log('✅ Package description fetching completed!');
    console.log(`📊 Final stats:`);
    console.log(`   - Total packages: ${allPackages.length}`);
    console.log(`   - Successfully processed: ${processedCount + newCount}`);
    console.log(`   - New fetches: ${newCount}`);
    console.log(`   - Errors: ${errorCount}`);
    console.log(`   - Coverage: ${((processedCount + newCount) / allPackages.length * 100).toFixed(1)}%`);
}

async function saveData(packageDescriptions, processedCount, totalPackages) {
    const outputData = {
        lastUpdated: new Date().toISOString(),
        totalPackages: totalPackages,
        processedPackages: processedCount,
        packageData: packageDescriptions
    };
    
    // Ensure directory exists
    const outputDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2));
    console.log(`💾 Saved data for ${processedCount} packages to ${OUTPUT_FILE}`);
}

// Run the script
if (require.main === module) {
    fetchPackageDescriptions().catch(error => {
        console.error('❌ Script failed:', error);
        process.exit(1);
    });
}

module.exports = { fetchPackageDescriptions };