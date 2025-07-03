import {
  Card,
  Page,
  Layout,
  TextContainer,
  Text,
  DataTable,
  Tabs,
  Badge,
  Stack,
  Button,
  EmptyState,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useQuery } from "react-query";
import { useAppBridge } from "@shopify/app-bridge-react";

import { ProductsCard, SubscriptionGate } from "../components";

export default function Dashboard() {
  const { t } = useTranslation();
  const shopify = useAppBridge();
  const [selectedTab, setSelectedTab] = useState(0);

  // Products data
  const {
    data: productsData,
    isLoading: isLoadingProducts,
    refetch: refetchProducts,
  } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const response = await fetch("/api/products/list");
      return await response.json();
    },
    refetchOnWindowFocus: false,
  });

  // Orders data
  const {
    data: ordersData,
    isLoading: isLoadingOrders,
    refetch: refetchOrders,
  } = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const response = await fetch("/api/orders/list");
      return await response.json();
    },
    refetchOnWindowFocus: false,
  });

  const tabs = [
    {
      id: "overview",
      content: t("Dashboard.overview"),
    },
    {
      id: "products",
      content: t("Dashboard.products"),
    },
    {
      id: "orders",
      content: t("Dashboard.orders"),
    },
    {
      id: "analytics",
      content: "Advanced Analytics",
    },
  ];

  const handleTabChange = (selectedTabIndex) => {
    setSelectedTab(selectedTabIndex);
  };

  const formatCurrency = (amount, currency = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const renderOverview = () => (
    <Layout>
      <Layout.Section oneHalf>
        <ProductsCard />
      </Layout.Section>
      <Layout.Section oneHalf>
        <Card title={t("Dashboard.orderSummary")} sectioned>
          <TextContainer spacing="loose">
            <Text as="h4" variant="headingMd">
              {t("Dashboard.totalOrders")}
              <Text variant="bodyMd" as="p" fontWeight="semibold">
                {isLoadingOrders ? "-" : ordersData?.orders?.length || 0}
              </Text>
            </Text>
            <Text as="h4" variant="headingMd">
              {t("Dashboard.totalRevenue")}
              <Text variant="bodyMd" as="p" fontWeight="semibold">
                {isLoadingOrders
                  ? "-"
                  : formatCurrency(
                      ordersData?.orders?.reduce((sum, order) => sum + parseFloat(order.total_price || 0), 0) || 0
                    )}
              </Text>
            </Text>
          </TextContainer>
        </Card>
      </Layout.Section>
      <Layout.Section>
        <Card title={t("Dashboard.recentOrders")} sectioned>
          {isLoadingOrders ? (
            <div>{t("Dashboard.loadingOrders")}</div>
          ) : ordersData?.orders?.length > 0 ? (
            <DataTable
              columnContentTypes={["text", "text", "text", "text", "text"]}
              headings={["Order", "Customer", "Date", "Status", "Total"]}
              rows={ordersData.orders.slice(0, 5).map((order) => [
                `#${order.order_number || order.id}`,
                order.customer?.first_name && order.customer?.last_name
                  ? `${order.customer.first_name} ${order.customer.last_name}`
                  : order.customer?.email || "Guest",
                formatDate(order.created_at),
                <Badge
                  key={order.id}
                  status={
                    order.financial_status === "paid"
                      ? "success"
                      : order.financial_status === "pending"
                      ? "attention"
                      : "critical"
                  }
                >
                  {order.financial_status || "unknown"}
                </Badge>,
                formatCurrency(order.total_price || 0, order.currency || "USD"),
              ])}
            />
          ) : (
            <EmptyState
              heading={t("Dashboard.noOrdersYet")}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>{t("Dashboard.ordersWillAppear")}</p>
            </EmptyState>
          )}
        </Card>
      </Layout.Section>
    </Layout>
  );

  const renderProducts = () => (
    <Layout>
      <Layout.Section>
        <Card title={t("Dashboard.productsManagement")} sectioned>
          <Stack vertical>
            <ProductsCard />
            {isLoadingProducts ? (
              <div>{t("Dashboard.loadingProducts")}</div>
            ) : productsData?.products?.length > 0 ? (
              <DataTable
                columnContentTypes={["text", "text", "text", "text", "text"]}
                headings={["Product", "SKU", "Inventory", "Price", "Status"]}
                rows={productsData.products.map((product) => [
                  product.title,
                  product.variants?.[0]?.sku || "-",
                  product.variants?.[0]?.inventory_quantity || 0,
                  formatCurrency(product.variants?.[0]?.price || 0),
                  <Badge
                    key={product.id}
                    status={product.status === "active" ? "success" : "warning"}
                  >
                    {product.status || "draft"}
                  </Badge>,
                ])}
              />
            ) : (
              <EmptyState
                heading={t("Dashboard.noProductsFound")}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>{t("Dashboard.createProductsToStart")}</p>
              </EmptyState>
            )}
          </Stack>
        </Card>
      </Layout.Section>
    </Layout>
  );

  const renderOrders = () => (
    <Layout>
      <Layout.Section>
        <Card title={t("Dashboard.ordersManagement")} sectioned>
          <Stack vertical>
            <Stack distribution="trailing">
              <Button
                onClick={() => refetchOrders()}
                loading={isLoadingOrders}
              >
                {t("Dashboard.refreshOrders")}
              </Button>
            </Stack>
            {isLoadingOrders ? (
              <div>{t("Dashboard.loadingOrders")}</div>
            ) : ordersData?.orders?.length > 0 ? (
              <DataTable
                columnContentTypes={["text", "text", "text", "text", "text", "text"]}
                headings={["Order", "Customer", "Date", "Items", "Status", "Total"]}
                rows={ordersData.orders.map((order) => [
                  `#${order.order_number || order.id}`,
                  order.customer?.first_name && order.customer?.last_name
                    ? `${order.customer.first_name} ${order.customer.last_name}`
                    : order.customer?.email || "Guest",
                  formatDate(order.created_at),
                  order.line_items?.length || 0,
                  <Badge
                    key={order.id}
                    status={
                      order.financial_status === "paid"
                        ? "success"
                        : order.financial_status === "pending"
                        ? "attention"
                        : "critical"
                    }
                  >
                    {order.financial_status || "unknown"}
                  </Badge>,
                  formatCurrency(order.total_price || 0, order.currency || "USD"),
                ])}
              />
            ) : (
              <EmptyState
                heading={t("Dashboard.noOrdersFound")}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>{t("Dashboard.orderWillAppear")}</p>
              </EmptyState>
            )}
          </Stack>
        </Card>
      </Layout.Section>
      
      {/* Premium Feature: Advanced Order Analytics */}
      <Layout.Section>
        <SubscriptionGate 
          requiredPlan="pro" 
          feature="advanced order analytics and reports"
        >
          <Card title="Advanced Order Analytics" sectioned>
            <Stack vertical>
              <Text variant="headingMd" as="h3">
                📊 Order Performance Metrics
              </Text>
              <Layout>
                <Layout.Section oneThird>
                  <Card sectioned>
                    <Stack vertical spacing="tight">
                      <Text variant="bodyMd" as="p" color="subdued">
                        Average Order Value
                      </Text>
                      <Text variant="headingLg" as="p">
                        {formatCurrency(
                          ordersData?.orders?.reduce((sum, order) => sum + parseFloat(order.total_price || 0), 0) / 
                          (ordersData?.orders?.length || 1) || 0
                        )}
                      </Text>
                    </Stack>
                  </Card>
                </Layout.Section>
                <Layout.Section oneThird>
                  <Card sectioned>
                    <Stack vertical spacing="tight">
                      <Text variant="bodyMd" as="p" color="subdued">
                        Conversion Rate
                      </Text>
                      <Text variant="headingLg" as="p">
                        12.5%
                      </Text>
                    </Stack>
                  </Card>
                </Layout.Section>
                <Layout.Section oneThird>
                  <Card sectioned>
                    <Stack vertical spacing="tight">
                      <Text variant="bodyMd" as="p" color="subdued">
                        Repeat Customer Rate
                      </Text>
                      <Text variant="headingLg" as="p">
                        28.3%
                      </Text>
                    </Stack>
                  </Card>
                </Layout.Section>
              </Layout>
            </Stack>
          </Card>
        </SubscriptionGate>
      </Layout.Section>
    </Layout>
  );

  const renderAdvancedAnalytics = () => (
    <Layout>
      <Layout.Section>
        <SubscriptionGate 
          requiredPlan="plus" 
          feature="advanced analytics dashboard"
        >
          <Card title="Advanced Analytics Dashboard" sectioned>
            <Stack vertical spacing="loose">
              <Text variant="headingLg" as="h2">
                📈 Business Intelligence
              </Text>
              
              <Layout>
                <Layout.Section oneHalf>
                  <Card sectioned>
                    <Stack vertical spacing="tight">
                      <Text variant="headingMd" as="h3">
                        Revenue Trends
                      </Text>
                      <div style={{ 
                        height: "200px", 
                        background: "linear-gradient(45deg, #00c851, #007e33)",
                        borderRadius: "8px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "white",
                        fontSize: "16px"
                      }}>
                        📊 Interactive Chart Placeholder
                      </div>
                    </Stack>
                  </Card>
                </Layout.Section>
                <Layout.Section oneHalf>
                  <Card sectioned>
                    <Stack vertical spacing="tight">
                      <Text variant="headingMd" as="h3">
                        Customer Segments
                      </Text>
                      <div style={{ 
                        height: "200px", 
                        background: "linear-gradient(45deg, #2196f3, #0d47a1)",
                        borderRadius: "8px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "white",
                        fontSize: "16px"
                      }}>
                        🎯 Segmentation Analysis
                      </div>
                    </Stack>
                  </Card>
                </Layout.Section>
              </Layout>

              <Card sectioned>
                <Stack vertical spacing="tight">
                  <Text variant="headingMd" as="h3">
                    Predictive Analytics
                  </Text>
                  <Text variant="bodyMd" as="p" color="subdued">
                    AI-powered insights and forecasting
                  </Text>
                  <div style={{ 
                    height: "120px", 
                    background: "linear-gradient(45deg, #ff9800, #e65100)",
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontSize: "16px"
                  }}>
                    🤖 Machine Learning Predictions
                  </div>
                </Stack>
              </Card>

              <Card sectioned>
                <Text variant="headingMd" as="h3">
                  Premium Features Available:
                </Text>
                <Stack wrap={false}>
                  <Badge status="success">Real-time Analytics</Badge>
                  <Badge status="success">Custom Reports</Badge>
                  <Badge status="success">Data Export</Badge>
                  <Badge status="success">API Access</Badge>
                  <Badge status="success">White-label Options</Badge>
                </Stack>
              </Card>
            </Stack>
          </Card>
        </SubscriptionGate>
      </Layout.Section>
    </Layout>
  );

  const renderTabContent = () => {
    switch (selectedTab) {
      case 0:
        return renderOverview();
      case 1:
        return renderProducts();
      case 2:
        return renderOrders();
      case 3:
        return renderAdvancedAnalytics();
      default:
        return renderOverview();
    }
  };

  return (
    <Page narrowWidth>
      <TitleBar title={t("Dashboard.title")} />
      <Layout>
        <Layout.Section>
          <Card>
            <Tabs
              tabs={tabs}
              selected={selectedTab}
              onSelect={handleTabChange}
            >
              <Card.Section>
                {renderTabContent()}
              </Card.Section>
            </Tabs>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
} 