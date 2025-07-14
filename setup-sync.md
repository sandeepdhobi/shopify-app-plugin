# Product Sync Setup Guide

This guide will help you set up the improved product sync feature for your Shopify app.

## Key Improvements

- **Simplified Architecture**: Removed Redis dependency, uses SQLite and in-memory job tracking
- **Single Job Processing**: Only one sync job runs at a time for better resource management
- **Optimized Performance**: Parallel batch processing with improved rate limiting (5 req/sec)
- **Enhanced Error Handling**: Better error tracking and consecutive error detection
- **Improved Cancellation**: Simplified and more reliable job cancellation
- **Better UI**: Updated frontend to reflect single-job architecture

## Prerequisites

1. **Node.js**: Make sure you have Node.js 16+ installed

2. **SQLite**: The sync feature uses SQLite for job tracking (included with Node.js)

## Setup Steps

### 1. Install Dependencies

```bash
cd fruitful-benchmark-app/web
npm install
```

### 2. Environment Variables

Create a `.env` file in the `web/` directory (if it doesn't exist) and add:

```env
# Shopify App Configuration
SHOPIFY_API_KEY=your_api_key_here
SHOPIFY_API_SECRET=your_api_secret_here
SCOPES=write_products,read_products,read_orders
```

### 3. Database Setup

The sync feature uses SQLite to track sync jobs. The database will be created automatically when you first run the app.

### 4. Start the Application

```bash
# Start the development server
npm run dev
```

## Features

### 1. Product Sync
- **Endpoint**: `POST /api/products/sync`
- **Purpose**: Starts a background job to sync millions of products from a third-party API
- **Parameters**: 
  - `batchSize` (optional): Number of products to process in each batch (default: 10)

### 2. Sync Status Tracking
- **Endpoint**: `GET /api/products/sync/:jobId/status`
- **Purpose**: Get the current status of a sync job
- **Returns**: Job status, progress, and error information

### 3. Sync History
- **Endpoint**: `GET /api/products/sync/history`
- **Purpose**: Get all sync jobs for the current shop
- **Returns**: List of all sync jobs with their status and metrics

### 4. Cancel Sync
- **Endpoint**: `DELETE /api/products/sync/:jobId`
- **Purpose**: Cancel a specific running sync job

### 5. Force Cancel All Jobs
- **Endpoint**: `DELETE /api/products/sync/force/all`
- **Purpose**: Force cancel all sync jobs (useful when regular cancel fails)
- **Returns**: Number of jobs cancelled

## How It Works

### Background Processing
1. **Single Job Processing**: Simplified architecture that processes one job at a time
2. **Optimized Batch Processing**: Processes products in parallel batches for better performance
3. **Smart Rate Limiting**: Optimized to 5 requests per second for single job execution
4. **Enhanced Error Handling**: Improved error tracking with consecutive error detection

### Third-Party Integration
- **Mock API**: Currently uses a mock third-party API that simulates 1000 products for testing
- **Real Implementation**: Replace the `fetchProductsFromThirdParty` function in `queue/syncJobQueue.js` with your actual API integration

### Shopify API Compatibility
- **GraphQL API Version**: Compatible with Shopify Admin API 2024-04 and later
- **Product Creation**: Uses modern `productCreate` + `productVariantsBulkUpdate` approach
- **Media Handling**: Simplified for demo (images are logged but not uploaded)
- **Inventory**: Basic inventory quantities are set during variant creation

### Database Schema
```sql
CREATE TABLE sync_jobs (
  id TEXT PRIMARY KEY,
  shop_domain TEXT NOT NULL,
  status TEXT NOT NULL,
  total_products INTEGER,
  processed_products INTEGER DEFAULT 0,
  failed_products INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  error_message TEXT
);
```

## Testing the Sync Feature

1. **Access the Dashboard**: Navigate to `/dashboard` in your Shopify app
2. **Go to Products Tab**: Click on the "Products" tab
3. **Start a Sync**: Click the "Start Sync" button
4. **Monitor Progress**: Watch the progress bar and sync status
5. **View History**: Check the sync history table for past operations

## Production Considerations

### 1. Database Configuration
- Use a dedicated SQLite database or upgrade to PostgreSQL/MySQL for production
- Implement proper database backups and recovery
- Monitor database performance and storage

### 2. Error Handling
- Implement proper logging for sync operations
- Set up alerts for failed sync jobs
- Monitor application performance and memory usage

### 3. API Rate Limits
- Adjust batch sizes based on your API limits
- The system is optimized for single job execution with 5 requests per second
- Consider implementing dynamic rate limiting based on API response times

### 4. Scalability
- For high-volume scenarios, consider upgrading to a distributed job queue system
- Implement proper application monitoring and health checks
- Consider using load balancing for multiple app instances

## Troubleshooting

### Common Issues

1. **Database Errors**
   - Verify write permissions in the app directory
   - Check SQLite database file permissions
   - Ensure the database file isn't locked by another process

2. **API Rate Limit Errors**
   - Reduce batch size in sync configuration
   - The system is optimized for 5 requests per second
   - Check Shopify API limits for your plan

3. **Memory Issues**
   - Monitor Node.js memory usage
   - Adjust batch sizes for large product catalogs
   - The system now processes products in parallel batches

4. **GraphQL API Errors**
   - Ensure you're using Shopify Admin API version 2024-04 or later
   - Products are created separately from variants for better reliability
   - Use `productVariantsBulkUpdate` for variant updates

5. **Sync Job Issues**
   - Only one job can run at a time - check current job status
   - Use "Force Cancel" button if regular cancel fails
   - Check application logs for detailed error messages with `[DEBUG]`, `[ERROR]`, and `[SUCCESS]` tags
   - Use `curl -X GET http://localhost:3000/api/products/sync/current` to check active jobs
   - Test single product creation with `curl -X POST http://localhost:3000/api/products/sync/test`
   - If jobs fail immediately, check session authentication and Shopify API permissions

### Debug Commands

```bash
# Check sync job database
sqlite3 sync_jobs.db "SELECT * FROM sync_jobs ORDER BY created_at DESC LIMIT 10;"

# Check current active job
curl http://localhost:3000/api/products/sync/current

# Monitor app logs
npm run dev

# Check database table structure
sqlite3 sync_jobs.db ".schema sync_jobs"
```

## API Reference

### Start Sync
```bash
curl -X POST http://localhost:3000/api/products/sync \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 10}'
```

### Get Sync Status
```bash
curl http://localhost:3000/api/products/sync/{jobId}/status
```

### Get Sync History
```bash
curl http://localhost:3000/api/products/sync/history
```

### Cancel Sync
```bash
curl -X DELETE http://localhost:3000/api/products/sync/{jobId}
```

### Force Cancel All Jobs
```bash
curl -X DELETE http://localhost:3000/api/products/sync/force/all
```

### Get Current Job Status
```bash
curl http://localhost:3000/api/products/sync/current
```

### Test Product Creation (Debug)
```bash
curl -X POST http://localhost:3000/api/products/sync/test \
  -H "Content-Type: application/json"
```

## Next Steps

1. **Integrate Real API**: Replace the mock API with your actual third-party service
2. **Add Webhooks**: Implement webhooks for real-time sync notifications
3. **Enhance UI**: Add more detailed progress information and sync configuration options
4. **Add Monitoring**: Implement proper monitoring and alerting for sync operations
5. **Optimize Performance**: Fine-tune batch sizes and API call rates for your specific use case 