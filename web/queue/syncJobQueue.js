import Queue from 'bull';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import shopify from '../shopify.js';

// Create a job queue for product sync
const syncQueue = new Queue('product sync', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    // For development, we'll use a simple in-memory store if Redis isn't available
  },
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});

// Database helper for tracking sync jobs
import sqlite3 from 'sqlite3';
import { promisify } from 'util';

const db = new sqlite3.Database('./sync_jobs.db');

// Promisify database methods
const dbRun = promisify(db.run.bind(db));
const dbGet = promisify(db.get.bind(db));
const dbAll = promisify(db.all.bind(db));

// Initialize sync jobs table
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS sync_jobs (
      id TEXT PRIMARY KEY,
      shop_domain TEXT NOT NULL,
      status TEXT NOT NULL,
      total_products INTEGER,
      processed_products INTEGER DEFAULT 0,
      failed_products INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      error_message TEXT
    )
  `);
});

// Update job status in database
const updateJobStatus = async (jobId, updates) => {
  const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
  const values = Object.values(updates);
  try {
    await dbRun(`UPDATE sync_jobs SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, ...values, jobId);
  } catch (error) {
    console.error('Error updating job status:', error);
  }
};

// Get job status from database
const getJobStatus = async (jobId) => {
  try {
    return await dbGet('SELECT * FROM sync_jobs WHERE id = ?', jobId);
  } catch (error) {
    console.error('Error getting job status:', error);
    return null;
  }
};

// Get all sync jobs for a shop
const getAllSyncJobs = async (shopDomain) => {
  try {
    return await dbAll('SELECT * FROM sync_jobs WHERE shop_domain = ? ORDER BY created_at DESC', shopDomain);
  } catch (error) {
    console.error('Error getting sync jobs:', error);
    return [];
  }
};

// Mock third-party API endpoint
const fetchProductsFromThirdParty = async (page = 1, limit = 100) => {
  // Simulate API call with mock data
  const mockProducts = [];
  for (let i = 0; i < limit; i++) {
    const id = (page - 1) * limit + i + 1;
    mockProducts.push({
      id: id,
      title: `Product ${id}`,
      description: `Description for product ${id}`,
      price: (Math.random() * 100 + 10).toFixed(2),
      sku: `SKU-${id}`,
      inventory_quantity: Math.floor(Math.random() * 100),
      images: [`https://via.placeholder.com/300x300?text=Product+${id}`],
      category: ['Electronics', 'Clothing', 'Home', 'Books'][Math.floor(Math.random() * 4)],
      tags: ['new', 'popular', 'sale'].slice(0, Math.floor(Math.random() * 3) + 1),
      vendor: 'ThirdParty Supplier',
      weight: Math.random() * 5,
      weight_unit: 'kg'
    });
  }
  
  return {
    products: mockProducts,
    total: 1000000, // Simulate 1 million products
    page,
    limit,
    hasMore: page * limit < 1000000
  };
};

// Create product in Shopify
const createShopifyProduct = async (session, product) => {
  const client = new shopify.api.clients.Graphql({ session });
  
  const mutation = `
    mutation productCreate($input: ProductInput!) {
      productCreate(input: $input) {
        product {
          id
          title
          handle
          variants(first: 1) {
            edges {
              node {
                id
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  
  // Create the basic product input without variants and images
  const productInput = {
    title: product.title,
    descriptionHtml: product.description,
    vendor: product.vendor,
    productType: product.category,
    tags: product.tags
  };
  
  // Create the product first
  const result = await client.request(mutation, {
    variables: { input: productInput }
  });
  
  if (result.data.productCreate.userErrors.length > 0) {
    throw new Error(result.data.productCreate.userErrors[0].message);
  }
  
  const createdProduct = result.data.productCreate.product;
  
  // Get the default variant ID that was created automatically
  const defaultVariant = createdProduct.variants.edges[0]?.node;
  
  if (defaultVariant) {
    // Update the default variant with our product data using bulk update
    const variantMutation = `
      mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants {
            id
            price
            sku
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    
    const variantInput = [{
      id: defaultVariant.id,
      price: product.price.toString(),
      sku: product.sku,
      weight: product.weight,
      weightUnit: product.weight_unit.toUpperCase(),
      inventoryQuantity: product.inventory_quantity
    }];
    
    const variantResult = await client.request(variantMutation, {
      variables: { 
        productId: createdProduct.id,
        variants: variantInput 
      }
    });
    
    if (variantResult.data.productVariantsBulkUpdate.userErrors.length > 0) {
      console.warn(`Failed to update variant for product ${createdProduct.id}:`, variantResult.data.productVariantsBulkUpdate.userErrors[0].message);
    }
    
    // Note: Inventory management is complex and requires additional API calls
    // For this demo, we're focusing on basic product creation
    // In production, you would handle inventory using inventoryAdjustQuantities mutation
  }
  
  // Add images if available - using simplified approach for demo
  if (product.images && product.images.length > 0) {
    try {
      // For this demo, we'll skip image upload to avoid complexity with media management
      // In a real implementation, you would:
      // 1. Upload the image file using fileCreate mutation
      // 2. Associate the media with the product using productUpdate
      console.log(`Skipping image upload for product ${createdProduct.id} - would upload: ${product.images[0]}`);
    } catch (error) {
      console.warn(`Image handling skipped for product ${createdProduct.id}:`, error.message);
    }
  }
  
  return createdProduct;
};

