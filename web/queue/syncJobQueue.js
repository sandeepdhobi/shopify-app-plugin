import { v4 as uuidv4 } from 'uuid';
import shopify from '../shopify.js';
import sqlite3 from 'sqlite3';
import { promisify } from 'util';

// Simple in-memory job tracking for single job execution
let currentJob = null;
let currentJobController = null;

// Database setup
const db = new sqlite3.Database('./sync_jobs.db');
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
    
    // Update in-memory job if it matches
    if (currentJob && currentJob.id === jobId) {
      currentJob = { ...currentJob, ...updates };
    }
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

// Improved mock third-party API endpoint with reasonable product counts
const fetchProductsFromThirdParty = async (page = 1, limit = 100) => {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 200));
  
  const mockProducts = [];
  const startId = (page - 1) * limit + 1;
  const totalProducts = 1000; // Reduced from 1 million to 1000 for testing
  
  for (let i = 0; i < limit && startId + i - 1 < totalProducts; i++) {
    const id = startId + i - 1;
    mockProducts.push({
      id: `third-party-${id}`,
      title: `Product ${id}`,
      description: `Description for product ${id}`,
      sku: `SKU-${String(id).padStart(6, '0')}`,
      price: (Math.random() * 100 + 10).toFixed(2),
      inventory_quantity: Math.floor(Math.random() * 100),
      category: ['Electronics', 'Clothing', 'Home', 'Books'][Math.floor(Math.random() * 4)],
      tags: ['new', 'popular', 'sale'].slice(0, Math.floor(Math.random() * 3) + 1),
      vendor: 'Third Party Supplier',
      weight: Math.random() * 2,
      weight_unit: 'kg'
    });
  }
  
  return {
    products: mockProducts,
    total: totalProducts,
    page,
    limit,
    hasMore: page * limit < totalProducts
  };
};

// Simplified Shopify product creation with better error handling
const createShopifyProduct = async (session, product) => {
  try {
    console.log(`[DEBUG] Creating Shopify GraphQL client for shop: ${session.shop}`);
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
    
    const productInput = {
      title: product.title,
      descriptionHtml: product.description,
      vendor: product.vendor,
      productType: product.category,
      tags: product.tags
    };
    
    console.log(`[DEBUG] Creating product with input:`, productInput);
    
    const result = await client.request(mutation, {
      variables: { input: productInput }
    });
    
    console.log(`[DEBUG] Product creation result:`, result);
    
    if (result.data.productCreate.userErrors.length > 0) {
      const error = result.data.productCreate.userErrors[0];
      throw new Error(`Shopify API error: ${error.message} (field: ${error.field})`);
    }
    
    const createdProduct = result.data.productCreate.product;
    const defaultVariant = createdProduct.variants.edges[0]?.node;
    
    if (defaultVariant) {
      console.log(`[DEBUG] Updating variant for product ${createdProduct.id}`);
      
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
        const error = variantResult.data.productVariantsBulkUpdate.userErrors[0];
        console.warn(`[WARN] Failed to update variant for product ${createdProduct.id}: ${error.message} (field: ${error.field})`);
      }
    }
    
    return createdProduct;
    
  } catch (error) {
    console.error(`[ERROR] Failed to create Shopify product:`, error);
    throw new Error(`Product creation failed: ${error.message}`);
  }
};

