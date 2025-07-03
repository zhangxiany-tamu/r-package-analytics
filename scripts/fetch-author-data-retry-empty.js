const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Aggressive configuration for speed
const BATCH_SIZE = 100;
const DELAY_BETWEEN_BATCHES = 200;
const TIMEOUT = 3000;
const MAX_RETRIES = 2;
const MAX_CONCURRENT_BATCHES = 3;

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
            await sleep(100 * (retryCount + 1));
            return fetchPackageAuthorInfo(packageName, retryCount + 1);
        }
        
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
    let processedCount = 0;
    let updatedCount = 0;
    
    for (let i = 0; i < allBatches.length; i += MAX_CONCURRENT_BATCHES) {
        const batchGroup = allBatches.slice(i, i + MAX_CONCURRENT_BATCHES);
        
        const batchPromises = batchGroup.map((batch, index) => 
            fetchAuthorDataBatch(batch.packages, batch.batchNumber, allBatches.length)
        );
        
        const batchResults = await Promise.all(batchPromises);
        
        // Merge results and count updates
        batchResults.flat().forEach(result => {
            const wasEmpty = !existingData[result.package] || 
                           !existingData[result.package].author || 
                           existingData[result.package].author === '';
            
            existingData[result.package] = {
                author: result.author,
                maintainer: result.maintainer,
                title: result.title,
                lastUpdated: new Date().toISOString()
            };
            
            if (result.success && wasEmpty) {
                updatedCount++;
            }
        });
        
        processedCount += batchResults.flat().length;
        
        // Save progress after each group
        const authorData = {
            lastUpdated: new Date().toISOString(),
            totalPackages: packages.length,
            processedPackages: Object.keys(existingData).length,
            authorData: existingData
        };
        
        fs.writeFileSync(authorDataPath, JSON.stringify(authorData, null, 2));
        
        const percentage = Math.round(processedCount/allBatches.flat().map(b => b.packages).flat().length*100);
        const elapsed = Date.now() - globalStartTime;
        console.log(`💾 Progress: ${processedCount} processed, ${updatedCount} updated empty entries - ${Math.round(processedCount/(elapsed/1000/60))} packages/min`);
        
        if (i + MAX_CONCURRENT_BATCHES < allBatches.length) {
            await sleep(DELAY_BETWEEN_BATCHES);
        }
    }
    
    return updatedCount;
}

async function main() {
    const globalStartTime = Date.now();
    
    try {
        console.log('🔄 Starting author data retry for empty entries...');
        
        // Load package list
        const packageListPath = path.join(__dirname, '..', 'data', 'cran-packages.json');
        if (!fs.existsSync(packageListPath)) {
            throw new Error('Package list not found. Please run fetch-packages.js first.');
        }
        
        const packageData = JSON.parse(fs.readFileSync(packageListPath, 'utf8'));
        const packages = packageData.packages;
        
        console.log(`📦 Found ${packages.length} packages total`);
        
        // Load existing author data
        const authorDataPath = path.join(__dirname, '..', 'data', 'cran-authors.json');
        let existingData = {};
        let emptyEntries = [];
        
        if (fs.existsSync(authorDataPath)) {
            const existing = JSON.parse(fs.readFileSync(authorDataPath, 'utf8'));
            existingData = existing.authorData || {};
            
            // Find packages with empty author data
            emptyEntries = packages.filter(pkg => {
                const entry = existingData[pkg];
                return !entry || !entry.author || entry.author === '';
            });
            
            console.log(`📂 Found existing data for ${Object.keys(existingData).length} packages`);
            console.log(`🔍 Found ${emptyEntries.length} packages with empty author data`);
        } else {
            emptyEntries = packages;
            console.log(`📂 No existing data found, will process all packages`);
        }
        
        if (emptyEntries.length === 0) {
            console.log('✅ No empty entries found! All packages have author data.');
            return;
        }
        
        console.log(`🔄 Processing ${emptyEntries.length} packages with empty author data...`);
        
        // Prepare batches for empty entries only
        const allBatches = [];
        for (let i = 0; i < emptyEntries.length; i += BATCH_SIZE) {
            const batch = emptyEntries.slice(i, i + BATCH_SIZE);
            allBatches.push({
                packages: batch,
                batchNumber: Math.floor(i / BATCH_SIZE) + 1
            });
        }
        
        console.log(`📊 Will process ${allBatches.length} batches with up to ${MAX_CONCURRENT_BATCHES} concurrent batches`);
        
        // Process all batches
        const updatedCount = await processBatchesConcurrently(allBatches, existingData, authorDataPath, packages, globalStartTime);
        
        const duration = Date.now() - globalStartTime;
        const totalEntries = Object.keys(existingData).length;
        const successfulEntries = Object.values(existingData).filter(entry => entry.author && entry.author !== '').length;
        
        console.log('\n✅ Author data retry completed!');
        console.log(`📈 Final stats:`);
        console.log(`   - Total packages: ${packages.length}`);
        console.log(`   - Total entries: ${totalEntries}`);
        console.log(`   - Entries with author data: ${successfulEntries}`);
        console.log(`   - Coverage: ${Math.round(successfulEntries/packages.length*100)}%`);
        console.log(`   - Updated empty entries: ${updatedCount}`);
        console.log(`   - Total time: ${Math.round(duration/1000)}s`);
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