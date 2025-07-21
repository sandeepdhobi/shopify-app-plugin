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
      current_offset INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      error_message TEXT
    )
  `);
  
  // Add current_offset column if it doesn't exist (for existing databases)
  db.run(`ALTER TABLE sync_jobs ADD COLUMN current_offset INTEGER DEFAULT 0`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding current_offset column:', err);
    }
  });
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
const fetchProductsFromThirdParty = async (offset_value = 0, limit = 100) => {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 200));
  
  const response = await fetch('https://api.amazinge.store/partner/api/product', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Token': 'c19149459f35fc80455c2a7b4c41fdd5',
      'origin': 'https://www.thwifty.com',
      'referer': 'https://www.thwifty.com'
    },
    body: JSON.stringify({
      offset_value
    })
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  console.log('API Response:', data);
  
  // Map API products to expected format
  const products = data.products ? data.products.map(apiProduct => ({
    id: `third-party-${apiProduct.id}`,
    title: apiProduct.title,
    description: apiProduct.description,
    sku: apiProduct.current_variants?.CPU || `SKU-${apiProduct.id}`,
    price: apiProduct.price_in_usd?.toString() || '0',
    inventory_quantity: apiProduct.in_stock || 0,
    category: apiProduct.brand || 'Electronics',
    tags: apiProduct.features ? apiProduct.features.slice(0, 3).map(feature => 
      feature.split(' ').slice(0, 2).join(' ').toLowerCase()
    ) : ['imported'],
    vendor: apiProduct.brand || 'Third Party Supplier',
    weight: apiProduct.weight_in_grams ? apiProduct.weight_in_grams / 1000 : 1, // Convert to kg
    weight_unit: 'kg',
    images: apiProduct.image_urls ? apiProduct.image_urls.split(',').map(url => url.trim()) : [apiProduct.main_image],
    main_image: apiProduct.main_image
  })) : [];
  
  return {
    products,
    total: data.total || products.length,
    offset_value: data.next_offset_value,
    limit,
    hasMore: data.has_more || false
  };
};

// Simplified Shopify product creation with better error handling
const createShopifyProduct = async (session, product) => {
  try {
    console.log(`[DEBUG] Creating Shopify GraphQL client for shop: ${session.shop}`);
    const client = new shopify.api.clients.Graphql({ session });
    
    
    const onlineStoreId = "gid://shopify/Publication/168777810076"; //  onlineStoreSalesChannel?.node.id;
    console.log(`[DEBUG] Online Store sales channel ID: ${onlineStoreId}`);
    
    // Create the product without variants
    const createProductMutation = `
      mutation productCreate($input: ProductInput!, $media: [CreateMediaInput!]) {
        productCreate(input: $input, media: $media) {
          product {
            id
            title
            handle
            media(first: 10) {
              edges {
                node {
                  id
                  ... on MediaImage {
                    image {
                      id
                      url
                      altText
                    }
                  }
                }
              }
            }
            variants(first: 1) {
              edges {
                node {
                  id
                  sku
                  price
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
    
    // Product input without variants (variants are not allowed in ProductInput)
    const productInput = {
      title: product.title,
      descriptionHtml: product.description,
      vendor: product.vendor,
      productType: product.category,
      tags: product.tags
    };

    // Prepare media input for images
    const mediaInput = product.images ? product.images.map(imageUrl => ({
      originalSource: imageUrl,
      alt: product.title,
      mediaContentType: 'IMAGE'
    })) : [];
    
    console.log(`[DEBUG] Creating product with input:`, productInput);
    console.log(`[DEBUG] Media input:`, mediaInput);
    
    const result = await client.request(createProductMutation, {
      variables: { 
        input: productInput,
        media: mediaInput.length > 0 ? mediaInput : undefined
      }
    });
    
    console.log(`[DEBUG] Product creation result:`, result);
    
    if (result.data.productCreate.userErrors.length > 0) {
      const error = result.data.productCreate.userErrors[0];
      throw new Error(`Shopify API error: ${error.message} (field: ${error.field})`);
    }
    
    const createdProduct = result.data.productCreate.product;
    
    // Now update the default variant with price and other properties
    if (createdProduct.variants.edges.length > 0) {
      const defaultVariantId = createdProduct.variants.edges[0].node.id;
      
      const updateVariantMutation = `
        mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants {
              id
              price
              sku
              inventoryQuantity
            }
            userErrors {
              field
              message
            }
          }
        }
      `;
      
      const variantInput = {
        id: defaultVariantId,
        price: product.price,
        inventoryItem: {
          sku: product.sku,
          // tracked: true
        }
      };
      
      console.log(`[DEBUG] Updating variant with input:`, variantInput);
      
      const variantResult = await client.request(updateVariantMutation, {
        variables: { 
          productId: createdProduct.id,
          variants: [variantInput]
        }
      });
      
      console.log(`[DEBUG] Variant update result:`, variantResult);
      
      if (variantResult.data.productVariantsBulkUpdate.userErrors.length > 0) {
        const error = variantResult.data.productVariantsBulkUpdate.userErrors[0];
        console.warn(`[WARNING] Variant update failed: ${error.message} (field: ${error.field})`);
        // Don't throw here as the product was created successfully
      } else {
        // Handle inventory quantity separately if variant update was successful
        const inventoryQuantity = product.inventory_quantity || 15;
        if (inventoryQuantity > 0) {
          try {
            const updatedVariant = variantResult.data.productVariantsBulkUpdate.productVariants[0];
            
            // Get inventory item ID from the updated variant
            const inventoryItemQuery = `
              query getInventoryItem($variantId: ID!) {
                productVariant(id: $variantId) {
                  inventoryItem {
                    id
                    inventoryLevels(first: 1) {
                      nodes {
                        id
                        location {
                          id
                        }
                      }
                    }
                  }
                }
              }
            `;
            
            const inventoryItemResult = await client.request(inventoryItemQuery, {
              variables: { variantId: updatedVariant.id }
            });
            
            const inventoryItem = inventoryItemResult.data.productVariant.inventoryItem;
            if (inventoryItem && inventoryItem.inventoryLevels.nodes.length > 0) {
              const inventoryLevelId = inventoryItem.inventoryLevels.nodes[0].id;
              
              // Set inventory quantity
              const inventoryMutation = `
                mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
                  inventorySetQuantities(input: $input) {
                    inventoryAdjustmentGroup {
                      id
                    }
                    userErrors {
                      field
                      message
                    }
                  }
                }
              `;
              
              const inventoryInput = {
                reason: "correction",
                name: "available",
                ignoreCompareQuantity: true,
                quantities: [
                  {
                    inventoryLevelId: inventoryLevelId,
                    quantity: inventoryQuantity
                  }
                ]
              };
              
              const inventoryResult = await client.request(inventoryMutation, {
                variables: { input: inventoryInput }
              });
              
              if (inventoryResult.data.inventorySetQuantities.userErrors.length > 0) {
                const inventoryError = inventoryResult.data.inventorySetQuantities.userErrors[0];
                console.warn(`[WARNING] Inventory update failed: ${inventoryError.message} (field: ${inventoryError.field})`);
              } else {
                console.log(`[SUCCESS] Set inventory quantity to ${inventoryQuantity} for variant ${updatedVariant.id}`);
              }
            }
          } catch (inventoryError) {
            console.warn(`[WARNING] Failed to set inventory quantity: ${inventoryError.message}`);
          }
        }
      }
    }
    
    // Publish the product to the Online Store sales channel
    if (onlineStoreId) {
      try {
        console.log(`[DEBUG] Publishing product ${createdProduct.id} to Online Store sales channel...`);
        
        const publishProductMutation = `
          mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
            publishablePublish(id: $id, input: $input) {
              publishable {
                ... on Product {
                  id
                  title
                  publishedAt
                }
              }
              shop {
                id
              }
              userErrors {
                field
                message
              }
            }
          }
        `;
        
        const publishResult = await client.request(publishProductMutation, {
          variables: {
            id: createdProduct.id,
            input: [
              {
                publicationId: onlineStoreId,
                publishDate: new Date().toISOString()
              }
            ]
          }
        });
        
        console.log(`[DEBUG] Product publish result:`, publishResult);
        
        if (publishResult.data.publishablePublish.userErrors.length > 0) {
          const publishError = publishResult.data.publishablePublish.userErrors[0];
          console.warn(`[WARNING] Product publish failed: ${publishError.message} (field: ${publishError.field})`);
        } else {
          console.log(`[SUCCESS] Product ${createdProduct.id} published to Online Store successfully`);
        }
        
      } catch (publishError) {
        console.warn(`[WARNING] Failed to publish product to Online Store: ${publishError.message}`);
        // Don't throw here as the product was created successfully
      }
    }
    
    console.log(`[SUCCESS] Created product ${createdProduct.id} with ${createdProduct.media.edges.length} media items`);
    
    return createdProduct;
    
  } catch (error) {
    console.error(`[ERROR] Failed to create Shopify product:`, error);
    throw new Error(`Product creation failed: ${error.message}`);
  }
};

// Optimized job processing function with better error handling and debugging
const processJob = async (jobId, session, batchSize = 50, resumeFromOffset = null) => {
  console.log(`[DEBUG] Starting sync job ${jobId} with batch size ${batchSize}`);
  console.log(`[DEBUG] Session details:`, { shop: session?.shop, accessToken: session?.accessToken ? 'present' : 'missing' });
  
  try {
    // Validate session first
    if (!session || !session.shop || !session.accessToken) {
      throw new Error('Invalid session - missing shop or accessToken');
    }
    
    await updateJobStatus(jobId, { status: 'processing' });
    console.log(`[DEBUG] Job ${jobId}: Status updated to processing`);
    
    // Get current job state from database to check for resume
    const currentJobState = await getJobStatus(jobId);
    let processedProducts = currentJobState?.processed_products || 0;
    let failedProducts = currentJobState?.failed_products || 0;
    let offset_value = resumeFromOffset !== null ? resumeFromOffset : (currentJobState?.current_offset || 0);
    
    console.log(`[DEBUG] Job ${jobId}: Resuming from offset ${offset_value}, processed: ${processedProducts}, failed: ${failedProducts}`);
    
    // Get total products count - fetch a batch to get accurate total (only if not resuming or total not set)
    let totalProducts = currentJobState?.total_products;
    if (!totalProducts || totalProducts === 0) {
      console.log(`[DEBUG] Job ${jobId}: Fetching total products count...`);
      const initialBatch = await fetchProductsFromThirdParty(0, batchSize);
      totalProducts = initialBatch.total && initialBatch.total > initialBatch.products.length ? initialBatch.total : null;
      console.log(`[DEBUG] Job ${jobId}: API returned total: ${initialBatch.total}, using: ${totalProducts || 'unknown - will update as we process'}`);
      
      await updateJobStatus(jobId, { 
        status: 'processing',
        total_products: totalProducts || 0 
      });
    }
    
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 50; // Reduced for better error detection
    
    while (currentJob && currentJob.id === jobId && currentJob.status === 'processing') {
      console.log(`[DEBUG] Job ${jobId}: Processing batch at offset ${offset_value}`);
      
      // Fetch data for current offset
      const batch = await fetchProductsFromThirdParty(offset_value, batchSize);
      
      // Update current offset in database for pause/resume functionality
      await updateJobStatus(jobId, { current_offset: offset_value });
      
      if (!batch.products || batch.products.length === 0) {
        console.log(`[DEBUG] Job ${jobId}: No more products to process`);
        break;
      }
      
      console.log(`[DEBUG] Job ${jobId}: Processing batch ${offset_value} (${batch.products.length} products)`);
      
      // Process products sequentially to avoid overwhelming the API
      for (const product of batch.products) {
        // Check if job was cancelled or paused
        if (!currentJob || currentJob.id !== jobId) {
          console.log(`[DEBUG] Job ${jobId}: Job reference lost, stopping processing`);
          return;
        }
        
        if (currentJob.status === 'cancelled') {
          console.log(`[DEBUG] Job ${jobId}: Job was cancelled, stopping processing`);
          return;
        }
        
        if (currentJob.status === 'paused') {
          console.log(`[DEBUG] Job ${jobId}: Job was paused, stopping processing`);
          // Update final state before pausing
          await updateJobStatus(jobId, { 
            processed_products: processedProducts,
            failed_products: failedProducts,
            current_offset: offset_value,
            status: 'paused'
          });
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
      if (totalProducts && totalProducts > 0) {
        const progress = ((processedProducts + failedProducts) / totalProducts * 100).toFixed(1);
        console.log(`[DEBUG] Job ${jobId}: Progress ${progress}% (${processedProducts} processed, ${failedProducts} failed)`);
      } else {
        console.log(`[DEBUG] Job ${jobId}: Progress unknown - ${processedProducts} processed, ${failedProducts} failed`);
      }
      
      // Check if we have a next offset value to continue
      if (batch.offset_value === null || batch.offset_value === undefined) {
        console.log(`[DEBUG] Job ${jobId}: No more offset_value, all batches processed`);
        break;
      }
      
      offset_value = batch.offset_value;
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
// Options:
//   - batchSize: Number of products to process per batch (default: 50, max: 100)
export const startSyncJob = async (session, options = {}) => {
  // Check if a job is already running
  if (currentJob) {
    throw new Error('A sync job is already running. Please wait for it to complete or cancel it first.');
  }
  
  // Validate and set batch size
  const batchSize = options.batchSize || 50;
  if (batchSize < 1 || batchSize > 100) {
    throw new Error('Batch size must be between 1 and 100 products');
  }
  
  console.log(`[DEBUG] Starting sync job with batch size: ${batchSize}`);
  
  const jobId = uuidv4();
  const shopDomain = session.shop;
  
  // Create job record in database
  try {
    await dbRun(`
      INSERT INTO sync_jobs (id, shop_domain, status, total_products, processed_products, failed_products, current_offset)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, jobId, shopDomain, 'queued', 0, 0, 0, 0);
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
    failed_products: 0,
    current_offset: 0
  };
  
  // Create abort controller for cancellation
  currentJobController = new AbortController();
  
  // Start processing immediately with debugging
  console.log(`[DEBUG] Starting processJob for ${jobId} with session shop: ${session?.shop}`);
  processJob(jobId, session, batchSize).catch(error => {
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



// Cancel all jobs (simplified since only one can run at a time)
export const forceCancelAllJobs = async () => {
  try {
    let cancelledCount = 0;
    
    if (currentJob) {
      // Cancel the current job directly
      currentJob.status = 'cancelled';
      await updateJobStatus(currentJob.id, { status: 'cancelled' });
      
      if (currentJobController) {
        currentJobController.abort();
      }
      
      console.log(`Force cancelled current job ${currentJob.id}`);
      currentJob = null;
      currentJobController = null;
      cancelledCount = 1;
    }
    
    // Update any remaining processing/queued/paused jobs in database
    await dbRun(`
      UPDATE sync_jobs 
      SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP 
      WHERE status IN ('processing', 'queued', 'paused')
    `);
    
    console.log(`Force cancelled ${cancelledCount} jobs`);
    return { success: true, cancelledCount };
  } catch (error) {
    console.error('Error in forceCancelAllJobs:', error);
    return { success: false, error: error.message };
  }
};

// Pause a sync job
export const pauseSyncJob = async (jobId) => {
  try {
    // Check if this is the currently running job
    if (currentJob && currentJob.id === jobId && currentJob.status === 'processing') {
      // Set the in-memory job status to paused - the processing loop will handle the rest
      currentJob.status = 'paused';
      console.log(`[DEBUG] Job ${jobId}: Pause requested, processing loop will handle the pause`);
      return { success: true };
    }
    
    // If job exists in database but isn't currently running, update database directly
    const dbJob = await getJobStatus(jobId);
    if (dbJob) {
      if (dbJob.status === 'processing' || dbJob.status === 'queued') {
        await updateJobStatus(jobId, { status: 'paused' });
        console.log(`[DEBUG] Job ${jobId}: Paused in database`);
        return { success: true };
      } else {
        return { success: false, error: `Job is in ${dbJob.status} state and cannot be paused` };
      }
    }
    
    return { success: false, error: 'Job not found' };
  } catch (error) {
    console.error(`Error pausing sync job ${jobId}:`, error);
    return { success: false, error: error.message };
  }
};

// Resume a paused sync job
export const resumeSyncJob = async (jobId, session, options = {}) => {
  try {
    // Check if another job is already running
    if (currentJob && currentJob.id !== jobId) {
      throw new Error('Another sync job is already running. Please wait for it to complete or cancel it first.');
    }
    
    // Get job from database
    const dbJob = await getJobStatus(jobId);
    if (!dbJob) {
      return { success: false, error: 'Job not found' };
    }
    
    if (dbJob.status !== 'paused') {
      return { success: false, error: `Job is in ${dbJob.status} state and cannot be resumed` };
    }
    
    // Validate session
    if (!session || !session.shop || !session.accessToken) {
      throw new Error('Invalid session - missing shop or accessToken');
    }
    
    // Set up current job in memory
    currentJob = {
      id: jobId,
      shop_domain: dbJob.shop_domain,
      status: 'processing',
      total_products: dbJob.total_products,
      processed_products: dbJob.processed_products,
      failed_products: dbJob.failed_products,
      current_offset: dbJob.current_offset
    };
    
    // Create abort controller for cancellation
    currentJobController = new AbortController();
    
    // Validate and set batch size
    const batchSize = options.batchSize || 50;
    if (batchSize < 1 || batchSize > 100) {
      throw new Error('Batch size must be between 1 and 100 products');
    }
    
    console.log(`[DEBUG] Resuming sync job ${jobId} from offset ${dbJob.current_offset} with batch size: ${batchSize}`);
    
    // Start processing from the stored offset
    processJob(jobId, session, batchSize, dbJob.current_offset).catch(error => {
      console.error(`[ERROR] Error in processJob for resumed job ${jobId}:`, error);
      console.error(`[ERROR] Stack trace:`, error.stack);
      currentJob = null;
      currentJobController = null;
    });
    
    return { success: true };
  } catch (error) {
    console.error(`Error resuming sync job ${jobId}:`, error);
    return { success: false, error: error.message };
  }
};

// Get current job status (for health checks)
export const getCurrentJobStatus = () => {
  return currentJob;
};

// Export for testing purposes
export { createShopifyProduct };