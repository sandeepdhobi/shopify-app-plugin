import React, { useState, useEffect } from "react";
import {
  Card,
  Page,
  Layout,
  TextContainer,
  Stack,
  Text,
  Button,
  Badge,
  List,
  Spinner,
  Modal,
  FormLayout,
  TextField,
  Checkbox,
  Icon,
  Box,
  Banner,
  Divider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import { CheckCircleIcon } from "@shopify/polaris-icons";

export default function PlansPage() {
  const { t } = useTranslation();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [paymentData, setPaymentData] = useState({
    cardNumber: "",
    expiryDate: "",
    cvv: "",
    nameOnCard: "",
    billingAddress: "",
    acceptTerms: false,
  });

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const response = await fetch("/api/plans");
      const data = await response.json();
      setPlans(data.plans || []);
    } catch (error) {
      console.error("Error fetching plans:", error);
      setPlans([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (planId) => {
    const plan = plans.find((p) => p.id === planId);
    
    // Don't open payment modal for free plan
    if (planId === 'free') {
      return;
    }
    
    setSelectedPlan(plan);
    setShowPaymentModal(true);
  };

  const handlePaymentSubmit = async () => {
    if (!paymentData.acceptTerms) {
      alert("Please accept the terms and conditions");
      return;
    }

    setSubscriptionLoading(true);
    try {
      const response = await fetch("/api/subscription/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ planId: selectedPlan.id }),
      });

      const result = await response.json();

      if (result.success) {
        // Redirect to Shopify's payment confirmation
        window.top.location.href = result.confirmationUrl;
      } else {
        alert("Error creating subscription: " + result.error);
      }
    } catch (error) {
      console.error("Error creating subscription:", error);
      alert("Error creating subscription. Please try again.");
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const handlePaymentDataChange = (field, value) => {
    setPaymentData({ ...paymentData, [field]: value });
  };

  if (loading) {
    return (
      <Page>
        <div style={{ textAlign: "center", padding: "60px" }}>
          <Spinner size="large" />
          <Text variant="headingMd" as="h2">
            Loading plans...
          </Text>
        </div>
      </Page>
    );
  }

  const PlanCard = ({ plan, isMiddle = false }) => (
    <div style={{ flex: 1, minWidth: '300px', maxWidth: '400px' }}>

        <div style={{ 
          padding: '32px 24px', 
          backgroundColor: 'white',
          height: '100%', 
          display: 'flex', 
          flexDirection: 'column',
          border: isMiddle ? '3px solid #6da797' : '1px solid #E1E3E5',
          borderRadius: '12px',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Plan Badge */}
          <div style={{ marginBottom: '16px' }}>
            <Badge 
              status={plan.badgeStatus} 
              size="small"
              tone={plan.badgeStatus === 'success' ? 'success' : 
                    plan.badgeStatus === 'info' ? 'info' : 'attention'}
            >
              {plan.badge}
            </Badge>
          </div>

          {/* Plan Name */}
          <div style={{ marginBottom: '8px' }}>
            <Text variant="headingLg" as="h2" fontWeight="bold">
              {plan.name}
            </Text>
          </div>

          {/* Plan Description */}
          <div style={{ marginBottom: '16px' }}>
            <Text variant="bodyMd" as="p" color="subdued">
              {plan.description}
            </Text>
          </div>

          {/* Pricing */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <Text variant="bodyMd" as="span" color="subdued">
                USD
              </Text>
              <Text variant="heading2xl" as="span" fontWeight="bold">
                ${plan.price}
              </Text>
              <Text variant="bodyMd" as="span" color="subdued">
                /{plan.interval}
              </Text>
            </div>
            
            {/* Yearly pricing for Plus plan */}
            {plan.priceYearly && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                <div style={{ 
                  width: '12px', 
                  height: '12px', 
                  borderRadius: '50%', 
                  backgroundColor: '#E1E3E5',
                  border: '3px solid #202223'
                }}></div>
                <Text variant="bodyMd" as="span" color="subdued">
                  USD
                </Text>
                <Text variant="headingLg" as="span" fontWeight="bold">
                  ${plan.priceYearly}
                </Text>
                <Text variant="bodyMd" as="span" color="subdued">
                  /year
                </Text>
                <Text variant="bodyMd" as="span" color="success">
                  ({plan.yearlyDiscount})
                </Text>
              </div>
            )}
          </div>

          {/* Trial Info */}
          {plan.description?.includes('trial') && (
            <div style={{ marginBottom: '24px' }}>
              <Text variant="bodyMd" as="p" color="subdued">
                {plan.description}
              </Text>
            </div>
          )}

          {/* Action Button */}
          <div style={{ marginBottom: '32px' }}>
            <Button
              variant={plan.buttonVariant}
              tone={plan.buttonVariant === 'primary' ? 'success' : undefined}
              size="large"
              fullWidth
              onClick={() => handleSubscribe(plan.id)}
              disabled={plan.id === 'free' || plan.buttonText === 'Current plan'}
            >
              {plan.buttonText}
            </Button>
          </div>

          {/* Features List */}
          <div style={{ flexGrow: 1 }}>
            <Stack vertical spacing="tight">
              {plan.features.map((feature, index) => (
                <div key={index} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ 
                    marginTop: '2px',
                    color: '#00A047',
                    flexShrink: 0
                  }}>
                    <Icon source={CheckCircleIcon} />
                  </div>
                  <Text variant="bodyMd" as="p">
                    {feature}
                  </Text>
                </div>
              ))}
            </Stack>
          </div>
        </div>
    </div>
  );

  return (
    <Page>
      <TitleBar title="Plans" />
      <Layout>
        <Layout.Section>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            gap: '24px',
            flexWrap: 'wrap',
            padding: '0 16px'
          }}>
            {plans.map((plan, index) => (
              <PlanCard 
                key={plan.id} 
                plan={plan} 
                isMiddle={index === 1} 
              />
            ))}
          </div>
        </Layout.Section>
      </Layout>

      {/* Payment Modal */}
      <Modal
        open={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        title="Complete Your Subscription"
        primaryAction={{
          content: subscriptionLoading ? "Processing..." : "Subscribe Now",
          onAction: handlePaymentSubmit,
          loading: subscriptionLoading,
          disabled: subscriptionLoading,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setShowPaymentModal(false),
          },
        ]}
      >
        <Modal.Section>
          <Stack vertical spacing="loose">

            <FormLayout>
              <Text variant="headingMd" as="h3">
                Payment Information
              </Text>

              <TextField
                label="Card Number"
                value={paymentData.cardNumber}
                onChange={(value) => handlePaymentDataChange("cardNumber", value)}
                placeholder="1234 5678 9012 3456"
              />

              <Stack distribution="fillEvenly">
                <TextField
                  label="Expiry Date"
                  value={paymentData.expiryDate}
                  onChange={(value) => handlePaymentDataChange("expiryDate", value)}
                  placeholder="MM/YY"
                />
                <TextField
                  label="CVV"
                  value={paymentData.cvv}
                  onChange={(value) => handlePaymentDataChange("cvv", value)}
                  placeholder="123"
                />
              </Stack>

              <TextField
                label="Name on Card"
                value={paymentData.nameOnCard}
                onChange={(value) => handlePaymentDataChange("nameOnCard", value)}
                placeholder="John Doe"
              />

              <TextField
                label="Billing Address"
                value={paymentData.billingAddress}
                onChange={(value) => handlePaymentDataChange("billingAddress", value)}
                placeholder="123 Main St, City, State 12345"
                multiline={3}
              />

              <Checkbox
                label="I accept the terms and conditions"
                checked={paymentData.acceptTerms}
                onChange={(value) => handlePaymentDataChange("acceptTerms", value)}
              />
            </FormLayout>
          </Stack>
        </Modal.Section>
      </Modal>
    </Page>
  );
} 