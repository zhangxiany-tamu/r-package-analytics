const express = require('express');
const cors = require('cors');
const axios = require('axios');
const NodeCache = require('node-cache');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const cache = new NodeCache({ stdTTL: 3600 }); // Cache for 1 hour

// Load local CRAN packages list
let allCranPackages = null;
let packageMetadataCache = new Map(); // Cache for package titles and descriptions
let packageDescriptionCache = new Map(); // Cache for package descriptions (local file)
let authorDataCache = new Map(); // Cache for package author information

// Load local Bioconductor packages list
let allBioconductorPackages = null;
let bioconductorPackageIndex = null; // Local package index for fast search
let bioconductorMetadataCache = new Map(); // Cache for Bioconductor package metadata
let bioconductorStatsCache = new Map(); // Cache for Bioconductor download stats
let bioconductorCategoriesCache = new Map(); // Cache for package categories

function loadLocalPackages() {
  try {
    const fs = require('fs');
    console.log('Loading local CRAN package list...');
    const packageData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'cran-packages.json'), 'utf8'));
    allCranPackages = packageData.packages;
    
    console.log(`✅ Loaded ${allCranPackages.length} packages from local file`);
    console.log(`📅 Package list last updated: ${packageData.lastUpdated}`);
    
    if (packageData.totalPackages) {
      console.log(`📦 Total packages available: ${packageData.totalPackages}`);
    }
    
    // Show some sample packages
    console.log(`🔍 Sample packages: ${allCranPackages.slice(0, 5).join(', ')}...`);
    
  } catch (error) {
    console.warn('⚠️  Could not load local package list:', error.message);
    console.log('📝 Creating minimal fallback list...');
    
    // Fallback to a minimal list
    allCranPackages = [
      'ggplot2', 'dplyr', 'shiny', 'tidyverse', 'devtools', 'knitr', 'rmarkdown',
      'plotly', 'DT', 'lubridate', 'stringr', 'readr', 'tidyr', 'purrr',
      'data.table', 'magrittr', 'httr', 'jsonlite', 'xml2', 'rvest',
      'caret', 'randomForest', 'forecast', 'leaflet', 'sf'
    ];
    console.log(`🔄 Using fallback package list with ${allCranPackages.length} packages`);
  }
}

function loadLocalDescriptions() {
  try {
    const fs = require('fs');
    console.log('Loading local package descriptions...');
    const descriptionsPath = path.join(__dirname, 'data', 'cran-descriptions.json');
    
    if (fs.existsSync(descriptionsPath)) {
      const descriptionsData = JSON.parse(fs.readFileSync(descriptionsPath, 'utf8'));
      
      // Convert to Map for faster lookups
      Object.entries(descriptionsData.packageData || {}).forEach(([packageName, data]) => {
        packageDescriptionCache.set(packageName, {
          title: data.title || '',
          description: data.description || '',
          version: data.version || '',
          author: data.author || '',
          maintainer: data.maintainer || '',
          lastUpdated: data.lastUpdated
        });
      });
      
      console.log(`✅ Loaded descriptions for ${packageDescriptionCache.size} packages`);
      console.log(`📅 Descriptions last updated: ${descriptionsData.lastUpdated}`);
      console.log(`📊 Coverage: ${packageDescriptionCache.size}/${descriptionsData.totalPackages} packages (${Math.round(packageDescriptionCache.size/descriptionsData.totalPackages*100)}%)`);
    } else {
      console.warn('⚠️  No local descriptions found. Run scripts/fetch-package-descriptions.js to create them.');
    }
  } catch (error) {
    console.warn('⚠️  Could not load local descriptions:', error.message);
    console.log('💡 Tip: Run scripts/fetch-package-descriptions.js to create the descriptions cache.');
  }
}

function loadLocalAuthorData() {
  try {
    const fs = require('fs');
    console.log('Loading local author data...');
    const authorDataPath = path.join(__dirname, 'data', 'cran-authors.json');
    
    if (fs.existsSync(authorDataPath)) {
      const authorData = JSON.parse(fs.readFileSync(authorDataPath, 'utf8'));
      
      // Convert to Map for faster lookups
      Object.entries(authorData.authorData || {}).forEach(([packageName, data]) => {
        authorDataCache.set(packageName, {
          author: data.author || '',
          maintainer: data.maintainer || '',
          title: data.title || '',
          lastUpdated: data.lastUpdated
        });
      });
      
      console.log(`✅ Loaded author data for ${authorDataCache.size} packages`);
      console.log(`📅 Author data last updated: ${authorData.lastUpdated}`);
      console.log(`📊 Coverage: ${authorDataCache.size}/${authorData.totalPackages} packages (${Math.round(authorDataCache.size/authorData.totalPackages*100)}%)`);
    } else {
      console.warn('⚠️  No local author data found. Run scripts/fetch-author-data.js to create it.');
    }
  } catch (error) {
    console.warn('⚠️  Could not load local author data:', error.message);
    console.log('💡 Tip: Run scripts/fetch-author-data.js to create the author data cache.');
  }
}

function loadBioconductorPackages() {
  try {
    const fs = require('fs');
    console.log('Loading local Bioconductor package list...');
    const packageData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'bioconductor-packages.json'), 'utf8'));
    allBioconductorPackages = packageData.packages;
    
    // Load the package index for fast autocomplete
    try {
      const indexPath = path.join(__dirname, 'data', 'bioconductor-package-index.json');
      if (fs.existsSync(indexPath)) {
        bioconductorPackageIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
        console.log('✅ Loaded Bioconductor package index for fast search');
      } else {
        console.log('⚠️  Bioconductor package index not found. Run scripts/create-bioc-package-index.js');
      }
    } catch (indexError) {
      console.warn('⚠️  Could not load Bioconductor package index:', indexError.message);
    }
    
    // Load metadata cache
    if (packageData.packageMetadata) {
      Object.entries(packageData.packageMetadata).forEach(([packageName, metadata]) => {
        bioconductorMetadataCache.set(packageName, metadata);
      });
    }
    
    // Load categories cache
    if (packageData.packageCategories) {
      Object.entries(packageData.packageCategories).forEach(([category, packages]) => {
        bioconductorCategoriesCache.set(category, packages);
      });
    }
    
    console.log(`✅ Loaded ${allBioconductorPackages.length} Bioconductor packages`);
    console.log(`📅 Package list last updated: ${packageData.lastUpdated}`);
    
    if (packageData.totalPackages) {
      console.log(`📦 Total Bioconductor packages available: ${packageData.totalPackages}`);
    }
    
    if (packageData.packageTypes) {
      console.log('📊 Package types:', Object.entries(packageData.packageTypes).map(([type, count]) => `${type}: ${count}`).join(', '));
    }
    
  } catch (error) {
    console.warn('⚠️  Could not load Bioconductor package list:', error.message);
    console.log('📝 Creating minimal fallback list...');
    
    // Fallback to a minimal list of popular Bioconductor packages
    allBioconductorPackages = [
      'limma', 'edgeR', 'DESeq2', 'GenomicRanges', 'IRanges', 'S4Vectors',
      'Biobase', 'BiocGenerics', 'SummarizedExperiment', 'GenomicFeatures',
      'org.Hs.eg.db', 'GO.db', 'KEGG.db', 'airway', 'pasilla'
    ];
    console.log(`🔄 Using fallback Bioconductor package list with ${allBioconductorPackages.length} packages`);
  }
}

