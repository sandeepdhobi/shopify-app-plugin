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

import { ProductsCard, ProductSyncCard } from "../components";

export default function Dashboard() {
  const { t } = useTranslation();
  const shopify = useAppBridge();
  const [selectedTab, setSelectedTab] = useState(1);

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
    }
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
        <ProductSyncCard />
  );

  const renderTabContent = () => {
    switch (selectedTab) {
      case 0:
        return renderOverview();
      case 1:
        return renderProducts();
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