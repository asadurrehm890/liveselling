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

  // No more savedStreams here
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

  // New version: no "Save Stream" – only "Start Live Stream"
  // When clicked, it:
  // 1) Records the session in your Prisma DB via /api/live-sessions
  // 2) Opens the viewer URL in a new tab
  const startLiveStream = async () => {
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
          // shop is available in the session on the server as well
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
        shopify.toast.show(`Live stream "${streamId}" started.`);
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

    // STEP 2: Open viewer URL in new tab (even if DB write fails)
    const url = `/viewerstream?shop=${encodeURIComponent(
      shop,
    )}&streamId=${encodeURIComponent(streamId)}&ids=${encodeURIComponent(
      idsParam,
    )}`;

    console.log("Opening URL:", url);
    window.open(url, "_blank");
  };

  return (
    <s-page heading="Live Stream Manager">
      <s-button
        slot="primary-action"
        onClick={startLiveStream}
        variant="primary"
        disabled={!streamId || selectedProductIds.length === 0 || isStarting}
        loading={isStarting}
      >
        Start Live Stream
      </s-button>

      {/* Main Form */}
      <s-card>
        <s-text variant="headingMd" as="h2">
          Create Live Stream
        </s-text>
        <s-divider />

        <div style={{ marginTop: "16px" }}>
          {/* Stream ID field - Using standard HTML input */}
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
              This ID will be used in the viewer URL
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
            onClick={startLiveStream}
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
          How to Use
        </s-text>
        <s-divider />
        <div style={{ marginTop: "12px" }}>
          <s-list>
            <s-list-item>
              Enter a unique Stream ID (e.g., "summer-sale-2024")
            </s-list-item>
            <s-list-item>
              Select the products you want to feature in your live stream
            </s-list-item>
            <s-list-item>
              Click "Start Live Stream" to save the session and open the viewer
              page in a new tab
            </s-list-item>
            <s-list-item>
              Share the viewer URL with your customers
            </s-list-item>
          </s-list>
        </div>
      </s-card>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};