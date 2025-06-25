const express = require('express');
const cors = require('cors');
const axios = require('axios');
const NodeCache = require('node-cache');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const cache = new NodeCache({ stdTTL: 3600 }); // Cache for 1 hour

// Cache for all CRAN packages (updated less frequently)
let allCranPackages = null;
let lastPackageUpdate = 0;

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

      const response = await axios.get(`https://cranlogs.r-pkg.org/downloads/daily/${apiPeriod}/${packageName}`);
      const data = Array.isArray(response.data) ? response.data[0] : response.data;
      
      cache.set(cacheKey, data);
      return data;
    }));
    
    res.json(results);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch download data',
      message: error.message 
    });
  }
});

// Helper function to get all CRAN packages
async function getAllCranPackages() {
  const now = Date.now();
  // Refresh package list every 6 hours
  if (!allCranPackages || (now - lastPackageUpdate) > 6 * 60 * 60 * 1000) {
    try {
      console.log('Fetching updated CRAN package list...');
      const response = await axios.get('https://crandb.r-pkg.org/-/all');
      allCranPackages = Object.keys(response.data);
      lastPackageUpdate = now;
      console.log(`Loaded ${allCranPackages.length} CRAN packages`);
    } catch (error) {
      console.error('Failed to fetch CRAN packages:', error.message);
      // Return empty array if we can't fetch packages
      if (!allCranPackages) {
        allCranPackages = [];
      }
    }
  }
  return allCranPackages;
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

    // Get all CRAN packages (cached)
    const allPackages = await getAllCranPackages();
    
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

app.listen(port, async () => {
  console.log(`R Package Analytics server running at http://localhost:${port}`);
  
  // Preload CRAN packages for faster first search
  try {
    await getAllCranPackages();
  } catch (error) {
    console.warn('Could not preload CRAN packages:', error.message);
  }
});