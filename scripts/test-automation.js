#!/usr/bin/env node

/**
 * Test script to validate the automation setup
 * This script checks if all components are ready for automated updates
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

class AutomationTester {
    constructor() {
        this.rootDir = path.join(__dirname, '..');
        this.errors = [];
        this.warnings = [];
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = {
            'info': '📋',
            'success': '✅',
            'warning': '⚠️',
            'error': '❌'
        }[type] || '📋';
        
        console.log(`${prefix} [${timestamp}] ${message}`);
        
        if (type === 'error') this.errors.push(message);
        if (type === 'warning') this.warnings.push(message);
    }

    checkFileExists(filePath, description) {
        const fullPath = path.join(this.rootDir, filePath);
        if (fs.existsSync(fullPath)) {
            this.log(`${description} exists`, 'success');
            return true;
        } else {
            this.log(`${description} missing: ${filePath}`, 'error');
            return false;
        }
    }

    checkDirectoryStructure() {
        this.log('Checking directory structure...');
        
        const requiredDirs = [
            { path: 'data', desc: 'Data directory' },
            { path: 'scripts', desc: 'Scripts directory' },
            { path: '.github/workflows', desc: 'GitHub Actions workflows directory' }
        ];

        requiredDirs.forEach(({ path: dirPath, desc }) => {
            this.checkFileExists(dirPath, desc);
        });
    }

    checkRequiredFiles() {
        this.log('Checking required files...');
        
        const requiredFiles = [
            { path: 'package.json', desc: 'Package configuration' },
            { path: 'app.yaml', desc: 'Google App Engine configuration' },
            { path: 'scripts/fetch-bioconductor-stats.js', desc: 'Bioconductor data fetching script' },
            { path: '.github/workflows/update-bioconductor-data.yml', desc: 'GitHub Actions workflow' },
            { path: 'AUTOMATION_SETUP.md', desc: 'Setup documentation' }
        ];

        requiredFiles.forEach(({ path: filePath, desc }) => {
            this.checkFileExists(filePath, desc);
        });
    }

    checkPackageJson() {
        this.log('Validating package.json...');
        
        try {
            const packagePath = path.join(this.rootDir, 'package.json');
            const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
            
            // Check required scripts
            const requiredScripts = ['start', 'deploy'];
            requiredScripts.forEach(script => {
                if (packageJson.scripts && packageJson.scripts[script]) {
                    this.log(`Script '${script}' configured`, 'success');
                } else {
                    this.log(`Script '${script}' missing`, 'warning');
                }
            });
            
            // Check Node.js version
            if (packageJson.engines && packageJson.engines.node) {
                this.log(`Node.js version requirement: ${packageJson.engines.node}`, 'success');
            } else {
                this.log('Node.js version not specified', 'warning');
            }
            
        } catch (error) {
            this.log(`Error reading package.json: ${error.message}`, 'error');
        }
    }

    async checkBioconductorEndpoint() {
        this.log('Testing Bioconductor data endpoint...');
        
        return new Promise((resolve) => {
            const url = 'https://www.bioconductor.org/packages/stats/bioc/bioc_pkg_stats.tab';
            
            const request = https.get(url, (response) => {
                if (response.statusCode === 200) {
                    this.log('Bioconductor endpoint accessible', 'success');
                    
                    let dataReceived = false;
                    response.on('data', (chunk) => {
                        if (!dataReceived && chunk.toString().includes('Package\tYear\tMonth')) {
                            this.log('Data format appears correct', 'success');
                            dataReceived = true;
                        }
                    });
                    
                    response.on('end', () => {
                        if (!dataReceived) {
                            this.log('Data format may be incorrect', 'warning');
                        }
                        resolve();
                    });
                } else {
                    this.log(`Bioconductor endpoint returned status ${response.statusCode}`, 'error');
                    resolve();
                }
            });
            
            request.on('error', (error) => {
                this.log(`Error accessing Bioconductor endpoint: ${error.message}`, 'error');
                resolve();
            });
            
            request.setTimeout(10000, () => {
                this.log('Bioconductor endpoint request timed out', 'error');
                request.destroy();
                resolve();
            });
        });
    }

    checkWorkflowConfiguration() {
        this.log('Validating GitHub Actions workflow...');
        
        try {
            const workflowPath = path.join(this.rootDir, '.github/workflows/update-bioconductor-data.yml');
            const workflowContent = fs.readFileSync(workflowPath, 'utf8');
            
            // Check for required elements
            const checks = [
                { pattern: /schedule:/, desc: 'Scheduled trigger' },
                { pattern: /workflow_dispatch:/, desc: 'Manual trigger' },
                { pattern: /cron:\s*['"]0 2 2 \* \*['"]/, desc: 'Monthly schedule (2nd at 02:00)' },
                { pattern: /google-github-actions\/auth@v2/, desc: 'Google Cloud authentication' },
                { pattern: /node scripts\/fetch-bioconductor-stats\.js/, desc: 'Data fetching step' },
                { pattern: /gcloud app deploy/, desc: 'Deployment step' }
            ];
            
            checks.forEach(({ pattern, desc }) => {
                if (pattern.test(workflowContent)) {
                    this.log(`Workflow has ${desc}`, 'success');
                } else {
                    this.log(`Workflow missing ${desc}`, 'error');
                }
            });
            
        } catch (error) {
            this.log(`Error reading workflow file: ${error.message}`, 'error');
        }
    }

    checkDataFiles() {
        this.log('Checking existing data files...');
        
        const dataFiles = [
            { path: 'data/bioconductor-stats.json', desc: 'Processed Bioconductor statistics' },
            { path: 'data/bioconductor-index.json', desc: 'Bioconductor package index' },
            { path: 'data/bioc_pkg_stats.tab', desc: 'Raw Bioconductor data' }
        ];
        
        dataFiles.forEach(({ path: filePath, desc }) => {
            const fullPath = path.join(this.rootDir, filePath);
            if (fs.existsSync(fullPath)) {
                const stats = fs.statSync(fullPath);
                const age = Date.now() - stats.mtime.getTime();
                const ageInDays = Math.floor(age / (1000 * 60 * 60 * 24));
                
                this.log(`${desc} exists (${ageInDays} days old)`, 'success');
                
                if (ageInDays > 35) {
                    this.log(`${desc} is quite old (${ageInDays} days)`, 'warning');
                }
            } else {
                this.log(`${desc} not found`, 'warning');
            }
        });
    }

    generateSummary() {
        this.log('\n🎯 AUTOMATION TEST SUMMARY', 'info');
        this.log('=' .repeat(50), 'info');
        
        if (this.errors.length === 0 && this.warnings.length === 0) {
            this.log('All checks passed! ✨', 'success');
            this.log('The automation setup is ready to use.', 'success');
        } else {
            if (this.errors.length > 0) {
                this.log(`Found ${this.errors.length} error(s):`, 'error');
                this.errors.forEach(error => this.log(`  • ${error}`, 'error'));
            }
            
            if (this.warnings.length > 0) {
                this.log(`Found ${this.warnings.length} warning(s):`, 'warning');
                this.warnings.forEach(warning => this.log(`  • ${warning}`, 'warning'));
            }
        }
        
        this.log('\n📖 Next Steps:', 'info');
        if (this.errors.length > 0) {
            this.log('1. Fix the errors listed above', 'info');
            this.log('2. Re-run this test script', 'info');
            this.log('3. Follow the AUTOMATION_SETUP.md guide', 'info');
        } else {
            this.log('1. Follow AUTOMATION_SETUP.md to configure GitHub secrets', 'info');
            this.log('2. Test the workflow manually via GitHub Actions', 'info');
            this.log('3. Monitor automated runs on the 2nd of each month', 'info');
        }
        
        return this.errors.length === 0;
    }

    async runAllTests() {
        this.log('🚀 Starting automation setup validation...', 'info');
        this.log('=' .repeat(50), 'info');
        
        this.checkDirectoryStructure();
        this.checkRequiredFiles();
        this.checkPackageJson();
        this.checkWorkflowConfiguration();
        this.checkDataFiles();
        await this.checkBioconductorEndpoint();
        
        const success = this.generateSummary();
        process.exit(success ? 0 : 1);
    }
}

// Run the tests
if (require.main === module) {
    const tester = new AutomationTester();
    tester.runAllTests().catch(error => {
        console.error('❌ Test execution failed:', error);
        process.exit(1);
    });
}

module.exports = AutomationTester;