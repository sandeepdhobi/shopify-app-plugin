# Product Sync Setup Guide

This guide will help you set up the product sync feature for your Shopify app.

## Prerequisites

1. **Redis Server**: The sync feature uses Redis for job queue management.
   - Install Redis locally: `brew install redis` (macOS) or `sudo apt-get install redis-server` (Ubuntu)
   - Start Redis: `redis-server`
   - Alternative: Use a cloud Redis service like Redis Cloud or AWS ElastiCache

2. **Node.js**: Make sure you have Node.js 16+ installed

## Setup Steps

### 1. Install Dependencies

```bash
cd fruitful-benchmark-app/web
npm install
```

### 2. Environment Variables

Create a `.env` file in the `web/` directory (if it doesn't exist) and add:

```env
# Redis Configuration (optional - defaults to localhost:6379)
REDIS_HOST=localhost
REDIS_PORT=6379

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
1. **Job Queue**: Uses Bull.js with Redis for reliable job queue management
2. **Batch Processing**: Processes products in configurable batches to manage memory usage
3. **Rate Limiting**: Respects Shopify API rate limits (2 requests per second)
4. **Error Handling**: Retries failed operations and tracks errors

### Third-Party Integration
- **Mock API**: Currently uses a mock third-party API that simulates 1 million products
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

### 1. Redis Configuration
- Use a dedicated Redis instance for production
- Configure Redis persistence for job durability
- Set appropriate memory limits and eviction policies

### 2. Error Handling
- Implement proper logging for sync operations
- Set up alerts for failed sync jobs
- Monitor Redis and database performance

### 3. API Rate Limits
- Adjust batch sizes based on your API limits
- Implement exponential backoff for failed requests
- Consider using multiple API keys for higher throughput

### 4. Scalability
- Use Redis Cluster for high availability
- Consider horizontal scaling with multiple worker processes
- Implement proper database connection pooling

## Troubleshooting

### Common Issues

1. **Redis Connection Error**
   - Ensure Redis is running: `redis-cli ping`
   - Check Redis host and port configuration

2. **Database Errors**
   - Verify write permissions in the app directory
   - Check SQLite database file permissions

3. **API Rate Limit Errors**
   - Reduce batch size in sync configuration
   - Increase delay between API calls

4. **Memory Issues**
   - Monitor Node.js memory usage
   - Adjust batch sizes for large product catalogs

5. **GraphQL API Errors**
   - Ensure you're using Shopify Admin API version 2024-04 or later
   - The `ProductInput.variants` field is deprecated - products are created separately from variants
   - Use `productVariantsBulkUpdate` instead of `productVariantCreate` (which doesn't exist)

6. **Sync Job Cancel Issues**
   - If regular cancel fails, use the "Force Cancel All" button in the UI
   - Force cancel will remove all jobs from the queue and mark them as cancelled in the database
   - Use `curl -X DELETE http://localhost:3000/api/products/sync/force/all` via API

### Debug Commands

```bash
# Check Redis status
redis-cli ping

# View Redis keys
redis-cli keys "*"

# Check sync job database
sqlite3 sync_jobs.db "SELECT * FROM sync_jobs ORDER BY created_at DESC LIMIT 10;"

# Monitor app logs
npm run dev
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

## Next Steps

1. **Integrate Real API**: Replace the mock API with your actual third-party service
2. **Add Webhooks**: Implement webhooks for real-time sync notifications
3. **Enhance UI**: Add more detailed progress information and sync configuration options
4. **Add Monitoring**: Implement proper monitoring and alerting for sync operations
5. **Optimize Performance**: Fine-tune batch sizes and API call rates for your specific use case 