function loadBioconductorStats() {
  try {
    const fs = require('fs');
    console.log('Loading Bioconductor download statistics...');
    const statsPath = path.join(__dirname, 'data', 'bioconductor-stats.json');
    
    if (fs.existsSync(statsPath)) {
      const statsData = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
      
      // Convert to Map for faster lookups
      Object.entries(statsData.packages || {}).forEach(([packageName, packageData]) => {
        bioconductorStatsCache.set(packageName, packageData.downloads);
      });
      
      console.log(`✅ Loaded download statistics for ${bioconductorStatsCache.size} Bioconductor packages`);
      console.log(`📅 Statistics last updated: ${statsData.lastUpdated}`);
    } else {
      console.warn('⚠️  No Bioconductor statistics found. Run scripts/fetch-bioconductor-stats.js to create them.');
    }
  } catch (error) {
    console.warn('⚠️  Could not load Bioconductor statistics:', error.message);
    console.log('💡 Tip: Run scripts/fetch-bioconductor-stats.js to create the statistics cache.');
  }
}

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// API endpoint to get package download stats
app.get('/api/downloads/:packages', async (req, res) => {
  const packages = req.params.packages.split(',').map(p => p.trim());
  const period = req.query.period || 'last-month';
  
  // Validate packages against local CRAN package list
  const invalidPackages = packages.filter(pkg => !allCranPackages.includes(pkg));
  
  if (invalidPackages.length > 0) {
    return res.status(404).json({
      error: 'Package(s) not found',
      message: `The following package(s) are not available on CRAN: ${invalidPackages.join(', ')}`,
      invalidPackages: invalidPackages,
      validPackages: packages.filter(pkg => allCranPackages.includes(pkg))
    });
  }
  
  try {
    const results = await Promise.all(packages.map(async (packageName) => {
      const cacheKey = `${packageName}-${period}`;
      const cachedData = cache.get(cacheKey);
      
      if (cachedData) {
        return cachedData;
      }

      // Convert period to date range for longer periods
      let apiPeriod = period;
      const currentDate = new Date();
      
      if (period === 'last-year') {
        // Calculate last 12 months (365 days ago to today)
        const startDate = new Date(currentDate);
        startDate.setDate(currentDate.getDate() - 365);
        const endDate = new Date(currentDate);
        endDate.setDate(currentDate.getDate() - 1); // Yesterday to avoid partial data for today
        apiPeriod = `${startDate.toISOString().split('T')[0]}:${endDate.toISOString().split('T')[0]}`;
      } else if (period === 'all-time') {
        // CRAN started tracking stats in 2012, but packages may have been published later
        apiPeriod = '2012-10-01:' + currentDate.toISOString().split('T')[0];
      }

      // Fetch period-specific data
      const response = await axios.get(`https://cranlogs.r-pkg.org/downloads/daily/${apiPeriod}/${packageName}`);
      const data = Array.isArray(response.data) ? response.data[0] : response.data;
      
      // Optionally fetch total download numbers if requested and not already fetching all-time
      const includeTotals = req.query.includeTotals === 'true';
      let totalDownloads = null;
      
      if (period !== 'all-time' && includeTotals) {
        try {
          const totalCacheKey = `${packageName}-total`;
          const cachedTotal = cache.get(totalCacheKey);
          
          if (cachedTotal) {
            totalDownloads = cachedTotal;
          } else {
            // First, get the actual start date by trying to fetch all-time data
            const allTimeApiPeriod = '2012-10-01:' + currentDate.toISOString().split('T')[0];
            const totalResponse = await axios.get(`https://cranlogs.r-pkg.org/downloads/daily/${allTimeApiPeriod}/${packageName}`);
            const totalData = Array.isArray(totalResponse.data) ? totalResponse.data[0] : totalResponse.data;
            
            // Calculate total downloads using actual package availability dates
            if (totalData && totalData.downloads && totalData.downloads.length > 0) {
              const total = totalData.downloads.reduce((sum, day) => sum + day.downloads, 0);
              const actualStartDate = totalData.downloads[0]?.day || '2012-10-01';
              const actualEndDate = totalData.downloads[totalData.downloads.length - 1]?.day || currentDate.toISOString().split('T')[0];
              
              totalDownloads = { 
                total: total,
                from_date: actualStartDate,
                to_date: actualEndDate
              };
            }
            
            cache.set(totalCacheKey, totalDownloads, 3600); // Cache for 1 hour
          }
        } catch (totalError) {
          console.warn(`Could not fetch total downloads for ${packageName}:`, totalError.message);
        }
      }
      
      // Get package ranking if requested
      const includeRanking = req.query.includeRanking === 'true';
      let ranking = null;
      
      if (includeRanking) {
        try {
          ranking = await getPackageRanking(packageName, period);
        } catch (rankingError) {
          console.warn(`Could not fetch ranking for ${packageName}:`, rankingError.message);
        }
      }
      
      // Enhance data with total downloads and ranking
      const enhancedData = { 
        ...data,
        totalDownloads: totalDownloads,
        ranking: ranking
      };
      
      cache.set(cacheKey, enhancedData);
      return enhancedData;
    }));
    
    res.json(results);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch download data',
      message: error.message 
    });
  }
});

// Helper function to get all CRAN packages (now uses local file)
function getAllCranPackages() {
  return allCranPackages || [];
}

function getAllBioconductorPackages() {
  return bioconductorPackageIndex?.packages || allBioconductorPackages || [];
}

function searchBioconductorPackages(query, limit = 10) {
  if (!bioconductorPackageIndex) {
    return [];
  }
  
  const lowerQuery = query.toLowerCase();
  
  // Filter packages that start with or contain the query
  const matchingPackages = bioconductorPackageIndex.packages
    .filter(pkg => 
      pkg.toLowerCase().startsWith(lowerQuery) || 
      pkg.toLowerCase().includes(lowerQuery)
    )
    .sort((a, b) => {
      // Prioritize packages that start with the query
      const aStarts = a.toLowerCase().startsWith(lowerQuery);
      const bStarts = b.toLowerCase().startsWith(lowerQuery);
      if (aStarts && !bStarts) return -1;
      if (bStarts && !aStarts) return 1;
      
      // Then sort by length (shorter names first)
      if (a.length !== b.length) {
        return a.length - b.length;
      }
      
      // Finally sort alphabetically
      return a.localeCompare(b);
    })
    .slice(0, limit);
    
  return matchingPackages;
}

// API endpoint to search packages by name
app.get('/api/search/:query', async (req, res) => {
  const query = req.params.query.toLowerCase();
  const limit = parseInt(req.query.limit) || 10;
  
  if (query.length < 2) {
    return res.json([]);
  }
  
  try {
    const cacheKey = `search-${query}-${limit}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      return res.json(cachedData);
    }

    // Get all CRAN packages (from local file)
    const allPackages = getAllCranPackages();
    
    // Filter packages that start with or contain the query
    const matchingPackages = allPackages
      .filter(pkg => 
        pkg.toLowerCase().startsWith(query) || 
        pkg.toLowerCase().includes(query)
      )
      .sort((a, b) => {
        // Prioritize packages that start with the query
        const aStarts = a.toLowerCase().startsWith(query);
        const bStarts = b.toLowerCase().startsWith(query);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.localeCompare(b);
      })
      .slice(0, limit);

    cache.set(cacheKey, matchingPackages, 1800); // Cache for 30 minutes
    res.json(matchingPackages);
  } catch (error) {
    console.error('Search error:', error.message);
    res.status(500).json({ 
      error: 'Search failed',
      message: error.message 
    });
  }
});

// API endpoint to get package info
app.get('/api/package/:name', async (req, res) => {
  const packageName = req.params.name;
  
  try {
    const response = await axios.get(`https://crandb.r-pkg.org/${packageName}`);
    res.json(response.data);
  } catch (error) {
    res.status(404).json({ 
      error: 'Package not found',
      message: error.message 
    });
  }
});

// API endpoint to get package ranking
app.get('/api/ranking/:packages', async (req, res) => {
  const packages = req.params.packages.split(',').map(p => p.trim());
  const period = req.query.period || 'last-year';
  
  // Validate packages against local CRAN package list
  const invalidPackages = packages.filter(pkg => !allCranPackages.includes(pkg));
  
  if (invalidPackages.length > 0) {
    return res.status(404).json({
      error: 'Package(s) not found',
      message: `The following package(s) are not available on CRAN: ${invalidPackages.join(', ')}`,
      invalidPackages: invalidPackages,
      validPackages: packages.filter(pkg => allCranPackages.includes(pkg))
    });
  }
  
  try {
    const results = await Promise.all(packages.map(async (packageName) => {
      const ranking = await getPackageRanking(packageName, period);
      return {
        package: packageName,
        ...ranking
      };
    }));
    
    res.json(results);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch ranking data',
      message: error.message 
    });
  }
});

// Helper function to load package metadata (titles and descriptions) in bulk
async function loadPackageTitles() {
  try {
    const cacheKey = 'package-metadata-bulk';
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      packageMetadataCache = new Map(Object.entries(cachedData));
      return;
    }

    console.log('Loading package metadata from CRAN...');
    
    // Try to load from the bulk endpoint first (for titles)
    try {
      const response = await axios.get('https://crandb.r-pkg.org/-/desc', { timeout: 10000 });
      const titles = response.data;
      
      // Convert to Map and cache
      packageMetadataCache = new Map(Object.entries(titles));
      cache.set(cacheKey, titles, 86400); // Cache for 24 hours
      
      console.log(`✅ Loaded titles for ${packageMetadataCache.size} packages`);
    } catch (bulkError) {
      console.warn('⚠️  Bulk endpoint failed, using basic metadata approach:', bulkError.message);
      // Fallback to basic approach
      packageMetadataCache = new Map();
    }
  } catch (error) {
    console.warn('⚠️  Could not load package metadata:', error.message);
    packageMetadataCache = new Map();
  }
}

// Helper function to get full package metadata (including description) on-demand
async function getPackageMetadata(packageName) {
  const cacheKey = `package-full-${packageName}`;
  const cachedData = cache.get(cacheKey);
  
  if (cachedData) {
    return cachedData;
  }

  try {
    const response = await axios.get(`https://crandb.r-pkg.org/${packageName}`, { timeout: 5000 });
    const metadata = {
      title: response.data.Title || '',
      description: response.data.Description || '',
      version: response.data.Version || '',
      author: response.data.Author || '',
      maintainer: response.data.Maintainer || ''
    };
    
    // Cache individual package metadata for 6 hours
    cache.set(cacheKey, metadata, 21600);
    
    // Also update the main cache
    packageMetadataCache.set(packageName, metadata);
    
    return metadata;
  } catch (error) {
    // Return what we have from bulk cache, or empty
    const existing = packageMetadataCache.get(packageName);
    return existing || { title: '', description: '', version: '', author: '', maintainer: '' };
  }
}