// Optimized job processing function with better error handling and debugging
const processJob = async (jobId, session, batchSize = 10) => {
  console.log(`[DEBUG] Starting sync job ${jobId} with batch size ${batchSize}`);
  console.log(`[DEBUG] Session details:`, { shop: session?.shop, accessToken: session?.accessToken ? 'present' : 'missing' });
  
  try {
    // Validate session first
    if (!session || !session.shop || !session.accessToken) {
      throw new Error('Invalid session - missing shop or accessToken');
    }
    
    await updateJobStatus(jobId, { status: 'processing' });
    console.log(`[DEBUG] Job ${jobId}: Status updated to processing`);
    
    // Get total products count
    console.log(`[DEBUG] Job ${jobId}: Fetching total products count...`);
    const firstBatch = await fetchProductsFromThirdParty(1, 1);
    const totalProducts = firstBatch.total;
    
    console.log(`[DEBUG] Job ${jobId}: Found ${totalProducts} total products to sync`);
    
    await updateJobStatus(jobId, { 
      status: 'processing',
      total_products: totalProducts 
    });
    
    let processedProducts = 0;
    let failedProducts = 0;
    let page = 1;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 50; // Reduced for better error detection
    
    while (currentJob && currentJob.id === jobId && currentJob.status === 'processing') {
      console.log(`[DEBUG] Job ${jobId}: Starting batch ${page}`);
      
      const batch = await fetchProductsFromThirdParty(page, batchSize);
      
      if (!batch.products || batch.products.length === 0) {
        console.log(`[DEBUG] Job ${jobId}: No more products to process`);
        break;
      }
      
      console.log(`[DEBUG] Job ${jobId}: Processing batch ${page} (${batch.products.length} products)`);
      
      // Process products sequentially to avoid overwhelming the API
      for (const product of batch.products) {
        // Check if job was cancelled
        if (!currentJob || currentJob.id !== jobId || currentJob.status !== 'processing') {
          console.log(`[DEBUG] Job ${jobId}: Job was cancelled, stopping processing`);
          return;
        }
        
        try {
          console.log(`[DEBUG] Job ${jobId}: Creating product ${product.id} (${product.title})`);
          await createShopifyProduct(session, product);
          processedProducts++;
          consecutiveErrors = 0; // Reset consecutive error count on success
          console.log(`[DEBUG] Job ${jobId}: Successfully created product ${product.id}`);
          
          // Update progress every 2 products for better tracking
          if (processedProducts % 2 === 0) {
            await updateJobStatus(jobId, { 
              processed_products: processedProducts,
              failed_products: failedProducts 
            });
          }
          
        } catch (error) {
          console.error(`[ERROR] Job ${jobId}: Failed to create product ${product.id}:`, error.message);
          console.error(`[ERROR] Job ${jobId}: Full error:`, error);
          failedProducts++;
          consecutiveErrors++;
          
          // Check if too many consecutive errors
          if (consecutiveErrors >= maxConsecutiveErrors) {
            throw new Error(`Too many consecutive errors (${consecutiveErrors}). Last error: ${error.message}`);
          }
        }
        
        // Rate limiting - 2 requests per second to be safe
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Update progress after each batch
      await updateJobStatus(jobId, { 
        processed_products: processedProducts,
        failed_products: failedProducts 
      });
      
      // Log progress
      const progress = ((processedProducts + failedProducts) / totalProducts * 100).toFixed(1);
      console.log(`[DEBUG] Job ${jobId}: Progress ${progress}% (${processedProducts} processed, ${failedProducts} failed)`);
      
      if (!batch.hasMore) {
        console.log(`[DEBUG] Job ${jobId}: All batches processed`);
        break;
      }
      
      page++;
    }
    
    // Final status update
    if (currentJob && currentJob.id === jobId) {
      await updateJobStatus(jobId, { 
        status: 'completed',
        processed_products: processedProducts,
        failed_products: failedProducts 
      });
      
      console.log(`[SUCCESS] Job ${jobId} completed successfully: ${processedProducts} processed, ${failedProducts} failed`);
      currentJob = null;
      currentJobController = null;
    }
    
  } catch (error) {
    console.error(`[ERROR] Job ${jobId} failed:`, error.message);
    console.error(`[ERROR] Job ${jobId} stack trace:`, error.stack);
    await updateJobStatus(jobId, { 
      status: 'failed',
      error_message: error.message
    });
    currentJob = null;
    currentJobController = null;
  }
};

// Start a sync job (only one allowed at a time)
export const startSyncJob = async (session, options = {}) => {
  // Check if a job is already running
  if (currentJob) {
    throw new Error('A sync job is already running. Please wait for it to complete or cancel it first.');
  }
  
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
  
  // Set current job
  currentJob = {
    id: jobId,
    shop_domain: shopDomain,
    status: 'queued',
    total_products: 0,
    processed_products: 0,
    failed_products: 0
  };
  
  // Create abort controller for cancellation
  currentJobController = new AbortController();
  
  // Start processing immediately with debugging
  console.log(`[DEBUG] Starting processJob for ${jobId} with session shop: ${session?.shop}`);
  processJob(jobId, session, options.batchSize || 10).catch(error => {
    console.error(`[ERROR] Error in processJob for ${jobId}:`, error);
    console.error(`[ERROR] Stack trace:`, error.stack);
    currentJob = null;
    currentJobController = null;
  });
  
  return { jobId };
};

// Get job status
export const getSyncJobStatus = async (jobId) => {
  const dbJob = await getJobStatus(jobId);
  
  // If this is the current job, return the in-memory version for real-time updates
  if (currentJob && currentJob.id === jobId) {
    return { job: currentJob };
  }
  
  return { job: dbJob };
};

// Get all sync jobs for a shop
export const getSyncJobsForShop = async (shopDomain) => {
  const jobs = await getAllSyncJobs(shopDomain);
  return { jobs };
};

// Simplified cancel job function
export const cancelSyncJob = async (jobId) => {
  try {
    if (currentJob && currentJob.id === jobId) {
      currentJob.status = 'cancelled';
      await updateJobStatus(jobId, { status: 'cancelled' });
      
      if (currentJobController) {
        currentJobController.abort();
      }
      
      currentJob = null;
      currentJobController = null;
      
      console.log(`Job ${jobId} cancelled successfully`);
      return { success: true };
    }
    
    // If job not in memory, update database
    await updateJobStatus(jobId, { status: 'cancelled' });
    return { success: true };
  } catch (error) {
    console.error('Error cancelling sync job:', error);
    return { success: false, error: error.message };
  }
};

// Cancel all jobs (simplified since only one can run at a time)
export const forceCancelAllJobs = async () => {
  try {
    let cancelledCount = 0;
    
    if (currentJob) {
      await cancelSyncJob(currentJob.id);
      cancelledCount = 1;
    }
    
    // Update any remaining processing/queued jobs in database
    await dbRun(`
      UPDATE sync_jobs 
      SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP 
      WHERE status IN ('processing', 'queued')
    `);
    
    console.log(`Force cancelled ${cancelledCount} jobs`);
    return { success: true, cancelledCount };
  } catch (error) {
    console.error('Error in forceCancelAllJobs:', error);
    return { success: false, error: error.message };
  }
};

// Get current job status (for health checks)
export const getCurrentJobStatus = () => {
  return currentJob;
};

// Export for testing purposes
export { createShopifyProduct };