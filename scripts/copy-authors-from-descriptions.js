const fs = require('fs');
const path = require('path');

async function copyAuthorsFromDescriptions() {
    console.log('🔄 Copying author data from descriptions to author file...');
    
    // Load description data
    const descriptionsPath = path.join(__dirname, '..', 'data', 'cran-descriptions.json');
    if (!fs.existsSync(descriptionsPath)) {
        throw new Error('Descriptions file not found. Please run fetch-package-descriptions.js first.');
    }
    
    const descriptionsData = JSON.parse(fs.readFileSync(descriptionsPath, 'utf8'));
    const descriptions = descriptionsData.packageData || {};
    
    console.log(`📄 Found descriptions for ${Object.keys(descriptions).length} packages`);
    
    // Load existing author data
    const authorDataPath = path.join(__dirname, '..', 'data', 'cran-authors.json');
    let existingData = {};
    
    if (fs.existsSync(authorDataPath)) {
        const existing = JSON.parse(fs.readFileSync(authorDataPath, 'utf8'));
        existingData = existing.authorData || {};
        console.log(`📂 Found existing author data for ${Object.keys(existingData).length} packages`);
    }
    
    let updatedCount = 0;
    let newCount = 0;
    
    // Copy author data from descriptions
    for (const [packageName, descData] of Object.entries(descriptions)) {
        const hasAuthorData = descData.author && descData.author !== '';
        const hasMaintainerData = descData.maintainer && descData.maintainer !== '';
        
        if (hasAuthorData || hasMaintainerData) {
            const existingEntry = existingData[packageName];
            const isEmptyOrMissing = !existingEntry || 
                                   (!existingEntry.author || existingEntry.author === '') ||
                                   (!existingEntry.maintainer || existingEntry.maintainer === '');
            
            if (isEmptyOrMissing) {
                const wasNew = !existingEntry;
                
                existingData[packageName] = {
                    author: descData.author || '',
                    maintainer: descData.maintainer || '',
                    title: descData.title || existingEntry?.title || '',
                    lastUpdated: new Date().toISOString()
                };
                
                if (wasNew) {
                    newCount++;
                } else {
                    updatedCount++;
                }
            }
        }
    }
    
    // Save updated author data
    const authorData = {
        lastUpdated: new Date().toISOString(),
        totalPackages: 22382, // From package list
        processedPackages: Object.keys(existingData).length,
        authorData: existingData
    };
    
    fs.writeFileSync(authorDataPath, JSON.stringify(authorData, null, 2));
    
    // Calculate stats
    const totalEntries = Object.keys(existingData).length;
    const entriesWithAuthor = Object.values(existingData).filter(entry => entry.author && entry.author !== '').length;
    const entriesWithMaintainer = Object.values(existingData).filter(entry => entry.maintainer && entry.maintainer !== '').length;
    
    console.log('\n✅ Author data copy completed!');
    console.log(`📈 Results:`);
    console.log(`   - New entries created: ${newCount}`);
    console.log(`   - Empty entries updated: ${updatedCount}`);
    console.log(`   - Total entries: ${totalEntries}`);
    console.log(`   - Entries with author: ${entriesWithAuthor}`);
    console.log(`   - Entries with maintainer: ${entriesWithMaintainer}`);
    console.log(`   - Author coverage: ${Math.round(entriesWithAuthor/22382*100)}%`);
    console.log(`   - Maintainer coverage: ${Math.round(entriesWithMaintainer/22382*100)}%`);
    console.log(`   - Data saved to: ${authorDataPath}`);
}

// Run the script
if (require.main === module) {
    copyAuthorsFromDescriptions().catch(error => {
        console.error('❌ Script failed:', error);
        process.exit(1);
    });
}

module.exports = { copyAuthorsFromDescriptions };