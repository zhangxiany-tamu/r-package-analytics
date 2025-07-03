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

    // Search in Author field - check all name variations
    if (authorData.author) {
      const authorText = authorData.author.toLowerCase();
      
      // Check all search variations
      for (const variation of searchVariations) {
        if (authorText.includes(variation)) {
          score += 15;
          matchReasons.push('author match');
          break; // Only count once even if multiple variations match
        }
      }
    }

    // Search in Maintainer field - check all name variations  
    if (authorData.maintainer) {
      const maintainerText = authorData.maintainer.toLowerCase();
      
      // Check all search variations
      for (const variation of searchVariations) {
        if (maintainerText.includes(variation)) {
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
    let hasExactPhrase = false;
    

    // Check for exact phrase match first (including description)
    if (isPhrase) {
      const packageNameLower = packageName.toLowerCase();
      // Handle newlines and extra whitespace in titles and descriptions
      const titleLower = metadata?.title?.toLowerCase().replace(/\s+/g, ' ').trim() || '';
      const descriptionLower = metadata?.description?.toLowerCase().replace(/\s+/g, ' ').trim() || '';
      const searchPhrase = originalInput.toLowerCase().trim();
      
      if (packageNameLower.includes(searchPhrase) || titleLower.includes(searchPhrase) || descriptionLower.includes(searchPhrase)) {
        hasExactPhrase = true;
        // Score for exact phrase matches with proper hierarchy:
        // Package name > Description > Title (description ranks higher than title for exact matches)
        if (packageNameLower.includes(searchPhrase)) {
          score += packageNameLower.startsWith(searchPhrase) ? 100 : 50;
          matchReasons.push(`name: ${originalInput} (exact phrase)`);
        }
        if (descriptionLower.includes(searchPhrase)) {
          score += 45; // Higher than title but lower than package name
          matchReasons.push(`description: ${originalInput} (exact phrase)`);
        }
        if (titleLower.includes(searchPhrase)) {
          score += 35; // Lower than description for exact phrase matches
          matchReasons.push(`title: ${originalInput} (exact phrase)`);
        }
      }
    }

    // If no exact phrase match found, check individual words with very low weights
    if (!hasExactPhrase) {
      // Score based on package name match (very low scores for individual words)
      expandedTerms.forEach(term => {
        if (packageName.toLowerCase().includes(term)) {
          const isOriginalTerm = searchTerms.includes(term);
          let baseScore = packageName.toLowerCase().startsWith(term) ? 2 : 1; // Reduced from 10/5 to 2/1
          score += isOriginalTerm ? baseScore : Math.floor(baseScore * 0.5);
          matchReasons.push(`name: ${term}${isOriginalTerm ? '' : ' (semantic)'}`);
        }
      });

      // Score based on title match (very low scores for individual words)
      if (metadata && metadata.title) {
        const title = metadata.title.toLowerCase();
        expandedTerms.forEach(term => {
          if (title.includes(term)) {
            const isOriginalTerm = searchTerms.includes(term);
            const isExactWord = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(title);
            let baseScore = isExactWord ? 2 : 1; // Reduced from 8/3 to 2/1
            score += isOriginalTerm ? baseScore : Math.floor(baseScore * 0.5);
            matchReasons.push(`title: ${term}${isOriginalTerm ? '' : ' (semantic)'}`);
          }
        });
      }
    }

    // Only include packages with matches
    if (score > 0) {
      preliminaryMatches.push({
        package: packageName,
        title: metadata?.title || '',
        description: metadata?.description || '',
        version: metadata?.version || '',
        score: score,
        matchReasons: matchReasons,
        hasExactPhrase: hasExactPhrase
      });
    }
  });

  // Sort by score to get the most promising candidates
  preliminaryMatches.sort((a, b) => b.score - a.score);
  
  // Second pass: enhance top matches with full descriptions (slower but more accurate)
  let topMatches = preliminaryMatches.slice(0, Math.min(100, preliminaryMatches.length));
  
  // If no matches found in first pass, the search was too restrictive
  if (preliminaryMatches.length === 0) {
    console.log('No matches found in first pass');
  }
  const enhancedMatches = await Promise.all(
    topMatches.map(async (match) => {
      try {
        // Get full metadata including description
        const fullMetadata = await getPackageMetadata(match.package);
        let enhancedScore = match.score;
        let enhancedReasons = [...match.matchReasons];

        // Check for exact phrase matches in enhanced metadata (second pass)
        if (fullMetadata.description || fullMetadata.title) {
          const titleLower = fullMetadata.title?.toLowerCase().replace(/\s+/g, ' ').trim() || '';
          const descriptionLower = fullMetadata.description?.toLowerCase().replace(/\s+/g, ' ').trim() || '';
          const searchPhrase = originalInput.toLowerCase().trim();
          
          // Check for exact phrase matches that weren't caught in first pass
          if (isPhrase && (titleLower.includes(searchPhrase) || descriptionLower.includes(searchPhrase))) {
            if (descriptionLower.includes(searchPhrase)) {
              enhancedScore += 45; // Exact phrase in description
              enhancedReasons.push(`description: ${originalInput} (exact phrase)`);
              match.hasExactPhrase = true;
            }
            if (titleLower.includes(searchPhrase)) {
              enhancedScore += 35; // Exact phrase in title
              enhancedReasons.push(`title: ${originalInput} (exact phrase)`);
              match.hasExactPhrase = true;
            }
          }
          // Only do individual word matching if no exact phrase found
          else if (!match.hasExactPhrase) {
            const description = descriptionLower;
            
            // Only check individual words for partial matches since exact phrases are handled above
            expandedTerms.forEach(term => {
              if (description.includes(term)) {
                const isOriginalTerm = searchTerms.includes(term);
                const isExactWord = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(description);
                let baseScore = isExactWord ? 2 : 1; // Reduced from 6/2 to 2/1 
                enhancedScore += isOriginalTerm ? baseScore : Math.floor(baseScore * 0.5);
                enhancedReasons.push(`description: ${term}${isOriginalTerm ? '' : ' (semantic)'}`);
              }
            });
          }
        }

        return {
          ...match,
          title: fullMetadata.title || match.title,
          description: fullMetadata.description || match.description,
          version: fullMetadata.version || match.version,
          score: enhancedScore,
          matchReasons: enhancedReasons,
          hasExactPhrase: match.hasExactPhrase
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
      
      // Re-sort with strict hierarchy: exact phrase matches first, then partial matches
      matchesWithPopularity.sort((a, b) => {
        const aHasExact = a.hasExactPhrase || false;
        const bHasExact = b.hasExactPhrase || false;
        
        // If one has exact phrase match and the other doesn't, prioritize exact match
        if (aHasExact && !bHasExact) return -1;
        if (!aHasExact && bHasExact) return 1;
        
        // Both have exact phrase matches OR both have partial matches
        const aPopularityScore = calculatePopularityScore(a.popularity || 0);
        const bPopularityScore = calculatePopularityScore(b.popularity || 0);
        
        if (aHasExact && bHasExact) {
          // Both have exact phrase matches: prioritize by popularity, then by relevance score
          if (Math.abs(aPopularityScore - bPopularityScore) > 5) {
            return bPopularityScore - aPopularityScore;
          }
          return b.score - a.score;
        } else {
          // Both have partial matches: use combined score (relevance + popularity)
          const aFinalScore = a.score + aPopularityScore;
          const bFinalScore = b.score + bPopularityScore;
          return bFinalScore - aFinalScore;
        }
      });

      results = matchesWithPopularity.slice(0, limit);
      
      // Add popularity tier information and match type to results
      results = results.map(result => ({
        ...result,
        popularityTier: result.popularity >= 1000000 ? 'very-popular' :
                       result.popularity >= 100000 ? 'popular' :
                       result.popularity >= 10000 ? 'moderate' :
                       result.popularity >= 1000 ? 'small' : 'niche',
        matchType: result.hasExactPhrase ? 'exact-phrase' : 'partial-match'
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
  
  // Load package titles for keyword search (async, don't block startup)
  setTimeout(loadPackageTitles, 2000);
});