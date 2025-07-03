import React, { useState, useEffect } from "react";
import {
  Card,
  Stack,
  Text,
  Button,
  Badge,
  Banner,
  Spinner,
  Modal,
  List,
} from "@shopify/polaris";
import { useNavigate } from "react-router-dom";

export default function SubscriptionGate({ 
  requiredPlan = "pro", 
  feature = "this feature", 
  children,
  showUpgrade = true 
}) {
  const navigate = useNavigate();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const handleUpgrade = () => {
    navigate("/plans");
  };

  // Always assume user is on free plan and needs upgrade for pro/plus features
  const hasAccess = () => {
    return requiredPlan === "free";
  };

  // If user has access, render children
  if (hasAccess()) {
    return <>{children}</>;
  }

  // If no access, show upgrade prompt
  return (
    <>
      <Card sectioned>
        <Stack vertical spacing="loose">
          <div style={{ textAlign: "center" }}>
            <Stack vertical spacing="tight">
              <Text variant="headingMd" as="h3">
                🚀 Upgrade Required
              </Text>
              <Text variant="bodyMd" as="p" color="subdued">
                You need a {requiredPlan.toUpperCase()} subscription to access {feature}.
              </Text>
            </Stack>
          </div>

          {showUpgrade && (
            <Stack distribution="center">
              <Button primary onClick={() => setShowUpgradeModal(true)}>
                View Plans
              </Button>
              <Button plain onClick={handleUpgrade}>
                Upgrade Now
              </Button>
            </Stack>
          )}
        </Stack>
      </Card>

      {/* Upgrade Modal */}
      <Modal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        title="Upgrade Your Plan"
        primaryAction={{
          content: "View All Plans",
          onAction: handleUpgrade,
        }}
        secondaryActions={[
          {
            content: "Maybe Later",
            onAction: () => setShowUpgradeModal(false),
          },
        ]}
      >
        <Modal.Section>
          <Stack vertical spacing="loose">
            <Text variant="bodyMd" as="p">
              Unlock powerful features with our subscription plans:
            </Text>

            {requiredPlan === "pro" && (
              <Card sectioned>
                <Stack vertical spacing="tight">
                  <Stack alignment="center">
                    <Text variant="headingMd" as="h4">
                      Pro Plan
                    </Text>
                    <Badge>$6/month</Badge>
                  </Stack>
                  <List type="bullet">
                    <List.Item>Tag products and collections</List.Item>
                    <List.Item>Product details</List.Item>
                    <List.Item>Videos autoplay</List.Item>
                    <List.Item>Instagram Stories</List.Item>
                    <List.Item>Up to 3 different feeds</List.Item>
                  </List>
                </Stack>
              </Card>
            )}

            {requiredPlan === "plus" && (
              <Card sectioned>
                <Stack vertical spacing="tight">
                  <Stack alignment="center">
                    <Text variant="headingMd" as="h4">
                      Plus Plan
                    </Text>
                    <Badge status="success">Recommended</Badge>
                    <Badge>$20/month</Badge>
                  </Stack>
                  <List type="bullet">
                    <List.Item>Instagram tagged posts</List.Item>
                    <List.Item>Automatic product tags</List.Item>
                    <List.Item>Product and collection feeds</List.Item>
                    <List.Item>Analytics</List.Item>
                    <List.Item>Unlimited feeds</List.Item>
                    <List.Item>API access</List.Item>
                  </List>
                </Stack>
              </Card>
            )}

            <Banner status="info">
              <p>
                All plans come with a 14-day free trial. Cancel anytime, no questions asked.
              </p>
            </Banner>
          </Stack>
        </Modal.Section>
      </Modal>
    </>
  );
} 