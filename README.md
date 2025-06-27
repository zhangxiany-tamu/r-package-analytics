# R Package Analytics

A simple web app to analyze R package download statistics from CRAN.

## Features

- **Complete CRAN search**: Autocomplete across all ~22,000 CRAN packages
- **Interactive charts**: View download trends with Chart.js visualizations
- **Multi-package comparison**: Compare multiple packages simultaneously
- **Flexible time periods**: day, week, month, year, all-time analysis
- **Trend predictions**: Optional forecasting for future download patterns
- **Theme support**: Light/dark theme toggle
- **Export functionality**: Download charts as PNG images
- **Package details**: Expandable information for each package

## Installation

### Prerequisites
- [Node.js](https://nodejs.org/) (version 14 or higher)
- [Git](https://git-scm.com/)

### Install from GitHub

1. **Clone the repository:**
   ```bash
   git clone https://github.com/zhangxiany-tamu/r-package-analytics.git
   ```

2. **Navigate to the project directory:**
   ```bash
   cd r-package-analytics
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Download CRAN package list** (first time setup):
   ```bash
   npm run update-packages
   ```

5. **Start the server:**
   ```bash
   npm start
   ```

6. **Open your browser to:**
   ```
   http://localhost:3000
   ```

## Live Demo

[View live demo](https://melodic-zoo-458222-s6.uc.r.appspot.com)

### Alternative: Download ZIP

If you don't have Git installed:

1. Go to https://github.com/zhangxiany-tamu/r-package-analytics
2. Click the green "Code" button
3. Select "Download ZIP"
4. Extract the ZIP file
5. Follow steps 2-6 above

## Usage

1. **Search packages**: Type any package name - autocomplete will suggest from all CRAN packages
2. **Add multiple packages**: Use comma separation or click suggestions to add packages
3. **Select time period**: Choose from day, week, month, year, or all-time
4. **Analyze trends**: View interactive charts and detailed statistics
5. **Compare packages**: Analyze multiple packages side-by-side
6. **Toggle predictions**: Optionally show forecast trends for future downloads
7. **Export results**: Download charts as PNG images

## Package Management

- **Update package list**: Run `npm run update-packages` to refresh the CRAN package list
- **Automatic fallback**: If package download fails, app uses popular packages list
- **Complete coverage**: Search across all ~22,000 packages on CRAN

## Technology

- **Backend**: Node.js + Express
- **Frontend**: Vanilla JavaScript + Chart.js  
- **Data**: CRAN logs API

## Examples

**Popular packages to try:**
- **Data manipulation**: ggplot2, dplyr, tidyr, data.table
- **Web applications**: shiny, shinydashboard, DT
- **Statistics**: caret, randomForest, survival, lme4  
- **Visualization**: plotly, leaflet, ggmap
- **Collections**: tidyverse, tidymodels