// Process sync job
syncQueue.process(async (job) => {
  const { jobId, session, batchSize = 10 } = job.data;
  
  console.log(`Starting sync job ${jobId}`);
  
  try {
    // Update job status to processing
    await updateJobStatus(jobId, { status: 'processing' });
    
    // Get total products count first
    const firstBatch = await fetchProductsFromThirdParty(1, 1);
    const totalProducts = firstBatch.total;
    
    await updateJobStatus(jobId, { 
      status: 'processing',
      total_products: totalProducts 
    });
    
    let processedProducts = 0;
    let failedProducts = 0;
    let page = 1;
    const limit = batchSize;
    
    // Process products in batches
    while (true) {
      const batch = await fetchProductsFromThirdParty(page, limit);
      
      if (!batch.products || batch.products.length === 0) {
        break;
      }
      
      // Process each product in the batch
      for (const product of batch.products) {
        try {
          await createShopifyProduct(session, product);
          processedProducts++;
          
          // Update progress every 10 products
          if (processedProducts % 10 === 0) {
            await updateJobStatus(jobId, { 
              processed_products: processedProducts,
              failed_products: failedProducts
            });
            
            // Update job progress
            job.progress(Math.round((processedProducts / totalProducts) * 100));
          }
          
          // Add delay to respect Shopify API rate limits (2 requests per second)
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          console.error(`Failed to create product ${product.id}:`, error.message);
          failedProducts++;
        }
      }
      
      if (!batch.hasMore) {
        break;
      }
      
      page++;
    }
    
    // Update final job status
    await updateJobStatus(jobId, { 
      status: 'completed',
      processed_products: processedProducts,
      failed_products: failedProducts
    });
    
    console.log(`Sync job ${jobId} completed. Processed: ${processedProducts}, Failed: ${failedProducts}`);
    
  } catch (error) {
    console.error(`Sync job ${jobId} failed:`, error.message);
    await updateJobStatus(jobId, { 
      status: 'failed',
      error_message: error.message
    });
    throw error;
  }
});

// Error handling
syncQueue.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err.message);
});

syncQueue.on('completed', (job) => {
  console.log(`Job ${job.id} completed successfully`);
});

// Start a sync job
export const startSyncJob = async (session, options = {}) => {
  const jobId = uuidv4();
  const shopDomain = session.shop;
  
  // Create job record in database
  try {
    await dbRun(`
      INSERT INTO sync_jobs (id, shop_domain, status, total_products, processed_products, failed_products)
      VALUES (?, ?, ?, ?, ?, ?)
    `, jobId, shopDomain, 'queued', 0, 0, 0);
  } catch (error) {
    console.error('Error creating sync job:', error);
    throw error;
  }
  
  // Add job to queue
  const job = await syncQueue.add({
    jobId,
    session,
    batchSize: options.batchSize || 10
  });
  
  return { jobId, queueJobId: job.id };
};

// Get job status
export const getSyncJobStatus = async (jobId) => {
  return await getJobStatus(jobId);
};

// Get all sync jobs for a shop
export const getSyncJobsForShop = async (shopDomain) => {
  return await getAllSyncJobs(shopDomain);
};

// Cancel a sync job
export const cancelSyncJob = async (jobId) => {
  try {
    const jobs = await syncQueue.getJobs(['waiting', 'active', 'delayed']);
    const job = jobs.find(j => j.data.jobId === jobId);
    
    if (job) {
      await job.remove();
      await updateJobStatus(jobId, { status: 'cancelled' });
      return true;
    }
    
    // If job not found in queue, try to cancel it in database anyway
    await updateJobStatus(jobId, { status: 'cancelled' });
    return true;
  } catch (error) {
    console.error('Error in cancelSyncJob:', error);
    return false;
  }
};

// Force cancel all sync jobs
export const forceCancelAllJobs = async () => {
  try {
    console.log('Force canceling all sync jobs...');
    
    // Cancel all jobs in the queue
    const allJobs = await syncQueue.getJobs(['waiting', 'active', 'delayed', 'completed', 'failed']);
    console.log(`Found ${allJobs.length} jobs in queue`);
    
    let cancelledCount = 0;
    for (const job of allJobs) {
      try {
        await job.remove();
        if (job.data.jobId) {
          await updateJobStatus(job.data.jobId, { status: 'cancelled' });
        }
        cancelledCount++;
      } catch (error) {
        console.warn(`Failed to cancel job ${job.id}:`, error.message);
      }
    }
    
    // Also update any processing/queued jobs in database to cancelled
    try {
      await dbRun(`
        UPDATE sync_jobs 
        SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP 
        WHERE status IN ('processing', 'queued')
      `);
    } catch (error) {
      console.warn('Failed to update database jobs:', error.message);
    }
    
    console.log(`Force cancelled ${cancelledCount} jobs`);
    return { success: true, cancelledCount };
  } catch (error) {
    console.error('Error in forceCancelAllJobs:', error);
    return { success: false, error: error.message };
  }
};

export default syncQueue;