// @ts-check
import { join } from "path";
import { readFileSync } from "fs";
import express from "express";
import serveStatic from "serve-static";

import shopify from "./shopify.js";
import productCreator from "./product-creator.js";
import PrivacyWebhookHandlers from "./privacy.js";
import { startSyncJob, getSyncJobStatus, getSyncJobsForShop, forceCancelAllJobs, getCurrentJobStatus, pauseSyncJob, resumeSyncJob } from "./queue/syncJobQueue.js";

const PORT = parseInt(
  process.env.BACKEND_PORT || process.env.PORT || "3000",
  10
);

const STATIC_PATH =
  process.env.NODE_ENV === "production"
    ? `${process.cwd()}/frontend/dist`
    : `${process.cwd()}/frontend/`;

const app = express();

// Set up Shopify authentication and webhook handling
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  shopify.redirectToShopifyOrAppRoot()
);
app.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({ webhookHandlers: PrivacyWebhookHandlers })
);

// If you are adding routes outside of the /api path, remember to
// also add a proxy rule for them in web/frontend/vite.config.js

app.use("/api/*", shopify.validateAuthenticatedSession());

app.use(express.json());

app.get("/api/products/count", async (_req, res) => {
  const client = new shopify.api.clients.Graphql({
    session: res.locals.shopify.session,
  });

  const countData = await client.request(`
    query shopifyProductCount {
      productsCount {
        count
      }
    }
  `);

  res.status(200).send({ count: countData.data.productsCount.count });
});

app.post("/api/products", async (_req, res) => {
  let status = 200;
  let error = null;

  try {
    await productCreator(res.locals.shopify.session);
  } catch (e) {
    console.log(`Failed to process products/create: ${e.message}`);
    status = 500;
    error = e.message;
  }
  res.status(status).send({ success: status === 200, error });
});

app.get("/api/products/list", async (_req, res) => {
  const client = new shopify.api.clients.Graphql({
    session: res.locals.shopify.session,
  });

  try {
    const productsData = await client.request(`
      query getProducts($first: Int!) {
        products(first: $first) {
          edges {
            node {
              id
              title
              handle
              status
              totalInventory
              createdAt
              variants(first: 1) {
                edges {
                  node {
                    id
                    price
                    sku
                    inventoryQuantity
                  }
                }
              }
              featuredImage {
                originalSrc
                altText
              }
            }
          }
        }
      }
    `, {
      variables: {
        first: 50
      }
    });

    const products = productsData.data.products.edges.map(edge => ({
      id: edge.node.id,
      title: edge.node.title,
      handle: edge.node.handle,
      status: edge.node.status.toLowerCase(),
      totalInventory: edge.node.totalInventory,
      createdAt: edge.node.createdAt,
      variants: edge.node.variants.edges.map(variantEdge => ({
        id: variantEdge.node.id,
        price: variantEdge.node.price,
        sku: variantEdge.node.sku,
        inventory_quantity: variantEdge.node.inventoryQuantity
      })),
      image: edge.node.featuredImage
    }));

    res.status(200).send({ products });
  } catch (e) {
    console.log(`Failed to fetch products: ${e.message}`);
    res.status(500).send({ error: e.message });
  }
});

app.get("/api/orders/list", async (_req, res) => {
  const client = new shopify.api.clients.Graphql({
    session: res.locals.shopify.session,
  });

  try {
    const ordersData = await client.request(`
      query getOrders($first: Int!) {
        orders(first: $first) {
          edges {
            node {
              id
              name
              orderNumber
              email
              createdAt
              updatedAt
              totalPrice
              currency
              financialStatus
              fulfillmentStatus
              customer {
                id
                firstName
                lastName
                email
              }
              lineItems(first: 10) {
                edges {
                  node {
                    id
                    title
                    quantity
                    variant {
                      id
                      title
                      price
                    }
                  }
                }
              }
            }
          }
        }
      }
    `, {
      variables: {
        first: 100
      }
    });

    const orders = ordersData.data.orders.edges.map(edge => ({
      id: edge.node.id,
      order_number: edge.node.orderNumber,
      name: edge.node.name,
      email: edge.node.email,
      created_at: edge.node.createdAt,
      updated_at: edge.node.updatedAt,
      total_price: edge.node.totalPrice,
      currency: edge.node.currency,
      financial_status: edge.node.financialStatus?.toLowerCase(),
      fulfillment_status: edge.node.fulfillmentStatus?.toLowerCase(),
      customer: edge.node.customer ? {
        id: edge.node.customer.id,
        first_name: edge.node.customer.firstName,
        last_name: edge.node.customer.lastName,
        email: edge.node.customer.email
      } : null,
      line_items: edge.node.lineItems.edges.map(itemEdge => ({
        id: itemEdge.node.id,
        title: itemEdge.node.title,
        quantity: itemEdge.node.quantity,
        variant: itemEdge.node.variant
      }))
    }));

    res.status(200).send({ orders });
  } catch (e) {
    console.log(`Failed to fetch orders: ${e.message}`);
    res.status(500).send({ error: e.message });
  }
});

