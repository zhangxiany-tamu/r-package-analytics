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

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// API endpoint to get package download stats
app.get('/api/downloads/:packages', async (req, res) => {
  const packages = req.params.packages.split(',').map(p => p.trim());
  const period = req.query.period || 'last-month';
  
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
        const lastYear = new Date(currentDate);
        lastYear.setFullYear(currentDate.getFullYear() - 1);
        const startDate = lastYear.toISOString().split('T')[0];
        const endDate = currentDate.toISOString().split('T')[0];
        apiPeriod = `${startDate}:${endDate}`;
      } else if (period === 'all-time') {
        // CRAN started in 2012
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
            const allTimeApiPeriod = '2012-10-01:' + currentDate.toISOString().split('T')[0];
            const totalResponse = await axios.get(`https://cranlogs.r-pkg.org/downloads/daily/${allTimeApiPeriod}/${packageName}`);
            const totalData = Array.isArray(totalResponse.data) ? totalResponse.data[0] : totalResponse.data;
            
            // Calculate total downloads
            if (totalData && totalData.downloads) {
              const total = totalData.downloads.reduce((sum, day) => sum + day.downloads, 0);
              totalDownloads = { 
                total: total,
                from_date: totalData.downloads[0]?.day || '2012-10-01',
                to_date: totalData.downloads[totalData.downloads.length - 1]?.day || currentDate.toISOString().split('T')[0]
              };
            }
            
            cache.set(totalCacheKey, totalDownloads, 3600); // Cache for 1 hour
          }
        } catch (totalError) {
          console.warn(`Could not fetch total downloads for ${packageName}:`, totalError.message);
        }
      }
      
      // Enhance data with total downloads
      const enhancedData = { 
        ...data,
        totalDownloads: totalDownloads 
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
    const lastYear = new Date(currentDate);
    lastYear.setFullYear(currentDate.getFullYear() - 1);
    const startDate = lastYear.toISOString().split('T')[0];
    const endDate = currentDate.toISOString().split('T')[0];
    const apiPeriod = `${startDate}:${endDate}`;

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

// Enhanced search function for author-based recommendations using local cache
function searchPackagesByAuthor(authorName, limit = 20) {
  if (!authorName || authorName.trim().length < 2) {
    return [];
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

  // Sort by score and return top matches
  matches.sort((a, b) => b.score - a.score);
  
  console.log(`Found ${matches.length} matches for "${authorName}"`);
  return matches.slice(0, limit);
}

// Simple and effective search function - exact word matches ranked by downloads
async function searchPackagesByKeywords(keywords, limit = 20) {
  if (!keywords || keywords.trim().length < 2) {
    return [];
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

  // Get popularity for all matched packages
  const finalMatches = await Promise.all(
    matches.map(async (match) => {
      const popularity = await getPackagePopularity(match.package);
      
      // Simple scoring: downloads + boost for title matches
      let score = popularity || 0;
      if (match.titleMatch) score += 1000; // Small boost for title match
      
      return {
        ...match,
        score: score,
        popularity: popularity || 0,
        popularityTier: popularity >= 100000 ? 'popular' : 
                       popularity >= 10000 ? 'moderate' : 
                       popularity >= 1000 ? 'small' : 'niche',
        matchType: 'exact-word'
      };
    })
  );

  // Sort by score (downloads + title boost)
  finalMatches.sort((a, b) => b.score - a.score);
  
  console.log(`Returning ${Math.min(limit, finalMatches.length)} top matches`);
  return finalMatches.slice(0, limit);
}

// API endpoint for keyword-based package recommendations
app.get('/api/recommend/:keywords', async (req, res) => {
  const keywords = req.params.keywords;
  const limit = parseInt(req.query.limit) || 20;
  
  if (!keywords || keywords.trim().length < 2) {
    return res.json([]);
  }

  try {
    const cacheKey = `recommend-v2-${keywords}-${limit}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      return res.json(cachedData);
    }

    // Use the updated search function directly
    const results = await searchPackagesByKeywords(keywords, limit);

    cache.set(cacheKey, results, 1800); // Cache for 30 minutes
    res.json(results);
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
  
  if (!authorName || authorName.trim().length < 2) {
    return res.json([]);
  }

  try {
    const cacheKey = `author-${authorName}-${limit}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      return res.json(cachedData);
    }

    // Search packages by author (now synchronous with local cache)
    const matches = searchPackagesByAuthor(authorName, limit);
    
    cache.set(cacheKey, matches, 1800); // Cache for 30 minutes
    res.json(matches);
  } catch (error) {
    console.error('Author search error:', error.message);
    res.status(500).json({ 
      error: 'Author search failed',
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
  
  // Load package titles for keyword search (async, don't block startup)
  setTimeout(loadPackageTitles, 2000);
});