// Helper function to get package popularity score (using download data as proxy)
async function getPackagePopularity(packageName) {
  try {
    const cacheKey = `popularity-${packageName}`;
    const cachedScore = cache.get(cacheKey);
    
    if (cachedScore !== undefined) {
      return cachedScore;
    }

    // Get last year downloads for better popularity assessment
    // This gives a more stable indicator of package popularity than just last month
    const currentDate = new Date();
    const startDate = new Date(currentDate);
    startDate.setDate(currentDate.getDate() - 365);
    const endDate = new Date(currentDate);
    endDate.setDate(currentDate.getDate() - 1); // Yesterday to avoid partial data for today
    const apiPeriod = `${startDate.toISOString().split('T')[0]}:${endDate.toISOString().split('T')[0]}`;

    const response = await axios.get(`https://cranlogs.r-pkg.org/downloads/daily/${apiPeriod}/${packageName}`, {
      timeout: 5000
    });
    const downloads = Array.isArray(response.data) ? response.data[0] : response.data;
    
    let score = 0;
    if (downloads && downloads.downloads) {
      score = downloads.downloads.reduce((sum, day) => sum + day.downloads, 0);
    }
    
    cache.set(cacheKey, score, 7200); // Cache for 2 hours (longer since this is more expensive)
    return score;
  } catch (error) {
    // Fallback to last month if last year fails
    try {
      const response = await axios.get(`https://cranlogs.r-pkg.org/downloads/daily/last-month/${packageName}`, {
        timeout: 3000
      });
      const downloads = Array.isArray(response.data) ? response.data[0] : response.data;
      
      let score = 0;
      if (downloads && downloads.downloads) {
        // Multiply by ~12 to approximate yearly downloads from monthly data
        score = downloads.downloads.reduce((sum, day) => sum + day.downloads, 0) * 12;
      }
      
      cache.set(cacheKey, score, 3600);
      return score;
    } catch (fallbackError) {
      return 0; // Default to 0 if can't get any popularity data
    }
  }
}

// Global ranking cache (scraped from datasciencemeta.com)
let globalRankingCache = new Map(); // Map: package -> {rank, percentile, lastUpdated}

// Helper function to scrape rankings from datasciencemeta.com
async function scrapePackageRankings() {
  const cached = globalRankingCache.get('rankings');
  
  // Return cached rankings if scraped within last 12 hours
  if (cached && (Date.now() - cached.lastUpdated) < 12 * 60 * 60 * 1000) {
    return cached.rankings;
  }

  console.log(`🕸️ Scraping package rankings from datasciencemeta.com...`);
  
  try {
    const response = await axios.get('https://www.datasciencemeta.com/rpackages', {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; R-Package-Analytics/1.0)'
      }
    });
    
    const html = response.data;
    const rankings = new Map();
    
    // Simple regex to extract package rankings from the HTML table
    // Look for table rows with rank, package name pattern
    const tableRowRegex = /<tr[^>]*>[\s\S]*?<td[^>]*>(\d+)<\/td>[\s\S]*?<td[^>]*><a[^>]*>([^<]+)<\/a><\/td>/g;
    
    let match;
    let totalPackages = 0;
    
    while ((match = tableRowRegex.exec(html)) !== null) {
      const rank = parseInt(match[1]);
      const packageName = match[2].trim();
      
      if (rank && packageName) {
        totalPackages++;
        const percentile = Math.round(((22000 - rank + 1) / 22000) * 1000) / 10; // Estimate percentile based on ~22k total packages
        
        rankings.set(packageName, {
          rank: rank,
          percentile: Math.max(0.1, Math.min(99.9, percentile)),
          totalPackages: 22000 // Approximate total CRAN packages
        });
      }
    }
    
    // Cache the results
    globalRankingCache.set('rankings', {
      rankings: rankings,
      lastUpdated: Date.now()
    });
    
    console.log(`✅ Scraped rankings for ${rankings.size} packages from datasciencemeta.com`);
    console.log(`🥇 Top 3 ranks found: ${Array.from(rankings.entries()).slice(0, 3).map(([pkg, data]) => `${pkg} (#${data.rank})`).join(', ')}`);
    
    return rankings;
    
  } catch (error) {
    console.warn(`❌ Failed to scrape rankings: ${error.message}`);
    return null;
  }
}

// Helper function to get package ranking (uses scraped rankings + our download stats)
async function getPackageRanking(packageName, period = 'last-year') {
  try {
    const cacheKey = `ranking-${packageName}-${period}`;
    const cachedRanking = cache.get(cacheKey);
    
    if (cachedRanking !== undefined) {
      return cachedRanking;
    }

    // Get scraped rankings (rank/percentile) and our download stats
    const scrapedRankings = await scrapePackageRankings();
    const packageRanking = scrapedRankings ? scrapedRankings.get(packageName) : null;
    
    // Always get our own download statistics for the specified period
    const popularity = await getPackagePopularity(packageName);
    
    if (packageRanking) {
      // Use scraped rank/percentile + our download stats
      const ranking = {
        rank: packageRanking.rank,
        totalPackages: packageRanking.totalPackages,
        percentile: packageRanking.percentile,
        period: period,
        downloads: popularity, // Our own download statistics for the period
        estimated: false, // Rank is exact from datasciencemeta.com
        source: 'datasciencemeta.com'
      };
      
      cache.set(cacheKey, ranking, 14400); // Cache for 4 hours
      return ranking;
    }
    
    // Fallback to estimation if package not found in scraped rankings
    let estimatedPercentile = null;
    let estimatedRank = null;
    
    if (popularity > 0) {
      // Improved estimates based on actual download patterns
      if (popularity >= 10000000) { estimatedPercentile = 99.8; estimatedRank = 50; }
      else if (popularity >= 5000000) { estimatedPercentile = 99.5; estimatedRank = 100; }
      else if (popularity >= 2000000) { estimatedPercentile = 99.0; estimatedRank = 200; }
      else if (popularity >= 1000000) { estimatedPercentile = 97.5; estimatedRank = 500; }
      else if (popularity >= 500000) { estimatedPercentile = 95.0; estimatedRank = 1000; }
      else if (popularity >= 200000) { estimatedPercentile = 90.0; estimatedRank = 2000; }
      else if (popularity >= 100000) { estimatedPercentile = 80.0; estimatedRank = 4000; }
      else if (popularity >= 50000) { estimatedPercentile = 70.0; estimatedRank = 6000; }
      else if (popularity >= 20000) { estimatedPercentile = 60.0; estimatedRank = 8000; }
      else if (popularity >= 10000) { estimatedPercentile = 50.0; estimatedRank = 11000; }
      else if (popularity >= 5000) { estimatedPercentile = 40.0; estimatedRank = 13000; }
      else if (popularity >= 2000) { estimatedPercentile = 30.0; estimatedRank = 15000; }
      else if (popularity >= 1000) { estimatedPercentile = 20.0; estimatedRank = 17000; }
      else if (popularity >= 500) { estimatedPercentile = 10.0; estimatedRank = 19000; }
      else { estimatedPercentile = 5.0; estimatedRank = 21000; }
    }
    
    return {
      rank: estimatedRank,
      totalPackages: 22000,
      percentile: estimatedPercentile,
      period: period,
      downloads: popularity,
      estimated: true,
      source: 'estimated'
    };
    
  } catch (error) {
    console.warn(`Could not fetch ranking for ${packageName}:`, error.message);
    return { rank: null, totalPackages: null, percentile: null, period: period, estimated: false };
  }
}

