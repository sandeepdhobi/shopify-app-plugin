import React, { useState, useEffect } from "react";
import {
  Card,
  Stack,
  Text,
  Badge,
  Spinner,
  Box,
} from "@shopify/polaris";

export default function MarketInfo({ compact = false }) {
  const [apiResponse, setApiResponse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchMarketInfo();
  }, []);

  const fetchMarketInfo = async () => {
    try {
      const response = await fetch("/api/shop/market-info");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setApiResponse(data);
    } catch (err) {
      console.error("Error fetching market info:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card sectioned>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Spinner size="small" />
          <Text variant="bodyMd">Loading shop information...</Text>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card sectioned>
        <Text variant="bodyMd" color="critical">
          Error loading shop info: {error}
        </Text>
      </Card>
    );
  }

  if (!apiResponse) {
    return (
      <Card sectioned>
        <Text variant="bodyMd" color="subdued">
          Shop information not available
        </Text>
      </Card>
    );
  }

  const shop = apiResponse.raw_shopify_response?.shop;
  const markets = apiResponse.raw_shopify_response?.markets?.edges || [];
  const queryInfo = apiResponse.query_info || {};

  if (compact) {
    return (
      <Card sectioned>
        <Stack alignment="center" spacing="tight">
          <Badge tone="success" size="small">
            {shop?.billingAddress?.countryCodeV2 || 'Unknown'}
          </Badge>
          <Text variant="bodyMd" fontWeight="semibold">
            {shop?.billingAddress?.country || 'Unknown Country'}
          </Text>
          <div style={{ width: "1px", height: "16px", backgroundColor: "#E1E3E5" }}></div>
          <Text variant="bodyMd" fontWeight="semibold">
            {shop?.currencyCode || 'USD'}
          </Text>
          <Badge tone="info" size="small">
            Ships to: {shop?.shipsToCountries?.length || 0} countries
          </Badge>
          {shop?.plan?.shopifyPlus && (
            <Badge tone="success" size="small">Shopify Plus</Badge>
          )}
        </Stack>
      </Card>
    );
  }

  return (
    <Card title="Shop & Market Information" sectioned>
      <Stack vertical spacing="loose">
        {/* Quick Summary from Raw Data */}
        <Box>
          <Text variant="headingMd" as="h3" style={{ marginBottom: "8px" }}>
            Quick Summary
          </Text>
          <Stack alignment="center" spacing="tight">
            <Badge tone="success" size="medium">
              {shop?.billingAddress?.countryCodeV2 || 'Unknown'}
            </Badge>
            <Text variant="headingMd" fontWeight="semibold">
              {shop?.billingAddress?.country || 'Unknown Country'}
            </Text>
            <div style={{ width: "2px", height: "20px", backgroundColor: "#E1E3E5" }}></div>
            <Text variant="headingMd" fontWeight="semibold">
              {shop?.currencyCode || 'USD'}
            </Text>
            <Badge tone="info" size="medium">
              {shop?.name || 'Shop'}
            </Badge>
            {shop?.plan?.shopifyPlus && (
              <Badge tone="success" size="medium">Shopify Plus</Badge>
            )}
          </Stack>
        </Box>

        {/* Countries Where Store Sells */}
        <Box>
          <Text variant="headingMd" as="h3" style={{ marginBottom: "12px" }}>
            Countries Where Store Sells Products
          </Text>
          <div style={{
            backgroundColor: "#f6f6f7",
            border: "1px solid #e1e3e5",
            borderRadius: "8px",
            padding: "16px"
          }}>
            <Text variant="bodyMd" fontWeight="semibold" style={{ marginBottom: "8px" }}>
              Ships to Countries: {shop?.shipsToCountries?.length || 0}
            </Text>
            {shop?.shipsToCountries && shop.shipsToCountries.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                {shop.shipsToCountries.map((country, index) => (
                  <Badge key={index} tone="neutral" size="small">
                    {country}
                  </Badge>
                ))}
              </div>
            ) : (
              <Text variant="bodyMd" color="subdued">No shipping countries configured</Text>
            )}
          </div>
        </Box>

        {/* Shop Plan Information */}
        {shop?.plan && (
          <Box>
            <Text variant="headingMd" as="h3" style={{ marginBottom: "12px" }}>
              Shop Plan Details
            </Text>
            <div style={{
              backgroundColor: "#f6f6f7",
              border: "1px solid #e1e3e5",
              borderRadius: "8px",
              padding: "16px"
            }}>
              <Stack spacing="tight">
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Text variant="bodyMd" fontWeight="semibold">Plan:</Text>
                  <Badge tone={shop.plan.shopifyPlus ? "success" : "info"} size="medium">
                    {shop.plan.displayName}
                  </Badge>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Text variant="bodyMd" fontWeight="semibold">Partner Development:</Text>
                  <Badge tone={shop.plan.partnerDevelopment ? "info" : "neutral"} size="small">
                    {shop.plan.partnerDevelopment ? "Yes" : "No"}
                  </Badge>
                </div>
              </Stack>
            </div>
          </Box>
        )}

        {/* Markets Information */}
        {queryInfo.markets_data_available && markets.length > 0 ? (
          <Box>
            <Text variant="headingMd" as="h3" style={{ marginBottom: "12px" }}>
              Markets ({markets.length})
            </Text>
            <div style={{
              backgroundColor: "#f6f6f7",
              border: "1px solid #e1e3e5",
              borderRadius: "8px",
              padding: "16px",
              overflow: "auto",
              maxHeight: "300px"
            }}>
              <pre style={{
                fontSize: "12px",
                fontFamily: "SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace",
                margin: 0,
                whiteSpace: "pre-wrap"
              }}>
                {JSON.stringify(markets.map(m => m.node), null, 2)}
              </pre>
            </div>
          </Box>
        ) : (
          <Box>
            <Text variant="headingMd" as="h3" style={{ marginBottom: "12px" }}>
              Markets Information
            </Text>
            <div style={{
              backgroundColor: "#fff6f6",
              border: "1px solid #f5c6cb",
              borderRadius: "8px",
              padding: "16px"
            }}>
              <Text variant="bodyMd" color="subdued">
                Markets data not accessible with current app permissions. This is normal for basic Shopify apps.
              </Text>
            </div>
          </Box>
        )}

        {/* Session & Query Information */}
        <Box>
          <Text variant="headingMd" as="h3" style={{ marginBottom: "12px" }}>
            Session & Query Information
          </Text>
          <div style={{
            backgroundColor: "#f6f6f7",
            border: "1px solid #e1e3e5",
            borderRadius: "8px",
            padding: "16px",
            overflow: "auto"
          }}>
            <pre style={{
              fontSize: "12px",
              fontFamily: "SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace",
              margin: 0,
              whiteSpace: "pre-wrap"
            }}>
              {JSON.stringify({
                session_info: apiResponse.session_info,
                query_info: apiResponse.query_info,
                api_version: apiResponse.api_version
              }, null, 2)}
            </pre>
          </div>
        </Box>

        {/* Complete Raw Shopify Response */}
        <Box>
          <Text variant="headingMd" as="h3" style={{ marginBottom: "12px" }}>
            Complete Shopify GraphQL Response
          </Text>
          <div style={{
            backgroundColor: "#f6f6f7",
            border: "1px solid #e1e3e5",
            borderRadius: "8px",
            padding: "16px",
            overflow: "auto",
            maxHeight: "500px"
          }}>
            <pre style={{
              fontSize: "12px",
              fontFamily: "SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace",
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all"
            }}>
              {JSON.stringify(apiResponse.raw_shopify_response, null, 2)}
            </pre>
          </div>
        </Box>
      </Stack>
    </Card>
  );
} 