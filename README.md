# R Package Analytics

A simple web app to analyze R package download statistics from CRAN.

## Features

- Search for any R package by name
- View download trends with interactive charts
- Compare multiple packages
- Support for different time periods (day, week, month, year, all-time)
- Light/dark theme toggle
- Download charts as PNG images

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. Open your browser to `http://localhost:3000`

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