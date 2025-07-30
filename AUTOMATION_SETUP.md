# Automated Bioconductor Data Updates Setup

This document describes how to set up automated monthly updates of Bioconductor download data using GitHub Actions.

## Overview

The automation system:
- Runs on the 2nd of each month at 02:00 UTC
- Fetches the latest Bioconductor download statistics
- Updates the data files in the repository
- Commits the changes to the main branch
- Automatically deploys the updated app to Google Cloud

## Setup Instructions

### 1. Google Cloud Service Account Setup

You need to create a service account with the necessary permissions for deployment:

```bash
# Create a service account
gcloud iam service-accounts create bioc-updater \
    --description="Service account for automated Bioconductor data updates" \
    --display-name="Bioconductor Data Updater"

# Grant necessary roles
gcloud projects add-iam-policy-binding melodic-zoo-458222-s6 \
    --member="serviceAccount:bioc-updater@melodic-zoo-458222-s6.iam.gserviceaccount.com" \
    --role="roles/appengine.deployer"

gcloud projects add-iam-policy-binding melodic-zoo-458222-s6 \
    --member="serviceAccount:bioc-updater@melodic-zoo-458222-s6.iam.gserviceaccount.com" \
    --role="roles/appengine.serviceAdmin"

gcloud projects add-iam-policy-binding melodic-zoo-458222-s6 \
    --member="serviceAccount:bioc-updater@melodic-zoo-458222-s6.iam.gserviceaccount.com" \
    --role="roles/storage.objectAdmin"

gcloud projects add-iam-policy-binding melodic-zoo-458222-s6 \
    --member="serviceAccount:bioc-updater@melodic-zoo-458222-s6.iam.gserviceaccount.com" \
    --role="roles/cloudbuild.builds.editor"

gcloud projects add-iam-policy-binding melodic-zoo-458222-s6 \
    --member="serviceAccount:bioc-updater@melodic-zoo-458222-s6.iam.gserviceaccount.com" \
    --role="roles/iam.serviceAccountTokenCreator"

# Allow the service account to act as the App Engine default service account
gcloud iam service-accounts add-iam-policy-binding melodic-zoo-458222-s6@appspot.gserviceaccount.com \
    --member="serviceAccount:bioc-updater@melodic-zoo-458222-s6.iam.gserviceaccount.com" \
    --role="roles/iam.serviceAccountUser" \
    --project=melodic-zoo-458222-s6

# Create and download the service account key
gcloud iam service-accounts keys create key.json \
    --iam-account=bioc-updater@melodic-zoo-458222-s6.iam.gserviceaccount.com
```

### 2. GitHub Repository Secrets

Add the following secrets to your GitHub repository:

1. Go to your repository on GitHub
2. Navigate to Settings → Secrets and variables → Actions
3. Add these repository secrets:

**GCP_SA_KEY**: The contents of the `key.json` file you created above. Copy the entire JSON content.

### 3. Workflow File

The workflow file is already created at `.github/workflows/update-bioconductor-data.yml`. This workflow:

- Triggers automatically on the 2nd of each month at 02:00 UTC
- Can be triggered manually via the GitHub Actions tab
- Updates the Bioconductor data using the existing script
- Commits changes with a descriptive message
- Deploys the updated application to Google App Engine

## Data Update Process

The automation performs these steps:

1. **Data Fetching**: Downloads the latest `bioc_pkg_stats.tab` from Bioconductor
2. **Data Processing**: Parses and structures the data into JSON format
3. **File Updates**: Updates these files:
   - `data/bioc_pkg_stats.tab` (raw data)
   - `data/bioconductor-stats.json` (processed package statistics)
   - `data/bioconductor-index.json` (lightweight package index)
4. **Commit**: Creates a commit with the updated data
5. **Deploy**: Automatically deploys to Google App Engine

## Manual Execution

You can manually trigger the workflow:

1. Go to the Actions tab in your GitHub repository
2. Select "Update Bioconductor Download Data"
3. Click "Run workflow"
4. Choose the branch (usually `main`) and click "Run workflow"

You can also run the data update locally:

```bash
# Install dependencies
npm install

# Run the data update
node scripts/fetch-bioconductor-stats.js

# Deploy manually if needed
npm run deploy
```

## Monitoring

The workflow provides detailed logging and will:
- Show progress in the GitHub Actions tab
- Fail if there are any errors during data fetching or deployment
- Send notifications (if configured) on failure

## Troubleshooting

### Common Issues

1. **Authentication Errors**: Verify the `GCP_SA_KEY` secret is correctly set with valid JSON
2. **Permission Errors**: Ensure the service account has all required roles
3. **Deployment Failures**: Check the Google Cloud console for App Engine deployment logs

### Logs

- **GitHub Actions**: Check the Actions tab for workflow execution logs
- **Google Cloud**: Use `gcloud app logs tail -s default` for App Engine logs
- **Local Development**: Run scripts locally to debug data processing issues

## Security Notes

- The service account key should be kept secure and rotated periodically
- The workflow only has access to the specific Google Cloud project
- No sensitive data is logged in the GitHub Actions workflow

## Data Source

The automation fetches data from:
`https://www.bioconductor.org/packages/stats/bioc/bioc_pkg_stats.tab`

This is the official Bioconductor package download statistics file, updated monthly by the Bioconductor team.