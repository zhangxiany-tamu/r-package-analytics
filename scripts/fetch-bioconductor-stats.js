const https = require('https');
const fs = require('fs');
const path = require('path');

class BioconductorStatsProcessor {
    constructor() {
        this.dataUrl = 'https://www.bioconductor.org/packages/stats/bioc/bioc_pkg_stats.tab';
        this.outputDir = path.join(__dirname, '../data');
        this.outputFile = path.join(this.outputDir, 'bioconductor-stats.json');
        this.rawDataFile = path.join(this.outputDir, 'bioc_pkg_stats.tab');
    }

    async fetchStatsData() {
        console.log('Fetching Bioconductor package statistics...');
        
        // Ensure output directory exists
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
            console.log(`Created directory: ${this.outputDir}`);
        }
        
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(this.rawDataFile);
            
            https.get(this.dataUrl, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                    return;
                }
                
                response.pipe(file);
                
                file.on('finish', () => {
                    file.close();
                    console.log('Raw data downloaded successfully');
                    resolve();
                });
                
                file.on('error', (err) => {
                    fs.unlink(this.rawDataFile, () => {}); // Delete partial file
                    reject(err);
                });
            }).on('error', (err) => {
                reject(err);
            });
        });
    }

    parseStatsData() {
        console.log('Parsing Bioconductor statistics data...');
        
        const rawData = fs.readFileSync(this.rawDataFile, 'utf8');
        const lines = rawData.trim().split('\n');
        
        // Skip header line
        const dataLines = lines.slice(1);
        
        const packageStats = {};
        let totalRecords = 0;
        
        dataLines.forEach(line => {
            const parts = line.split('\t');
            if (parts.length !== 5) return;
            
            const [packageName, year, month, distinctIPs, downloads] = parts;
            
            // Skip invalid data
            if (!packageName || !year || !month || !distinctIPs || !downloads) return;
            
            // Skip yearly totals (e.g., "2024-all")
            if (month === 'all') return;
            
            // Skip future data points (after current month)
            const currentDate = new Date();
            const currentYear = currentDate.getFullYear();
            const currentMonth = currentDate.getMonth() + 1; // 0-based to 1-based
            
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const recordYear = parseInt(year);
            const recordMonthIndex = monthNames.indexOf(month);
            
            // Skip if month name is invalid
            if (recordMonthIndex === -1) return;
            
            const recordMonthNum = recordMonthIndex + 1;
            
            // Skip future data points
            if (recordYear > currentYear || (recordYear === currentYear && recordMonthNum > currentMonth)) {
                return;
            }
            
            if (!packageStats[packageName]) {
                packageStats[packageName] = {
                    package: packageName,
                    downloads: [],
                    total: {
                        downloads: 0,
                        distinctIPs: 0
                    }
                };
            }
            
            const downloadsNum = parseInt(downloads) || 0;
            const distinctIPsNum = parseInt(distinctIPs) || 0;
            
            packageStats[packageName].downloads.push({
                year: parseInt(year),
                month: month,
                period: `${year}-${month}`,
                downloads: downloadsNum,
                distinctIPs: distinctIPsNum
            });
            
            packageStats[packageName].total.downloads += downloadsNum;
            packageStats[packageName].total.distinctIPs += distinctIPsNum;
            
            totalRecords++;
        });
        
        // Sort downloads by year and month for each package
        Object.keys(packageStats).forEach(packageName => {
            packageStats[packageName].downloads.sort((a, b) => {
                if (a.year !== b.year) return a.year - b.year;
                
                const monthOrder = {
                    'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
                    'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12
                };
                
                return monthOrder[a.month] - monthOrder[b.month];
            });
        });
        
        console.log(`Parsed ${totalRecords} records for ${Object.keys(packageStats).length} packages`);
        return packageStats;
    }

    generateSummaryStats(packageStats) {
        console.log('Generating summary statistics...');
        
        const packages = Object.keys(packageStats);
        const totalPackages = packages.length;
        
        // Calculate top packages by total downloads
        const topPackages = packages
            .map(pkg => ({
                package: pkg,
                totalDownloads: packageStats[pkg].total.downloads,
                totalDistinctIPs: packageStats[pkg].total.distinctIPs
            }))
            .sort((a, b) => b.totalDownloads - a.totalDownloads)
            .slice(0, 100);
        
        // Calculate recent activity (last 12 months)
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        
        const recentPackages = packages
            .map(pkg => {
                const recentDownloads = packageStats[pkg].downloads
                    .filter(d => {
                        const year = d.year;
                        const monthNum = {
                            'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
                            'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12
                        }[d.month];
                        
                        // Include last 12 months
                        if (year === currentYear && monthNum < currentMonth) return true;
                        if (year === currentYear - 1 && monthNum >= currentMonth) return true;
                        
                        return false;
                    })
                    .reduce((sum, d) => sum + d.downloads, 0);
                
                return {
                    package: pkg,
                    recentDownloads
                };
            })
            .sort((a, b) => b.recentDownloads - a.recentDownloads)
            .slice(0, 50);
        
        return {
            totalPackages,
            topPackages,
            recentPackages,
            lastUpdated: new Date().toISOString()
        };
    }

    async saveProcessedData(packageStats) {
        console.log('Saving processed data...');
        
        // Ensure output directory exists
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
        
        // Generate summary stats
        const summaryStats = this.generateSummaryStats(packageStats);
        
        // Save main data file
        const outputData = {
            packages: packageStats,
            summary: summaryStats,
            lastUpdated: new Date().toISOString()
        };
        
        fs.writeFileSync(this.outputFile, JSON.stringify(outputData, null, 2));
        console.log(`Saved processed data to ${this.outputFile}`);
        
        // Save a lightweight index for quick searches
        const packageIndex = Object.keys(packageStats).map(pkg => ({
            package: pkg,
            totalDownloads: packageStats[pkg].total.downloads,
            totalDistinctIPs: packageStats[pkg].total.distinctIPs,
            firstYear: packageStats[pkg].downloads[0]?.year,
            lastYear: packageStats[pkg].downloads[packageStats[pkg].downloads.length - 1]?.year
        }));
        
        const indexFile = path.join(this.outputDir, 'bioconductor-index.json');
        fs.writeFileSync(indexFile, JSON.stringify(packageIndex, null, 2));
        console.log(`Saved package index to ${indexFile}`);
        
        return {
            totalPackages: Object.keys(packageStats).length,
            outputFile: this.outputFile,
            indexFile
        };
    }

    async processAllData() {
        try {
            console.log('Starting Bioconductor statistics processing...');
            
            // Fetch raw data
            await this.fetchStatsData();
            
            // Parse and structure data
            const packageStats = this.parseStatsData();
            
            // Save processed data
            const result = await this.saveProcessedData(packageStats);
            
            console.log('✅ Bioconductor statistics processing completed successfully!');
            console.log(`📊 Processed ${result.totalPackages} packages`);
            console.log(`💾 Data saved to: ${result.outputFile}`);
            console.log(`🔍 Index saved to: ${result.indexFile}`);
            
            return result;
            
        } catch (error) {
            console.error('❌ Error processing Bioconductor statistics:', error);
            throw error;
        }
    }
}

// Run the processor
if (require.main === module) {
    const processor = new BioconductorStatsProcessor();
    processor.processAllData()
        .then(result => {
            console.log('\n🎉 All done! You can now use the Bioconductor download analytics.');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 Failed to process Bioconductor statistics:', error);
            process.exit(1);
        });
}

module.exports = BioconductorStatsProcessor;