class RPackageAnalytics {
    constructor() {
        this.chart = null;
        this.cumulativeChart = null;
        this.packages = [];
        this.currentData = null;
        this.currentPeriod = 'last-month';
        this.currentTheme = 'light';
        this.themes = ['light', 'dark'];
        this.colors = [
            '#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#00f2fe',
            '#43e97b', '#38f9d7', '#ffecd2', '#fcb69f', '#a8edea', '#fed6e3'
        ];
        
        // Popular R packages for autocomplete
        this.popularPackages = [
            'ggplot2', 'dplyr', 'shiny', 'tidyverse', 'devtools', 'knitr', 'rmarkdown',
            'plotly', 'DT', 'lubridate', 'stringr', 'readr', 'tidyr', 'purrr',
            'data.table', 'magrittr', 'httr', 'jsonlite', 'xml2', 'rvest',
            'testthat', 'roxygen2', 'usethis', 'pkgdown', 'bookdown', 'blogdown',
            'flexdashboard', 'shinydashboard', 'leaflet', 'sf', 'sp', 'rgdal',
            'ggmap', 'forecast', 'zoo', 'xts', 'quantmod', 'TTR', 'PerformanceAnalytics',
            'caret', 'randomForest', 'e1071', 'neuralnet', 'nnet', 'cluster',
            'survival', 'boot', 'MASS', 'lattice', 'nlme', 'lme4', 'mgcv'
        ];
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        const searchBtn = document.getElementById('searchBtn');
        const packageInput = document.getElementById('packageInput');
        const periodButtons = document.querySelectorAll('.period-btn');
        
        searchBtn.addEventListener('click', () => this.addPackages());
        packageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addPackages();
            }
        });
        
        // Add autocomplete functionality
        packageInput.addEventListener('input', (e) => this.handleInputChange(e));
        packageInput.addEventListener('focus', (e) => this.handleInputChange(e));
        packageInput.addEventListener('blur', () => {
            // Delay hiding to allow clicking on suggestions
            setTimeout(() => this.hideSuggestions(), 150);
        });
        
        // Period switching
        periodButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.changePeriod(e.target.dataset.period);
            });
        });
        
        // Hide suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.input-container')) {
                this.hideSuggestions();
            }
        });
        
        // Theme switching
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.switchTheme());
        }
        
        // Load saved theme
        this.loadTheme();
    }

    handleInputChange(e) {
        const query = e.target.value.trim();
        const lastComma = query.lastIndexOf(',');
        const currentInput = lastComma >= 0 ? query.substring(lastComma + 1).trim() : query;
        
        console.log('Input changed:', currentInput, 'Length:', currentInput.length); // Debug
        
        if (currentInput.length >= 1) {
            this.showSuggestions(currentInput, lastComma);
        } else {
            this.hideSuggestions();
        }
    }

    showSuggestions(query, lastCommaIndex) {
        console.log('showSuggestions called with query:', query); // Debug
        console.log('Available packages:', this.popularPackages.slice(0, 5)); // Debug
        
        const suggestions = this.popularPackages
            .filter(pkg => 
                pkg.toLowerCase().includes(query.toLowerCase()) && 
                !this.packages.includes(pkg)
            )
            .slice(0, 8);
        
        console.log('Found suggestions:', suggestions); // Debug
        
        const suggestionsContainer = document.getElementById('packageSuggestions');
        console.log('Container found:', !!suggestionsContainer); // Debug
        
        if (!suggestionsContainer) {
            console.log('No suggestions container found!'); // Debug
            return;
        }
        
        if (suggestions.length === 0) {
            console.log('No suggestions, hiding'); // Debug
            this.hideSuggestions();
            return;
        }
        
        suggestionsContainer.innerHTML = suggestions.map(pkg => 
            `<div class="suggestion-item" onclick="app.selectSuggestion('${pkg}')">${pkg}</div>`
        ).join('');
        
        suggestionsContainer.style.display = 'block';
        console.log('Suggestions displayed'); // Debug
    }

    selectSuggestion(packageName) {
        const packageInput = document.getElementById('packageInput');
        const currentValue = packageInput.value;
        const lastComma = currentValue.lastIndexOf(',');
        
        if (lastComma >= 0) {
            packageInput.value = currentValue.substring(0, lastComma + 1) + ' ' + packageName;
        } else {
            packageInput.value = packageName;
        }
        
        this.hideSuggestions();
        packageInput.focus();
    }

    switchTheme() {
        const currentIndex = this.themes.indexOf(this.currentTheme);
        const nextIndex = (currentIndex + 1) % this.themes.length;
        this.currentTheme = this.themes[nextIndex];
        this.applyTheme();
        this.saveTheme();
    }

    applyTheme() {
        if (this.currentTheme === 'light') {
            document.body.removeAttribute('data-theme');
        } else {
            document.body.setAttribute('data-theme', this.currentTheme);
        }
        
        // Update chart colors for theme
        if (this.chart || this.cumulativeChart) {
            this.updateChartTheme();
        }
    }

    loadTheme() {
        const savedTheme = localStorage.getItem('r-analytics-theme') || 'light';
        // Handle legacy 'default' theme
        this.currentTheme = savedTheme === 'default' ? 'light' : savedTheme;
        this.applyTheme();
    }

    saveTheme() {
        localStorage.setItem('r-analytics-theme', this.currentTheme);
    }

    getThemeTextColor() {
        switch (this.currentTheme) {
            case 'dark':
                return '#e2e8f0';
            default:
                return '#333333';
        }
    }

    getThemeGridColor() {
        switch (this.currentTheme) {
            case 'dark':
                return '#4a5568';
            default:
                return '#e0e0e0';
        }
    }

    updateChartTheme() {
        // Force chart recreation with new theme colors if charts exist
        if (this.currentData && this.currentPeriod !== 'last-day') {
            this.createCharts(this.currentData, this.currentPeriod);
        }
    }

    downloadChart(chartType) {
        const chart = chartType === 'trends' ? this.chart : this.cumulativeChart;
        if (!chart) {
            alert('No chart available to download');
            return;
        }

        // Create download link
        const canvas = chart.canvas;
        const url = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `${chartType}-chart-${this.packages.join('-')}-${this.currentPeriod}.png`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    hideSuggestions() {
        const container = document.getElementById('packageSuggestions');
        if (container) {
            container.style.display = 'none';
        }
    }

    changePeriod(newPeriod) {
        // Update active button
        document.querySelectorAll('.period-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-period="${newPeriod}"]`).classList.add('active');
        
        this.currentPeriod = newPeriod;
        
        // Re-analyze with new period if we have packages
        if (this.packages.length > 0) {
            this.analyzePackages();
        }
    }

    addPackages() {
        const packageInput = document.getElementById('packageInput');
        const newPackages = packageInput.value.trim().split(',')
            .map(p => p.trim())
            .filter(p => p && !this.packages.includes(p));

        if (newPackages.length === 0) {
            this.showError('Please enter valid package name(s)');
            return;
        }

        // Add new packages to the list
        this.packages.push(...newPackages);
        packageInput.value = '';
        this.hideSuggestions();
        
        this.updatePackagesList();
        this.showPeriodSelector();
        this.analyzePackages();
    }

    removePackage(packageName) {
        this.packages = this.packages.filter(p => p !== packageName);
        this.updatePackagesList();
        
        if (this.packages.length > 0) {
            this.analyzePackages();
        } else {
            this.hideResults();
            this.hidePeriodSelector();
        }
    }

    showPeriodSelector() {
        document.getElementById('periodSelector').style.display = 'block';
    }

    hidePeriodSelector() {
        document.getElementById('periodSelector').style.display = 'none';
    }

    updatePackagesList() {
        const packagesList = document.getElementById('packagesList');
        packagesList.innerHTML = this.packages.map(pkg => `
            <div class="package-tag">
                ${pkg}
                <button class="remove-btn" onclick="app.removePackage('${pkg}')">&times;</button>
            </div>
        `).join('');
    }

    async analyzePackages() {
        if (this.packages.length === 0) return;

        this.showLoading(true);
        this.hideError();

        try {
            const [downloadDataArray, packageInfoArray] = await Promise.all([
                this.fetchDownloadData(this.packages, this.currentPeriod),
                Promise.all(this.packages.map(pkg => this.fetchPackageInfo(pkg)))
            ]);

            this.displayResults(downloadDataArray, packageInfoArray, this.currentPeriod);
        } catch (error) {
            this.showError(`Failed to fetch data: ${error.message}`);
        } finally {
            this.showLoading(false);
        }
    }

    async fetchDownloadData(packages, period) {
        const response = await fetch(`/api/downloads/${packages.join(',')}?period=${period}`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.json();
    }

    async fetchPackageInfo(packageName) {
        try {
            const response = await fetch(`/api/package/${packageName}`);
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.warn('Package info not available:', error);
        }
        return null;
    }

    displayResults(downloadDataArray, packageInfoArray, period) {
        // Update title
        const title = this.packages.length === 1 
            ? this.packages[0] 
            : `${this.packages.length} Packages Comparison`;
        document.getElementById('packageTitle').textContent = title;

        // Display package details
        this.displayPackageDetails(packageInfoArray);

        // Calculate and display combined statistics
        const combinedStats = this.calculateCombinedStats(downloadDataArray);
        this.displayStats(combinedStats);

        // Display individual package summaries
        this.displayPackageSummaries(downloadDataArray, packageInfoArray);

        // Store current data for chart updates
        this.currentData = downloadDataArray;

        // Show/hide chart section based on period
        this.updateChartVisibility(period);

        // Create charts if needed
        if (period !== 'last-day') {
            this.createCharts(downloadDataArray, period);
        }

        // Show results
        this.showResults();
    }

    displayPackageDetails(packageInfoArray) {
        const detailsElement = document.getElementById('packageDetails');
        
        if (packageInfoArray.length === 1 && packageInfoArray[0]) {
            const info = packageInfoArray[0];
            detailsElement.innerHTML = `
                <p><strong>Title:</strong> ${info.Title || 'N/A'}</p>
                <p><strong>Version:</strong> ${info.Version || 'N/A'}</p>
                <p><strong>Description:</strong> ${info.Description || 'N/A'}</p>
                <p><strong>Author:</strong> ${info.Author || 'N/A'}</p>
            `;
        } else {
            const validPackages = packageInfoArray.filter(info => info !== null);
            detailsElement.innerHTML = `
                <p><strong>Packages:</strong> ${this.packages.join(', ')}</p>
                <p><strong>Package info available for:</strong> ${validPackages.length} of ${this.packages.length} packages</p>
            `;
        }
    }

    calculateCombinedStats(downloadDataArray) {
        if (!downloadDataArray || downloadDataArray.length === 0) {
            return { total: 0, average: 0, peak: { day: 'N/A', downloads: 0 } };
        }

        let totalDownloads = 0;
        let totalDays = 0;
        let allDayData = [];

        downloadDataArray.forEach(packageData => {
            if (packageData.downloads && packageData.downloads.length > 0) {
                const packageTotal = packageData.downloads.reduce((sum, day) => sum + day.downloads, 0);
                totalDownloads += packageTotal;
                totalDays += packageData.downloads.length;
                
                // Find package peak
                const packagePeak = packageData.downloads.reduce((max, day) => 
                    day.downloads > max.downloads ? { ...day, package: packageData.package } : max, 
                    { ...packageData.downloads[0], package: packageData.package }
                );
                allDayData.push(packagePeak);
            }
        });

        const averageDays = downloadDataArray.length > 0 ? totalDays / downloadDataArray.length : 0;
        const average = averageDays > 0 ? Math.round(totalDownloads / averageDays) : 0;
        const peak = allDayData.length > 0 
            ? allDayData.reduce((max, day) => day.downloads > max.downloads ? day : max)
            : { day: 'N/A', downloads: 0, package: 'N/A' };

        return { total: totalDownloads, average, peak };
    }

    displayStats(stats) {
        document.getElementById('totalDownloads').textContent = stats.total.toLocaleString();
        document.getElementById('avgDaily').textContent = stats.average.toLocaleString();
        
        const peakText = stats.peak.package 
            ? `${stats.peak.downloads.toLocaleString()} (${stats.peak.package}, ${stats.peak.day})`
            : `${stats.peak.downloads.toLocaleString()} (${stats.peak.day})`;
        document.getElementById('peakDay').textContent = peakText;
    }

    displayPackageSummaries(downloadDataArray, packageInfoArray) {
        const summariesContainer = document.getElementById('packageSummaries');
        
        if (this.packages.length <= 1) {
            summariesContainer.innerHTML = '';
            return;
        }

        const summariesHtml = downloadDataArray.map((packageData, index) => {
            const packageInfo = packageInfoArray[index];
            const stats = this.calculateIndividualPackageStats(packageData);
            const color = this.colors[index % this.colors.length];

            return `
                <div class="package-summary">
                    <div class="package-summary-header" style="background: ${color};" onclick="app.togglePackageDetails('${packageData.package}')">
                        <span>
                            ${packageData.package}
                            ${packageInfo ? `- ${packageInfo.Title || ''}` : ''}
                        </span>
                        <span class="dropdown-arrow" id="arrow-${packageData.package}">▼</span>
                    </div>
                    <div class="package-summary-stats">
                        <div class="package-stat">
                            <h4>Total Downloads</h4>
                            <div class="package-stat-value">${stats.total.toLocaleString()}</div>
                        </div>
                        <div class="package-stat">
                            <h4>Average Daily</h4>
                            <div class="package-stat-value">${stats.average.toLocaleString()}</div>
                        </div>
                        <div class="package-stat">
                            <h4>Peak Downloads</h4>
                            <div class="package-stat-value">${stats.peak.downloads.toLocaleString()}</div>
                        </div>
                        <div class="package-stat">
                            <h4>Peak Date</h4>
                            <div class="package-stat-value">${stats.peak.day}</div>
                        </div>
                    </div>
                    <div class="package-details" id="details-${packageData.package}">
                        <div class="package-details-content">
                            ${this.generatePackageDetails(packageInfo, packageData)}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        summariesContainer.innerHTML = summariesHtml;
    }

    generatePackageDetails(packageInfo, packageData) {
        if (!packageInfo) {
            return `
                <div class="detail-item">
                    <div class="detail-label">Package Information</div>
                    <div class="detail-value">Package details not available from CRAN database.</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Package Name</div>
                    <div class="detail-value">${packageData.package}</div>
                </div>
            `;
        }

        return `
            ${packageInfo.Description ? `
                <div class="detail-item">
                    <div class="detail-label">Description</div>
                    <div class="detail-value">${packageInfo.Description}</div>
                </div>
            ` : ''}
            
            ${packageInfo.Version ? `
                <div class="detail-item">
                    <div class="detail-label">Version</div>
                    <div class="detail-value">${packageInfo.Version}</div>
                </div>
            ` : ''}
            
            ${packageInfo.Author ? `
                <div class="detail-item">
                    <div class="detail-label">Author(s)</div>
                    <div class="detail-value">${packageInfo.Author}</div>
                </div>
            ` : ''}
            
            ${packageInfo.Maintainer ? `
                <div class="detail-item">
                    <div class="detail-label">Maintainer</div>
                    <div class="detail-value">${packageInfo.Maintainer}</div>
                </div>
            ` : ''}
            
            ${packageInfo.License ? `
                <div class="detail-item">
                    <div class="detail-label">License</div>
                    <div class="detail-value">${packageInfo.License}</div>
                </div>
            ` : ''}
            
            ${packageInfo.URL ? `
                <div class="detail-item">
                    <div class="detail-label">URL</div>
                    <div class="detail-value"><a href="${packageInfo.URL}" target="_blank">${packageInfo.URL}</a></div>
                </div>
            ` : ''}
            
            ${packageInfo.BugReports ? `
                <div class="detail-item">
                    <div class="detail-label">Bug Reports</div>
                    <div class="detail-value"><a href="${packageInfo.BugReports}" target="_blank">${packageInfo.BugReports}</a></div>
                </div>
            ` : ''}
            
            ${packageInfo['Date/Publication'] ? `
                <div class="detail-item">
                    <div class="detail-label">Last Published</div>
                    <div class="detail-value">${new Date(packageInfo['Date/Publication']).toLocaleDateString()}</div>
                </div>
            ` : ''}
        `;
    }

    togglePackageDetails(packageName) {
        const detailsElement = document.getElementById(`details-${packageName}`);
        const arrowElement = document.getElementById(`arrow-${packageName}`);
        
        if (!detailsElement || !arrowElement) return;
        
        const isExpanded = detailsElement.classList.contains('expanded');
        
        if (isExpanded) {
            detailsElement.classList.remove('expanded');
            arrowElement.classList.remove('expanded');
        } else {
            detailsElement.classList.add('expanded');
            arrowElement.classList.add('expanded');
        }
    }

    calculateIndividualPackageStats(packageData) {
        if (!packageData.downloads || packageData.downloads.length === 0) {
            return { total: 0, average: 0, peak: { day: 'N/A', downloads: 0 } };
        }

        const downloads = packageData.downloads;
        const total = downloads.reduce((sum, day) => sum + day.downloads, 0);
        const average = Math.round(total / downloads.length);
        const peak = downloads.reduce((max, day) => 
            day.downloads > max.downloads ? day : max, downloads[0]);

        return { total, average, peak };
    }

    updateChartVisibility(period) {
        const chartSection = document.getElementById('chartSection');
        if (period === 'last-day') {
            chartSection.style.display = 'none';
        } else {
            chartSection.style.display = 'block';
        }
    }

    createCharts(downloadDataArray, period) {
        // Determine if we need to aggregate data for readability
        const shouldAggregate = period === 'last-year' || period === 'all-time';
        const aggregationType = period === 'all-time' ? 'monthly' : 'weekly';

        let processedData;
        if (shouldAggregate) {
            processedData = this.aggregateDataForChart(downloadDataArray, aggregationType);
        } else {
            processedData = this.prepareRawDataForChart(downloadDataArray);
        }

        this.createTrendsChart(processedData, period, shouldAggregate, aggregationType);
        this.createCumulativeChart(processedData, period, shouldAggregate, aggregationType);
        this.createCustomLegends();
    }

    createTrendsChart(processedData, period, shouldAggregate, aggregationType) {
        const ctx = document.getElementById('downloadsChart').getContext('2d');
        
        if (this.chart) {
            this.chart.destroy();
        }

        const datasets = processedData.datasets.map((dataset, index) => {
            const color = this.colors[index % this.colors.length];
            
            return {
                label: dataset.label,
                data: dataset.data,
                borderColor: color,
                backgroundColor: color + '20',
                borderWidth: 2,
                fill: false,
                tension: 0.4,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: color,
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            };
        });

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: processedData.labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: shouldAggregate ? (aggregationType === 'monthly' ? 'Month' : 'Week') : 'Date',
                            color: this.getThemeTextColor(),
                            font: {
                                size: 14,
                                weight: 'bold'
                            },
                            padding: {
                                top: 20
                            }
                        },
                        ticks: {
                            maxTicksLimit: shouldAggregate ? 12 : 20,
                            color: this.getThemeTextColor(),
                            font: {
                                size: 12
                            }
                        },
                        grid: {
                            color: this.getThemeGridColor()
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: shouldAggregate ? `${aggregationType === 'monthly' ? 'Monthly' : 'Weekly'} Downloads` : 'Daily Downloads',
                            color: this.getThemeTextColor(),
                            font: {
                                size: 14,
                                weight: 'bold'
                            },
                            padding: {
                                bottom: 20
                            }
                        },
                        ticks: {
                            color: this.getThemeTextColor(),
                            font: {
                                size: 12
                            }
                        },
                        grid: {
                            color: this.getThemeGridColor()
                        },
                        beginAtZero: true
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });
    }

    createCumulativeChart(processedData, period, shouldAggregate, aggregationType) {
        const ctx = document.getElementById('cumulativeChart').getContext('2d');
        
        if (this.cumulativeChart) {
            this.cumulativeChart.destroy();
        }

        const datasets = processedData.datasets.map((dataset, index) => {
            const color = this.colors[index % this.colors.length];
            const cumulativeData = this.calculateCumulativeData(dataset.data);
            
            return {
                label: dataset.label,
                data: cumulativeData,
                borderColor: color,
                backgroundColor: color + '10',
                borderWidth: 3,
                fill: false,
                tension: 0.4,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: color,
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            };
        });

        this.cumulativeChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: processedData.labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: shouldAggregate ? (aggregationType === 'monthly' ? 'Month' : 'Week') : 'Date',
                            color: this.getThemeTextColor(),
                            font: {
                                size: 14,
                                weight: 'bold'
                            },
                            padding: {
                                top: 20
                            }
                        },
                        ticks: {
                            maxTicksLimit: shouldAggregate ? 12 : 20,
                            color: this.getThemeTextColor(),
                            font: {
                                size: 12
                            }
                        },
                        grid: {
                            color: this.getThemeGridColor()
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Cumulative Downloads',
                            color: this.getThemeTextColor(),
                            font: {
                                size: 14,
                                weight: 'bold'
                            },
                            padding: {
                                bottom: 20
                            }
                        },
                        ticks: {
                            color: this.getThemeTextColor(),
                            font: {
                                size: 12
                            }
                        },
                        grid: {
                            color: this.getThemeGridColor()
                        },
                        beginAtZero: true
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });
    }

    createCustomLegends() {
        if (this.packages.length <= 1) return;
        
        const trendsLegend = document.getElementById('trendsLegend');
        const cumulativeLegend = document.getElementById('cumulativeLegend');
        
        if (!trendsLegend || !cumulativeLegend) return;
        
        const legendHtml = this.packages.map((packageName, index) => {
            const color = this.colors[index % this.colors.length];
            
            return `
                <div class="legend-item">
                    <div class="legend-color" style="background-color: ${color};"></div>
                    <span class="legend-label">${packageName}</span>
                </div>
            `;
        }).join('');
        
        trendsLegend.innerHTML = legendHtml;
        cumulativeLegend.innerHTML = legendHtml;
    }


    prepareRawDataForChart(downloadDataArray) {
        // Get all unique dates and sort them
        const allDates = new Set();
        downloadDataArray.forEach(packageData => {
            if (packageData.downloads) {
                packageData.downloads.forEach(day => allDates.add(day.day));
            }
        });
        const sortedDates = Array.from(allDates).sort();

        const datasets = downloadDataArray.map(packageData => {
            const data = sortedDates.map(date => {
                const dayData = packageData.downloads?.find(d => d.day === date);
                return dayData ? dayData.downloads : 0;
            });

            return {
                label: packageData.package,
                data: data
            };
        });

        return { labels: sortedDates, datasets };
    }

    aggregateDataForChart(downloadDataArray, aggregationType) {
        const aggregatedData = {};
        
        downloadDataArray.forEach(packageData => {
            if (!packageData.downloads) return;
            
            const packageAggregation = {};
            
            packageData.downloads.forEach(day => {
                const date = new Date(day.day);
                let periodKey;
                
                if (aggregationType === 'monthly') {
                    periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                } else { // weekly
                    const weekStart = new Date(date);
                    weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
                    periodKey = weekStart.toISOString().split('T')[0];
                }
                
                if (!packageAggregation[periodKey]) {
                    packageAggregation[periodKey] = 0;
                }
                packageAggregation[periodKey] += day.downloads;
            });
            
            aggregatedData[packageData.package] = packageAggregation;
        });

        // Get all periods and sort them
        const allPeriods = new Set();
        Object.values(aggregatedData).forEach(packageData => {
            Object.keys(packageData).forEach(period => allPeriods.add(period));
        });
        const sortedPeriods = Array.from(allPeriods).sort();

        // Create datasets
        const datasets = Object.keys(aggregatedData).map(packageName => {
            const data = sortedPeriods.map(period => {
                return aggregatedData[packageName][period] || 0;
            });

            return {
                label: packageName,
                data: data
            };
        });

        // Format labels for display
        const formattedLabels = sortedPeriods.map(period => {
            if (aggregationType === 'monthly') {
                const [year, month] = period.split('-');
                return new Date(year, month - 1).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
            } else {
                return new Date(period).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }
        });

        return { labels: formattedLabels, datasets };
    }

    calculateCumulativeData(data) {
        let cumulative = 0;
        return data.map(value => {
            cumulative += value;
            return cumulative;
        });
    }

    getPeriodLabel(period) {
        const labels = {
            'last-day': 'Last Day',
            'last-week': 'Last Week',
            'last-month': 'Last Month',
            'last-year': 'Last Year',
            'all-time': 'All Time'
        };
        return labels[period] || period;
    }

    showLoading(show) {
        const loadingElement = document.getElementById('loadingIndicator');
        if (show) {
            loadingElement.classList.remove('hidden');
        } else {
            loadingElement.classList.add('hidden');
        }
    }

    showResults() {
        document.getElementById('results').classList.remove('hidden');
    }

    hideResults() {
        document.getElementById('results').classList.add('hidden');
    }

    showError(message) {
        const errorElement = document.getElementById('error');
        const errorMessage = document.getElementById('errorMessage');
        errorMessage.textContent = message;
        errorElement.classList.remove('hidden');
    }

    hideError() {
        document.getElementById('error').classList.add('hidden');
    }
}

// Initialize the application and make it globally accessible
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new RPackageAnalytics();
});