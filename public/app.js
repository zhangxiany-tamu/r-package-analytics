class RPackageAnalytics {
    constructor() {
        this.chart = null;
        this.cumulativeChart = null;
        this.packages = [];
        this.currentData = null;
        this.currentPeriod = 'last-month';
        this.currentTheme = 'light';
        this.themes = ['light', 'dark'];
        // Apple System Colors - simplified and clean
        this.colors = [
            '#007AFF', // Blue
            '#AF52DE', // Purple  
            '#FF3B30', // Red
            '#FF9500', // Orange
            '#FFCC02', // Yellow
            '#34C759', // Green
            '#5AC8FA', // Light Blue
            '#FF2D92', // Pink
            '#5856D6', // Indigo
            '#A2845E', // Brown
            '#8E8E93', // Gray
            '#FF6482'  // Light Pink
        ];
        
        // Search debounce timer
        this.searchTimeout = null;
        this.justSelected = false; // Flag to prevent dropdown from showing after selection
        
        // Forecasting settings
        this.showPredictions = false;
        this.forecastPeriods = 30; // Number of future periods to predict
        
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
        packageInput.addEventListener('blur', (e) => {
            // Don't hide if clicking on a suggestion
            if (!e.relatedTarget || !e.relatedTarget.closest('.package-suggestions')) {
                // Delay hiding to allow clicking on suggestions
                this.blurTimeout = setTimeout(() => this.hideSuggestions(), 150);
            }
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
        
        // Prediction toggle
        const predictionToggle = document.getElementById('predictionToggle');
        if (predictionToggle) {
            predictionToggle.addEventListener('change', (e) => this.togglePredictions(e.target.checked));
        }
        
        // Load saved theme
        this.loadTheme();
        
        // Initialize keyword search functionality
        this.initializeKeywordSearch();
        
        // Initialize author search functionality
        this.initializeAuthorSearch();
        
        // Initialize statistics functionality
        this.initializeStatistics();
        
        // Initialize tab navigation
        this.initializeTabNavigation();
    }

    handleInputChange(e) {
        // Don't show suggestions if we just selected one
        if (this.justSelected) {
            return;
        }
        
        // Clear blur timeout if input is active
        if (this.blurTimeout) {
            clearTimeout(this.blurTimeout);
            this.blurTimeout = null;
        }
        
        const query = e.target.value.trim();
        const lastComma = query.lastIndexOf(',');
        const currentInput = lastComma >= 0 ? query.substring(lastComma + 1).trim() : query;
        
        // Clear previous timeout
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
        
        if (currentInput.length >= 2) {
            // Show loading immediately to prevent flicker
            this.showSearchLoading();
            // Debounce search requests
            this.searchTimeout = setTimeout(() => {
                this.searchPackages(currentInput, lastComma);
            }, 300);
        } else {
            this.hideSuggestions();
        }
    }

    async searchPackages(query, lastCommaIndex) {
        try {
            const response = await fetch(`/api/search/${encodeURIComponent(query)}?limit=8`);
            
            if (!response.ok) {
                console.error('Search request failed:', response.status);
                this.hideSuggestions();
                return;
            }
            
            const suggestions = await response.json();
            
            // Filter out packages already added
            const filteredSuggestions = suggestions.filter(pkg => !this.packages.includes(pkg));
            
            this.showSuggestions(filteredSuggestions, lastCommaIndex);
        } catch (error) {
            console.error('Error searching packages:', error);
            this.hideSuggestions();
        }
    }

    showSearchLoading() {
        const suggestionsContainer = document.getElementById('packageSuggestions');
        
        if (!suggestionsContainer) {
            return;
        }
        
        // Only show loading if not already visible to prevent flicker
        if (suggestionsContainer.style.display !== 'block') {
            suggestionsContainer.innerHTML = '<div class="search-loading">Searching packages...</div>';
            suggestionsContainer.style.display = 'block';
        } else {
            // Just update content if already visible
            suggestionsContainer.innerHTML = '<div class="search-loading">Searching packages...</div>';
        }
    }

    showSuggestions(suggestions, lastCommaIndex) {
        const suggestionsContainer = document.getElementById('packageSuggestions');
        
        if (!suggestionsContainer) {
            return;
        }
        
        if (suggestions.length === 0) {
            this.hideSuggestions();
            return;
        }
        
        suggestionsContainer.innerHTML = suggestions.map(pkg => 
            `<div class="suggestion-item" onclick="app.selectSuggestion('${pkg}')">${pkg}</div>`
        ).join('');
        
        suggestionsContainer.style.display = 'block';
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
        
        // Clear any pending search timeout to prevent suggestions from showing
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = null;
        }
        
        // Use a flag to prevent immediate re-triggering of suggestions
        this.justSelected = true;
        packageInput.focus();
        
        // Reset the flag after a short delay
        setTimeout(() => {
            this.justSelected = false;
        }, 100);
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
                return '#ffffff';
            default:
                return '#1d1d1f';
        }
    }

    getThemeGridColor() {
        switch (this.currentTheme) {
            case 'dark':
                return '#38383a';
            default:
                return '#d2d2d7';
        }
    }

    getAppleColors() {
        // Apple System Colors optimized for current theme
        switch (this.currentTheme) {
            case 'dark':
                return [
                    '#0A84FF', // Blue (dark mode)
                    '#BF5AF2', // Purple (dark mode)
                    '#FF453A', // Red (dark mode)
                    '#FF9F0A', // Orange (dark mode)
                    '#FFD60A', // Yellow (dark mode)
                    '#32D74B', // Green (dark mode)
                    '#64D2FF', // Light Blue (dark mode)
                    '#FF2D92', // Pink (dark mode)
                    '#5E5CE6', // Indigo (dark mode)
                    '#AC8E68', // Brown (dark mode)
                    '#8E8E93', // Gray (dark mode)
                    '#FF6482'  // Light Pink (dark mode)
                ];
            default:
                return this.colors; // Use the light mode colors defined in constructor
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
        // Clear any pending blur timeout
        if (this.blurTimeout) {
            clearTimeout(this.blurTimeout);
            this.blurTimeout = null;
        }
        
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
        const response = await fetch(`/api/downloads/${packages.join(',')}?period=${period}&includeTotals=true`);
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
            return { 
                total: 0, 
                average: 0, 
                peak: { day: 'N/A', downloads: 0 },
                allTimeTotal: 0 
            };
        }

        let totalDownloads = 0;
        let totalDays = 0;
        let allDayData = [];
        let allTimeTotal = 0;

        downloadDataArray.forEach(packageData => {
            if (packageData.downloads && packageData.downloads.length > 0) {
                const packageTotal = packageData.downloads.reduce((sum, day) => sum + day.downloads, 0);
                totalDownloads += packageTotal;
                totalDays += packageData.downloads.length;
                
                // Add all-time total if available
                if (packageData.totalDownloads && packageData.totalDownloads.total) {
                    allTimeTotal += packageData.totalDownloads.total;
                }
                
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

        return { 
            total: totalDownloads, 
            average, 
            peak,
            allTimeTotal: allTimeTotal 
        };
    }

    displayStats(stats) {
        document.getElementById('totalDownloads').textContent = stats.total.toLocaleString();
        document.getElementById('avgDaily').textContent = stats.average.toLocaleString();
        
        // Display all-time total if available
        const allTimeTotalElement = document.getElementById('allTimeTotal');
        if (allTimeTotalElement) {
            allTimeTotalElement.textContent = stats.allTimeTotal > 0 ? stats.allTimeTotal.toLocaleString() : '-';
        }
        
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
            const colors = this.getAppleColors();
            const color = colors[index % colors.length];

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

        // Prepare datasets with optional forecasting
        const datasets = [];
        const extendedLabels = [...processedData.labels];
        
        processedData.datasets.forEach((dataset, index) => {
            const colors = this.getAppleColors();
            const color = colors[index % colors.length];
            
            // Historical data
            const historicalDataset = {
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
            
            datasets.push(historicalDataset);
            
            // Add forecasting if enabled
            if (this.showPredictions && dataset.data.length >= 7) {
                // Adjust forecast periods based on the time range
                let forecastPeriods = this.forecastPeriods;
                if (shouldAggregate) {
                    forecastPeriods = aggregationType === 'monthly' ? 6 : 12; // 6 months or 12 weeks
                } else {
                    forecastPeriods = Math.min(30, Math.floor(dataset.data.length * 0.3)); // 30 days max, or 30% of data length
                }
                
                const forecasts = this.forecastWithSeasonality(dataset.data, forecastPeriods);
                
                if (forecasts.length > 0) {
                    // Generate future labels
                    if (index === 0) { // Only generate labels once
                        for (let i = 1; i <= forecasts.length; i++) {
                            let label;
                            if (shouldAggregate) {
                                if (aggregationType === 'monthly') {
                                    label = `Forecast +${i}M`;
                                } else {
                                    label = `Forecast +${i}W`;
                                }
                            } else {
                                label = `+${i}d`;
                            }
                            extendedLabels.push(label);
                        }
                    }
                    
                    // Create connector and forecast data
                    // Connect last historical point to first forecast point
                    const lastHistoricalValue = dataset.data[dataset.data.length - 1];
                    const connectorAndForecastData = [
                        ...new Array(dataset.data.length - 1).fill(null),
                        lastHistoricalValue, // Last historical point
                        ...forecasts // All forecast points
                    ];
                    
                    // Forecast dataset with connector
                    const forecastDataset = {
                        label: `${dataset.label} (Predicted)`,
                        data: connectorAndForecastData,
                        borderColor: color,
                        backgroundColor: color + '10',
                        borderWidth: 2,
                        borderDash: [5, 5], // Dashed line for predictions
                        fill: false,
                        tension: 0.4,
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        pointBackgroundColor: color,
                        pointBorderColor: '#fff',
                        pointBorderWidth: 1
                    };
                    
                    datasets.push(forecastDataset);
                }
            }
        });

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: extendedLabels,
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

        // Prepare datasets with optional forecasting
        const datasets = [];
        const extendedLabels = [...processedData.labels];
        
        processedData.datasets.forEach((dataset, index) => {
            const colors = this.getAppleColors();
            const color = colors[index % colors.length];
            const cumulativeData = this.calculateCumulativeData(dataset.data);
            
            // Historical cumulative data
            const historicalDataset = {
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
            
            datasets.push(historicalDataset);
            
            // Add forecasting if enabled
            if (this.showPredictions && dataset.data.length >= 7) {
                // Adjust forecast periods based on the time range
                let forecastPeriods = this.forecastPeriods;
                if (shouldAggregate) {
                    forecastPeriods = aggregationType === 'monthly' ? 6 : 12; // 6 months or 12 weeks
                } else {
                    forecastPeriods = Math.min(30, Math.floor(dataset.data.length * 0.3)); // 30 days max, or 30% of data length
                }
                
                const forecasts = this.forecastWithSeasonality(dataset.data, forecastPeriods);
                
                if (forecasts.length > 0) {
                    // Generate future labels (only once)
                    if (index === 0) {
                        for (let i = 1; i <= forecasts.length; i++) {
                            let label;
                            if (shouldAggregate) {
                                if (aggregationType === 'monthly') {
                                    label = `Forecast +${i}M`;
                                } else {
                                    label = `Forecast +${i}W`;
                                }
                            } else {
                                label = `+${i}d`;
                            }
                            extendedLabels.push(label);
                        }
                    }
                    
                    // Calculate cumulative forecast data
                    const lastCumulativeValue = cumulativeData[cumulativeData.length - 1];
                    const cumulativeForecasts = [];
                    let runningTotal = lastCumulativeValue;
                    
                    forecasts.forEach(forecast => {
                        runningTotal += forecast;
                        cumulativeForecasts.push(runningTotal);
                    });
                    
                    // Create connector and forecast data for cumulative chart
                    const connectorAndCumulativeForecastData = [
                        ...new Array(cumulativeData.length - 1).fill(null),
                        lastCumulativeValue, // Last historical cumulative value
                        ...cumulativeForecasts // All cumulative forecast points
                    ];
                    
                    // Cumulative forecast dataset
                    const cumulativeForecastDataset = {
                        label: `${dataset.label} (Predicted)`,
                        data: connectorAndCumulativeForecastData,
                        borderColor: color,
                        backgroundColor: color + '05',
                        borderWidth: 3,
                        borderDash: [5, 5], // Dashed line for predictions
                        fill: false,
                        tension: 0.4,
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        pointBackgroundColor: color,
                        pointBorderColor: '#fff',
                        pointBorderWidth: 1
                    };
                    
                    datasets.push(cumulativeForecastDataset);
                }
            }
        });

        this.cumulativeChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: extendedLabels,
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
        const trendsLegend = document.getElementById('trendsLegend');
        const cumulativeLegend = document.getElementById('cumulativeLegend');
        
        if (!trendsLegend || !cumulativeLegend) return;
        
        // Always update legends to reflect current packages, including when packages are removed
        let legendHtml = this.packages.map((packageName, index) => {
            const colors = this.getAppleColors();
            const color = colors[index % colors.length];
            
            let items = `
                <div class="legend-item">
                    <div class="legend-color" style="background-color: ${color};"></div>
                    <span class="legend-label">${packageName}</span>
                </div>
            `;
            
            // Add prediction legend if enabled
            if (this.showPredictions) {
                items += `
                    <div class="legend-item prediction-legend">
                        <div class="legend-color prediction-color" style="background-color: ${color}; border: 2px dashed ${color}; background: transparent;"></div>
                        <span class="legend-label">${packageName} (Predicted)</span>
                    </div>
                `;
            }
            
            return items;
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

    // Simple time series forecasting using exponential smoothing
    forecastTimeSeries(data, periods = 30) {
        if (!data || data.length < 7) {
            return []; // Need at least a week of data
        }
        
        // Simple exponential smoothing with trend (Holt's method)
        const alpha = 0.3; // Smoothing parameter for level
        const beta = 0.1;  // Smoothing parameter for trend
        
        let level = data[0];
        let trend = 0;
        
        // Calculate initial trend
        if (data.length >= 2) {
            trend = data[1] - data[0];
        }
        
        // Apply exponential smoothing
        for (let i = 1; i < data.length; i++) {
            const newLevel = alpha * data[i] + (1 - alpha) * (level + trend);
            const newTrend = beta * (newLevel - level) + (1 - beta) * trend;
            
            level = newLevel;
            trend = newTrend;
        }
        
        // Generate forecasts
        const forecasts = [];
        for (let i = 0; i < periods; i++) {
            const forecast = Math.max(0, level + (i + 1) * trend);
            forecasts.push(Math.round(forecast));
        }
        
        return forecasts;
    }

    // Enhanced forecasting with seasonality detection
    forecastWithSeasonality(data, periods = 30) {
        if (!data || data.length < 14) {
            return this.forecastTimeSeries(data, periods);
        }
        
        // Detect weekly seasonality (7-day cycle)
        const seasonLength = 7;
        let seasonalFactors = [];
        
        if (data.length >= seasonLength * 2) {
            // Calculate seasonal factors
            seasonalFactors = new Array(seasonLength).fill(0);
            const seasonCounts = new Array(seasonLength).fill(0);
            
            for (let i = 0; i < data.length; i++) {
                const seasonIndex = i % seasonLength;
                seasonalFactors[seasonIndex] += data[i];
                seasonCounts[seasonIndex]++;
            }
            
            // Average and normalize seasonal factors
            const overallMean = data.reduce((a, b) => a + b, 0) / data.length;
            seasonalFactors = seasonalFactors.map((sum, i) => {
                const avg = seasonCounts[i] > 0 ? sum / seasonCounts[i] : overallMean;
                return avg / overallMean;
            });
        }
        
        // Apply basic trend forecasting
        const baseForecast = this.forecastTimeSeries(data, periods);
        
        // Apply seasonal adjustments if we have seasonal factors
        if (seasonalFactors.length > 0) {
            return baseForecast.map((value, i) => {
                const seasonIndex = (data.length + i) % seasonLength;
                const seasonalFactor = seasonalFactors[seasonIndex] || 1;
                return Math.max(0, Math.round(value * seasonalFactor));
            });
        }
        
        return baseForecast;
    }

    togglePredictions(show) {
        this.showPredictions = show;
        
        // Update charts if we have data
        if (this.currentData && this.currentPeriod !== 'last-day') {
            this.createCharts(this.currentData, this.currentPeriod);
        }
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

    // Keyword search functionality
    initializeKeywordSearch() {
        const keywordInput = document.getElementById('keywordInput');
        const recommendBtn = document.getElementById('recommendBtn');
        
        if (keywordInput && recommendBtn) {
            recommendBtn.addEventListener('click', () => this.searchByKeywords());
            keywordInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.searchByKeywords();
                }
            });
        }
    }

    async searchByKeywords() {
        const keywordInput = document.getElementById('keywordInput');
        const keywords = keywordInput.value.trim();

        if (!keywords || keywords.length < 2) {
            this.showError('Please enter at least 2 characters for keyword search');
            return;
        }

        this.showKeywordLoading(true);
        this.hideKeywordResults();
        this.hideError();

        try {
            const response = await fetch(`/api/recommend/${encodeURIComponent(keywords)}?limit=20`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const recommendations = await response.json();
            this.displayKeywordResults(recommendations, keywords);
        } catch (error) {
            this.showError(`Keyword search failed: ${error.message}`);
        } finally {
            this.showKeywordLoading(false);
        }
    }

    displayKeywordResults(recommendations, keywords) {
        const resultsContainer = document.getElementById('recommendationResults');
        
        if (!recommendations || recommendations.length === 0) {
            resultsContainer.innerHTML = `
                <div class="recommendation-header">
                    <span>No packages found for "${keywords}"</span>
                    <span class="recommendation-count">0 results</span>
                </div>
                <div class="recommendation-list">
                    <div style="padding: var(--space-6); text-align: center; color: var(--text-secondary);">
                        <p>Try different keywords or check your spelling.</p>
                        <p>Examples: "machine learning", "time series", "data visualization"</p>
                    </div>
                </div>
            `;
            resultsContainer.classList.remove('hidden');
            return;
        }

        const resultHtml = `
            <div class="recommendation-header">
                <span>Recommended packages for "${keywords}"</span>
                <span class="recommendation-count">${recommendations.length} results</span>
            </div>
            <div class="recommendation-list">
                ${recommendations.map(item => this.createRecommendationItem(item)).join('')}
            </div>
        `;

        resultsContainer.innerHTML = resultHtml;
        resultsContainer.classList.remove('hidden');
    }

    createRecommendationItem(item) {
        const hasPopularity = item.popularity !== undefined && item.popularity > 0;
        const popularityText = hasPopularity ? `${item.popularity.toLocaleString()} yearly downloads` : '';
        const matchReasonsHtml = item.matchReasons?.map(reason => 
            `<span class="match-reason">${reason}</span>`
        ).join('') || '';

        return `
            <div class="recommendation-item" onclick="app.addPackageFromRecommendation('${item.package}')">
                <div class="recommendation-item-header">
                    <div>
                        <div class="recommendation-package-name">${item.package}</div>
                        ${item.version ? `<div class="recommendation-package-version">v${item.version}</div>` : ''}
                    </div>
                    <div class="recommendation-score">
                        <div class="recommendation-score-value">Score: ${item.score}</div>
                        ${hasPopularity ? `<div class="recommendation-popularity">📈 ${popularityText}</div>` : ''}
                    </div>
                </div>
                ${item.title ? `<div class="recommendation-title">${item.title}</div>` : ''}
                ${matchReasonsHtml ? `
                    <div class="recommendation-matches">
                        ${matchReasonsHtml}
                    </div>
                ` : ''}
                <button class="add-package-btn" onclick="event.stopPropagation(); app.addPackageFromRecommendation('${item.package}')">
                    Add to Analysis
                </button>
            </div>
        `;
    }

    addPackageFromRecommendation(packageName) {
        const packageInput = document.getElementById('packageInput');
        
        // Check if package is already added
        if (this.packages.includes(packageName)) {
            this.showError(`Package "${packageName}" is already in your analysis`);
            return;
        }

        // Add the package to the current input
        const currentValue = packageInput.value.trim();
        if (currentValue && !currentValue.endsWith(',')) {
            packageInput.value = currentValue + ', ' + packageName;
        } else {
            packageInput.value = currentValue + packageName;
        }

        // Trigger the add packages functionality
        this.addPackages();
        
        // Show success message
        this.showTemporaryMessage(`Added "${packageName}" to analysis`, 'success');
    }

    showKeywordLoading(show) {
        const loadingElement = document.getElementById('keywordLoadingIndicator');
        if (loadingElement) {
            if (show) {
                loadingElement.classList.remove('hidden');
            } else {
                loadingElement.classList.add('hidden');
            }
        }
    }

    hideKeywordResults() {
        const resultsContainer = document.getElementById('recommendationResults');
        if (resultsContainer) {
            resultsContainer.classList.add('hidden');
        }
    }

    // Author Search Functions
    initializeAuthorSearch() {
        const authorInput = document.getElementById('authorInput');
        const authorSearchBtn = document.getElementById('authorSearchBtn');
        
        if (authorInput && authorSearchBtn) {
            authorSearchBtn.addEventListener('click', () => this.searchByAuthor());
            authorInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.searchByAuthor();
                }
            });
        }
    }

    async searchByAuthor() {
        const authorInput = document.getElementById('authorInput');
        const authorName = authorInput.value.trim();

        if (!authorName || authorName.length < 2) {
            this.showError('Please enter at least 2 characters for author search');
            return;
        }

        this.showAuthorLoading(true);
        this.hideAuthorResults();
        this.hideError();

        try {
            const response = await fetch(`/api/author/${encodeURIComponent(authorName)}?limit=20`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const authorResults = await response.json();
            this.displayAuthorResults(authorResults, authorName);
        } catch (error) {
            this.showError(`Failed to search by author: ${error.message}`);
        } finally {
            this.showAuthorLoading(false);
        }
    }

    displayAuthorResults(authorResults, authorName) {
        const resultsContainer = document.getElementById('authorResults');
        if (!resultsContainer) return;

        if (authorResults.length === 0) {
            resultsContainer.innerHTML = `
                <div class="author-header">
                    <span>No packages found for "${authorName}"</span>
                </div>
            `;
            resultsContainer.classList.remove('hidden');
            return;
        }

        const resultHtml = `
            <div class="author-header">
                <span>Packages by "${authorName}"</span>
                <span class="author-count">${authorResults.length}</span>
            </div>
            <div class="author-list">
                ${authorResults.map(item => this.createAuthorItem(item)).join('')}
            </div>
        `;

        resultsContainer.innerHTML = resultHtml;
        resultsContainer.classList.remove('hidden');
    }

    createAuthorItem(item) {
        const matchReasonsHtml = item.matchReasons?.map(reason => 
            `<span class="match-reason">${reason}</span>`
        ).join('') || '';

        // Truncate long author/maintainer fields for display
        const authorField = item.author ? item.author.substring(0, 200) + (item.author.length > 200 ? '...' : '') : '';
        const maintainerField = item.maintainer ? item.maintainer.substring(0, 100) + (item.maintainer.length > 100 ? '...' : '') : '';

        return `
            <div class="author-item" onclick="app.addPackageFromAuthor('${item.package}')">
                <div class="author-item-header">
                    <div>
                        <div class="author-package-name">${item.package}</div>
                        ${item.version ? `<div class="author-package-version">v${item.version}</div>` : ''}
                    </div>
                    <div class="author-score">
                        <div class="author-score-value">Score: ${item.score}</div>
                    </div>
                </div>
                
                ${item.title ? `<div class="author-title">${item.title}</div>` : ''}
                
                <div class="author-meta">
                    ${authorField ? `<div class="author-field"><strong>Authors:</strong> ${authorField}</div>` : ''}
                    ${maintainerField ? `<div class="author-field"><strong>Maintainer:</strong> ${maintainerField}</div>` : ''}
                </div>
                
                ${matchReasonsHtml ? `<div class="author-match-reasons">${matchReasonsHtml}</div>` : ''}
                
                <button class="add-package-btn" onclick="event.stopPropagation(); app.addPackageFromAuthor('${item.package}')">
                    Add Package
                </button>
            </div>
        `;
    }

    addPackageFromAuthor(packageName) {
        // Switch to the search tab and add the package
        this.switchTab('search');
        
        // Add the package to the search input
        const packageInput = document.getElementById('packageInput');
        if (packageInput) {
            const currentValue = packageInput.value.trim();
            if (currentValue && !currentValue.split(',').map(p => p.trim()).includes(packageName)) {
                packageInput.value = currentValue + ', ' + packageName;
            } else if (!currentValue) {
                packageInput.value = packageName;
            }
        }
        
        // Add to packages array and search
        if (!this.packages.includes(packageName)) {
            this.packages.push(packageName);
            this.searchData();
        }
        
        // Show temporary success message
        this.showTemporaryMessage(`Added "${packageName}" to analysis`, 'success');
    }

    showAuthorLoading(show) {
        const loadingElement = document.getElementById('authorLoadingIndicator');
        if (loadingElement) {
            if (show) {
                loadingElement.classList.remove('hidden');
            } else {
                loadingElement.classList.add('hidden');
            }
        }
    }

    hideAuthorResults() {
        const resultsContainer = document.getElementById('authorResults');
        if (resultsContainer) {
            resultsContainer.classList.add('hidden');
        }
    }

    // Statistics Functions
    initializeStatistics() {
        const loadTopPackagesBtn = document.getElementById('loadTopPackagesBtn');
        
        if (loadTopPackagesBtn) {
            loadTopPackagesBtn.addEventListener('click', () => this.loadTopPackages());
        }
        
        // Update the author coverage stat
        this.updateAuthorCoverage();
    }

    async loadTopPackages() {
        const button = document.getElementById('loadTopPackagesBtn');
        const loading = document.getElementById('topPackagesLoading');
        const list = document.getElementById('topPackagesList');
        
        // Show loading
        if (button) button.classList.add('hidden');
        if (loading) loading.classList.remove('hidden');
        if (list) list.classList.add('hidden');
        
        try {
            // Get top packages based on known popular packages
            const topPackages = [
                'ggplot2', 'dplyr', 'tidyverse', 'shiny', 'devtools',
                'knitr', 'rmarkdown', 'data.table', 'lubridate', 'stringr',
                'readr', 'tidyr', 'purrr', 'plotly', 'DT'
            ];
            
            // Fetch download data for these packages
            const response = await fetch(`/api/downloads/${topPackages.join(',')}?period=last-year&includeTotals=true`);
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            
            const downloadData = await response.json();
            
            // Sort by total downloads
            const sortedPackages = downloadData
                .filter(pkg => pkg.totalDownloads && pkg.totalDownloads.total)
                .sort((a, b) => b.totalDownloads.total - a.totalDownloads.total)
                .slice(0, 10);
            
            this.displayTopPackages(sortedPackages);
            
        } catch (error) {
            this.showError(`Failed to load top packages: ${error.message}`);
        } finally {
            if (loading) loading.classList.add('hidden');
        }
    }

    displayTopPackages(packages) {
        const list = document.getElementById('topPackagesList');
        if (!list) return;
        
        const html = packages.map((pkg, index) => {
            const downloads = pkg.totalDownloads?.total || 0;
            const formattedDownloads = this.formatNumber(downloads);
            
            return `
                <div class="top-package-item" onclick="app.addPackageFromStats('${pkg.package}')">
                    <div class="package-rank">${index + 1}</div>
                    <div class="package-name-stats">${pkg.package}</div>
                    <div class="package-downloads">${formattedDownloads} downloads</div>
                </div>
            `;
        }).join('');
        
        list.innerHTML = html;
        list.classList.remove('hidden');
    }


    updateAuthorCoverage() {
        // This would be updated from server data
        const authorsCoveredElement = document.getElementById('authorsCovered');
        if (authorsCoveredElement) {
            // Will be updated with real data later
            authorsCoveredElement.textContent = '13,250+';
        }
    }

    addPackageFromStats(packageName) {
        // Switch to the search tab and add the package
        this.switchTab('search');
        
        const packageInput = document.getElementById('packageInput');
        
        // Check if package is already added
        if (this.packages.includes(packageName)) {
            this.showError(`Package "${packageName}" is already in your analysis`);
            return;
        }

        // Add the package to the current input
        const currentValue = packageInput.value.trim();
        if (currentValue && !currentValue.endsWith(',')) {
            packageInput.value = currentValue + ', ' + packageName;
        } else {
            packageInput.value = currentValue + packageName;
        }

        // Trigger the add packages functionality
        this.addPackages();
        
        // Show success message
        this.showTemporaryMessage(`Added "${packageName}" to analysis`, 'success');
    }

    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }

    showTemporaryMessage(message, type = 'info') {
        // Create or update a temporary message element
        let messageElement = document.getElementById('tempMessage');
        if (!messageElement) {
            messageElement = document.createElement('div');
            messageElement.id = 'tempMessage';
            messageElement.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 12px 20px;
                border-radius: 8px;
                color: white;
                font-weight: 500;
                z-index: 1000;
                opacity: 0;
                transition: opacity 0.3s ease;
                max-width: 300px;
            `;
            document.body.appendChild(messageElement);
        }

        // Set background color based on type
        const colors = {
            success: '#34c759',
            error: '#ff3b30',
            info: '#007aff'
        };
        
        messageElement.style.backgroundColor = colors[type] || colors.info;
        messageElement.textContent = message;
        messageElement.style.opacity = '1';

        // Auto-hide after 3 seconds
        setTimeout(() => {
            messageElement.style.opacity = '0';
            setTimeout(() => {
                if (messageElement.parentNode) {
                    messageElement.parentNode.removeChild(messageElement);
                }
            }, 300);
        }, 3000);
    }

    // Tab navigation functionality
    initializeTabNavigation() {
        const navTabs = document.querySelectorAll('.nav-tab');
        
        navTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const targetTab = e.currentTarget.dataset.tab;
                this.switchTab(targetTab);
            });
        });
    }

    switchTab(targetTab) {
        // Update nav tabs
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${targetTab}"]`).classList.add('active');

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${targetTab}-tab`).classList.add('active');

        // Clear any existing results when switching tabs
        if (targetTab === 'search') {
            this.hideKeywordResults();
            this.hideAuthorResults();
        } else if (targetTab === 'discover') {
            this.hideResults();
            this.hideAuthorResults();
        } else if (targetTab === 'author') {
            this.hideResults();
            this.hideKeywordResults();
        } else if (targetTab === 'stats') {
            this.hideResults();
            this.hideKeywordResults();
            this.hideAuthorResults();
        }
    }
}

// Initialize the application and make it globally accessible
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new RPackageAnalytics();
});