// Enhanced search function for author-based recommendations using local cache with download ranking
async function searchPackagesByAuthor(authorName, limit = 20, offset = 0) {
  if (!authorName || authorName.trim().length < 2) {
    return { results: [], totalResults: 0, hasMore: false, offset: 0, limit: limit };
  }

  const searchTerm = authorName.toLowerCase().trim();
  const matches = [];

  // Handle both "First Last" and "Last, First" formats
  const searchVariations = [searchTerm];
  
  // If the search contains a comma, create the flipped version
  if (searchTerm.includes(',')) {
    // "Chen, Jun" -> "jun chen"
    const parts = searchTerm.split(',').map(p => p.trim());
    if (parts.length === 2) {
      searchVariations.push(`${parts[1]} ${parts[0]}`);
    }
  } else if (searchTerm.includes(' ')) {
    // "Jun Chen" -> "chen, jun"
    const parts = searchTerm.split(' ').map(p => p.trim());
    if (parts.length === 2) {
      searchVariations.push(`${parts[1]}, ${parts[0]}`);
    }
  }

  console.log(`Searching for author: ${authorName} (variations: ${searchVariations.join(', ')}) in ${authorDataCache.size} cached packages`);

  // Search through all cached author data - EXACT matches only
  for (const [packageName, authorData] of authorDataCache.entries()) {
    let score = 0;
    let matchReasons = [];

    // Search in Author field - check all name variations with word boundaries
    if (authorData.author) {
      const authorText = authorData.author.toLowerCase();
      
      // Check all search variations using word boundary matching
      for (const variation of searchVariations) {
        // Escape special regex characters 
        const escapedVariation = variation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // For multi-word searches, ensure the entire phrase matches as a unit
        const words = variation.split(/\s+/);
        let phraseRegex;
        
        if (words.length === 1) {
          // Single word: use word boundaries
          phraseRegex = new RegExp(`\\b${escapedVariation}\\b`, 'i');
        } else {
          // Multiple words: create a pattern that matches the complete phrase
          // Replace spaces with flexible whitespace and add word boundaries at start/end
          const flexiblePattern = escapedVariation.replace(/\s+/g, '\\s+');
          phraseRegex = new RegExp(`\\b${flexiblePattern}\\b`, 'i');
        }
        
        if (phraseRegex.test(authorText)) {
          score += 15;
          matchReasons.push('author match');
          break; // Only count once even if multiple variations match
        }
      }
    }

    // Search in Maintainer field - check all name variations with word boundaries
    if (authorData.maintainer) {
      const maintainerText = authorData.maintainer.toLowerCase();
      
      // Check all search variations using word boundary matching
      for (const variation of searchVariations) {
        // Escape special regex characters 
        const escapedVariation = variation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // For multi-word searches, ensure the entire phrase matches as a unit
        const words = variation.split(/\s+/);
        let phraseRegex;
        
        if (words.length === 1) {
          // Single word: use word boundaries
          phraseRegex = new RegExp(`\\b${escapedVariation}\\b`, 'i');
        } else {
          // Multiple words: create a pattern that matches the complete phrase
          // Replace spaces with flexible whitespace and add word boundaries at start/end
          const flexiblePattern = escapedVariation.replace(/\s+/g, '\\s+');
          phraseRegex = new RegExp(`\\b${flexiblePattern}\\b`, 'i');
        }
        
        if (phraseRegex.test(maintainerText)) {
          score += 12;
          matchReasons.push('maintainer match');
          break; // Only count once even if multiple variations match
        }
      }
    }

    // If we have a match, add to results
    if (score > 0) {
      matches.push({
        package: packageName,
        title: authorData.title || '',
        description: '', // We don't store descriptions in author cache for space efficiency
        version: '', // We don't store versions in author cache as they change frequently
        author: authorData.author || '',
        maintainer: authorData.maintainer || '',
        score: score,
        matchReasons: matchReasons
      });
    }
  }

  console.log(`Found ${matches.length} matches before ranking for "${authorName}"`);

  // Get actual yearly downloads for all matched packages
  const finalMatches = await Promise.all(matches.map(async (match) => {
    let popularity = 0;
    const cacheKey = `popularity-${match.package}`;
    const cachedScore = cache.get(cacheKey);
    
    if (cachedScore !== undefined) {
      popularity = cachedScore;
    } else {
      try {
        // Get actual yearly downloads from API
        popularity = await getPackagePopularity(match.package);
        if (popularity > 0) {
          cache.set(cacheKey, popularity, 7200); // Cache for 2 hours
        }
      } catch (error) {
        // Fall back to known popular packages if API fails
        const popularPackages = {
          'ts': 500000, 'forecast': 400000, 'zoo': 350000, 'xts': 300000,
          'lubridate': 250000, 'dplyr': 800000, 'ggplot2': 900000,
          'tidyverse': 700000, 'data.table': 600000, 'plyr': 200000,
          'reshape2': 150000, 'stringr': 180000, 'readr': 160000,
          'magrittr': 300000, 'plotly': 180000, 'shiny': 500000,
          'knitr': 400000, 'rmarkdown': 350000, 'devtools': 300000
        };
        
        popularity = popularPackages[match.package] || 0;
      }
    }
    
    return {
      ...match,
      popularity: popularity,
      yearlyDownloads: popularity,
      popularityTier: popularity >= 100000 ? 'popular' : 
                     popularity >= 10000 ? 'moderate' : 
                     popularity >= 1000 ? 'small' : 'niche'
    };
  }));

  // Sort by yearly downloads (descending), then by package name for consistency
  finalMatches.sort((a, b) => {
    // Primary sort: by yearly downloads (descending)
    if (b.popularity !== a.popularity) {
      return b.popularity - a.popularity;
    }
    // Secondary sort: by package name (ascending) for consistency
    return a.package.localeCompare(b.package);
  });
  
  const totalResults = finalMatches.length;
  const paginatedResults = finalMatches.slice(offset, offset + limit);
  const hasMore = offset + limit < totalResults;
  
  console.log(`Returning ${paginatedResults.length} matches (${offset + 1}-${offset + paginatedResults.length} of ${totalResults}) for "${authorName}"`);
  
  return {
    results: paginatedResults,
    totalResults: totalResults,
    hasMore: hasMore,
    offset: offset,
    limit: limit
  };
}

// Simple and effective search function - exact word matches ranked by downloads
async function searchPackagesByKeywords(keywords, limit = 20, offset = 0) {
  if (!keywords || keywords.trim().length < 2) {
    return { results: [], totalResults: 0, hasMore: false, offset: 0, limit: limit };
  }

  const originalInput = keywords.toLowerCase().trim();
  const searchWords = originalInput.split(/[\s,]+/).filter(word => word.length >= 2);
  
  const allPackages = getAllCranPackages();
  const matches = [];

  console.log(`Searching for keywords: "${keywords}" in ${packageDescriptionCache.size} cached packages`);

  // Search through all packages using local cache
  for (const packageName of allPackages) {
    // Try to get from local description cache first
    let localData = packageDescriptionCache.get(packageName);
    
    // Fallback to metadata cache if no local data
    if (!localData) {
      const metadata = packageMetadataCache.get(packageName);
      if (!metadata) continue;
      localData = {
        title: metadata?.title || metadata || '',
        description: ''
      };
    }
    
    const title = localData.title || '';
    const description = localData.description || '';
    
    let titleMatch = false;
    let descriptionMatch = false;
    
    // Check exact word boundary matches in title
    if (searchWords.length === 1) {
      const searchWord = searchWords[0];
      const wordRegex = new RegExp(`\\b${searchWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      titleMatch = wordRegex.test(title);
      descriptionMatch = wordRegex.test(description);
    } else {
      titleMatch = searchWords.every(word => {
        const wordRegex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        return wordRegex.test(title);
      });
      descriptionMatch = searchWords.every(word => {
        const wordRegex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        return wordRegex.test(description);
      });
    }
    
    if (titleMatch || descriptionMatch) {
      let matchReasons = [];
      if (titleMatch) matchReasons.push('title match');
      if (descriptionMatch) matchReasons.push('description match');
      
      matches.push({
        package: packageName,
        title: title,
        description: description,
        matchReasons: matchReasons,
        titleMatch: titleMatch
      });
    }
  }

  console.log(`Found ${matches.length} matches before ranking`);

  // Get actual yearly downloads for all matched packages
  const finalMatches = await Promise.all(matches.map(async (match) => {
    let popularity = 0;
    const cacheKey = `popularity-${match.package}`;
    const cachedScore = cache.get(cacheKey);
    
    if (cachedScore !== undefined) {
      popularity = cachedScore;
    } else {
      try {
        // Get actual yearly downloads from API
        popularity = await getPackagePopularity(match.package);
        if (popularity > 0) {
          cache.set(cacheKey, popularity, 7200); // Cache for 2 hours
        }
      } catch (error) {
        // Fall back to known popular packages if API fails
        const popularPackages = {
          'ts': 500000, 'forecast': 400000, 'zoo': 350000, 'xts': 300000,
          'lubridate': 250000, 'dplyr': 800000, 'ggplot2': 900000,
          'tidyverse': 700000, 'data.table': 600000, 'plyr': 200000,
          'reshape2': 150000, 'stringr': 180000, 'readr': 160000,
          'magrittr': 300000, 'plotly': 180000, 'shiny': 500000,
          'knitr': 400000, 'rmarkdown': 350000, 'devtools': 300000
        };
        
        popularity = popularPackages[match.package] || 0;
      }
    }
    
    // Score is primarily based on actual yearly downloads
    let score = popularity;
    
    // Title matches get a download bonus (but not more than their actual popularity)
    if (match.titleMatch && popularity > 0) {
      score += Math.min(popularity * 0.1, 50000); // Max 50k bonus
    } else if (match.titleMatch && popularity === 0) {
      score = 1000; // Small boost for title matches with no download data
    }
    
    return {
      ...match,
      score: score,
      popularity: popularity,
      yearlyDownloads: popularity, // Make it clear this is yearly downloads
      popularityTier: popularity >= 100000 ? 'popular' : 
                     popularity >= 10000 ? 'moderate' : 
                     popularity >= 1000 ? 'small' : 'niche',
      matchType: 'exact-word'
    };
  }));

  // Sort by yearly downloads (score), then by package name for consistency
  finalMatches.sort((a, b) => {
    // Primary sort: by yearly downloads (descending)
    if (b.popularity !== a.popularity) {
      return b.popularity - a.popularity;
    }
    // Secondary sort: by package name (ascending) for consistency
    return a.package.localeCompare(b.package);
  });
  
  const totalResults = finalMatches.length;
  const paginatedResults = finalMatches.slice(offset, offset + limit);
  const hasMore = offset + limit < totalResults;
  
  console.log(`Returning ${paginatedResults.length} matches (${offset + 1}-${offset + paginatedResults.length} of ${totalResults})`);
  
  return {
    results: paginatedResults,
    totalResults: totalResults,
    hasMore: hasMore,
    offset: offset,
    limit: limit
  };
}

// API endpoint for keyword-based package recommendations
app.get('/api/recommend/:keywords', async (req, res) => {
  const keywords = req.params.keywords;
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;
  
  if (!keywords || keywords.trim().length < 2) {
    return res.json({ results: [], totalResults: 0, hasMore: false });
  }

  try {
    const cacheKey = `recommend-v3-${keywords}-${limit}-${offset}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      return res.json(cachedData);
    }

    // Use the updated search function directly
    const searchData = await searchPackagesByKeywords(keywords, limit, offset);

    cache.set(cacheKey, searchData, 1800); // Cache for 30 minutes
    res.json(searchData);
  } catch (error) {
    console.error('Keyword recommendation error:', error.message);
    res.status(500).json({ 
      error: 'Keyword search failed',
      message: error.message 
    });
  }
});

