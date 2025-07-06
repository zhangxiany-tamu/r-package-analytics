#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

async function downloadCranPackages() {
    console.log('Downloading complete CRAN package list...');
    
    try {
        // Method 1: Try CRAN database API (this should get all ~22k packages)
        console.log('Fetching from CRAN database API...');
        
        const response = await axios.get('https://crandb.r-pkg.org/-/all', {
            timeout: 180000, // 3 minute timeout
            responseType: 'stream'
        });
        
        console.log('Streaming CRAN data...');
        let jsonData = '';
        
        // Collect the streamed data
        for await (const chunk of response.data) {
            jsonData += chunk;
        }
        
        console.log(`Received ${Math.round(jsonData.length / 1024 / 1024)}MB of data, parsing JSON...`);
        const parsedData = JSON.parse(jsonData);
        const allPackages = Object.keys(parsedData);
        
        // Sort packages alphabetically
        allPackages.sort();
        
        console.log(`Successfully extracted ${allPackages.length} package names`);
        
        // Create data directory if it doesn't exist
        const dataDir = path.join(__dirname, '..', 'data');
        await fs.mkdir(dataDir, { recursive: true });
        
        // Save to JSON file
        const outputPath = path.join(dataDir, 'cran-packages.json');
        await fs.writeFile(outputPath, JSON.stringify({
            lastUpdated: new Date().toISOString(),
            totalPackages: allPackages.length,
            packages: allPackages
        }, null, 2));
        
        console.log(`Successfully saved ${allPackages.length} packages to ${outputPath}`);
        console.log('First 10 packages:', allPackages.slice(0, 10).join(', '));
        console.log('Random sample:', allPackages.filter((_, i) => i % Math.floor(allPackages.length / 10) === 0).slice(0, 10).join(', '));
        
    } catch (error) {
        console.error('Error downloading CRAN packages:', error.message);
        console.log('Creating fallback list with popular packages...');
        
        // Fallback: Create a comprehensive curated list
        const fallbackPackages = [
            // Core tidyverse and popular packages
            'ggplot2', 'dplyr', 'tidyr', 'readr', 'purrr', 'tibble', 'stringr', 'forcats', 'tidyverse',
            'data.table', 'magrittr', 'lubridate', 'janitor', 'reshape2', 'plyr',
            'shiny', 'shinydashboard', 'DT', 'htmlwidgets', 'httr', 'jsonlite', 'xml2', 'rvest', 'curl',
            'lme4', 'nlme', 'mgcv', 'survival', 'boot', 'MASS', 'cluster', 'lattice', 'Matrix',
            'caret', 'randomForest', 'e1071', 'neuralnet', 'nnet', 'glmnet', 'xgboost', 'rpart',
            'plotly', 'leaflet', 'ggmap', 'RColorBrewer', 'viridis', 'gridExtra', 'corrplot',
            'forecast', 'zoo', 'xts', 'quantmod', 'TTR', 'PerformanceAnalytics', 'tseries',
            'devtools', 'usethis', 'roxygen2', 'testthat', 'pkgdown', 'remotes', 'desc',
            'knitr', 'rmarkdown', 'bookdown', 'blogdown', 'flexdashboard', 'xaringan',
            'DBI', 'RSQLite', 'RMySQL', 'RPostgreSQL', 'odbc', 'dbplyr',
            'sf', 'sp', 'rgdal', 'rgeos', 'raster', 'maps', 'maptools',
            'Biobase', 'limma', 'edgeR', 'DESeq2', 'GenomicRanges', 'IRanges',
            'parallel', 'foreach', 'doParallel', 'future', 'furrr',
            'tm', 'text2vec', 'quanteda', 'tidytext', 'wordcloud', 'tokenizers',
            'shinyjs', 'shinycssloaders', 'shinyWidgets', 'officer', 'openxlsx', 'readxl',
            'here', 'fs', 'glue', 'crayon', 'cli', 'rlang', 'vctrs', 'pillar',
            'psych', 'corrr', 'broom', 'modelr', 'infer', 'recipes', 'parsnip',
            'workflows', 'tune', 'rsample', 'yardstick', 'tidymodels'
        ].sort();
        
        try {
            const dataDir = path.join(__dirname, '..', 'data');
            await fs.mkdir(dataDir, { recursive: true });
            
            const outputPath = path.join(dataDir, 'cran-packages.json');
            await fs.writeFile(outputPath, JSON.stringify({
                lastUpdated: new Date().toISOString(),
                totalPackages: fallbackPackages.length,
                packages: fallbackPackages,
                note: 'Fallback list - run script again to attempt full download'
            }, null, 2));
            
            console.log(`Saved fallback list with ${fallbackPackages.length} popular packages`);
        } catch (writeError) {
            console.error('Failed to save fallback list:', writeError.message);
            process.exit(1);
        }
    }
}

// Run the script
downloadCranPackages();