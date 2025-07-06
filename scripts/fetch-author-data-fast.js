const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Aggressive configuration for speed
const BATCH_SIZE = 100; // Increased from 50
const DELAY_BETWEEN_BATCHES = 200; // Reduced from 1000ms to 200ms
const TIMEOUT = 3000; // Reduced from 5000ms to 3000ms
const MAX_RETRIES = 2; // Reduced from 3
const MAX_CONCURRENT_BATCHES = 3; // Process multiple batches concurrently

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
        if (retryCount < MAX_RETRIES && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.response?.status >= 500)) {
            await sleep(100 * (retryCount + 1)); // Quick exponential backoff
            return fetchPackageAuthorInfo(packageName, retryCount + 1);
        }
        
        // Don't log every failure to reduce noise
        if (retryCount === 0) {
            console.warn(`Failed: ${packageName}`);
        }
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

async function fetchAuthorDataBatch(packages, batchNumber, totalBatches) {
    const startTime = Date.now();
    
    const promises = packages.map(pkg => fetchPackageAuthorInfo(pkg));
    const results = await Promise.all(promises);
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const duration = Date.now() - startTime;
    
    console.log(`Batch ${batchNumber}/${totalBatches}: ${successful}/${packages.length} successful (${duration}ms)`);
    return results;
}

async function processBatchesConcurrently(allBatches, existingData, authorDataPath, packages, globalStartTime) {
    const concurrentBatches = [];
    let processedCount = Object.keys(existingData).length;
    
    for (let i = 0; i < allBatches.length; i += MAX_CONCURRENT_BATCHES) {
        // Process up to MAX_CONCURRENT_BATCHES batches concurrently
        const batchGroup = allBatches.slice(i, i + MAX_CONCURRENT_BATCHES);
        
        const batchPromises = batchGroup.map((batch, index) => 
            fetchAuthorDataBatch(batch.packages, batch.batchNumber, allBatches.length)
        );
        
        const batchResults = await Promise.all(batchPromises);
        
        // Merge all results from this group
        batchResults.flat().forEach(result => {
            existingData[result.package] = {
                author: result.author,
                maintainer: result.maintainer,
                title: result.title,
                lastUpdated: new Date().toISOString()
            };
        });
        
        processedCount += batchResults.flat().length;
        
        // Save progress after each group
        const authorData = {
            lastUpdated: new Date().toISOString(),
            totalPackages: packages.length,
            processedPackages: processedCount,
            authorData: existingData
        };
        
        fs.writeFileSync(authorDataPath, JSON.stringify(authorData, null, 2));
        
        const percentage = Math.round(processedCount/packages.length*100);
        const elapsed = Date.now() - globalStartTime;
        console.log(`💾 Progress: ${processedCount}/${packages.length} (${percentage}%) - ${Math.round(processedCount/(elapsed/1000/60))} packages/min`);
        
        // Brief pause between groups
        if (i + MAX_CONCURRENT_BATCHES < allBatches.length) {
            await sleep(DELAY_BETWEEN_BATCHES);
        }
    }
}

async function main() {
    const globalStartTime = Date.now();
    
    try {
        console.log('🚀 Starting FAST author data fetch...');
        
        // Load package list
        const packageListPath = path.join(__dirname, '..', 'data', 'cran-packages.json');
        if (!fs.existsSync(packageListPath)) {
            throw new Error('Package list not found. Please run fetch-packages.js first.');
        }
        
        const packageData = JSON.parse(fs.readFileSync(packageListPath, 'utf8'));
        const packages = packageData.packages;
        
        console.log(`📦 Found ${packages.length} packages to process`);
        console.log(`⚡ Using aggressive settings: ${BATCH_SIZE} packages/batch, ${MAX_CONCURRENT_BATCHES} concurrent batches, ${DELAY_BETWEEN_BATCHES}ms delay`);
        
        // Check if author data already exists
        const authorDataPath = path.join(__dirname, '..', 'data', 'cran-authors.json');
        let existingData = {};
        let startIndex = 0;
        
        if (fs.existsSync(authorDataPath)) {
            const existing = JSON.parse(fs.readFileSync(authorDataPath, 'utf8'));
            existingData = existing.authorData || {};
            startIndex = Object.keys(existingData).length;
            console.log(`📂 Found existing data for ${startIndex} packages, resuming...`);
        }
        
        const remainingPackages = packages.slice(startIndex);
        console.log(`🔄 Processing ${remainingPackages.length} remaining packages...`);
        
        // Prepare batches
        const allBatches = [];
        for (let i = 0; i < remainingPackages.length; i += BATCH_SIZE) {
            const batch = remainingPackages.slice(i, i + BATCH_SIZE);
            allBatches.push({
                packages: batch,
                batchNumber: Math.floor(i / BATCH_SIZE) + 1
            });
        }
        
        console.log(`📊 Will process ${allBatches.length} batches with up to ${MAX_CONCURRENT_BATCHES} concurrent batches`);
        
        // Process all batches
        await processBatchesConcurrently(allBatches, existingData, authorDataPath, packages, globalStartTime);
        
        const duration = Date.now() - globalStartTime;
        const totalProcessed = Object.keys(existingData).length;
        
        console.log('\n✅ FAST author data fetch completed!');
        console.log(`📈 Final stats:`);
        console.log(`   - Total packages: ${packages.length}`);
        console.log(`   - Successfully processed: ${totalProcessed}`);
        console.log(`   - Success rate: ${Math.round(totalProcessed/packages.length*100)}%`);
        console.log(`   - Total time: ${Math.round(duration/1000)}s`);
        console.log(`   - Average rate: ${Math.round(totalProcessed/(duration/1000/60))} packages/min`);
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