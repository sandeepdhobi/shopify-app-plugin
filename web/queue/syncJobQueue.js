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
  
  const response = await fetch('https://api.amazinge.store/partner/api/product', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Token': 'c19149459f35fc80455c2a7b4c41fdd5',
      'origin': 'https://www.thwifty.com',
      'referer': 'https://www.thwifty.com'
    },
    body: JSON.stringify({
      offset_value: (page - 1) * limit
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
    page,
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