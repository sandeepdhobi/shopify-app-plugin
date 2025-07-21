import {
  Card,
  Stack,
  Button,
  Text,
  ProgressBar,
  Badge,
  DataTable,
  Modal,
  TextContainer,
  Spinner,
  Banner,
  Toast,
  Frame,
} from "@shopify/polaris";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";

export default function ProductSyncCard() {
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [activeSyncJob, setActiveSyncJob] = useState(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastError, setToastError] = useState(false);
  const queryClient = useQueryClient();

  // Fetch sync history
  const { data: syncHistory, isLoading: isLoadingHistory } = useQuery({
    queryKey: ["syncHistory"],
    queryFn: async () => {
      const response = await fetch("/api/products/sync/history");
      if (!response.ok) throw new Error("Failed to fetch sync history");
      return response.json();
    },
    refetchInterval: 5000, // Refetch every 5 seconds
  });

  // Fetch active job status
  const { data: jobStatus, isLoading: isLoadingJobStatus } = useQuery({
    queryKey: ["syncJobStatus", activeSyncJob],
    queryFn: async () => {
      if (!activeSyncJob) return null;
      const response = await fetch(`/api/products/sync/${activeSyncJob}/status`);
      if (!response.ok) throw new Error("Failed to fetch job status");
      return response.json();
    },
    enabled: !!activeSyncJob,
    refetchInterval: 2000, // Refetch every 2 seconds when there's an active job
  });

  // Start sync mutation
  const startSyncMutation = useMutation({
    mutationFn: async ({ batchSize = 50 }) => {
      const response = await fetch("/api/products/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ batchSize }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to start sync");
      }
      return response.json();
    },
    onSuccess: (data) => {
      setActiveSyncJob(data.jobId);
      setShowSyncModal(false);
      setToastMessage("Product sync started successfully!");
      setToastError(false);
      setShowToast(true);
      queryClient.invalidateQueries(["syncHistory"]);
    },
    onError: (error) => {
      setToastMessage(error.message);
      setToastError(true);
      setShowToast(true);
    },
  });



  // Force cancel all jobs mutation
  const forceCancelAllMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/products/sync/force/all", {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to force cancel all jobs");
      return response.json();
    },
    onSuccess: (data) => {
      setActiveSyncJob(null);
      setToastMessage(`Force cancelled all jobs (${data.cancelledCount} jobs)`);
      setToastError(false);
      setShowToast(true);
      queryClient.invalidateQueries(["syncHistory"]);
    },
    onError: (error) => {
      setToastMessage(`Force cancel failed: ${error.message}`);
      setToastError(true);
      setShowToast(true);
    },
  });

  // Pause sync mutation
  const pauseSyncMutation = useMutation({
    mutationFn: async (jobId) => {
      const response = await fetch(`/api/products/sync/${jobId}/pause`, {
        method: "POST",
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to pause sync");
      }
      return response.json();
    },
    onSuccess: () => {
      setToastMessage("Sync job paused successfully!");
      setToastError(false);
      setShowToast(true);
      queryClient.invalidateQueries(["syncHistory"]);
      queryClient.invalidateQueries(["syncJobStatus", activeSyncJob]);
    },
    onError: (error) => {
      setToastMessage(`Pause failed: ${error.message}`);
      setToastError(true);
      setShowToast(true);
    },
  });

  // Resume sync mutation
  const resumeSyncMutation = useMutation({
    mutationFn: async ({ jobId, batchSize = 50 }) => {
      const response = await fetch(`/api/products/sync/${jobId}/resume`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ batchSize }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to resume sync");
      }
      return response.json();
    },
    onSuccess: () => {
      setToastMessage("Sync job resumed successfully!");
      setToastError(false);
      setShowToast(true);
      queryClient.invalidateQueries(["syncHistory"]);
      queryClient.invalidateQueries(["syncJobStatus", activeSyncJob]);
    },
    onError: (error) => {
      setToastMessage(`Resume failed: ${error.message}`);
      setToastError(true);
      setShowToast(true);
    },
  });

  // Check if there's an active job on mount
  useEffect(() => {
    if (syncHistory?.jobs) {
      const activeJob = syncHistory.jobs.find(
        (job) => job.status === "processing" || job.status === "queued" || job.status === "paused"
      );
      if (activeJob) {
        setActiveSyncJob(activeJob.id);
      }
    }
  }, [syncHistory]);

  // Clear active job when it completes
  useEffect(() => {
    if (jobStatus?.job && (jobStatus.job.status === "completed" || jobStatus.job.status === "failed" || jobStatus.job.status === "cancelled")) {
      setTimeout(() => {
        setActiveSyncJob(null);
        queryClient.invalidateQueries(["syncHistory"]);
      }, 2000);
    }
  }, [jobStatus, queryClient]);

  const handleStartSync = () => {
    startSyncMutation.mutate({ batchSize: 50 });
  };

  const handleForceCancelAll = () => {
    forceCancelAllMutation.mutate();
  };

  const handlePauseSync = () => {
    if (activeSyncJob) {
      pauseSyncMutation.mutate(activeSyncJob);
    }
  };

  const handleResumeSync = () => {
    if (activeSyncJob) {
      resumeSyncMutation.mutate({ jobId: activeSyncJob, batchSize: 50 });
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      completed: { status: "success", children: "Completed" },
      processing: { status: "info", children: "Processing" },
      queued: { status: "attention", children: "Queued" },
      paused: { status: "warning", children: "Paused" },
      failed: { status: "critical", children: "Failed" },
      cancelled: { status: "warning", children: "Cancelled" },
    };
    return statusMap[status] || { status: "default", children: status };
  };

  const getProgressPercentage = () => {
    if (!jobStatus?.job) return 0;
    const { processed_products, total_products } = jobStatus.job;
    if (!total_products) return 0;
    return Math.round((processed_products / total_products) * 100);
  };

  const currentJob = jobStatus?.job || null;
  const isActiveSync = activeSyncJob && (currentJob?.status === "processing" || currentJob?.status === "queued" || currentJob?.status === "paused");

  const toastMarkup = showToast ? (
    <Toast
      content={toastMessage}
      error={toastError}
      onDismiss={() => setShowToast(false)}
    />
  ) : null;

  return (
    <Frame>
      {toastMarkup}
          {isActiveSync && (
            <Card sectioned>
              <Stack vertical spacing="tight">
                                  <Stack distribution="equalSpacing" alignment="center">
                  <Stack alignment="center" spacing="tight">
                    {currentJob?.status !== "paused" && <Spinner size="small" />}
                    <Text variant="headingMd">
                      {currentJob?.status === "paused" ? "Sync Paused" : "Sync in Progress"}
                    </Text>
                  </Stack>
                  <Badge {...getStatusBadge(currentJob?.status)} />
                </Stack>
                
                <Stack vertical spacing="tight">
                  {currentJob?.total_products > 0 && (
                    <ProgressBar progress={getProgressPercentage()} />
                  )}
                  <Text variant="bodyMd" color="subdued">
                    {currentJob?.processed_products || 0} products synced
                    {currentJob?.total_products > 0 && (
                      <span> of {currentJob.total_products}</span>
                    )}
                    {currentJob?.failed_products > 0 && (
                      <span style={{ color: "#d72c0d" }}>
                        {" "}({currentJob.failed_products} failed)
                      </span>
                    )}
                  </Text>
                </Stack>
                
                <Stack spacing="tight">
                  {/* Show different buttons based on job status */}
                  {currentJob?.status === "processing" && (
                    <Button
                      onClick={handlePauseSync}
                      loading={pauseSyncMutation.isLoading}
                    >
                      Pause Sync
                    </Button>
                  )}
                  
                  {currentJob?.status === "paused" && (
                    <Button
                      primary
                      onClick={handleResumeSync}
                      loading={resumeSyncMutation.isLoading}
                    >
                      Resume Sync
                    </Button>
                  )}
                  
                  <Button
                    destructive
                    onClick={handleForceCancelAll}
                    loading={forceCancelAllMutation.isLoading}
                  >
                    Force Cancel All
                  </Button>
                </Stack>
              </Stack>
            </Card>
          )}

          {/* Sync Controls */}
          <Card sectioned>
            <Stack vertical spacing="loose">
              <Stack distribution="equalSpacing" alignment="center">
                              <Stack vertical spacing="tight">
                <Text variant="headingMd">Sync Products from AmazingE</Text>
                <Text variant="bodyMd" color="subdued">
                  Import products from your third-party supplier with optimized single-job processing
                </Text>
              </Stack>
                <Button
                  primary
                  onClick={() => setShowSyncModal(true)}
                  disabled={isActiveSync}
                  loading={startSyncMutation.isLoading}
                >
                  Start Sync
                </Button>
              </Stack>

              {syncHistory?.jobs?.length > 0 && (
                <Banner status="info">
                  <p>
                    Last sync: {formatDate(syncHistory.jobs[0].created_at)} - {" "}
                    {syncHistory.jobs[0].processed_products} products processed
                  </p>
                </Banner>
              )}
            </Stack>
          </Card>

          {/* Sync History */}
          <Card title="Sync History" sectioned>
            {isLoadingHistory ? (
              <Stack alignment="center">
                <Spinner size="large" />
                <Text>Loading sync history...</Text>
              </Stack>
            ) : syncHistory?.jobs?.length > 0 ? (
              <DataTable
                columnContentTypes={["text", "text", "text", "text", "text"]}
                headings={["Date", "Status", "Products", "Failed", "Duration"]}
                rows={syncHistory.jobs.slice(0, 10).map((job) => [
                  formatDate(job.created_at),
                  <Badge key={job.id} {...getStatusBadge(job.status)} />,
                  job.processed_products || 0,
                  job.failed_products || 0,
                  job.status === "completed" || job.status === "failed"
                    ? `${Math.round(
                        (new Date(job.updated_at) - new Date(job.created_at)) / 1000
                      )}s`
                    : "-",
                ])}
              />
            ) : (
              <Stack alignment="center">
                <Text color="subdued">No sync history available</Text>
              </Stack>
            )}

      </Card>

      {/* Sync Configuration Modal */}
      <Modal
        open={showSyncModal}
        onClose={() => setShowSyncModal(false)}
        title="Start Product Sync"
        primaryAction={{
          content: "Start Sync",
          onAction: handleStartSync,
          loading: startSyncMutation.isLoading,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setShowSyncModal(false),
          },
        ]}
      >
        <Modal.Section>
          <TextContainer>
            <Text variant="bodyMd">
              This will start syncing products from your third-party supplier to your Shopify store.
            </Text>
            <Text variant="bodyMd">
              The sync will run in the background and process products in optimized batches for better performance.
            </Text>
            <Text variant="bodyMd">
              <strong>Features:</strong> Only one sync job can run at a time, improved error handling, 
              and better cancellation support.
            </Text>
            <Text variant="bodyMd">
              <strong>Note:</strong> This demo will create 1000 sample products. In a real implementation, 
              this would connect to your actual third-party API.
            </Text>
          </TextContainer>
        </Modal.Section>
      </Modal>
    </Frame>
  );
} 