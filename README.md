# R Package Analytics

A simple web app to analyze R package download statistics from CRAN.

## Features

- Search for any R package by name
- View download trends with interactive charts
- Compare multiple packages
- Support for different time periods (day, week, month, year, all-time)
- Light/dark theme toggle
- Download charts as PNG images

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

4. **Start the server:**
   ```bash
   npm start
   ```

5. **Open your browser to:**
   ```
   http://localhost:3000
   ```

### Alternative: Download ZIP

If you don't have Git installed:

1. Go to https://github.com/zhangxiany-tamu/r-package-analytics
2. Click the green "Code" button
3. Select "Download ZIP"
4. Extract the ZIP file
5. Follow steps 2-5 above

## Usage

1. Type a package name (e.g., "ggplot2", "dplyr")
2. Use autocomplete suggestions or add multiple packages
3. Select a time period
4. View download statistics and trends

## Technology

- **Backend**: Node.js + Express
- **Frontend**: Vanilla JavaScript + Chart.js  
- **Data**: CRAN logs API

## Examples

Try popular packages like: ggplot2, dplyr, shiny, tidyverse, data.table