const fs = require('fs');
const path = require('path');

class BioconductorPackageIndexer {
    constructor() {
        this.inputFile = path.join(__dirname, '../data/bioconductor-packages.json');
        this.outputFile = path.join(__dirname, '../data/bioconductor-package-index.json');
    }

    createPackageIndex() {
        console.log('Creating Bioconductor package index...');
        
        try {
            // Load the existing Bioconductor packages data
            if (!fs.existsSync(this.inputFile)) {
                console.error('❌ Bioconductor packages file not found. Run update-bioconductor-packages.js first.');
                return;
            }

            const biocData = JSON.parse(fs.readFileSync(this.inputFile, 'utf8'));
            
            // Create index structure similar to CRAN
            const packageIndex = {
                packages: [],
                packageDetails: {},
                lastUpdated: new Date().toISOString(),
                totalPackages: 0
            };

            // Process each package from packageMetadata
            Object.entries(biocData.packageMetadata || {}).forEach(([packageName, packageInfo]) => {
                // Add to simple package list (for autocomplete)
                packageIndex.packages.push(packageName);
                
                // Add to detailed package info (for search)
                packageIndex.packageDetails[packageName] = {
                    package: packageName,
                    title: packageInfo.title || '',
                    description: packageInfo.description || '',
                    packageType: packageInfo.packageType || 'software',
                    biocViews: packageInfo.biocViews || '',
                    maintainer: packageInfo.maintainer || '',
                    // Create searchable text for keyword search
                    searchText: [
                        packageName,
                        packageInfo.title || '',
                        packageInfo.description || '',
                        packageInfo.biocViews || ''
                    ].join(' ').toLowerCase()
                };
            });

            // Sort packages alphabetically
            packageIndex.packages.sort();
            packageIndex.totalPackages = packageIndex.packages.length;

            // Save the index
            fs.writeFileSync(this.outputFile, JSON.stringify(packageIndex, null, 2));
            
            console.log(`✅ Created Bioconductor package index with ${packageIndex.totalPackages} packages`);
            console.log(`💾 Index saved to: ${this.outputFile}`);
            
            // Show some statistics
            const packageTypes = {};
            Object.values(packageIndex.packageDetails).forEach(pkg => {
                packageTypes[pkg.packageType] = (packageTypes[pkg.packageType] || 0) + 1;
            });
            
            console.log('📊 Package types:', packageTypes);
            console.log('🔍 Sample packages:', packageIndex.packages.slice(0, 10).join(', '));
            
            return {
                totalPackages: packageIndex.totalPackages,
                outputFile: this.outputFile
            };
            
        } catch (error) {
            console.error('❌ Error creating package index:', error);
            throw error;
        }
    }
}

// Run the indexer
if (require.main === module) {
    try {
        const indexer = new BioconductorPackageIndexer();
        const result = indexer.createPackageIndex();
        console.log('\n🎉 Bioconductor package index created successfully!');
        process.exit(0);
    } catch (error) {
        console.error('\n💥 Failed to create package index:', error);
        process.exit(1);
    }
}

module.exports = BioconductorPackageIndexer;