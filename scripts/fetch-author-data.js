const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const BATCH_SIZE = 50; // Number of packages to process concurrently
const DELAY_BETWEEN_BATCHES = 1000; // 1 second delay between batches
const TIMEOUT = 5000; // 5 second timeout per request
const MAX_RETRIES = 3;

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPackageAuthorInfo(packageName, retryCount = 0) {
    try {
        const response = await axios.get(`https://crandb.r-pkg.org/${packageName}`, { 
            timeout: TIMEOUT 
        });
        
        return {
            package: packageName,
            author: response.data.Author || '',
            maintainer: response.data.Maintainer || '',
            title: response.data.Title || '',
            success: true
        };
    } catch (error) {
        if (retryCount < MAX_RETRIES && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT')) {
            console.log(`Retrying ${packageName} (attempt ${retryCount + 1}/${MAX_RETRIES})`);
            await sleep(1000 * (retryCount + 1)); // Exponential backoff
            return fetchPackageAuthorInfo(packageName, retryCount + 1);
        }
        
        console.warn(`Failed to fetch ${packageName}: ${error.message}`);
        return {
            package: packageName,
            author: '',
            maintainer: '',
            title: '',
            success: false,
            error: error.message
        };
    }
}

async function fetchAuthorDataBatch(packages) {
    console.log(`Processing batch of ${packages.length} packages...`);
    
    const promises = packages.map(pkg => fetchPackageAuthorInfo(pkg));
    const results = await Promise.all(promises);
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`Batch complete: ${successful} successful, ${failed} failed`);
    return results;
}

async function main() {
    try {
        console.log('🚀 Starting author data fetch...');
        
        // Load package list
        const packageListPath = path.join(__dirname, '..', 'data', 'cran-packages.json');
        if (!fs.existsSync(packageListPath)) {
            throw new Error('Package list not found. Please run fetch-packages.js first.');
        }
        
        const packageData = JSON.parse(fs.readFileSync(packageListPath, 'utf8'));
        const packages = packageData.packages;
        
        console.log(`📦 Found ${packages.length} packages to process`);
        
        // Check if author data already exists
        const authorDataPath = path.join(__dirname, '..', 'data', 'cran-authors.json');
        let existingData = {};
        let startIndex = 0;
        
        if (fs.existsSync(authorDataPath)) {
            const existing = JSON.parse(fs.readFileSync(authorDataPath, 'utf8'));
            existingData = existing.authorData || {};
            startIndex = Object.keys(existingData).length;
            console.log(`📂 Found existing data for ${startIndex} packages, resuming from package ${startIndex + 1}`);
        }
        
        const remainingPackages = packages.slice(startIndex);
        console.log(`🔄 Processing ${remainingPackages.length} remaining packages...`);
        
        // Process in batches
        const totalBatches = Math.ceil(remainingPackages.length / BATCH_SIZE);
        let processedCount = startIndex;
        
        for (let i = 0; i < remainingPackages.length; i += BATCH_SIZE) {
            const batch = remainingPackages.slice(i, i + BATCH_SIZE);
            const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
            
            console.log(`\n📊 Processing batch ${batchNumber}/${totalBatches} (packages ${processedCount + 1}-${processedCount + batch.length})`);
            
            const results = await fetchAuthorDataBatch(batch);
            
            // Add results to existing data
            results.forEach(result => {
                existingData[result.package] = {
                    author: result.author,
                    maintainer: result.maintainer,
                    title: result.title,
                    lastUpdated: new Date().toISOString()
                };
            });
            
            processedCount += batch.length;
            
            // Save progress after each batch
            const authorData = {
                lastUpdated: new Date().toISOString(),
                totalPackages: packages.length,
                processedPackages: processedCount,
                authorData: existingData
            };
            
            fs.writeFileSync(authorDataPath, JSON.stringify(authorData, null, 2));
            console.log(`💾 Saved progress: ${processedCount}/${packages.length} packages (${Math.round(processedCount/packages.length*100)}%)`);
            
            // Delay between batches to be respectful to the API
            if (i + BATCH_SIZE < remainingPackages.length) {
                console.log(`⏸️  Waiting ${DELAY_BETWEEN_BATCHES}ms before next batch...`);
                await sleep(DELAY_BETWEEN_BATCHES);
            }
        }
        
        console.log('\n✅ Author data fetch completed!');
        console.log(`📈 Final stats:`);
        console.log(`   - Total packages: ${packages.length}`);
        console.log(`   - Successfully processed: ${Object.keys(existingData).length}`);
        console.log(`   - Success rate: ${Math.round(Object.keys(existingData).length/packages.length*100)}%`);
        console.log(`   - Data saved to: ${authorDataPath}`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n⏹️  Process interrupted. Progress has been saved.');
    process.exit(0);
});

main();