// Product Sync Endpoints
app.post("/api/products/sync", async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    const { batchSize = 10, shippingCountry } = req.body;
    
    // Validate shipping country
    if (!shippingCountry) {
      res.status(400).send({ error: "Shipping country is required" });
      return;
    }
    
    const result = await startSyncJob(session, { 
      batchSize, 
      shippingCountry 
    });
    
    res.status(200).send({ 
      success: true, 
      message: `Sync job started successfully for shipping country: ${shippingCountry}`,
      jobId: result.jobId,
      shippingCountry: shippingCountry
    });
  } catch (error) {
    console.error("Failed to start sync job:", error.message);
    res.status(500).send({ error: error.message });
  }
});

app.get("/api/products/sync/:jobId/status", async (req, res) => {
  try {
    const { jobId } = req.params;
    const result = await getSyncJobStatus(jobId);
    
    if (!result.job) {
      res.status(404).send({ error: "Job not found" });
      return;
    }
    
    res.status(200).send(result);
  } catch (error) {
    console.error("Failed to get sync job status:", error.message);
    res.status(500).send({ error: error.message });
  }
});

app.get("/api/products/sync/history", async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    const result = await getSyncJobsForShop(session.shop);
    
    res.status(200).send(result);
  } catch (error) {
    console.error("Failed to get sync job history:", error.message);
    res.status(500).send({ error: error.message });
  }
});



app.delete("/api/products/sync/force/all", async (req, res) => {
  try {
    const result = await forceCancelAllJobs();
    
    if (!result.success) {
      res.status(500).send({ error: result.error });
      return;
    }
    
    res.status(200).send({ 
      success: true, 
      message: `Force cancelled ${result.cancelledCount} jobs`,
      cancelledCount: result.cancelledCount
    });
  } catch (error) {
    console.error("Failed to force cancel all jobs:", error.message);
    res.status(500).send({ error: error.message });
  }
});

// Pause sync job
app.post("/api/products/sync/:jobId/pause", async (req, res) => {
  try {
    const { jobId } = req.params;
    const result = await pauseSyncJob(jobId);
    
    if (!result.success) {
      res.status(400).send({ error: result.error || "Failed to pause sync job" });
      return;
    }
    
    res.status(200).send({ 
      success: true, 
      message: "Sync job paused successfully" 
    });
  } catch (error) {
    console.error("Failed to pause sync job:", error.message);
    res.status(500).send({ error: error.message });
  }
});

// Resume sync job
app.post("/api/products/sync/:jobId/resume", async (req, res) => {
  try {
    const { jobId } = req.params;
    const session = res.locals.shopify.session;
    const { batchSize = 50 } = req.body;
    
    const result = await resumeSyncJob(jobId, session, { batchSize });
    
    if (!result.success) {
      res.status(400).send({ error: result.error || "Failed to resume sync job" });
      return;
    }
    
    res.status(200).send({ 
      success: true, 
      message: "Sync job resumed successfully" 
    });
  } catch (error) {
    console.error("Failed to resume sync job:", error.message);
    res.status(500).send({ error: error.message });
  }
});

// Get current job status (for health checks)
app.get("/api/products/sync/current", async (req, res) => {
  try {
    const currentJob = getCurrentJobStatus();
    
    res.status(200).send({ 
      hasActiveJob: !!currentJob,
      currentJob: currentJob 
    });
  } catch (error) {
    console.error("Failed to get current job status:", error.message);
    res.status(500).send({ error: error.message });
  }
});

