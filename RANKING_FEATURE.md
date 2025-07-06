# CRAN Package Popularity Percentiles

This document describes the package popularity percentile functionality added to the R Package Analytics application.

## Overview

The popularity feature provides precise percentiles showing where a package ranks among all CRAN packages based on total download counts. Rankings are determined by the cumulative download statistics from datasciencemeta.com, which tracks all-time download totals. A higher percentile means more popular (e.g., 99% = top 1% most popular).

## API Endpoints

### 1. Enhanced Downloads Endpoint

**URL:** `/api/downloads/:packages`

**New Query Parameters:**
- `includeRanking=true` - Include ranking information in the response

**Example:**
```
GET /api/downloads/ggplot2?includeRanking=true&period=last-year
```

**Response includes:**
```json
{
  "package": "ggplot2",
  "downloads": [...],
  "ranking": {
    "rank": null,
    "totalPackages": 22000,
    "percentile": 99.5,
    "period": "last-year",
    "downloads": 19797343,
    "estimated": false,
    "sampleSize": 200
  }
}
```

### 2. Dedicated Ranking Endpoint

**URL:** `/api/ranking/:packages`

**Query Parameters:**
- `period` - Time period for percentile calculation (default: "last-year")
  - Options: "last-year", "last-month", "last-week", "last-day", "all-time"

**Example:**
```
GET /api/ranking/ggplot2,dplyr?period=last-year
```

**Response:**
```json
[
  {
    "package": "ggplot2",
    "rank": null,
    "totalPackages": 22000,
    "percentile": 99.5,
    "period": "last-year",
    "downloads": 19797343,
    "estimated": false,
    "sampleSize": 200
  },
  {
    "package": "dplyr",
    "rank": null,
    "totalPackages": 22000,
    "percentile": 99.2,
    "period": "last-year",
    "downloads": 15234567,
    "estimated": false,
    "sampleSize": 200
  }
]
```

## Response Fields

- `rank`: Always null (percentiles are used instead of ranks)
- `totalPackages`: Total number of packages in CRAN (~22,000)
- `percentile`: Package's popularity percentile (99% = top 1%, 50% = median)
- `period`: Time period used for percentile calculation
- `downloads`: Total download count for the specified period
- `estimated`: Boolean indicating if ranking is estimated vs. scraped from datasciencemeta.com
- `source`: Data source ("datasciencemeta.com" or "estimated")

## Ranking Data Sources

### Primary Method: datasciencemeta.com
1. **Scrapes exact rankings** from https://www.datasciencemeta.com/rpackages  
2. **Updated daily** with comprehensive CRAN package rankings
3. **Covers 22,000+ packages** with precise rank positions based on total download counts
4. **Rankings reflect all-time popularity** determined by cumulative download statistics
5. **Combines with our download stats** for the selected time period
6. **Cached for 12 hours** to minimize scraping load

### Download Statistics: CRAN Logs API  
- **All download numbers** come from our own CRAN logs API calls
- **Period-specific data** (last-year, last-month, etc.)
- **Accurate for selected time frame** regardless of ranking source

### Fallback Estimation (When scraping fails)
Estimates based on download count ranges:
- **10M+ downloads**: Rank ~50, 99.8th percentile
- **5M+ downloads**: Rank ~100, 99.5th percentile  
- **2M+ downloads**: Rank ~200, 99.0th percentile
- **1M+ downloads**: Rank ~500, 97.5th percentile
- **500K+ downloads**: Rank ~1000, 95.0th percentile
- And so on...

## Caching

- **Scraped rankings**: Cached for 12 hours (updated daily from source)
- **Individual package rankings**: Cached for 4 hours  
- **Download statistics**: Use existing CRAN API caching (1-2 hours)

## Error Handling

- Invalid packages return 404 with error details
- API failures gracefully fall back to estimation methods
- Network timeouts use reasonable defaults (10-15 seconds)

## Usage Examples

### JavaScript (Frontend)
```javascript
// Get downloads with ranking
fetch('/api/downloads/ggplot2?includeRanking=true')
  .then(response => response.json())
  .then(data => {
    const ranking = data[0].ranking;
    console.log(`${data[0].package} ranks #${ranking.rank} (${ranking.percentile}th percentile)`);
  });

// Get ranking only
fetch('/api/ranking/ggplot2,dplyr')
  .then(response => response.json())
  .then(rankings => {
    rankings.forEach(pkg => {
      console.log(`${pkg.package}: Rank #${pkg.rank}`);
    });
  });
```

### R
```r
library(httr)
library(jsonlite)

# Get package ranking
response <- GET("http://localhost:3000/api/ranking/ggplot2")
ranking_data <- fromJSON(content(response, "text"))
print(paste("ggplot2 ranks", ranking_data$rank, "out of", ranking_data$totalPackages))
```

### Python
```python
import requests

# Get package ranking
response = requests.get("http://localhost:3000/api/ranking/ggplot2")
ranking_data = response.json()[0]
print(f"ggplot2 ranks #{ranking_data['rank']} ({ranking_data['percentile']}th percentile)")
```

## Testing

Run the test script to verify functionality:
```bash
node test-ranking.js
```

This will test various scenarios and display ranking information for sample packages.