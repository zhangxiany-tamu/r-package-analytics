class BioconductorAnalytics {
    constructor() {
        this.chart = null;
        this.cumulativeChart = null;
        this.packages = [];
        this.currentData = null;
        this.currentPeriod = 'last-year';
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
        this.justSelected = false;
        
        this.initializeEventListeners();
        this.initializeNavigation();
        this.initializeTheme();
    }

    initializeEventListeners() {
        // Tab switching
        const tabButtons = document.querySelectorAll('.nav-tab');
        tabButtons.forEach(button => {
            button.addEventListener('click', (e) => this.switchTab(e.target.closest('.nav-tab').dataset.tab));
        });

        // Search functionality  
        const searchBtn = document.getElementById('biocSearchBtn');
        const packageInput = document.getElementById('biocPackageInput');
        
        if (searchBtn && packageInput) {
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
        }
        
        // Hide suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.input-container')) {
                this.hideSuggestions();
            }
        });

        // Category buttons
        const categoryButtons = document.querySelectorAll('.category-btn');
        categoryButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const category = e.target.dataset.category;
                this.browseCategory(category);
            });
        });

        // Research area cards
        const researchCards = document.querySelectorAll('.research-area-card');
        researchCards.forEach(card => {
            card.addEventListener('click', (e) => {
                const area = e.currentTarget.dataset.area;
                this.browseResearchArea(area);
            });
        });


        // Period selector
        const periodButtons = document.querySelectorAll('#biocPeriodSelector .period-btn');
        periodButtons.forEach(button => {
            button.addEventListener('click', (e) => this.changePeriod(e.target.dataset.period));
        });

        // Theme toggle
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }

        // Keyword search functionality
        const keywordInput = document.getElementById('biocKeywordInput');
        const recommendBtn = document.getElementById('biocRecommendBtn');
        
        if (keywordInput && recommendBtn) {
            recommendBtn.addEventListener('click', () => this.searchByKeywords());
            keywordInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.searchByKeywords();
                }
            });
        }
    }

    initializeNavigation() {
        // Initialize CRAN button
        const cranBtn = document.getElementById('cranBtn');
        if (cranBtn) {
            cranBtn.addEventListener('click', () => {
                window.location.href = 'index.html';
            });
        }
    }

    initializeTheme() {
        // Load saved theme or default to light (use same key as main app)
        const savedTheme = localStorage.getItem('r-analytics-theme') || 'light';
        this.setTheme(savedTheme);
    }

    switchTab(tabName) {
        // Hide all tab contents
        const tabContents = document.querySelectorAll('.tab-content');
        tabContents.forEach(content => content.classList.remove('active'));

        // Remove active class from all tab buttons
        const tabButtons = document.querySelectorAll('.nav-tab');
        tabButtons.forEach(button => button.classList.remove('active'));

        // Show selected tab content
        const selectedTab = document.getElementById(`${tabName}-tab`);
        if (selectedTab) {
            selectedTab.classList.add('active');
        }

        // Add active class to selected tab button
        const selectedButton = document.querySelector(`[data-tab="${tabName}"]`);
        if (selectedButton) {
            selectedButton.classList.add('active');
        }

        // Clear any existing results when switching tabs (like CRAN)
        if (tabName === 'bioc-search') {
            this.hideKeywordResults();
            this.hideElement('categoryResults');
            this.hideElement('researchResults');
            // Show main results if we have packages analyzed
            if (this.packages.length > 0 && this.currentData) {
                this.showElement('biocResults');
                this.showElement('biocChartSection');
            }
        } else if (tabName === 'bioc-discover') {
            this.hideResults(); // Hide main results when going to discover tab
            this.hideElement('categoryResults');
            this.hideElement('researchResults');
        } else if (tabName === 'bioc-categories') {
            this.hideResults(); // Hide main results when going to categories tab
            this.hideKeywordResults();
            this.hideElement('researchResults');
        } else if (tabName === 'bioc-research') {
            this.hideResults(); // Hide main results when going to research tab
            this.hideKeywordResults();
            this.hideElement('categoryResults');
        }
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
            const response = await fetch(`/api/bioconductor/search/${encodeURIComponent(query)}?limit=8`);
            
            if (!response.ok) {
                console.error('Search request failed:', response.status);
                this.hideSuggestions();
                return;
            }
            
            const suggestions = await response.json();
            
            // Filter out packages already added (suggestions are now just package names)
            const filteredSuggestions = suggestions.filter(pkg => !this.packages.includes(pkg));
            
            this.showSuggestions(filteredSuggestions, lastCommaIndex);
        } catch (error) {
            console.error('Search error:', error);
            this.hideSuggestions();
        }
    }

    showSuggestions(suggestions, lastCommaIndex) {
        this.hideSearchLoading();
        
        const suggestionsContainer = document.getElementById('biocPackageSuggestions');
        if (!suggestionsContainer) {
            return;
        }

        if (suggestions.length === 0) {
            this.hideSuggestions();
            return;
        }

        const inputValue = document.getElementById('biocPackageInput').value;
        const prefix = lastCommaIndex >= 0 ? inputValue.substring(0, lastCommaIndex + 1) + ' ' : '';

        suggestionsContainer.innerHTML = suggestions.map(pkg => `
            <div class="suggestion-item" data-package="${pkg}">
                <div class="suggestion-name">${pkg}</div>
            </div>
        `).join('');

        // Add click handlers for suggestions
        const suggestionItems = suggestionsContainer.querySelectorAll('.suggestion-item');
        suggestionItems.forEach(item => {
            item.addEventListener('click', () => {
                const packageName = item.dataset.package;
                document.getElementById('biocPackageInput').value = prefix + packageName;
                this.justSelected = true;
                this.hideSuggestions();
                
                // Clear the flag after a short delay
                setTimeout(() => {
                    this.justSelected = false;
                }, 100);
            });
        });

        // Show the suggestions container
        suggestionsContainer.classList.remove('hidden');
        suggestionsContainer.style.display = 'block';
    }

    hideSuggestions() {
        const suggestionsContainer = document.getElementById('biocPackageSuggestions');
        if (suggestionsContainer) {
            suggestionsContainer.classList.add('hidden');
            suggestionsContainer.style.display = 'none';
            suggestionsContainer.innerHTML = '';
        }
    }

    addPackages() {
        const input = document.getElementById('biocPackageInput').value.trim();
        if (!input) return;

        const packageNames = input.split(',').map(name => name.trim()).filter(name => name);
        const newPackages = packageNames.filter(pkg => !this.packages.includes(pkg));
        
        if (newPackages.length === 0) {
            return;
        }

        this.packages = [...this.packages, ...newPackages];
        document.getElementById('biocPackageInput').value = '';
        this.hideSuggestions();
        this.analyzePackageList(this.packages);
    }


    async browseCategory(category) {
        this.showLoading('categoryLoading');
        
        try {
            // Use category-specific limits as specified
            const limits = {
                'software': 75,      // Top 75 packages
                'annotation': 30,    // Top 30 packages  
                'experiment': 15,    // Top 15 packages
                'workflow': 100      // All workflow packages (no specific limit)
            };
            
            const limit = limits[category] || 50;
            const response = await fetch(`/api/bioconductor/categories/${category}?limit=${limit}`);
            const packages = await response.json();

            this.displayCategoryResults(category, packages);
        } catch (error) {
            console.error('Category browse error:', error);
            this.showError('Failed to browse category');
        } finally {
            this.hideLoading('categoryLoading');
        }
    }

    displayCategoryResults(category, packages) {
        const resultsContainer = document.getElementById('categoryResults');
        if (!resultsContainer) return;

        if (packages.length === 0) {
            resultsContainer.innerHTML = `
                <div class="recommendation-header">
                    <span>No ${category} packages found</span>
                </div>
            `;
        } else {
            // Show appropriate header based on category
            const categoryLabels = {
                'software': 'Top 75 Software Packages',
                'annotation': 'Top 30 Annotation Packages',
                'experiment': 'Top 15 Experiment Packages', 
                'workflow': 'All Workflow Packages'
            };
            
            const categoryLabel = categoryLabels[category] || `${category.charAt(0).toUpperCase() + category.slice(1)} Packages`;
            
            resultsContainer.innerHTML = `
                <div class="recommendation-header">
                    <span>${categoryLabel} (by Downloads)</span>
                    <span class="recommendation-count">${packages.length}</span>
                </div>
                <div class="recommendation-list">
                    ${packages.map(pkg => this.createCategoryResultItem(pkg)).join('')}
                </div>
            `;
        }

        resultsContainer.classList.remove('hidden');
    }

    createCategoryResultItem(item) {
        return `
            <div class="recommendation-item" onclick="biocApp.analyzePackage('${item.package}')">
                <div class="recommendation-item-header">
                    <div>
                        <div class="recommendation-package-name">
                            ${item.downloadRank ? `#${item.downloadRank}` : ''} ${item.package}
                        </div>
                        <span class="package-type-badge ${item.packageType}">${item.packageType}</span>
                    </div>
                    ${item.totalDownloads ? `
                        <div class="recommendation-stats">
                            <span class="downloads-label">Downloads:</span>
                            <span class="downloads-value">${this.formatNumber(item.totalDownloads)}</span>
                        </div>
                    ` : ''}
                </div>
                
                ${item.title ? `<div class="recommendation-title">${item.title}</div>` : ''}
                ${item.description ? `<div class="recommendation-description">${this.truncateText(item.description, 120)}</div>` : ''}
                ${item.biocViews ? `<div class="recommendation-biocviews"><strong>Categories:</strong> ${item.biocViews}</div>` : ''}
                
                <button class="add-package-btn" onclick="event.stopPropagation(); biocApp.analyzePackage('${item.package}')">
                    Add to Analysis
                </button>
            </div>
        `;
    }

    async browseResearchArea(area) {
        this.showLoading('researchLoading');
        
        try {
            const response = await fetch(`/api/bioconductor/research/${area}?limit=30`);
            const packages = await response.json();

            this.displayResearchResults(area, packages);
        } catch (error) {
            console.error('Research area browse error:', error);
            this.showError('Failed to browse research area');
        } finally {
            this.hideLoading('researchLoading');
        }
    }

    displayResearchResults(area, packages) {
        const resultsContainer = document.getElementById('researchResults');
        if (!resultsContainer) return;

        const areaNames = {
            'genomics': 'Genomics',
            'rnaseq': 'RNA-seq Analysis',
            'proteomics': 'Proteomics',
            'microarray': 'Microarray',
            'cytometry': 'Flow Cytometry',
            'metabolomics': 'Metabolomics'
        };

        if (packages.length === 0) {
            resultsContainer.innerHTML = `
                <div class="author-header">
                    <span>No ${areaNames[area] || area} packages found</span>
                </div>
            `;
        } else {
            resultsContainer.innerHTML = `
                <div class="author-header">
                    <span>${areaNames[area] || area} Packages</span>
                    <span class="author-count">${packages.length}</span>
                </div>
                <div class="author-list">
                    ${packages.map(pkg => this.createResearchResultItem(pkg)).join('')}
                </div>
            `;
        }

        resultsContainer.classList.remove('hidden');
    }

    createResearchResultItem(item) {
        return `
            <div class="author-item" onclick="biocApp.analyzePackage('${item.package}')">
                <div class="author-item-header">
                    <div>
                        <div class="author-package-name">${item.package}</div>
                        <span class="package-type-badge ${item.packageType}">${item.packageType}</span>
                    </div>
                    <div class="author-score">
                        <div class="author-score-value">Score: ${item.relevanceScore || 0}</div>
                        ${item.totalDownloads > 0 ? `<div class="author-popularity">${item.totalDownloads.toLocaleString()} downloads</div>` : ''}
                    </div>
                </div>
                
                ${item.title ? `<div class="author-title">${item.title}</div>` : ''}
                ${item.description ? `<div class="author-description">${this.truncateText(item.description, 120)}</div>` : ''}
                ${item.biocViews ? `<div class="author-biocviews"><strong>Categories:</strong> ${item.biocViews}</div>` : ''}
                
                <button class="add-package-btn" onclick="event.stopPropagation(); biocApp.analyzePackage('${item.package}')">
                    Add to Analysis
                </button>
            </div>
        `;
    }


    async analyzePackage(packageName) {
        // Switch to search tab to show the analysis (like CRAN)
        this.switchTab('bioc-search');
        
        // Check if package is already added
        if (this.packages.includes(packageName)) {
            this.showError(`Package "${packageName}" is already in your analysis`);
            return;
        }

        // Add the package to the search input
        const packageInput = document.getElementById('biocPackageInput');
        if (packageInput) {
            const currentValue = packageInput.value.trim();
            if (currentValue && !currentValue.split(',').map(p => p.trim()).includes(packageName)) {
                packageInput.value = currentValue + ', ' + packageName;
            } else if (!currentValue) {
                packageInput.value = packageName;
            }
        }

        // Add to packages array and analyze
        this.packages.push(packageName);
        this.updatePackageList();
        this.showElement('biocPeriodSelector');
        await this.analyzePackageList(this.packages);
        
        // Show success message
        this.showTemporaryMessage(`Added "${packageName}" to analysis`, 'success');
    }

    async analyzePackageList(packageNames) {
        this.packages = packageNames;
        this.showLoading('biocLoadingIndicator');
        this.hideResults();

        try {
            const response = await fetch(`/api/bioconductor/downloads/${packageNames.join(',')}?period=${this.currentPeriod}`);
            
            if (!response.ok) {
                if (response.status === 404) {
                    // Handle package not found error
                    try {
                        const errorData = await response.json();
                        this.showError(errorData.message || 'Package(s) not found on Bioconductor');
                        return;
                    } catch (parseError) {
                        this.showError('Package(s) not found on Bioconductor');
                        return;
                    }
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();

            // Check if we got valid data
            const hasValidData = data && data.length > 0 && 
                data.some(pkg => pkg.downloads && pkg.downloads.length > 0);
            
            if (!hasValidData) {
                // Clear invalid packages from the list
                this.packages = [];
                this.updatePackageList();
                this.hideElement('biocPeriodSelector');
                this.showError(`No valid data found for package(s): ${packageNames.join(', ')}. Please check the package name(s).`);
                return;
            }

            this.currentData = data;
            this.displayAnalyticsResults(data);
            this.showElement('biocPeriodSelector');
        } catch (error) {
            console.error('Analytics error:', error);
            this.showError('Failed to fetch download data');
        } finally {
            this.hideLoading('biocLoadingIndicator');
        }
    }

    displayAnalyticsResults(data) {
        if (!data || data.length === 0) {
            this.showError('No data available for the selected packages');
            return;
        }

        // Update package list
        this.updatePackageList();

        // Calculate statistics
        const totalDownloads = data.reduce((sum, pkg) => sum + (pkg.total?.downloads || 0), 0);
        const totalDistinctIPs = data.reduce((sum, pkg) => sum + (pkg.total?.distinctIPs || 0), 0);
        
        // Calculate all-time total and average monthly
        let allTimeTotal = 0;
        let totalMonths = 0;
        
        data.forEach(pkg => {
            pkg.downloads.forEach(download => {
                allTimeTotal += download.downloads;
            });
            if (pkg.downloads.length > 0) {
                totalMonths = Math.max(totalMonths, pkg.downloads.length);
            }
        });
        
        const avgMonthly = totalMonths > 0 ? Math.round(allTimeTotal / totalMonths) : 0;

        // Update title
        const title = this.packages.length === 1 
            ? this.packages[0] 
            : `${this.packages.length} Packages Comparison`;
        document.getElementById('biocPackageTitle').textContent = title;

        // Update stats display
        document.getElementById('biocTotalDownloads').textContent = this.formatNumber(totalDownloads);
        document.getElementById('biocAllTimeTotal').textContent = this.formatNumber(allTimeTotal);
        document.getElementById('biocAvgMonthly').textContent = this.formatNumber(avgMonthly);
        document.getElementById('biocDistinctIPs').textContent = this.formatNumber(totalDistinctIPs);

        // Display package details and summaries
        this.displayPackageDetails(data);
        this.displayPackageSummaries(data);

        // Show chart section and create charts
        this.showElement('biocChartSection');
        this.createDownloadChart(data);
        this.createCumulativeChart(data);

        this.showElement('biocResults');
    }

    updatePackageList() {
        const packagesList = document.getElementById('biocPackagesList');
        if (!packagesList) return;

        packagesList.innerHTML = this.packages.map((pkg, index) => `
            <div class="package-tag" style="background: ${this.colors[index % this.colors.length]}">
                <span class="package-name">${pkg}</span>
                <button class="remove-btn" data-package="${pkg}">&times;</button>
            </div>
        `).join('');
        
        // Add event listeners for remove buttons
        const removeButtons = packagesList.querySelectorAll('.remove-btn');
        removeButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const packageName = button.dataset.package;
                this.removePackage(packageName);
            });
        });
    }

    async displayPackageDetails(downloadDataArray) {
        const detailsElement = document.getElementById('biocPackageDetails');
        if (!detailsElement) return;

        try {
            // Fetch package metadata
            const response = await fetch(`/api/bioconductor/metadata/${this.packages.join(',')}`);
            const packageInfoArray = await response.json();

            if (this.packages.length === 1 && packageInfoArray[0]) {
                const info = packageInfoArray[0];
                detailsElement.innerHTML = `
                    <p><strong>Title:</strong> ${info.title || 'N/A'}</p>
                    <p><strong>Version:</strong> ${info.version || 'N/A'}</p>
                    <p><strong>Description:</strong> ${info.description || 'N/A'}</p>
                    <p><strong>Author:</strong> ${info.author || 'N/A'}</p>
                    <p><strong>Package Type:</strong> ${info.packageType || 'N/A'}</p>
                    ${info.biocViews ? `<p><strong>Bioc Views:</strong> ${info.biocViews}</p>` : ''}
                `;
            } else {
                const validPackages = packageInfoArray.filter(info => info !== null);
                detailsElement.innerHTML = `
                    <p><strong>Packages:</strong> ${this.packages.join(', ')}</p>
                    <p><strong>Package info available for:</strong> ${validPackages.length} of ${this.packages.length} packages</p>
                    <p><em>Individual package details are shown in the summaries below.</em></p>
                `;
            }
        } catch (error) {
            console.error('Failed to fetch package details:', error);
            detailsElement.innerHTML = `
                <p><strong>Package:</strong> ${this.packages.join(', ')}</p>
                <p><em>Package details could not be loaded.</em></p>
            `;
        }
    }

    async displayPackageSummaries(downloadDataArray) {
        const summariesContainer = document.getElementById('biocPackageSummaries');
        if (!summariesContainer) return;
        
        // Show summaries only for multiple packages (like CRAN)
        if (this.packages.length <= 1) {
            summariesContainer.innerHTML = '';
            return;
        }

        try {
            // Fetch package metadata
            const response = await fetch(`/api/bioconductor/metadata/${this.packages.join(',')}`);
            const packageInfoArray = await response.json();

            const summariesHtml = downloadDataArray.map((packageData, index) => {
                const packageInfo = packageInfoArray[index];
                const stats = this.calculateIndividualPackageStats(packageData);
                const color = this.colors[index % this.colors.length];

                return `
                    <div class="package-summary">
                        <div class="package-summary-header" style="background: ${color};" onclick="biocApp.togglePackageDetails('${packageData.package}')">
                            <span>
                                ${packageData.package}
                                ${packageInfo?.title ? `- ${packageInfo.title}` : ''}
                            </span>
                            <span class="dropdown-arrow" id="arrow-${packageData.package}">▼</span>
                        </div>
                        <div class="package-summary-stats">
                            <div class="package-stat">
                                <h4>Total Downloads</h4>
                                <div class="package-stat-value">${stats.total.toLocaleString()}</div>
                            </div>
                            <div class="package-stat">
                                <h4>Average Monthly</h4>
                                <div class="package-stat-value">${stats.average.toLocaleString()}</div>
                            </div>
                            <div class="package-stat">
                                <h4>Peak Downloads</h4>
                                <div class="package-stat-value">${stats.peak.downloads.toLocaleString()}</div>
                            </div>
                        </div>
                        <div class="package-details" id="details-${packageData.package}">
                            <div class="package-details-content">
                                ${packageInfo?.description ? `<p><strong>Description:</strong> ${packageInfo.description}</p>` : ''}
                                ${packageInfo?.version ? `<p><strong>Version:</strong> ${packageInfo.version}</p>` : ''}
                                ${packageInfo?.author ? `<p><strong>Author:</strong> ${packageInfo.author}</p>` : ''}
                                ${packageInfo?.maintainer ? `<p><strong>Maintainer:</strong> ${packageInfo.maintainer}</p>` : ''}
                                ${packageInfo?.packageType ? `<p><strong>Package Type:</strong> ${packageInfo.packageType}</p>` : ''}
                                ${packageInfo?.biocViews ? `<p><strong>Bioc Views:</strong> ${packageInfo.biocViews}</p>` : ''}
                                ${packageInfo?.license ? `<p><strong>License:</strong> ${packageInfo.license}</p>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            summariesContainer.innerHTML = summariesHtml;
        } catch (error) {
            console.error('Failed to fetch package metadata:', error);
            summariesContainer.innerHTML = '';
        }
    }

    calculateIndividualPackageStats(packageData) {
        const downloads = packageData.downloads || [];
        const total = downloads.reduce((sum, item) => sum + item.downloads, 0);
        const average = downloads.length > 0 ? Math.round(total / downloads.length) : 0;
        
        // Find peak downloads
        const peak = downloads.reduce((max, item) => 
            item.downloads > max.downloads ? item : max, 
            { downloads: 0, period: 'N/A' }
        );

        return { total, average, peak };
    }

    togglePackageDetails(packageName) {
        const detailsDiv = document.getElementById(`details-${packageName}`);
        const arrow = document.getElementById(`arrow-${packageName}`);
        
        if (detailsDiv && arrow) {
            const isExpanded = detailsDiv.classList.contains('expanded');
            if (isExpanded) {
                detailsDiv.classList.remove('expanded');
                arrow.textContent = '▼';
            } else {
                detailsDiv.classList.add('expanded');
                arrow.textContent = '▲';
            }
        }
    }

    async searchByKeywords(offset = 0) {
        const keywordInput = document.getElementById('biocKeywordInput');
        const keywords = keywordInput.value.trim();

        if (!keywords || keywords.length < 2) {
            this.showError('Please enter at least 2 characters for keyword search');
            return;
        }

        // Store current search state
        if (offset === 0) {
            this.currentKeywordSearch = { keywords, offset: 0 };
            this.showKeywordLoading(true);
            this.hideKeywordResults();
            this.hideResults();
        } else {
            this.showKeywordLoadingMore(true);
        }

        try {
            const response = await fetch(`/api/bioconductor/recommend/${encodeURIComponent(keywords)}?limit=20&offset=${offset}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const searchData = await response.json();
            this.displayKeywordResults(searchData, keywords, offset === 0);
        } catch (error) {
            this.showError(`Keyword search failed: ${error.message}`);
        } finally {
            if (offset === 0) {
                this.showKeywordLoading(false);
            } else {
                this.showKeywordLoadingMore(false);
            }
        }
    }

    displayKeywordResults(searchData, keywords, isNewSearch = true) {
        const resultsContainer = document.getElementById('biocRecommendationResults');
        
        // Handle both old format (array) and new format (object) for backward compatibility
        const recommendations = Array.isArray(searchData) ? searchData : searchData.results || [];
        const totalResults = searchData.totalResults || recommendations.length;
        const hasMore = searchData.hasMore || false;
        
        if (!recommendations || recommendations.length === 0) {
            if (isNewSearch) {
                resultsContainer.innerHTML = `
                    <div class="recommendation-header">
                        <span>No packages found for "${keywords}"</span>
                        <span class="recommendation-count">0 results</span>
                    </div>
                    <div class="recommendation-list">
                        <div style="padding: var(--space-6); text-align: center; color: var(--text-secondary);">
                            <p>Try different keywords or check your spelling.</p>
                            <p>Examples: "differential", "proteomics", "microbiome"</p>
                        </div>
                    </div>
                `;
                resultsContainer.classList.remove('hidden');
            }
            return;
        }

        if (isNewSearch) {
            // New search - replace content
            const resultsHtml = `
                <div class="recommendation-header">
                    <span>Packages matching "${keywords}"</span>
                    <span class="recommendation-count">${totalResults} results</span>
                </div>
                <div class="recommendation-list" id="biocRecommendationList">
                    ${recommendations.map(pkg => this.createKeywordResultItem(pkg)).join('')}
                </div>
                ${hasMore ? `
                    <div class="show-more-container">
                        <button class="show-more-btn" onclick="biocApp.loadMoreKeywordResults()">
                            Show More Results (${totalResults - recommendations.length} remaining)
                        </button>
                        <div class="show-more-loading hidden">
                            <div class="spinner-small"></div>
                            <span>Loading more...</span>
                        </div>
                    </div>
                ` : ''}
            `;
            resultsContainer.innerHTML = resultsHtml;
            resultsContainer.classList.remove('hidden');
            
            // Update search state
            this.currentKeywordSearch = { 
                keywords, 
                offset: recommendations.length,
                totalResults,
                hasMore 
            };
        } else {
            // Load more - append content
            const listContainer = document.getElementById('biocRecommendationList');
            const showMoreContainer = resultsContainer.querySelector('.show-more-container');
            
            // Append new results
            const newItemsHtml = recommendations.map(pkg => this.createKeywordResultItem(pkg)).join('');
            listContainer.insertAdjacentHTML('beforeend', newItemsHtml);
            
            // Update show more button or remove if no more results
            this.currentKeywordSearch.offset += recommendations.length;
            this.currentKeywordSearch.hasMore = hasMore;
            
            if (hasMore) {
                const button = showMoreContainer.querySelector('.show-more-btn');
                const remaining = totalResults - this.currentKeywordSearch.offset;
                button.textContent = `Show More Results (${remaining} remaining)`;
            } else {
                showMoreContainer.remove();
            }
        }
    }

    createKeywordResultItem(item) {
        return `
            <div class="recommendation-item" onclick="biocApp.analyzePackage('${item.package}')">
                <div class="recommendation-item-header">
                    <div>
                        <div class="recommendation-package-name">${item.package}</div>
                        <span class="package-type-badge ${item.packageType}">${item.packageType}</span>
                    </div>
                    <div class="recommendation-stats">
                        <div class="recommendation-score">
                            <span class="score-label">Relevance:</span>
                            <span class="score-value">${item.score}</span>
                        </div>
                        <div class="recommendation-downloads">
                            <span class="downloads-label">Downloads:</span>
                            <span class="downloads-value">${this.formatNumber(item.totalDownloads)}</span>
                        </div>
                    </div>
                </div>
                
                ${item.title ? `<div class="recommendation-title">${item.title}</div>` : ''}
                ${item.description ? `<div class="recommendation-description">${this.truncateText(item.description, 150)}</div>` : ''}
                ${item.biocViews ? `<div class="recommendation-biocviews"><strong>Categories:</strong> ${item.biocViews}</div>` : ''}
                
                <button class="add-package-btn" onclick="event.stopPropagation(); biocApp.analyzePackage('${item.package}')">
                    Add to Analysis
                </button>
            </div>
        `;
    }

    loadMoreKeywordResults() {
        if (this.currentKeywordSearch && this.currentKeywordSearch.hasMore) {
            this.searchByKeywords(this.currentKeywordSearch.offset);
        }
    }

    showKeywordLoading(show) {
        const loadingElement = document.getElementById('biocKeywordLoadingIndicator');
        if (loadingElement) {
            if (show) {
                loadingElement.classList.remove('hidden');
            } else {
                loadingElement.classList.add('hidden');
            }
        }
    }

    showKeywordLoadingMore(show) {
        const loadingElement = document.querySelector('.show-more-loading');
        const button = document.querySelector('.show-more-btn');
        if (loadingElement && button) {
            if (show) {
                loadingElement.classList.remove('hidden');
                button.classList.add('hidden');
            } else {
                loadingElement.classList.add('hidden');
                button.classList.remove('hidden');
            }
        }
    }

    hideKeywordResults() {
        const resultsContainer = document.getElementById('biocRecommendationResults');
        if (resultsContainer) {
            resultsContainer.classList.add('hidden');
        }
    }

    createDownloadChart(data) {
        const ctx = document.getElementById('biocDownloadsChart');
        if (!ctx) return;

        // Destroy existing chart
        if (this.chart) {
            this.chart.destroy();
        }

        // Prepare chart data
        const datasets = data.map((pkg, index) => ({
            label: pkg.package,
            data: pkg.downloads.map(d => d.downloads),
            borderColor: this.colors[index % this.colors.length],
            backgroundColor: this.colors[index % this.colors.length] + '20',
            fill: false,
            tension: 0.1
        }));

        const labels = data[0]?.downloads?.map(d => d.period) || [];

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
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
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Downloads',
                            color: this.getThemeTextColor()
                        },
                        ticks: {
                            color: this.getThemeTextColor()
                        },
                        grid: {
                            color: this.getThemeGridColor()
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Period',
                            color: this.getThemeTextColor()
                        },
                        ticks: {
                            color: this.getThemeTextColor()
                        },
                        grid: {
                            color: this.getThemeGridColor()
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });

        // Update legend
        this.updateLegend('biocTrendsLegend', datasets);
    }

    createCumulativeChart(data) {
        const ctx = document.getElementById('biocCumulativeChart');
        if (!ctx) return;

        // Destroy existing chart
        if (this.cumulativeChart) {
            this.cumulativeChart.destroy();
        }

        // Calculate cumulative data
        const datasets = data.map((pkg, index) => {
            let cumulative = 0;
            const cumulativeData = pkg.downloads.map(d => {
                cumulative += d.downloads;
                return cumulative;
            });

            return {
                label: pkg.package,
                data: cumulativeData,
                borderColor: this.colors[index % this.colors.length],
                backgroundColor: this.colors[index % this.colors.length] + '20',
                fill: false,
                tension: 0.1
            };
        });

        const labels = data[0]?.downloads?.map(d => d.period) || [];

        this.cumulativeChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
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
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Cumulative Downloads',
                            color: this.getThemeTextColor()
                        },
                        ticks: {
                            color: this.getThemeTextColor()
                        },
                        grid: {
                            color: this.getThemeGridColor()
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Period',
                            color: this.getThemeTextColor()
                        },
                        ticks: {
                            color: this.getThemeTextColor()
                        },
                        grid: {
                            color: this.getThemeGridColor()
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });

        // Update legend
        this.updateLegend('biocCumulativeLegend', datasets);
    }

    updateLegend(legendId, datasets) {
        const legend = document.getElementById(legendId);
        if (!legend) return;

        legend.innerHTML = datasets.map(dataset => `
            <div class="legend-item">
                <div class="legend-color" style="background-color: ${dataset.borderColor}"></div>
                <span class="legend-label">${dataset.label}</span>
            </div>
        `).join('');
    }

    async changePeriod(period) {
        this.currentPeriod = period;
        
        // Update active period button
        const periodButtons = document.querySelectorAll('#biocPeriodSelector .period-btn');
        periodButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.period === period);
        });

        // Re-fetch data with new period
        if (this.packages.length > 0) {
            await this.analyzePackageList(this.packages);
        }
    }

    removePackage(packageName) {
        this.packages = this.packages.filter(pkg => pkg !== packageName);
        
        // Always update the package list display
        this.updatePackageList();
        
        if (this.packages.length === 0) {
            this.hideResults();
            this.hideElement('biocPeriodSelector');
            this.hideElement('biocChartSection');
        } else {
            this.analyzePackageList(this.packages);
        }
    }

    downloadChart(chartType) {
        const chart = chartType === 'cumulative' ? this.cumulativeChart : this.chart;
        if (!chart) return;

        const url = chart.toBase64Image();
        const link = document.createElement('a');
        link.download = `bioconductor-${chartType}-chart.png`;
        link.href = url;
        link.click();
    }

    toggleTheme() {
        const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        this.setTheme(newTheme);
    }

    setTheme(theme) {
        this.currentTheme = theme;
        
        // Use same theme application method as main app
        if (theme === 'light') {
            document.body.removeAttribute('data-theme');
            document.body.className = '';
        } else {
            document.body.setAttribute('data-theme', theme);
            document.body.className = theme;
        }
        
        // Use same storage key as main app
        localStorage.setItem('r-analytics-theme', theme);
        
        // Update charts if they exist
        this.updateChartTheme();
    }

    updateChartTheme() {
        // Recreate charts with new theme if they exist
        if (this.currentData && this.currentData.length > 0) {
            this.createDownloadChart(this.currentData);
            this.createCumulativeChart(this.currentData);
        }
    }

    getThemeTextColor() {
        return this.currentTheme === 'dark' ? '#ffffff' : '#1d1d1f';
    }

    getThemeGridColor() {
        return this.currentTheme === 'dark' ? '#38383a' : '#d2d2d7';
    }

    // Utility methods
    showLoading(elementId) {
        const element = document.getElementById(elementId);
        if (element) element.classList.remove('hidden');
    }

    hideLoading(elementId) {
        const element = document.getElementById(elementId);
        if (element) element.classList.add('hidden');
    }

    showSearchLoading() {
        const suggestionsContainer = document.getElementById('biocPackageSuggestions');
        if (suggestionsContainer) {
            suggestionsContainer.innerHTML = '<div class="suggestion-loading">Searching...</div>';
            suggestionsContainer.classList.remove('hidden');
            suggestionsContainer.style.display = 'block';
        }
    }

    hideSearchLoading() {
        // Loading is hidden when suggestions are shown or hidden
    }

    showElement(elementId) {
        const element = document.getElementById(elementId);
        if (element) element.classList.remove('hidden');
    }

    hideElement(elementId) {
        const element = document.getElementById(elementId);
        if (element) element.classList.add('hidden');
    }

    hideResults() {
        this.hideElement('biocResults');
        this.hideElement('biocError');
        this.hideElement('biocChartSection');
        this.hideKeywordResults();
        this.hideElement('categoryResults');
        this.hideElement('researchResults');
        // Clear package summaries and details
        const summariesContainer = document.getElementById('biocPackageSummaries');
        if (summariesContainer) {
            summariesContainer.innerHTML = '';
        }
        const detailsElement = document.getElementById('biocPackageDetails');
        if (detailsElement) {
            detailsElement.innerHTML = '';
        }
    }

    showError(message) {
        const errorElement = document.getElementById('biocError');
        const errorMessage = document.getElementById('biocErrorMessage');
        
        if (errorElement && errorMessage) {
            errorMessage.textContent = message;
            errorElement.classList.remove('hidden');
        }
    }

    showTemporaryMessage(message, type = 'info') {
        // Create or get the message element
        let messageElement = document.getElementById('biocTemporaryMessage');
        if (!messageElement) {
            messageElement = document.createElement('div');
            messageElement.id = 'biocTemporaryMessage';
            messageElement.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 12px 24px;
                border-radius: 8px;
                color: white;
                font-weight: 500;
                z-index: 1000;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                transition: all 0.3s ease;
                opacity: 0;
                transform: translateX(100%);
            `;
            document.body.appendChild(messageElement);
        }

        // Set message content and style based on type
        messageElement.textContent = message;
        const colors = {
            success: '#34C759',
            error: '#FF3B30',
            info: '#007AFF',
            warning: '#FF9500'
        };
        messageElement.style.backgroundColor = colors[type] || colors.info;

        // Show message with animation
        messageElement.style.opacity = '1';
        messageElement.style.transform = 'translateX(0)';

        // Hide message after 3 seconds
        setTimeout(() => {
            messageElement.style.opacity = '0';
            messageElement.style.transform = 'translateX(100%)';
        }, 3000);
    }

    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }

    truncateText(text, maxLength) {
        if (!text || text.length <= maxLength) {
            return text || '';
        }
        return text.substring(0, maxLength).trim() + '...';
    }
}

// Initialize the Bioconductor application
let biocApp;
document.addEventListener('DOMContentLoaded', () => {
    biocApp = new BioconductorAnalytics();
});