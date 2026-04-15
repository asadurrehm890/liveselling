// app/routes/app.sellerlive.jsx
import { useState } from "react";
import { useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  // Fetch ONLY ACTIVE products (status: ACTIVE)
  const response = await admin.graphql(
    `#graphql
      query GetAllProducts {
        products(first: 250, query: "status:active") {
          edges {
            node {
              id
              title
              handle
              status
              featuredImage {
                url
                altText
              }
              priceRangeV2 {
                minVariantPrice {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
    `,
  );

  const data = await response.json();
  const products = data.data.products.edges.map((edge) => edge.node);

  return {
    shop,
    products,
  };
};

export default function SellerLiveStream() {
  const { shop, products } = useLoaderData();
  const shopify = useAppBridge();

  const [streamId, setStreamId] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [isStarting, setIsStarting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showCopiedFeedback, setShowCopiedFeedback] = useState(false);

  const toggleProduct = (productId) => {
    setSelectedProductIds((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId],
    );
  };

  const selectAllProducts = () => {
    setSelectedProductIds(products.map((p) => p.id));
  };

  const clearAllProducts = () => {
    setSelectedProductIds([]);
  };

  const handleStreamIdChange = (e) => {
    setStreamId(e.target.value);
  };

  // Copy OBS Broadcast Link
  const copyBroadcastLink = () => {
  if (!streamId.trim()) {
    shopify.toast.show("Please enter a Stream ID first", { isError: true });
    return;
  }
  
  // IMPORTANT: Add ?room parameter to auto-join without menu
  const broadcastLink = `https://vdo.ninja/?push=${streamId}&webcam&quality=1080p&bitrate=3000`;
  navigator.clipboard.writeText(broadcastLink);
  
  setShowCopiedFeedback(true);
  shopify.toast.show("Broadcast link copied! Use in OBS as Browser Source");
  
  setTimeout(() => setShowCopiedFeedback(false), 3000);
};

  // Copy Viewer Link
  const copyViewerLink = () => {
    if (!streamId.trim()) {
      shopify.toast.show("Please enter a Stream ID first", { isError: true });
      return;
    }
    
    if (selectedProductIds.length === 0) {
      shopify.toast.show("Please select at least one product", { isError: true });
      return;
    }
    
    const idsParam = selectedProductIds.join(",");
    const viewerUrl = `${window.location.origin}/viewerstream?shop=${encodeURIComponent(
      shop,
    )}&streamId=${encodeURIComponent(streamId)}&ids=${encodeURIComponent(idsParam)}`;
    
    navigator.clipboard.writeText(viewerUrl);
    shopify.toast.show("Viewer link copied to clipboard!");
  };

  // Open Stream in New Tab (for testing)
  const openViewerTab = async () => {
    if (!streamId.trim()) {
      shopify.toast.show("Please enter a Stream ID", { isError: true });
      return;
    }

    if (selectedProductIds.length === 0) {
      shopify.toast.show("Please select at least one product", {
        isError: true,
      });
      return;
    }

    setIsStarting(true);

    const idsParam = selectedProductIds.join(",");

    try {
      // STEP 1: Save live session in DB
      const response = await fetch("/api/live-sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          shop,
          streamId: streamId.trim(),
          productIds: selectedProductIds,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error("Failed to create live session:", text);
        shopify.toast.show(
          "Could not record live session (stream will still open).",
          { isError: true },
        );
      } else {
        shopify.toast.show(`Live stream "${streamId}" session saved.`);
      }
    } catch (err) {
      console.error("Error calling /api/live-sessions:", err);
      shopify.toast.show(
        "Error recording live session (stream will still open).",
        { isError: true },
      );
    } finally {
      setIsStarting(false);
    }

    // STEP 2: Open viewer URL in new tab
    const url = `/viewerstream?shop=${encodeURIComponent(
      shop,
    )}&streamId=${encodeURIComponent(streamId)}&ids=${encodeURIComponent(
      idsParam,
    )}`;

    console.log("Opening URL:", url);
    window.open(url, "_blank");
  };

  // Clear all rows from LiveSession table
  const clearLiveSessions = async () => {
    if (
      !window.confirm(
        "Are you sure you want to clear all live session records? This cannot be undone.",
      )
    ) {
      return;
    }

    setIsClearing(true);

    try {
      const response = await fetch("/api/clear-livesessions", {
        method: "POST",
      });

      if (!response.ok) {
        const text = await text.text();
        console.error("Failed to clear live sessions:", text);
        shopify.toast.show("Failed to clear live sessions", {
          isError: true,
        });
        return;
      }

      const data = await response.json();
      console.log("Cleared live sessions:", data);
      shopify.toast.show(
        `Cleared ${data.deletedCount ?? 0} live session record(s).`,
      );
    } catch (error) {
      console.error("Error calling /api/clear-livesessions:", error);
      shopify.toast.show("Error clearing live sessions", {
        isError: true,
      });
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div style={{ padding: "20px" }}>
      <s-page heading="Live Stream Manager">
        {/* Main Form */}
        <s-card>
          <s-text variant="headingMd" as="h2">
            Create Live Stream
          </s-text>
          <s-divider />

          <div style={{ marginTop: "16px" }}>
            {/* Stream ID field */}
            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: 600,
                }}
              >
                Stream ID *
              </label>
              <input
                type="text"
                value={streamId}
                onChange={handleStreamIdChange}
                placeholder="Enter a unique stream ID (e.g., summer-sale-2024)"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "14px",
                  border: "1px solid #d6d6d6",
                  borderRadius: "4px",
                  fontFamily: "inherit",
                }}
              />
              <div
                style={{
                  marginTop: "4px",
                  fontSize: "12px",
                  color: "#6b6b6b",
                }}
              >
                This ID will create your VDO.Ninja room (e.g., vdo.ninja/your-id)
              </div>
            </div>

            {/* VDO.Ninja Instructions Card */}
            {streamId && (
              <div style={{ 
                marginTop: "16px", 
                marginBottom: "24px",
                padding: "16px", 
                background: "#f0f7ff", 
                borderRadius: "8px",
                border: "1px solid #b3d4fc"
              }}>
                <s-text variant="headingSm" style={{ marginBottom: "12px", display: "block" }}>
                  🎥 VDO.Ninja Stream Setup
                </s-text>
                
                {/* OBS Setup Section */}
                <div style={{ marginBottom: "16px" }}>
                  <s-text variant="bodySm" tone="subdued" style={{ marginBottom: "8px", display: "block" }}>
                    <strong>Step 1:</strong> Copy this link to use in OBS Studio:
                  </s-text>
                  <div style={{ 
                    display: "flex", 
                    gap: "8px", 
                    alignItems: "center",
                    marginBottom: "8px"
                  }}>
                    <code style={{
                      flex: 1,
                      padding: "8px",
                      background: "#fff",
                      border: "1px solid #ddd",
                      borderRadius: "4px",
                      fontSize: "12px",
                      overflow: "auto",
                      wordBreak: "break-all"
                    }}>
                      https://vdo.ninja/?push=${streamId}&webcam&quality=1080p&bitrate=3000
                    </code>
                    <s-button onClick={copyBroadcastLink} variant="tertiary">
                      {showCopiedFeedback ? "✓ Copied!" : "Copy Link"}
                    </s-button>
                  </div>
                </div>

                {/* OBS Instructions */}
                <div style={{ marginBottom: "16px", padding: "12px", background: "#fff", borderRadius: "4px" }}>
                  <s-text variant="bodySm" tone="subdued">
                    <strong>Step 2:</strong> Add to OBS Studio as Browser Source:
                  </s-text>
                  <ol style={{ marginTop: "8px", fontSize: "12px", color: "#666", paddingLeft: "20px" }}>
                    <li>Open OBS Studio</li>
                    <li>Click <strong>+</strong> under Sources → <strong>Browser</strong></li>
                    <li>Name it (e.g., "VDO.Ninja Stream")</li>
                    <li>Paste the URL above: <code>https://vdo.ninja/{streamId}</code></li>
                    <li>Set Width: <strong>1280px</strong>, Height: <strong>720px</strong></li>
                    <li>Check <strong>"Control audio via OBS"</strong></li>
                    <li>Click OK</li>
                    <li>The browser source will automatically connect when you go live</li>
                  </ol>
                </div>

                {/* Viewer Link Section */}
                <div style={{ marginBottom: "8px" }}>
                  <s-text variant="bodySm" tone="subdued" style={{ marginBottom: "8px", display: "block" }}>
                    <strong>Step 3:</strong> Share this link with your customers:
                  </s-text>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <s-button onClick={copyViewerLink} variant="primary">
                      Copy Viewer Link
                    </s-button>
                    <s-button onClick={openViewerTab} variant="secondary">
                      Preview Stream
                    </s-button>
                  </div>
                </div>
              </div>
            )}

            {/* Product selection */}
            <div style={{ marginTop: "24px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "12px",
                }}
              >
                <s-text variant="headingSm">
                  Select Products (Active Products Only)
                </s-text>
                <div style={{ display: "flex", gap: "8px" }}>
                  <s-button onClick={selectAllProducts} variant="tertiary">
                    Select All
                  </s-button>
                  <s-button onClick={clearAllProducts} variant="tertiary">
                    Clear All
                  </s-button>
                </div>
              </div>

              {!products || products.length === 0 ? (
                <s-text tone="subdued">No active products found...</s-text>
              ) : (
                <div
                  style={{
                    border: "1px solid #e1e1e1",
                    borderRadius: "8px",
                    padding: "12px",
                    maxHeight: "400px",
                    overflowY: "auto",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    {products.map((product) => (
                      <label
                        key={product.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          padding: "8px",
                          cursor: "pointer",
                          borderBottom: "1px solid #f0f0f0",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedProductIds.includes(product.id)}
                          onChange={() => toggleProduct(product.id)}
                          style={{ width: "18px", height: "18px" }}
                        />
                        {product.featuredImage && (
                          <img
                            src={product.featuredImage.url}
                            alt={product.title}
                            style={{
                              width: "40px",
                              height: "40px",
                              objectFit: "cover",
                              borderRadius: "4px",
                            }}
                          />
                        )}
                        <div style={{ flex: 1 }}>
                          <s-text variant="bodyMd">{product.title}</s-text>
                          <s-text variant="bodySm" tone="subdued" as="p">
                            {product.handle}
                          </s-text>
                        </div>
                        <s-text variant="bodySm">
                          {product.priceRangeV2?.minVariantPrice?.amount}{" "}
                          {product.priceRangeV2?.minVariantPrice?.currencyCode}
                        </s-text>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginTop: "16px" }}>
                <s-text variant="bodySm" tone="subdued">
                  Selected: {selectedProductIds.length} products
                </s-text>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <s-divider />
          <div
            style={{
              display: "flex",
              gap: "12px",
              marginTop: "24px",
              justifyContent: "flex-end",
            }}
          >
            <s-button
              onClick={openViewerTab}
              variant="primary"
              disabled={!streamId || selectedProductIds.length === 0}
              loading={isStarting}
            >
              Start Live Stream
            </s-button>
          </div>
        </s-card>

        {/* Instructions */}
        <s-card>
          <s-text variant="headingMd" as="h2">
            How It Works
          </s-text>
          <s-divider />
          <div style={{ marginTop: "12px" }}>
            <s-list>
              <s-list-item>
                <strong>1. Enter Stream ID</strong> - Create a unique name for your live stream
              </s-list-item>
              <s-list-item>
                <strong>2. Select Products</strong> - Choose which products to feature
              </s-list-item>
              <s-list-item>
                <strong>3. Copy Broadcast Link</strong> - Use in OBS as Browser Source
              </s-list-item>
              <s-list-item>
                <strong>4. Start Streaming in OBS</strong> - Your stream goes live instantly
              </s-list-item>
              <s-list-item>
                <strong>5. Share Viewer Link</strong> - Customers can watch and shop
              </s-list-item>
            </s-list>
          </div>
        </s-card>

        {/* VDO.Ninja Features */}
        <s-card>
          <s-text variant="headingMd" as="h2">
            Why VDO.Ninja?
          </s-text>
          <s-divider />
          <div style={{ marginTop: "12px" }}>
            <s-list>
              <s-list-item>✅ <strong>100% Free</strong> - No subscription or API keys needed</s-list-item>
              <s-list-item>⚡ <strong>Ultra-low latency</strong> - Under 500ms delay</s-list-item>
              <s-list-item>🔒 <strong>Peer-to-peer</strong> - Direct connection, no middleman</s-list-item>
              <s-list-item>🎥 <strong>Works with OBS</strong> - Simple browser source setup</s-list-item>
              <s-list-item>📱 <strong>Mobile friendly</strong> - Works on all devices</s-list-item>
            </s-list>
          </div>
        </s-card>

        {/* Maintenance */}
        <s-card>
          <s-text variant="headingMd" as="h2">
            Maintenance
          </s-text>
          <s-divider />
          <div style={{ marginTop: "12px" }}>
            <s-text variant="bodySm" tone="subdued">
              Use this to clear all live session records from the database.
            </s-text>
          </div>
          <div
            style={{
              marginTop: "16px",
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <s-button
              variant="tertiary"
              tone="critical"
              onClick={clearLiveSessions}
              loading={isClearing}
            >
              Clear all live sessions
            </s-button>
          </div>
        </s-card>
      </s-page>
    </div>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};