#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

async function downloadBioconductorPackages() {
    console.log('Downloading Bioconductor package lists and metadata...');
    
    try {
        const allPackages = {};
        const packageCategories = {
            software: [],
            annotation: [],
            experiment: [],
            workflow: []
        };
        
        // Fetch different types of Bioconductor packages using the JSON API
        const packageTypes = [
            { 
                type: 'software', 
                url: 'https://bioconductor.org/packages/json/3.21/bioc/packages.json',
                description: 'Software packages for analysis and methods'
            },
            { 
                type: 'annotation', 
                url: 'https://bioconductor.org/packages/json/3.21/data/annotation/packages.json',
                description: 'Annotation packages for organisms and platforms'
            },
            { 
                type: 'experiment', 
                url: 'https://bioconductor.org/packages/json/3.21/data/experiment/packages.json',
                description: 'Experiment packages with example datasets'
            },
            { 
                type: 'workflow', 
                url: 'https://bioconductor.org/packages/json/3.21/workflows/packages.json',
                description: 'Workflow packages with complete analysis pipelines'
            }
        ];
        
        for (const packageType of packageTypes) {
            console.log(`Fetching ${packageType.type} packages...`);
            
            try {
                const response = await axios.get(packageType.url, {
                    timeout: 30000
                });
                
                // Parse the JSON API format
                const packages = parseBioconductorJSON(response.data, packageType.type);
                
                // Add to all packages
                for (const [packageName, packageData] of Object.entries(packages)) {
                    allPackages[packageName] = packageData;
                    packageCategories[packageType.type].push(packageName);
                }
                
                console.log(`✅ Found ${Object.keys(packages).length} ${packageType.type} packages`);
                
            } catch (error) {
                console.warn(`⚠️  Failed to fetch ${packageType.type} packages:`, error.message);
            }
        }
        
        // Fetch download statistics
        console.log('Fetching Bioconductor download statistics...');
        let downloadStats = {};
        
        try {
            const statsResponse = await axios.get('https://bioconductor.org/packages/stats/bioc/bioc_pkg_stats.tab', {
                timeout: 30000
            });
            
            downloadStats = parseBioconductorStats(statsResponse.data);
            console.log(`✅ Loaded download statistics for ${Object.keys(downloadStats).length} packages`);
            
        } catch (error) {
            console.warn('⚠️  Failed to fetch download statistics:', error.message);
        }
        
        // Create data directory if it doesn't exist
        const dataDir = path.join(__dirname, '..', 'data');
        await fs.mkdir(dataDir, { recursive: true });
        
        // Save package lists
        const packageListPath = path.join(dataDir, 'bioconductor-packages.json');
        await fs.writeFile(packageListPath, JSON.stringify({
            lastUpdated: new Date().toISOString(),
            totalPackages: Object.keys(allPackages).length,
            packageTypes: Object.keys(packageCategories).reduce((acc, type) => {
                acc[type] = packageCategories[type].length;
                return acc;
            }, {}),
            packages: Object.keys(allPackages).sort(),
            packageMetadata: allPackages,
            packageCategories: packageCategories
        }, null, 2));
        
        // Save download statistics
        const statsPath = path.join(dataDir, 'bioconductor-stats.json');
        await fs.writeFile(statsPath, JSON.stringify({
            lastUpdated: new Date().toISOString(),
            downloadStats: downloadStats
        }, null, 2));
        
        console.log(`✅ Successfully saved ${Object.keys(allPackages).length} Bioconductor packages to ${packageListPath}`);
        console.log(`✅ Saved download statistics to ${statsPath}`);
        
        // Show summary
        console.log('\n📊 Bioconductor Package Summary:');
        for (const [type, count] of Object.entries(packageCategories)) {
            console.log(`  ${type}: ${count.length} packages`);
        }
        
        // Show some examples
        console.log('\n🔍 Sample packages:');
        console.log('  Software:', packageCategories.software.slice(0, 5).join(', '));
        console.log('  Annotation:', packageCategories.annotation.slice(0, 3).join(', '));
        console.log('  Experiment:', packageCategories.experiment.slice(0, 3).join(', '));
        
    } catch (error) {
        console.error('Error downloading Bioconductor packages:', error.message);
        console.log('Creating fallback list with popular Bioconductor packages...');
        
        // Fallback: Create a comprehensive curated list
        const fallbackPackages = {
            software: [
                'limma', 'edgeR', 'DESeq2', 'GenomicRanges', 'IRanges', 'S4Vectors',
                'Biobase', 'BiocGenerics', 'GenomicFeatures', 'rtracklayer',
                'SummarizedExperiment', 'GenomicAlignments', 'Rsamtools', 'ShortRead',
                'VariantAnnotation', 'BSgenome', 'GenomeInfoDb', 'AnnotationDbi',
                'GOstats', 'Category', 'GSEABase', 'GSVA', 'fgsea',
                'flowCore', 'flowStats', 'flowViz', 'flowWorkspace',
                'affy', 'affyPLM', 'simpleaffy', 'gcrma', 'oligo',
                'beadarray', 'lumi', 'methylumi', 'minfi', 'ChAMP',
                'xcms', 'CAMERA', 'MSnbase', 'mzR', 'MAIT'
            ],
            annotation: [
                'org.Hs.eg.db', 'org.Mm.eg.db', 'org.Rn.eg.db', 'org.Dm.eg.db',
                'GO.db', 'KEGG.db', 'reactome.db', 'PFAM.db',
                'TxDb.Hsapiens.UCSC.hg38.knownGene', 'TxDb.Hsapiens.UCSC.hg19.knownGene',
                'BSgenome.Hsapiens.UCSC.hg38', 'BSgenome.Hsapiens.UCSC.hg19',
                'hugene10sttranscriptcluster.db', 'hgu133plus2.db'
            ],
            experiment: [
                'airway', 'pasilla', 'parathyroidSE', 'RNAseqData.HNRNPC.bam.chr14',
                'TENxPBMCData', 'scRNAseq', 'FlowSorted.Blood.450k', 'minfiData'
            ],
            workflow: [
                'rnaseqGene', 'simpleSingleCell', 'methylationArrayAnalysis',
                'chipseqDB', 'maEndToEnd', 'TCGAWorkflow'
            ]
        };
        
        const allFallback = [];
        const packageCategories = {};
        
        for (const [type, packages] of Object.entries(fallbackPackages)) {
            allFallback.push(...packages);
            packageCategories[type] = packages;
        }
        
        try {
            const dataDir = path.join(__dirname, '..', 'data');
            await fs.mkdir(dataDir, { recursive: true });
            
            const outputPath = path.join(dataDir, 'bioconductor-packages.json');
            await fs.writeFile(outputPath, JSON.stringify({
                lastUpdated: new Date().toISOString(),
                totalPackages: allFallback.length,
                packages: allFallback.sort(),
                packageCategories: packageCategories,
                note: 'Fallback list - run script again to attempt full download'
            }, null, 2));
            
            console.log(`✅ Saved fallback list with ${allFallback.length} popular Bioconductor packages`);
        } catch (writeError) {
            console.error('Failed to save fallback list:', writeError.message);
            process.exit(1);
        }
    }
}