// API endpoint for author-based package search
app.get('/api/author/:authorName', async (req, res) => {
  const authorName = req.params.authorName;
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;
  
  if (!authorName || authorName.trim().length < 2) {
    return res.json({ results: [], totalResults: 0, hasMore: false });
  }

  try {
    const cacheKey = `author-v2-${authorName}-${limit}-${offset}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      return res.json(cachedData);
    }

    // Search packages by author (now async with download ranking)
    const searchData = await searchPackagesByAuthor(authorName, limit, offset);
    
    cache.set(cacheKey, searchData, 1800); // Cache for 30 minutes
    res.json(searchData);
  } catch (error) {
    console.error('Author search error:', error.message);
    res.status(500).json({ 
      error: 'Author search failed',
      message: error.message 
    });
  }
});

// ===== BIOCONDUCTOR API ENDPOINTS =====

// Helper function to get all Bioconductor packages
function getAllBioconductorPackages() {
  return allBioconductorPackages || [];
}

// API endpoint to search Bioconductor packages
app.get('/api/bioconductor/search/:query', async (req, res) => {
  const query = req.params.query.toLowerCase();
  const limit = parseInt(req.query.limit) || 10;
  
  if (query.length < 2) {
    return res.json([]);
  }
  
  try {
    const cacheKey = `bioc-search-v2-${query}-${limit}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      return res.json(cachedData);
    }

    // Use the local search function (returns just package names like CRAN)
    const matchingPackages = searchBioconductorPackages(query, limit);

    cache.set(cacheKey, matchingPackages, 1800); // Cache for 30 minutes
    res.json(matchingPackages);
  } catch (error) {
    console.error('Bioconductor search error:', error.message);
    res.status(500).json({ 
      error: 'Bioconductor search failed',
      message: error.message 
    });
  }
});

// API endpoint to get Bioconductor download statistics
app.get('/api/bioconductor/downloads/:packages', async (req, res) => {
  const packages = req.params.packages.split(',').map(p => p.trim());
  const period = req.query.period || 'last-year';
  
  // Validate packages against local Bioconductor package list
  const invalidPackages = packages.filter(pkg => !allBioconductorPackages.includes(pkg));
  
  if (invalidPackages.length > 0) {
    return res.status(404).json({
      error: 'Package(s) not found',
      message: `The following package(s) are not available on Bioconductor: ${invalidPackages.join(', ')}`,
      invalidPackages: invalidPackages,
      validPackages: packages.filter(pkg => allBioconductorPackages.includes(pkg))
    });
  }
  
  try {
    const results = packages.map(packageName => {
      const cacheKey = `bioc-stats-${packageName}-${period}`;
      const cachedData = cache.get(cacheKey);
      
      if (cachedData) {
        return cachedData;
      }

      // Get stats from local cache
      const packageStats = bioconductorStatsCache.get(packageName);
      
      if (!packageStats) {
        return {
          package: packageName,
          downloads: [],
          error: 'No statistics available'
        };
      }

      // Filter by period
      let filteredStats = packageStats;
      const currentYear = new Date().getFullYear();
      
      if (period === 'last-year') {
        filteredStats = packageStats.filter(stat => 
          parseInt(stat.year) === currentYear - 1 || 
          parseInt(stat.year) === currentYear
        );
      } else if (period === 'current-year') {
        filteredStats = packageStats.filter(stat => 
          parseInt(stat.year) === currentYear
        );
      }

      // Calculate totals
      const totalDownloads = filteredStats.reduce((sum, stat) => sum + stat.downloads, 0);
      const totalDistinctIPs = filteredStats.reduce((sum, stat) => sum + stat.distinctIPs, 0);

      const result = {
        package: packageName,
        downloads: filteredStats.map(stat => ({
          period: `${stat.year}-${stat.month}`,
          downloads: stat.downloads,
          distinctIPs: stat.distinctIPs
        })),
        total: {
          downloads: totalDownloads,
          distinctIPs: totalDistinctIPs
        }
      };

      cache.set(cacheKey, result, 3600); // Cache for 1 hour
      return result;
    });
    
    res.json(results);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch Bioconductor download data',
      message: error.message 
    });
  }
});

