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
      version: response.data.Version || ''
    };
    
    // Cache individual package metadata for 6 hours
    cache.set(cacheKey, metadata, 21600);
    
    // Also update the main cache
    packageMetadataCache.set(packageName, metadata);
    
    return metadata;
  } catch (error) {
    // Return what we have from bulk cache, or empty
    const existing = packageMetadataCache.get(packageName);
    return existing || { title: '', description: '', version: '' };
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

// Enhanced search function for keyword-based recommendations with semantic matching
async function searchPackagesByKeywords(keywords, limit = 20) {
  if (!keywords || keywords.trim().length < 2) {
    return [];
  }

  // Parse input to extract both phrases and individual words
  let originalInput = keywords.toLowerCase().trim();
  
  // Create semantic synonyms map for common R/statistics terms
  const semanticSynonyms = {
    'machine learning': ['ml', 'classification', 'prediction', 'model', 'algorithm', 'supervised', 'unsupervised'],
    'ml': ['machine learning', 'classification', 'prediction', 'model', 'algorithm'],
    'deep learning': ['neural', 'network', 'tensorflow', 'keras', 'torch'],
    'neural network': ['deep learning', 'tensorflow', 'keras', 'torch', 'neural'],
    'random forest': ['rf', 'randomforest', 'ensemble', 'tree', 'bagging'],
    'time series': ['timeseries', 'temporal', 'forecasting', 'trend', 'seasonal', 'ts'],
    'linear regression': ['lm', 'glm', 'modeling', 'linear model'],
    'logistic regression': ['glm', 'binomial', 'classification'],
    'data visualization': ['plot', 'graph', 'chart', 'ggplot', 'visual'],
    'data manipulation': ['dplyr', 'tidyverse', 'transform', 'cleaning', 'wrangling'],
    'statistical analysis': ['stats', 'statistical', 'hypothesis', 'test', 'analysis'],
    'bayesian analysis': ['bayes', 'mcmc', 'posterior', 'prior', 'stan'],
    'survival analysis': ['hazard', 'cox', 'kaplan', 'meier', 'censoring'],
    'mixed effects': ['mixed', 'hierarchical', 'multilevel', 'lme', 'lmer'],
    'mixed models': ['lme4', 'nlme', 'hierarchical', 'multilevel'],
    'microbiome analysis': ['microbiota', '16s', 'metagenome', 'phyloseq', 'bacteria'],
    'spatial analysis': ['geographic', 'gis', 'map', 'coordinate', 'sf'],
    'network analysis': ['graph', 'igraph', 'social', 'topology', 'edge'],
    'text mining': ['nlp', 'sentiment', 'corpus', 'tokenize', 'tm'],
    'principal component analysis': ['pca', 'dimensionality reduction', 'prcomp'],
    'cluster analysis': ['clustering', 'kmeans', 'hierarchical clustering'],
    'association rules': ['market basket', 'frequent itemsets', 'apriori']
  };

  // Simplified search: prioritize exact phrases over individual words
  let searchTerms = [];
  let isPhrase = false;
  
  // Step 1: Determine if input is a phrase (multiple words)
  const inputWords = originalInput.split(/[\s,]+/).filter(word => word.length >= 2);
  
  if (inputWords.length >= 2) {
    // Multi-word input: treat as a phrase
    isPhrase = true;
    searchTerms.push(originalInput); // The complete phrase
    // Also add individual words as fallback, but with lower priority
    searchTerms.push(...inputWords);
  } else {
    // Single word input
    isPhrase = false;
    searchTerms.push(originalInput);
  }
  
  // Step 2: Add known semantic synonyms (but keep it simple)
  const expandedTerms = [...searchTerms];
  searchTerms.forEach(term => {
    if (semanticSynonyms[term]) {
      expandedTerms.push(...semanticSynonyms[term]);
    }
  });

  const allPackages = getAllCranPackages();
  const preliminaryMatches = [];

  // First pass: search with basic metadata (title only, fast)
  allPackages.forEach(packageName => {
    const metadata = packageMetadataCache.get(packageName);
    let score = 0;
    let matchReasons = [];

    // Score based on package name match (highest priority)
    expandedTerms.forEach(term => {
      if (packageName.toLowerCase().includes(term)) {
        const isOriginalTerm = searchTerms.includes(term);
        const isExactPhrase = isPhrase && term === originalInput;
        
        let baseScore = packageName.toLowerCase().startsWith(term) ? 10 : 5;
        
        // Higher score for exact phrase matches
        if (isExactPhrase) {
          baseScore *= 2; // Double score for exact phrase matches
        }
        
        score += isOriginalTerm ? baseScore : Math.floor(baseScore * 0.7);
        matchReasons.push(`name: ${term}${isOriginalTerm ? '' : ' (semantic)'}${isExactPhrase ? ' (exact phrase)' : ''}`);
      }
    });

    // Score based on title match (high priority)
    if (metadata && metadata.title) {
      const title = metadata.title.toLowerCase();
      expandedTerms.forEach(term => {
        if (title.includes(term)) {
          const isOriginalTerm = searchTerms.includes(term);
          const isExactPhrase = isPhrase && term === originalInput;
          const isExactWord = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(title);
          
          let baseScore = isExactWord ? 8 : 3;
          
          // Higher score for exact phrase matches
          if (isExactPhrase) {
            baseScore *= 2; // Double score for exact phrase matches
          }
          
          score += isOriginalTerm ? baseScore : Math.floor(baseScore * 0.7);
          matchReasons.push(`title: ${term}${isOriginalTerm ? '' : ' (semantic)'}${isExactPhrase ? ' (exact phrase)' : ''}`);
        }
      });
    }

    // Only include packages with matches
    if (score > 0) {
      preliminaryMatches.push({
        package: packageName,
        title: metadata?.title || '',
        description: metadata?.description || '',
        version: metadata?.version || '',
        score: score,
        matchReasons: matchReasons
      });
    }
  });

  // Sort by score to get the most promising candidates
  preliminaryMatches.sort((a, b) => b.score - a.score);
  
  // Second pass: enhance top matches with full descriptions (slower but more accurate)
  let topMatches = preliminaryMatches.slice(0, Math.min(50, preliminaryMatches.length));
  
  // If no matches found in first pass, add some known packages that might be relevant
  if (preliminaryMatches.length === 0) {
    console.log('No matches in first pass, adding candidate packages for deep search...');
    
    // For glucose search, add specific known packages
    let candidatePackages = [];
    if (originalInput.toLowerCase() === 'glucose') {
      candidatePackages = ['iglu'];
    }
    
    topMatches = candidatePackages.map(packageName => ({
      package: packageName,
      title: packageMetadataCache.get(packageName)?.title || '',
      description: packageMetadataCache.get(packageName)?.description || '',
      version: packageMetadataCache.get(packageName)?.version || '',
      score: 0,
      matchReasons: []
    }));
    
    console.log(`Added ${topMatches.length} candidate packages for deep search`);
  }
  const enhancedMatches = await Promise.all(
    topMatches.map(async (match) => {
      try {
        // Get full metadata including description
        const fullMetadata = await getPackageMetadata(match.package);
        let enhancedScore = match.score;
        let enhancedReasons = [...match.matchReasons];

        // Score based on description match (medium priority)
        if (fullMetadata.description) {
          const description = fullMetadata.description.toLowerCase();
          expandedTerms.forEach(term => {
            if (description.includes(term)) {
              const isOriginalTerm = searchTerms.includes(term);
              const isExactPhrase = isPhrase && term === originalInput;
              const isExactWord = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(description);
              
              let baseScore = isExactWord ? 6 : 2;
              
              // Higher score for exact phrase matches
              if (isExactPhrase) {
                baseScore *= 2; // Double score for exact phrase matches
              }
              
              enhancedScore += isOriginalTerm ? baseScore : Math.floor(baseScore * 0.7);
              enhancedReasons.push(`description: ${term}${isOriginalTerm ? '' : ' (semantic)'}${isExactPhrase ? ' (exact phrase)' : ''}`);
            }
          });
        }

        return {
          ...match,
          title: fullMetadata.title || match.title,
          description: fullMetadata.description || match.description,
          version: fullMetadata.version || match.version,
          score: enhancedScore,
          matchReasons: enhancedReasons
        };
      } catch (error) {
        // If we can't get enhanced metadata, return the original match
        return match;
      }
    })
  );

  // Final sort by enhanced scores
  enhancedMatches.sort((a, b) => b.score - a.score);
  
  return enhancedMatches.slice(0, limit);
}

// API endpoint for keyword-based package recommendations
app.get('/api/recommend/:keywords', async (req, res) => {
  const keywords = req.params.keywords;
  const limit = parseInt(req.query.limit) || 20;
  
  if (!keywords || keywords.trim().length < 2) {
    return res.json([]);
  }

  try {
    const cacheKey = `recommend-${keywords}-${limit}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      return res.json(cachedData);
    }

    // Ensure package titles are loaded
    if (packageMetadataCache.size === 0) {
      await loadPackageTitles();
    }

    // Get keyword-based matches
    const matches = await searchPackagesByKeywords(keywords, limit * 2); // Get more for popularity filtering

    let results = matches;

    // Always enhance with popularity data for better ranking
    if (matches.length > 0) {
      const popularityPromises = matches.slice(0, Math.min(100, matches.length)).map(async match => {
        const popularity = await getPackagePopularity(match.package);
        return { ...match, popularity };
      });

      const matchesWithPopularity = await Promise.all(popularityPromises);
      
      // Calculate popularity score based on download tiers
      const calculatePopularityScore = (downloads) => {
        if (!downloads || downloads === 0) return 0;
        
        // Logarithmic scoring to prevent extremely popular packages from dominating
        // but still give significant weight to download counts
        if (downloads >= 1000000) return 50;      // Very popular (1M+ downloads)
        if (downloads >= 500000) return 40;       // Highly popular (500K+ downloads)
        if (downloads >= 100000) return 30;       // Popular (100K+ downloads)
        if (downloads >= 50000) return 20;        // Moderately popular (50K+ downloads)
        if (downloads >= 10000) return 15;        // Somewhat popular (10K+ downloads)
        if (downloads >= 5000) return 10;         // Known packages (5K+ downloads)
        if (downloads >= 1000) return 5;          // Small packages (1K+ downloads)
        return Math.log10(downloads + 1);         // Very small packages (logarithmic)
      };
      
      // Re-sort by combined score (keyword relevance + popularity)
      matchesWithPopularity.sort((a, b) => {
        const aPopularityScore = calculatePopularityScore(a.popularity || 0);
        const bPopularityScore = calculatePopularityScore(b.popularity || 0);
        
        // Balance keyword relevance (base score) with popularity
        // Higher base scores still matter, but popularity can significantly boost ranking
        const aFinalScore = a.score + aPopularityScore;
        const bFinalScore = b.score + bPopularityScore;
        
        return bFinalScore - aFinalScore;
      });

      results = matchesWithPopularity.slice(0, limit);
      
      // Add popularity tier information to results
      results = results.map(result => ({
        ...result,
        popularityTier: result.popularity >= 1000000 ? 'very-popular' :
                       result.popularity >= 100000 ? 'popular' :
                       result.popularity >= 10000 ? 'moderate' :
                       result.popularity >= 1000 ? 'small' : 'niche'
      }));
    } else {
      results = results.slice(0, limit);
    }

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

app.listen(port, () => {
  console.log(`R Package Analytics server running at http://localhost:${port}`);
  
  // Load local CRAN packages
  loadLocalPackages();
  
  // Load package titles for keyword search (async, don't block startup)
  setTimeout(loadPackageTitles, 2000);
});