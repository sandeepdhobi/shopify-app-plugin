import {
  Card,
  Page,
  Layout,
  TextContainer,
  Stack,
  Link,
  Text,
  Button,
  Badge,
  List,
  Icon,
  Box,
  Divider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { 
  ProductIcon, 
  DeliveryIcon, 
  ChartVerticalFilledIcon,
  StarIcon,
  CheckCircleIcon 
} from "@shopify/polaris-icons";

export default function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  const handleGetStarted = () => {
    navigate("/plans");
  };
  
  return (
    <Page>
      <TitleBar title="Welcome to DropShipper" />
      <Layout>
        {/* Hero Section */}
        <Layout.Section>
          <Card sectioned>
            <Box paddingBlockStart="6" paddingBlockEnd="6">
              <Stack vertical spacing="extraLoose" alignment="center">
                <Stack.Item>
                  <div style={{ textAlign: "center" }}>
                    <Text as="h1" variant="heading2xl" fontWeight="bold">
                      Scale Your Store with 100M+ Products
                    </Text>
                    <Box paddingBlockStart="4">
                      <Text as="p" variant="bodyLg" color="subdued">
                        The complete e-commerce solution that handles everything from product sync to fulfillment. 
                        Focus on what you do best - driving sales!
                      </Text>
                    </Box>
                  </div>
                </Stack.Item>
                
                <Stack.Item>
                  <Stack spacing="tight">
                    <Button primary size="large" onClick={handleGetStarted}>
                      Get Started - View Plans
                    </Button>
                  </Stack>
                </Stack.Item>
              </Stack>
            </Box>
          </Card>
        </Layout.Section>


                {/* Simple Steps Section */}
                <Layout.Section>
          <Card sectioned>
            <Box paddingBlockStart="6" paddingBlockEnd="6">
            <Stack vertical spacing="loose">
              <Stack.Item>
                <div style={{ textAlign: "center" }}>
                  <Text as="h3" variant="headingLg" fontWeight="bold" color="subdued">
                    Get started in 3 simple steps
                  </Text>
                </div>
              </Stack.Item>

              <Stack.Item>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '48px',
                  flexWrap: 'wrap',
                  padding: '24px 0'
                }}>
                  {/* Step 1 */}
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center',
                    textAlign: 'center',
                    maxWidth: '200px'
                  }}>
                    <div style={{ 
                      width: '48px', 
                      height: '48px', 
                      backgroundColor: '#a8b8f0', 
                      borderRadius: '50%', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      marginBottom: '12px',
                      color: 'white',
                      fontSize: '30px',
                      fontWeight: 'bold'
                    }}>
                      1
                    </div>
                    <Text as="h4" variant="headingMd" fontWeight="bold">
                      Subscribe to a Plan
                    </Text>
                    <Box paddingBlockStart="1">
                      <Text as="p" variant="bodyMd" color="subdued">
                        Choose your plan and get instant access
                      </Text>
                    </Box>
                  </div>

                  {/* Arrow */}
                  <div style={{ 
                    fontSize: '24px', 
                    color: '#8c9196',
                    display: 'flex',
                    alignItems: 'center'
                  }}>
                    →
                  </div>

                  {/* Step 2 */}
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center',
                    textAlign: 'center',
                    maxWidth: '200px'
                  }}>
                    <div style={{ 
                      width: '48px', 
                      height: '48px', 
                      backgroundColor: '#7fb3a3', 
                      borderRadius: '50%', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      marginBottom: '12px',
                      color: 'white',
                      fontSize: '30px',
                      fontWeight: 'bold'
                    }}>
                      2
                    </div>
                    <Text as="h4" variant="headingMd" fontWeight="bold">
                      Products Auto-Sync
                    </Text>
                    <Box paddingBlockStart="1">
                      <Text as="p" variant="bodyMd" color="subdued">
                        100M+ products sync automatically
                      </Text>
                    </Box>
                  </div>

                  {/* Arrow */}
                  <div style={{ 
                    fontSize: '24px', 
                    color: '#8c9196',
                    display: 'flex',
                    alignItems: 'center'
                  }}>
                    →
                  </div>

                  {/* Step 3 */}
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center',
                    textAlign: 'center',
                    maxWidth: '200px'
                  }}>
                    <div style={{ 
                      width: '48px', 
                      height: '48px', 
                      backgroundColor: '#f19066', 
                      borderRadius: '50%', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      marginBottom: '12px',
                      color: 'white',
                      fontSize: '30px',
                      fontWeight: 'bold'
                    }}>
                      3
                    </div>
                    <Text as="h4" variant="headingMd" fontWeight="bold">
                      Drive Sales & Profit
                    </Text>
                    <Box paddingBlockStart="1">
                      <Text as="p" variant="bodyMd" color="subdued">
                        Focus on marketing and growth
                      </Text>
                    </Box>
                  </div>
                </div>
              </Stack.Item>
            </Stack>
            </Box>
          </Card>
        </Layout.Section>

        {/* Combined Features & How It Works Section */}
        <Layout.Section>
          <Card sectioned>
            <Box paddingBlockStart="6" paddingBlockEnd="6">
            <Stack vertical spacing="extraLoose">
              <Stack.Item>
                <div style={{ textAlign: "center" }}>
                  <Text as="h2" variant="headingLg" fontWeight="bold" color="subdued">
                    Everything You Need to Succeed
                  </Text>
                  <Box paddingBlockStart="2">
                    <Text as="p" variant="bodyLg" color="subdued">
                      From product sourcing to customer delivery, we've got you covered
                    </Text>
                  </Box>
                </div>
              </Stack.Item>

              <Stack.Item>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
                  gap: '40px',
                  marginTop: '32px'
                }}>
                  {/* Step 1 - Subscribe & Get Products */}
                  <div style={{
                    background: 'linear-gradient(135deg, #f8f9ff 0%, #f0f2ff 100%)',
                    borderRadius: '16px',
                    padding: '32px 24px',
                    border: '1px solid #e1e5f7',
                    position: 'relative',
                    overflow: 'hidden'
                  }}>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '16px',
                      marginBottom: '20px'
                    }}>
                      <div style={{ 
                        padding: '12px', 
                        backgroundColor: '#a8b8f0', 
                        borderRadius: '12px',
                        color: 'white'
                      }}>
                        <Icon source={ProductIcon} color="base" />
                      </div>
                      <Text as="h3" variant="headingLg" fontWeight="bold">
                        100M+ Products
                      </Text>
                    </div>
                    <Text as="p" variant="bodyMd" color="subdued" style={{ marginBottom: '16px' }}>
                      Subscribe to a plan and get instant access to over 100 million products that sync directly to your Shopify store. No inventory management, no upfront costs.
                    </Text>
                    <div style={{ 
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      backgroundColor: '#a8b8f0',
                      color: 'white',
                      padding: '6px 12px',
                      borderRadius: '16px',
                      fontSize: '14px',
                      marginTop: '16px'
                    }}>
                      <Icon source={CheckCircleIcon} color="base" />
                      <span>Instant Sync</span>
                    </div>
                  </div>

                  {/* Step 2 - Auto Fulfillment */}
                  <div style={{
                    background: 'linear-gradient(135deg, #f0f8f6 0%, #e8f5f2 100%)',
                    borderRadius: '16px',
                    padding: '32px 24px',
                    border: '1px solid #d1ede7',
                    position: 'relative',
                    overflow: 'hidden'
                  }}>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '16px',
                      marginBottom: '20px'
                    }}>
                      <div style={{ 
                        padding: '12px', 
                        backgroundColor: '#7fb3a3', 
                        borderRadius: '12px',
                        color: 'white'
                      }}>
                        <Icon source={DeliveryIcon} color="base" />
                      </div>
                      <Text as="h3" variant="headingLg" fontWeight="bold">
                        Full Fulfillment
                      </Text>
                    </div>
                    <Text as="p" variant="bodyMd" color="subdued" style={{ marginBottom: '16px' }}>
                      We handle all shipment and fulfillment operations automatically. From order processing to customer delivery, your customers get their products hassle-free.
                    </Text>
                    <div style={{ 
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      backgroundColor: '#7fb3a3',
                      color: 'white',
                      padding: '6px 12px',
                      borderRadius: '16px',
                      fontSize: '14px',
                      marginTop: '16px'
                    }}>
                      <Icon source={CheckCircleIcon} color="base" />
                      <span>Automated</span>
                    </div>
                  </div>

                  {/* Step 3 - Focus on Sales */}
                  <div style={{
                    background: 'linear-gradient(135deg, #fdf6f0 0%, #faf0e8 100%)',
                    borderRadius: '16px',
                    padding: '32px 24px',
                    border: '1px solid #f5e6d3',
                    position: 'relative',
                    overflow: 'hidden'
                  }}>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '16px',
                      marginBottom: '20px'
                    }}>
                      <div style={{ 
                        padding: '12px', 
                        backgroundColor: '#f19066', 
                        borderRadius: '12px',
                        color: 'white'
                      }}>
                        <Icon source={ChartVerticalFilledIcon} color="base" />
                      </div>
                      <Text as="h3" variant="headingLg" fontWeight="bold">
                        Focus on Sales
                      </Text>
                    </div>
                    <Text as="p" variant="bodyMd" color="subdued" style={{ marginBottom: '16px' }}>
                      Your only job is to drive more sales. Use your marketing skills, social media, and customer relationships to grow your business while we handle the rest.
                    </Text>
                    <div style={{ 
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      backgroundColor: '#f19066',
                      color: 'white',
                      padding: '6px 12px',
                      borderRadius: '16px',
                      fontSize: '14px',
                      marginTop: '16px'
                    }}>
                      <Icon source={StarIcon} color="base" />
                      <span>Your Expertise</span>
                    </div>
                  </div>
                </div>
              </Stack.Item>
            </Stack>
            </Box>
          </Card>
        </Layout.Section>

        {/* CTA Section */}
        <Layout.Section>
          <Card sectioned>
            <Box paddingBlockStart="6" paddingBlockEnd="6">
              <Stack vertical spacing="loose" alignment="center">
                <Stack.Item>
                  <div style={{ textAlign: "center" }}>
                    <Text as="h2" variant="headingXl" fontWeight="bold">
                      Ready to Scale Your Business?
                    </Text>
                    <Box paddingBlockStart="3">
                      <Text as="p" variant="bodyLg" color="subdued">
                        Join thousands of successful merchants who trust us with their e-commerce operations.
                      </Text>
                    </Box>
                  </div>
                </Stack.Item>
                
                <Stack.Item>
                  <Stack spacing="tight">
                    <Button primary size="large" onClick={handleGetStarted}>
                      View Subscription Plans
                    </Button>
                    <Button outline size="large" disabled>
                      Explore Dashboard
                    </Button>
                  </Stack>
                </Stack.Item>

                <Stack.Item>
                  <div style={{ textAlign: "center", marginTop: "16px" }}>
                    <Text as="p" variant="bodyMd" color="subdued">
                      Questions? <Link onClick={handleGetStarted}>View our plans</Link> or contact support
                    </Text>
                  </div>
                </Stack.Item>
              </Stack>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