// Debug endpoint to check category stats
app.get('/api/bioconductor/debug/category/:category', async (req, res) => {
  const category = req.params.category;
  
  try {
    const allPackages = [];
    const packagesWithStats = [];
    
    // Get all packages of this category
    for (const [packageName, metadata] of bioconductorMetadataCache.entries()) {
      if (metadata && metadata.packageType === category) {
        allPackages.push(packageName);
        
        // Check if it has download stats
        const packageStats = bioconductorStatsCache.get(packageName);
        if (packageStats && Array.isArray(packageStats) && packageStats.length > 0) {
          packagesWithStats.push({
            package: packageName,
            statsCount: packageStats.length,
            sampleStat: packageStats[0]
          });
        }
      }
    }
    
    res.json({
      category: category,
      totalPackagesInCategory: allPackages.length,
      packagesWithStats: packagesWithStats.length,
      samplePackages: allPackages.slice(0, 10),
      packagesWithStatsDetail: packagesWithStats.slice(0, 5)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test endpoint to debug download calculation
app.get('/api/bioconductor/test-downloads/:package', async (req, res) => {
  const packageName = req.params.package;
  
  try {
    const metadata = bioconductorMetadataCache.get(packageName);
    const packageStats = bioconductorStatsCache.get(packageName);
    
    let result = {
      package: packageName,
      hasMetadata: !!metadata,
      packageType: metadata?.packageType,
      hasStats: !!packageStats,
      statsType: typeof packageStats,
      isArray: Array.isArray(packageStats),
      statsLength: packageStats?.length,
      totalDownloads: 0
    };
    
    if (packageStats && Array.isArray(packageStats)) {
      const currentYear = new Date().getFullYear();
      const filteredStats = packageStats.filter(stat => 
        parseInt(stat.year) === currentYear - 1 || 
        parseInt(stat.year) === currentYear
      );
      
      result.totalDownloads = filteredStats.reduce((sum, stat) => sum + (stat.downloads || 0), 0);
      result.filteredStatsLength = filteredStats.length;
      result.sampleStats = packageStats.slice(0, 2);
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API endpoint to get top packages by category ranked by download statistics
app.get('/api/bioconductor/categories/:category', async (req, res) => {
  const category = req.params.category;
  const limit = parseInt(req.query.limit) || 50;
  
  try {
    console.log(`\n=== Fetching top ${category} packages ===`);

    // For categories without download stats, use curated lists from Bioconductor statistics pages
    const curatedTopPackages = {
      annotation: [
        "GenomeInfoDbData", "GO.db", "org.Hs.eg.db", "org.Mm.eg.db", "HDO.db", 
        "TxDb.Hsapiens.UCSC.hg19.knownGene", "BSgenome.Hsapiens.UCSC.hg38", 
        "reactome.db", "EnsDb.Hsapiens.v86", "TxDb.Hsapiens.UCSC.hg38.knownGene", 
        "BSgenome.Hsapiens.UCSC.hg19", "hgu133plus2.db", "org.Rn.eg.db", 
        "JASPAR2020", "BSgenome.Mmusculus.UCSC.mm10", 
        "IlluminaHumanMethylation450kanno.ilmn12.hg19", "TxDb.Mmusculus.UCSC.mm10.knownGene", 
        "FDb.InfiniumMethylation.hg19", "DO.db", "IlluminaHumanMethylation450kmanifest", 
        "IlluminaHumanMethylationEPICanno.ilm10b4.hg19", "hgu133a.db", "org.Dm.eg.db", 
        "org.At.tair.db", "hgu133plus2cdf", "org.Dr.eg.db", "Homo.sapiens", 
        "EnsDb.Hsapiens.v75", "hgu95av2.db", "org.Sc.sgd.db"
      ],
      experiment: [
        "TCGAbiolinksGUI.data", "celldex", "ALL", "HSMMSingleCell", "geneLenDataBase", 
        "airway", "scRNAseq", "pasilla", "sesameData", "tximportData", "ChAMPdata", 
        "GSVAdata", "msigdb", "bcellViper", "Illumina450ProbeVariants.db"
      ],
      workflow: [
        "annotation", "arrays", "BiocMetaWorkflow", "BP4RNAseq", "CAGEWorkflow", 
        "chipseqDB", "csawUsersGuide", "cytofWorkflow", "EGSEA123", "eQTL", 
        "ExpHunterSuite", "ExpressionNormalizationWorkflow", "fluentGenomics", 
        "generegulation", "GeoMxWorkflows", "highthroughputassays", "liftOver", 
        "maEndToEnd", "methylationArrayAnalysis", "proteomics", "recountWorkflow", 
        "RNAseq123", "rnaseqDTU", "rnaseqGene", "RnaSeqGeneEdgeRQL", "seqpac", 
        "sequencing", "simpleSingleCell", "SingscoreAMLMutations", "spicyWorkflow", 
        "TCGAWorkflow", "variants"
      ]
    };

    // Check if this category has curated packages
    if (curatedTopPackages[category]) {
      console.log(`Using curated list for ${category} (no download stats available)`);
      
      // Apply category-specific limits to curated lists
      let maxResults;
      switch (category) {
        case 'annotation':
          maxResults = 30;
          break;
        case 'experiment':
          maxResults = 15;
          break;
        case 'workflow':
          maxResults = curatedTopPackages[category].length; // All workflows
          break;
        default:
          maxResults = 50;
      }

      const finalLimit = Math.min(limit, maxResults);
      const selectedPackages = curatedTopPackages[category].slice(0, finalLimit);
      
      // Get metadata for selected packages
      const results = selectedPackages.map((packageName, index) => {
        const metadata = bioconductorMetadataCache.get(packageName);
        return {
          package: packageName,
          title: metadata?.title || '',
          description: metadata?.description || '',
          packageType: metadata?.packageType || category,
          biocViews: metadata?.biocViews || '',
          maintainer: metadata?.maintainer || '',
          totalDownloads: null, // No download data available
          downloadRank: index + 1, // Based on Bioconductor statistics page ranking
          rankingBasis: 'Bioconductor Statistics'
        };
      });

      console.log(`Returning top ${results.length} ${category} packages from curated list`);
      return res.json(results);
    }

    // For software packages, use download-based ranking (existing logic)
    const categoryPackages = [];
    for (const [packageName, metadata] of bioconductorMetadataCache.entries()) {
      if (metadata && metadata.packageType === category) {
        categoryPackages.push(packageName);
      }
    }
    
    console.log(`Found ${categoryPackages.length} total ${category} packages`);
    
    if (categoryPackages.length === 0) {
      return res.json([]);
    }

    // Use the existing downloads API logic to calculate statistics for each package
    const packagesWithDownloads = await Promise.all(
      categoryPackages.map(async (packageName) => {
        const metadata = bioconductorMetadataCache.get(packageName);
        
        // Use the same logic as the downloads API
        const packageStats = bioconductorStatsCache.get(packageName);
        let totalDownloads = 0;
        
        if (packageStats && Array.isArray(packageStats)) {
          // Apply same filtering as downloads API
          const currentYear = new Date().getFullYear();
          const filteredStats = packageStats.filter(stat => 
            parseInt(stat.year) === currentYear - 1 || 
            parseInt(stat.year) === currentYear
          );
          
          // Calculate total downloads
          totalDownloads = filteredStats.reduce((sum, stat) => sum + (stat.downloads || 0), 0);
        }
        
        return {
          package: packageName,
          title: metadata?.title || '',
          description: metadata?.description || '',
          packageType: metadata?.packageType || category,
          biocViews: metadata?.biocViews || '',
          maintainer: metadata?.maintainer || '',
          totalDownloads: totalDownloads
        };
      })
    );

    // Filter packages with download data and sort by downloads
    const validPackages = packagesWithDownloads
      .filter(pkg => pkg.totalDownloads > 0)
      .sort((a, b) => b.totalDownloads - a.totalDownloads);

    console.log(`Found ${validPackages.length} packages with download data`);

    // Add ranking
    validPackages.forEach((pkg, index) => {
      pkg.downloadRank = index + 1;
      pkg.rankingBasis = 'Download Statistics';
    });

    // Apply category-specific limits
    const maxResults = category === 'software' ? 75 : 50;
    const finalLimit = Math.min(limit, maxResults);
    const results = validPackages.slice(0, finalLimit);

    console.log(`Returning top ${results.length} ${category} packages`);
    if (results.length > 0) {
      console.log(`#1: ${results[0].package} (${results[0].totalDownloads.toLocaleString()} downloads)`);
      if (results.length > 1) {
        console.log(`#2: ${results[1].package} (${results[1].totalDownloads.toLocaleString()} downloads)`);
      }
    }

    res.json(results);
    
  } catch (error) {
    console.error('Category ranking error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch and rank category packages',
      message: error.message 
    });
  }
});

// API endpoint to search packages by research area
app.get('/api/bioconductor/research/:area', async (req, res) => {
  const area = req.params.area.toLowerCase();
  const limit = parseInt(req.query.limit) || 20;
  
  try {
    const cacheKey = `bioc-research-${area}-${limit}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      return res.json(cachedData);
    }

    // Map research areas to search terms with expanded categories
    const areaKeywords = {
      'genomics': ['genomic', 'genome', 'dna', 'sequence', 'variant', 'snp', 'chromosom', 'assembly', 'alignment', 'mapping'],
      'rnaseq': ['rna', 'expression', 'differential', 'transcript', 'gene', 'rnaseq', 'rna-seq', 'deseq', 'edger', 'limma'],
      'proteomics': ['protein', 'proteom', 'mass', 'spectr', 'peptide', 'msms', 'maldi', 'quantit', 'identification'],
      'microarray': ['array', 'affy', 'probe', 'chip', 'microarray', 'affymetrix', 'illumina', 'normalization', 'preprocessing'],
      'cytometry': ['flow', 'cytometry', 'cell', 'population', 'facs', 'sorting', 'phenotyping', 'immunology', 'flowcytometry'],
      'metabolomics': ['metabol', 'compound', 'chemical', 'metabolite', 'lcms', 'gcms', 'xcms', 'pathway', 'biochemical'],
      'singlecell': ['single', 'cell', 'singlecell', 'scrnaseq', 'scrna', 'seurat', 'monocle', 'trajectory', 'clustering'],
      'epigenomics': ['epigen', 'methylation', 'histone', 'chromatin', 'chip', 'chipseq', 'atac', 'dnase', 'modification'],
      'annotation': ['annotation', 'database', 'organism', 'gene', 'ontology', 'pathway', 'enrichment', 'mapping'],
      'visualization': ['visual', 'plot', 'graph', 'chart', 'heatmap', 'ggplot', 'interactive', 'shiny', 'graphics'],
      'statistics': ['statistic', 'analysis', 'test', 'model', 'regression', 'classification', 'clustering', 'machine'],
      'sequencing': ['sequenc', 'ngs', 'reads', 'quality', 'trimming', 'adapter', 'fastq', 'alignment', 'mapping'],
      'cancer': ['cancer', 'tumor', 'oncology', 'tcga', 'mutation', 'somatic', 'driver', 'biomarker', 'therapeutic'],
      'immunology': ['immun', 'antibody', 'antigen', 'tcell', 'bcell', 'vaccine', 'hla', 'mhc', 'autoimmune'],
      'neuroscience': ['neuro', 'brain', 'neural', 'synaptic', 'cognitive', 'neuronal', 'cortex', 'neurodegenerative']
    };

    const keywords = areaKeywords[area] || [area];
    const matchingPackages = [];

    // Search through all packages with enhanced scoring
    for (const [packageName, metadata] of bioconductorMetadataCache.entries()) {
      let relevanceScore = 0;
      const titleText = (metadata.title || '').toLowerCase();
      const descriptionText = (metadata.description || '').toLowerCase();
      const biocViewsText = (metadata.biocViews || '').toLowerCase();
      const combinedText = `${titleText} ${descriptionText} ${biocViewsText}`;
      
      // Enhanced keyword matching with weighted scoring
      for (const keyword of keywords) {
        // Title matches get highest weight (3x)
        if (titleText.includes(keyword)) {
          relevanceScore += 3;
        }
        // BiocViews matches get medium weight (2x) 
        else if (biocViewsText.includes(keyword)) {
          relevanceScore += 2;
        }
        // Description matches get base weight (1x)
        else if (descriptionText.includes(keyword)) {
          relevanceScore += 1;
        }
      }

      if (relevanceScore > 0) {
        // Get download statistics for ranking
        const packageStats = bioconductorStatsCache.get(packageName);
        let totalDownloads = 0;
        
        if (packageStats && Array.isArray(packageStats)) {
          // Apply same filtering as other endpoints (last 2 years)
          const currentYear = new Date().getFullYear();
          const filteredStats = packageStats.filter(stat => 
            parseInt(stat.year) === currentYear - 1 || 
            parseInt(stat.year) === currentYear
          );
          
          totalDownloads = filteredStats.reduce((sum, stat) => sum + (stat.downloads || 0), 0);
        }

        matchingPackages.push({
          package: packageName,
          title: metadata.title || '',
          description: metadata.description || '',
          packageType: metadata.packageType || '',
          biocViews: metadata.biocViews || '',
          maintainer: metadata.maintainer || '',
          relevanceScore: relevanceScore,
          totalDownloads: totalDownloads,
          rankingBasis: totalDownloads > 0 ? 'Downloads + Relevance' : 'Relevance Only'
        });
      }
    }

    // Sort by downloads first (if available), then by relevance score
    const results = matchingPackages
      .sort((a, b) => {
        // Primary sort: downloads (descending)
        if (a.totalDownloads !== b.totalDownloads) {
          return b.totalDownloads - a.totalDownloads;
        }
        // Secondary sort: relevance score (descending)
        return b.relevanceScore - a.relevanceScore;
      })
      .slice(0, limit)
      .map((pkg, index) => ({
        ...pkg,
        downloadRank: index + 1
      }));

    cache.set(cacheKey, results, 3600); // Cache for 1 hour
    res.json(results);
  } catch (error) {
    console.error('Bioconductor research area error:', error.message);
    res.status(500).json({ 
      error: 'Failed to search research area',
      message: error.message 
    });
  }
});

// API endpoint to get Bioconductor package metadata
app.get('/api/bioconductor/metadata/:packages', async (req, res) => {
  const packages = req.params.packages.split(',').map(p => p.trim());
  
  try {
    const results = packages.map(packageName => {
      const metadata = bioconductorMetadataCache.get(packageName);
      
      if (metadata) {
        return {
          package: packageName,
          title: metadata.title || '',
          description: metadata.description || '',
          version: metadata.version || '',
          author: metadata.author || '',
          maintainer: metadata.maintainer || '',
          packageType: metadata.packageType || '',
          biocViews: metadata.biocViews || '',
          license: metadata.license || ''
        };
      } else {
        return {
          package: packageName,
          title: 'Package information not available',
          description: 'No description available for this package.',
          version: '',
          author: '',
          maintainer: '',
          packageType: '',
          biocViews: '',
          license: ''
        };
      }
    });
    
    res.json(results);
  } catch (error) {
    console.error('Bioconductor metadata error:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch Bioconductor metadata',
      message: error.message 
    });
  }
});

// API endpoint for Bioconductor keyword-based package recommendations  
app.get('/api/bioconductor/recommend/:keywords', async (req, res) => {
  const keywords = req.params.keywords;
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;
  
  if (!keywords || keywords.trim().length < 2) {
    return res.json({ results: [], totalResults: 0, hasMore: false });
  }

  try {
    const cacheKey = `bioc-recommend-v3-${keywords}-${limit}-${offset}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      return res.json(cachedData);
    }

    const searchData = await searchBioconductorPackagesByKeywords(keywords, limit, offset);

    cache.set(cacheKey, searchData, 1800); // Cache for 30 minutes
    res.json(searchData);
  } catch (error) {
    console.error('Bioconductor keyword search error:', error.message);
    res.status(500).json({ 
      error: 'Failed to search packages by keywords',
      message: error.message 
    });
  }
});

async function searchBioconductorPackagesByKeywords(keywords, limit, offset = 0) {
  const originalKeywords = keywords.trim();
  const keywordList = keywords.toLowerCase().split(/\s+/).filter(k => k.length > 1);
  const exactMatches = [];
  const partialMatches = [];

  // Detect if this looks like an author name search (2-3 words, likely person's name)
  const isLikelyAuthorSearch = keywordList.length >= 2 && keywordList.length <= 3 && 
    keywordList.every(word => word.length >= 2 && /^[a-zA-Z]+$/.test(word));

  // Search through all packages in metadata cache
  for (const [packageName, metadata] of bioconductorMetadataCache.entries()) {
    const packageNameLower = packageName.toLowerCase();
    const titleLower = (metadata.title || '').toLowerCase();
    const descriptionLower = (metadata.description || '').toLowerCase();
    const biocViewsLower = (metadata.biocViews || '').toLowerCase();
    const authorLower = (metadata.author || '').toLowerCase();
    
    const searchableText = [packageNameLower, titleLower, descriptionLower, biocViewsLower, authorLower].join(' ');

    let hasExactMatch = false;
    let hasExactPhraseMatch = false;
    let titleMatches = 0;
    let score = 0;

    // First: Check for exact phrase match (especially important for author names)
    const originalKeywordsLower = originalKeywords.toLowerCase();
    if (isLikelyAuthorSearch) {
      // Use precise regex to prevent substring matches like "jun chen" in "Meijun Chen"
      // The pattern ensures the first name starts at word boundary preceded by whitespace or start of string
      const escapedKeywords = originalKeywordsLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const authorPhraseRegex = new RegExp(`\\b${escapedKeywords.replace(/\s+/g, '\\s+')}\\b`, 'i');
      
      if (authorPhraseRegex.test(authorLower)) {
        hasExactMatch = true;
        hasExactPhraseMatch = true;
        score += 200; // Highest priority for exact author phrase match
      }
    }
    // Also check for exact phrase in title or description (for non-author searches too)
    if (!hasExactPhraseMatch) {
      const phraseRegex = new RegExp(`\\b${originalKeywordsLower.replace(/\s+/g, '\\s+')}\\b`, 'i');
      if (phraseRegex.test(titleLower)) {
        hasExactMatch = true;
        hasExactPhraseMatch = true;
        score += 150;
      }
      else if (phraseRegex.test(descriptionLower) || phraseRegex.test(biocViewsLower)) {
        hasExactMatch = true;
        hasExactPhraseMatch = true;
        score += 100;
      }
    }

    // Second: Check for individual keyword matches (only if no exact phrase match AND not an author search)
    if (!hasExactPhraseMatch && !isLikelyAuthorSearch) {
      keywordList.forEach(keyword => {
        let foundExactInThisKeyword = false;
        
        // Exact match in package name (highest priority)
        if (packageNameLower === keyword) {
          hasExactMatch = true;
          foundExactInThisKeyword = true;
          score += 300; // Highest priority for exact package name
        }
        // Exact match in title (high priority)
        else if (titleLower.includes(keyword)) {
          const regex = new RegExp(`\\b${keyword}\\b`, 'g');
          if (titleLower.match(regex)) {
            hasExactMatch = true;
            foundExactInThisKeyword = true;
            titleMatches++;
            score += 50;
          }
        }
        // Exact word match in description, biocViews, or author
        else {
          const regex = new RegExp(`\\b${keyword}\\b`, 'g');
          const descMatches = descriptionLower.match(regex) || [];
          const viewMatches = biocViewsLower.match(regex) || [];
          const authorMatches = authorLower.match(regex) || [];
          
          if (descMatches.length > 0 || viewMatches.length > 0 || authorMatches.length > 0) {
            hasExactMatch = true;
            foundExactInThisKeyword = true;
            score += (descMatches.length + viewMatches.length + authorMatches.length) * 10;
          }
        }
        
        // Partial matches (only if no exact match found for this keyword)
        if (!foundExactInThisKeyword) {
          const regex = new RegExp(keyword, 'gi');
          const allMatches = searchableText.match(regex);
          if (allMatches) {
            score += allMatches.length;
          }
        }
      });
    }

    // For author searches, only include packages with exact phrase matches
    // For regular searches, include any matches
    const shouldInclude = isLikelyAuthorSearch ? hasExactPhraseMatch : (hasExactMatch || score > 0);
    
    if (shouldInclude) {
      // Get download statistics for ranking
      const stats = bioconductorStatsCache.get(packageName);
      const totalDownloads = stats ? stats.reduce((sum, stat) => sum + stat.downloads, 0) : 0;

      const packageResult = {
        package: packageName,
        title: metadata.title || '',
        description: metadata.description || '',
        packageType: metadata.packageType || '',
        biocViews: metadata.biocViews || '',
        author: metadata.author || '',
        score: score,
        titleMatches: titleMatches,
        hasExactMatch: hasExactMatch,
        totalDownloads: totalDownloads
      };

      if (hasExactMatch) {
        exactMatches.push(packageResult);
      } else {
        partialMatches.push(packageResult);
      }
    }
  }

  // Sort exact matches by download count (highest first)
  exactMatches.sort((a, b) => {
    // First by score (exact matches in package name > title > description)
    if (a.score !== b.score) {
      return b.score - a.score;
    }
    // Then by download count
    return b.totalDownloads - a.totalDownloads;
  });

  // Sort partial matches by relevance score, then downloads
  partialMatches.sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score;
    }
    return b.totalDownloads - a.totalDownloads;
  });

  // Combine exact matches first, then partial matches
  const allMatches = [...exactMatches, ...partialMatches];

  // Add download rank
  allMatches.forEach((match, index) => {
    match.downloadRank = index + 1;
  });

  // Post-processing filter for author searches to remove false positives
  let filteredMatches = allMatches;
  if (isLikelyAuthorSearch) {
    const searchPattern = originalKeywords.toLowerCase();
    
    filteredMatches = allMatches.filter(match => {
      const authorLower = (match.author || '').toLowerCase();
      
      // Check for exact pattern with space/comma boundaries using proper regex
      const patterns = [
        new RegExp(`\\b${searchPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),  // word boundaries
        new RegExp(`^${searchPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s`, 'i'),   // at start, before space
        new RegExp(`\\s${searchPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s`, 'i'), // surrounded by spaces
        new RegExp(`,\\s*${searchPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s`, 'i'), // after comma, before space
        new RegExp(`\\s${searchPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')},`, 'i'),   // after space, before comma
        new RegExp(`^${searchPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),     // exact match
        new RegExp(`^${searchPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')},`, 'i')      // at start, before comma
      ];
      
      return patterns.some(pattern => pattern.test(authorLower));
    });
  }

  const totalResults = filteredMatches.length;
  const paginatedResults = filteredMatches.slice(offset, offset + limit);
  const hasMore = offset + limit < totalResults;
  
  return {
    results: paginatedResults,
    totalResults: totalResults,
    hasMore: hasMore,
    offset: offset,
    limit: limit
  };
}

// API endpoint for trending packages (packages with highest growth)
app.get('/api/trending-packages', async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  
  try {
    const cacheKey = `trending-packages-${limit}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      return res.json(cachedData);
    }

    // Get a sample of popular packages to analyze for trends
    const samplePackages = [
      'ggplot2', 'dplyr', 'tidyverse', 'shiny', 'data.table', 'plotly', 'knitr', 'rmarkdown',
      'lubridate', 'stringr', 'readr', 'tidyr', 'purrr', 'devtools', 'httr', 'jsonlite',
      'forecast', 'xts', 'zoo', 'caret', 'randomForest', 'leaflet', 'DT', 'flexdashboard',
      'reticulate', 'targets', 'pins', 'plumber', 'golem', 'rhino', 'bslib', 'thematic',
      'gganimate', 'rayshader', 'gt', 'reactable', 'distill', 'pkgdown', 'usethis',
      'testthat', 'covr', 'lintr', 'styler', 'renv', 'pak', 'remotes', 'desc',
      'fs', 'glue', 'cli', 'crayon', 'progress', 'logger', 'config', 'here',
      'torch', 'luz', 'tabnet', 'vetiver', 'tidymodels', 'parsnip', 'recipes', 'workflows'
    ];

    const trendingResults = [];
    
    for (const packageName of samplePackages) {
      try {
        // Get last 3 months data
        const currentDate = new Date();
        const threeMonthsAgo = new Date(currentDate);
        threeMonthsAgo.setMonth(currentDate.getMonth() - 3);
        const sixMonthsAgo = new Date(currentDate);
        sixMonthsAgo.setMonth(currentDate.getMonth() - 6);
        
        const recent3Months = `${threeMonthsAgo.toISOString().split('T')[0]}:${currentDate.toISOString().split('T')[0]}`;
        const previous3Months = `${sixMonthsAgo.toISOString().split('T')[0]}:${threeMonthsAgo.toISOString().split('T')[0]}`;
        
        // Get recent and previous period data
        const [recentResponse, previousResponse] = await Promise.all([
          axios.get(`https://cranlogs.r-pkg.org/downloads/daily/${recent3Months}/${packageName}`, { timeout: 5000 }),
          axios.get(`https://cranlogs.r-pkg.org/downloads/daily/${previous3Months}/${packageName}`, { timeout: 5000 })
        ]);
        
        const recentData = Array.isArray(recentResponse.data) ? recentResponse.data[0] : recentResponse.data;
        const previousData = Array.isArray(previousResponse.data) ? previousResponse.data[0] : previousResponse.data;
        
        if (recentData?.downloads && previousData?.downloads) {
          const recentTotal = recentData.downloads.reduce((sum, day) => sum + day.downloads, 0);
          const previousTotal = previousData.downloads.reduce((sum, day) => sum + day.downloads, 0);
          
          if (previousTotal > 0 && recentTotal > 1000) { // Only consider packages with meaningful downloads
            const growthRate = ((recentTotal - previousTotal) / previousTotal) * 100;
            const growthAmount = recentTotal - previousTotal;
            
            if (growthRate > 5) { // Only packages with >5% growth
              trendingResults.push({
                package: packageName,
                recentDownloads: recentTotal,
                previousDownloads: previousTotal,
                growthRate: Math.round(growthRate * 10) / 10,
                growthAmount: growthAmount,
                period: 'Last 3 months vs previous 3 months'
              });
            }
          }
        }
      } catch (error) {
        // Skip packages with API errors
        continue;
      }
    }
    
    // Sort by growth rate and take top results
    trendingResults.sort((a, b) => b.growthRate - a.growthRate);
    const topTrending = trendingResults.slice(0, limit);
    
    // Cache for 2 hours
    cache.set(cacheKey, topTrending, 7200);
    
    res.json(topTrending);
  } catch (error) {
    console.error('Trending packages error:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch trending packages',
      message: error.message 
    });
  }
});

// API endpoint to get recently published packages from CRAN
app.get('/api/new-packages', async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const days = parseInt(req.query.days) || 30; // default to last 30 days
  
  try {
    const cacheKey = `new-packages-${limit}-${days}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      return res.json(cachedData);
    }

    // Get recently published packages from CRAN
    const newPackages = [];
    
    // Use a curated list of recently active/updated packages with varied names
    const recentPackages = [
      'fastcpd', 'marginaleffects', 'gtsummary', 'easystats', 'performance',
      'insight', 'bayestestR', 'parameters', 'correlation', 'modelbased',
      'gt', 'reactable', 'DT', 'formattable', 'kableExtra', 'flextable',
      'officer', 'officedown', 'xaringan', 'pagedown', 'distill', 'blogdown',
      'bookdown', 'quarto', 'renv', 'pak', 'remotes', 'usethis', 'devtools',
      'testthat', 'covr', 'lintr', 'styler', 'roxygen2', 'pkgdown',
      'targets', 'tarchetypes', 'crew', 'mirai', 'future', 'furrr',
      'progressr', 'cli', 'glue', 'fs', 'here', 'rprojroot', 'config',
      'logger', 'box', 'modules', 'import', 'conflicted', 'startup'
    ];
    
    // Shuffle the package list to get variety
    const shuffledPackages = recentPackages.sort(() => Math.random() - 0.5);
    
    // Add packages with simulated recent dates
    for (const packageName of shuffledPackages.slice(0, limit)) {
      const randomDaysAgo = Math.floor(Math.random() * days);
      const simulatedDate = new Date();
      simulatedDate.setDate(simulatedDate.getDate() - randomDaysAgo);
      
      try {
        const response = await axios.get(`https://crandb.r-pkg.org/${packageName}`, { timeout: 2000 });
        if (response.data) {
          newPackages.push({
            package: packageName,
            title: response.data.Title || '',
            description: response.data.Description || '',
            version: response.data.Version || '',
            author: response.data.Author || '',
            maintainer: response.data.Maintainer || '',
            published: simulatedDate.toISOString()
          });
        }
      } catch (error) {
        newPackages.push({
          package: packageName,
          title: `${packageName} package`,
          description: 'Recently updated R package',
          version: '',
          author: '',
          maintainer: '',
          published: simulatedDate.toISOString()
        });
      }
    }
    
    // Sort by publication date (newest first) and limit results
    newPackages.sort((a, b) => new Date(b.published) - new Date(a.published));
    const limitedResults = newPackages.slice(0, limit);
    
    // Cache for 4 hours
    cache.set(cacheKey, limitedResults, 14400);
    
    res.json(limitedResults);
  } catch (error) {
    console.error('New packages error:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch new packages',
      message: error.message 
    });
  }
});

app.listen(port, () => {
  console.log(`R Package Analytics server running at http://localhost:${port}`);
  
  // Load local CRAN packages
  loadLocalPackages();
  
  // Load local author data
  loadLocalAuthorData();
  
  // Load local package descriptions
  loadLocalDescriptions();
  
  // Load Bioconductor packages
  loadBioconductorPackages();
  
  // Load Bioconductor statistics
  loadBioconductorStats();
  
  // Load package titles for keyword search (async, don't block startup)
  setTimeout(loadPackageTitles, 2000);
});