function parseBioconductorJSON(packagesData, packageType) {
    const packages = {};
    
    // If packagesData is a string, parse it as JSON
    const data = typeof packagesData === 'string' ? JSON.parse(packagesData) : packagesData;
    
    for (const [packageName, packageInfo] of Object.entries(data)) {
        packages[packageName] = {
            package: packageName,
            version: packageInfo.Version || '',
            title: packageInfo.Title || '',
            description: packageInfo.Description || '',
            author: packageInfo.Author || '',
            maintainer: packageInfo.Maintainer || '',
            license: packageInfo.License || '',
            depends: Array.isArray(packageInfo.Depends) ? packageInfo.Depends.join(', ') : (packageInfo.Depends || ''),
            imports: Array.isArray(packageInfo.Imports) ? packageInfo.Imports.join(', ') : (packageInfo.Imports || ''),
            suggests: Array.isArray(packageInfo.Suggests) ? packageInfo.Suggests.join(', ') : (packageInfo.Suggests || ''),
            biocViews: Array.isArray(packageInfo.biocViews) ? packageInfo.biocViews.join(', ') : (packageInfo.biocViews || ''),
            packageType: packageType,
            gitUrl: packageInfo.git_url || '',
            lastUpdated: new Date().toISOString()
        };
    }
    
    return packages;
}

function parseBioconductorPackages(packagesData, packageType) {
    const packages = {};
    const entries = packagesData.split('\n\n');
    
    for (const entry of entries) {
        if (entry.trim() === '') continue;
        
        const lines = entry.split('\n');
        const packageInfo = {};
        
        for (const line of lines) {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0) {
                const key = line.substring(0, colonIndex).trim();
                const value = line.substring(colonIndex + 1).trim();
                packageInfo[key] = value;
            }
        }
        
        if (packageInfo.Package) {
            packages[packageInfo.Package] = {
                package: packageInfo.Package,
                version: packageInfo.Version || '',
                title: packageInfo.Title || '',
                description: packageInfo.Description || '',
                author: packageInfo.Author || '',
                maintainer: packageInfo.Maintainer || '',
                license: packageInfo.License || '',
                depends: packageInfo.Depends || '',
                imports: packageInfo.Imports || '',
                suggests: packageInfo.Suggests || '',
                biocViews: packageInfo.biocViews || '',
                packageType: packageType,
                lastUpdated: new Date().toISOString()
            };
        }
    }
    
    return packages;
}

function parseBioconductorStats(statsData) {
    const stats = {};
    const lines = statsData.split('\n');
    
    for (const line of lines) {
        if (line.trim() === '') continue;
        
        const parts = line.split('\t');
        if (parts.length >= 4) {
            const packageName = parts[0];
            const year = parts[1];
            const month = parts[2];
            const distinctIPs = parseInt(parts[3]) || 0;
            const downloads = parts[4] ? parseInt(parts[4]) : distinctIPs;
            
            if (!stats[packageName]) {
                stats[packageName] = [];
            }
            
            stats[packageName].push({
                year: year,
                month: month,
                distinctIPs: distinctIPs,
                downloads: downloads
            });
        }
    }
    
    return stats;
}

// Run the script
downloadBioconductorPackages();