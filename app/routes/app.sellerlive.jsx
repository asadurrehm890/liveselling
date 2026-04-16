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

  // Button 1: Start Live Stream - Saves to database AND opens VDO.Ninja push URL
  const startLiveStream = async () => {
    if (!streamId.trim()) {
      shopify.toast.show("Please enter a Stream ID first", { isError: true });
      return;
    }
    
    if (selectedProductIds.length === 0) {
      shopify.toast.show("Please select at least one product", { isError: true });
      return;
    }
    
    setIsStarting(true);
    
    try {
      // Save live session to database using your existing API endpoint
      const response = await fetch("/api/live-sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          streamId: streamId.trim(),
          productIds: selectedProductIds,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error("Failed to create live session:", errorData);
        shopify.toast.show(
          errorData.error || "Could not record live session (stream will still open).",
          { isError: true },
        );
      } else {
        const data = await response.json();
        shopify.toast.show(`Live stream "${streamId}" session saved successfully!`);
        console.log("Live session saved:", data);
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
    
    // Open VDO.Ninja push URL to start streaming
    const pushUrl = `https://vdo.ninja/?push=${streamId}&webcam`;
    window.open(pushUrl, "_blank");
    
    shopify.toast.show("VDO.Ninja stream window opened! Start broadcasting your camera.");
  };

  // Button 2: Copy Viewer Link - Creates viewer link with selected products
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
    setShowCopiedFeedback(true);
    shopify.toast.show("Viewer link copied to clipboard!");
    
    setTimeout(() => setShowCopiedFeedback(false), 3000);
  };

  // Button 3: Clear all live sessions (maintenance)
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
        const text = await response.text();
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

          {/* Three Action Buttons */}
          <s-divider />
          <div
            style={{
              display: "flex",
              gap: "12px",
              marginTop: "24px",
              justifyContent: "flex-start",
            }}
          >
            {/* Button 1: Start Live Stream */}
            <s-button
              onClick={startLiveStream}
              variant="primary"
              disabled={!streamId.trim() || selectedProductIds.length === 0}
              loading={isStarting}
            >
              🎥 Start Live Stream
            </s-button>

            {/* Button 2: Copy Viewer Link */}
            <s-button
              onClick={copyViewerLink}
              variant="secondary"
              disabled={!streamId.trim() || selectedProductIds.length === 0}
            >
              🔗 Copy Viewer Link
            </s-button>

            {/* Button 3: Clear All Streams */}
            <s-button
              variant="tertiary"
              tone="critical"
              onClick={clearLiveSessions}
              loading={isClearing}
            >
              🗑️ Clear All Streams
            </s-button>
          </div>
          
          {/* Helper text for buttons */}
          <div style={{ marginTop: "16px", fontSize: "12px", color: "#6b6b6b" }}>
            <p style={{ margin: "4px 0" }}>
              <strong>🎥 Start Live Stream:</strong> Saves session to database and opens VDO.Ninja push page
            </p>
            <p style={{ margin: "4px 0" }}>
              <strong>🔗 Copy Viewer Link:</strong> Share this link with customers to watch and shop
            </p>
            <p style={{ margin: "4px 0" }}>
              <strong>🗑️ Clear All Streams:</strong> Remove all live session records from database
            </p>
          </div>
        </s-card>

      </s-page>
    </div>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};