// Test endpoint to debug single product creation
app.post("/api/products/sync/test", async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    
    // Create a single test product
    const testProduct = {
      id: 'test-product-1',
      title: 'Test Product',
      description: 'This is a test product for debugging',
      sku: 'TEST-001',
      price: '19.99',
      inventory_quantity: 10,
      category: 'Electronics',
      tags: ['test', 'debug'],
      vendor: 'Test Vendor',
      weight: 0.5,
      weight_unit: 'kg'
    };
    
    console.log(`[DEBUG] Testing product creation with session shop: ${session?.shop}`);
    console.log(`[DEBUG] Session details:`, { shop: session?.shop, accessToken: session?.accessToken ? 'present' : 'missing' });
    
    const { createShopifyProduct } = await import('./queue/syncJobQueue.js');
    const result = await createShopifyProduct(session, testProduct);
    
    res.status(200).send({ 
      success: true,
      message: "Test product created successfully",
      product: result
    });
  } catch (error) {
    console.error("Failed to create test product:", error.message);
    console.error("Full error:", error);
    res.status(500).send({ 
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Subscription Plans API Routes
app.get("/api/plans", async (_req, res) => {
  try {
    const plans = [
      {
        id: 'free',
        name: 'Starter',
        price: 0,
        interval: 'month',
        badge: 'BASIC',
        badgeStatus: 'attention',
        description: 'Perfect for testing our services',
        features: [
          'Up to 10000 products sourced monthly',
          'Basic product research & validation',
          'Standard shipping (5-7 business days)',
          'Email support',
          'Basic inventory management',
          'Order tracking dashboard',
          'Standard packaging',
          'US domestic shipping only',
          'Basic analytics & reporting'
        ],
        buttonText: 'Current plan',
        buttonVariant: 'plain'
      },
      {
        id: 'pro',
        name: 'Professional',
        price: 49,
        interval: 'month',
        badge: 'PRO',
        badgeStatus: 'success',
        description: '14-day free trial',
        features: [
          'Up to 100 million products sourced monthly',
          'Advanced product research & market analysis',
          'Priority shipping (2-3 business days)',
          'Priority email & chat support',
          'Automated inventory management',
          'Advanced order tracking & notifications',
          'Custom branded packaging available',
          'US & Canada shipping',
          'Detailed analytics & profit tracking',
          'Quality control inspections',
          'Returns & refunds handling',
          'Supplier relationship management'
        ],
        isRecommended: true,
        buttonText: 'Select plan',
        buttonVariant: 'primary'
      }
    ];
    
    res.status(200).send({ plans });
  } catch (e) {
    console.log(`Failed to fetch plans: ${e.message}`);
    res.status(500).send({ error: e.message });
  }
});

// Get current subscription status
app.get("/api/subscription/status", async (_req, res) => {
  try {
    const session = res.locals.shopify.session;
    // In a real app, you'd check the subscription status from your database
    // For demo purposes, returning a mock response
    const subscriptionStatus = {
      active: false,
      plan: null,
      trial_ends_at: null,
      current_period_end: null
    };
    
    res.status(200).send({ subscription: subscriptionStatus });
  } catch (e) {
    console.log(`Failed to fetch subscription status: ${e.message}`);
    res.status(500).send({ error: e.message });
  }
});

// Create subscription
app.post("/api/subscription/create", async (req, res) => {
  try {
    const { planId } = req.body;
    const session = res.locals.shopify.session;
    
    if (!planId) {
      res.status(400).send({ error: "Plan ID is required" });
      return;
    }

    // In a real app, you would:
    // 1. Validate the plan ID
    // 2. Create a Shopify App Subscription or integrate with payment provider
    // 3. Store subscription data in your database
    // 4. Handle webhooks for subscription updates
    
    // For demo purposes, using Shopify's App Subscription API
    const client = new shopify.api.clients.Graphql({
      session: session,
    });

    // Find the plan details
    const plans = [
      { id: "free", name: "Free", price: 0 },
      { id: "pro", name: "Pro", price: 6 },
      { id: "plus", name: "Plus", price: 20 }
    ];
    
    const selectedPlan = plans.find(p => p.id === planId);
    if (!selectedPlan) {
      res.status(400).send({ error: "Invalid plan ID" });
      return;
    }

    // Handle free plan
    if (selectedPlan.id === "free") {
      res.status(200).send({ 
        success: true, 
        message: "Free plan is already active",
        confirmationUrl: `${process.env.SHOPIFY_APP_URL}/plans?subscription=free`
      });
      return;
    }

    // Create App Subscription
    const subscriptionData = await client.request(`
      mutation appSubscriptionCreate($name: String!, $returnUrl: URL!, $lineItems: [AppSubscriptionLineItemInput!]!) {
        appSubscriptionCreate(name: $name, returnUrl: $returnUrl, lineItems: $lineItems) {
          appSubscription {
            id
            name
            status
          }
          confirmationUrl
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        name: `${selectedPlan.name} Plan`,
        returnUrl: `${process.env.SHOPIFY_APP_URL}/plans?subscription=success`,
        lineItems: [{
          plan: {
            appRecurringPricingDetails: {
              price: { amount: selectedPlan.price, currencyCode: "USD" },
              interval: "EVERY_30_DAYS"
            }
          }
        }]
      }
    });

    if (subscriptionData.data.appSubscriptionCreate.userErrors.length > 0) {
      res.status(400).send({ 
        error: subscriptionData.data.appSubscriptionCreate.userErrors[0].message 
      });
      return;
    }

    res.status(200).send({
      success: true,
      confirmationUrl: subscriptionData.data.appSubscriptionCreate.confirmationUrl,
      subscription: subscriptionData.data.appSubscriptionCreate.appSubscription
    });
    
  } catch (e) {
    console.log(`Failed to create subscription: ${e.message}`);
    res.status(500).send({ error: e.message });
  }
});

// Get shop market information (country and currency)
app.get("/api/shop/market-info", async (_req, res) => {
  const client = new shopify.api.clients.Graphql({
    session: res.locals.shopify.session,
  });

  try {
    const shopData = await client.request(`
      query getShopMarketInfo {
        shop {
          id
          name
          email
          url
          myshopifyDomain
          currencyCode
          timezoneAbbreviation
          ianaTimezone
          plan {
            displayName
            partnerDevelopment
            shopifyPlus
          }
          billingAddress {
            country
            countryCodeV2 
            province
            city
            address1
            address2
            zip
          }
          shipsToCountries
        }
      }
    `);

    // Try to get additional market data if permissions allow
    let marketsData = null;
    try {
      const additionalData = await client.request(`
        query getMarketsData {
          markets(first: 5) {
            edges {
              node {
                id
                name
                enabled
                primary
                handle
                regions(first: 10) {
                  edges {
                    node {
                      id
                      name
                      countryCode
                    }
                  }
                }
                currencySettings {
                  baseCurrency {
                    currencyCode
                    currencyName
                  }
                  localCurrencies
                }
              }
            }
          }
        }
      `);
      marketsData = additionalData.data.markets;
    } catch (marketError) {
      console.log('Markets data not accessible:', marketError.message);
    }

    // Return raw data from Shopify API
    res.status(200).send({
      raw_shopify_response: {
        shop: shopData.data.shop,
        markets: marketsData
      },
      session_info: {
        shop: res.locals.shopify.session.shop,
        scope: res.locals.shopify.session.scope
      },
      api_version: "2024-10",
      query_info: {
        description: "Basic shop info with shipping countries and optional markets data",
        shop_data_available: true,
        markets_data_available: marketsData ? true : false,
        includes: [
          "shop_basic_info",
          "billing_address", 
          "ships_to_countries",
          "shopify_plan",
          "markets_if_accessible"
        ]
      }
    });
  } catch (e) {
    console.log(`Failed to fetch shop market info: ${e.message}`);
    console.error('Full error:', e);
    res.status(500).send({ 
      error: e.message,
      raw_error: e.toString(),
      details: 'Check server logs for more information. This might be a GraphQL permissions issue.'
    });
  }
});

app.use(shopify.cspHeaders());
app.use(serveStatic(STATIC_PATH, { index: false }));

app.use("/*", shopify.ensureInstalledOnShop(), async (_req, res, _next) => {
  res
    .status(200)
    .set("Content-Type", "text/html")
    .send(
      readFileSync(join(STATIC_PATH, "index.html"))
        .toString()
        .replace("%VITE_SHOPIFY_API_KEY%", process.env.SHOPIFY_API_KEY || "")
    );
});

app.listen(PORT);
