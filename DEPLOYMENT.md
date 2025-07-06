# Google Cloud Deployment Guide

## Prerequisites

1. **Google Cloud SDK**: Install the [Google Cloud CLI](https://cloud.google.com/sdk/docs/install)
2. **Google Cloud Project**: Create a project in [Google Cloud Console](https://console.cloud.google.com/)
3. **App Engine**: Enable App Engine API in your project

## Setup

1. **Authenticate with Google Cloud:**
   ```bash
   gcloud auth login
   ```

2. **Set your project ID:**
   ```bash
   gcloud config set project YOUR_PROJECT_ID
   ```

3. **Initialize App Engine:**
   ```bash
   gcloud app create --region=us-central1
   ```

## Deployment

### Quick Deploy
```bash
npm run deploy
```

### Deploy with Custom Version
```bash
npm run deploy:version -- v1-0-0
```

### Manual Deploy
```bash
gcloud app deploy
```

## Post-Deployment

1. **View your app:**
   ```bash
   gcloud app browse
   ```

2. **View logs:**
   ```bash
   npm run logs
   ```

3. **Check status:**
   ```bash
   gcloud app versions list
   ```

## Configuration

- **Runtime**: Node.js 18
- **Auto-scaling**: 1-10 instances
- **Environment**: Production

## Important Notes

- The app uses local CRAN package data from `data/cran-packages.json`
- Run `npm run update-packages` before deployment to ensure fresh data
- The server automatically uses PORT environment variable provided by App Engine
- All external API calls are cached for 1 hour to reduce costs

## Troubleshooting

If deployment fails:
1. Check that App Engine API is enabled
2. Verify your project has billing enabled
3. Ensure all dependencies are in package.json
4. Check logs with `gcloud app logs tail -s default`