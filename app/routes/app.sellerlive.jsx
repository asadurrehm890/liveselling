// app/routes/app.sellerlive.jsx
import { useState, useEffect } from "react";
import { useLoaderData } from "react-router-dom";
import { useAppBridge } from "@shopify/app-bridge-react";
import { owncastAPI } from "../services/owncastService";

export const loader = async () => {
  // This will be handled by your backend
  // You need to implement the actual API call to Shopify
  return {
    shop: process.env.REACT_APP_SHOPIFY_SHOP,
    products: []
  };
};

export default function SellerLiveStream() {
  const { shop, products } = useLoaderData();
  const shopify = useAppBridge();

  const [streamId, setStreamId] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [isStarting, setIsStarting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  
  // Owncast states
  const [isOwncastStreaming, setIsOwncastStreaming] = useState(false);
  const [streamKey, setStreamKey] = useState("");
  const [viewerCount, setViewerCount] = useState(0);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isStartingStream, setIsStartingStream] = useState(false);
  const [isStoppingStream, setIsStoppingStream] = useState(false);

  const OWNCAST_URL = process.env.REACT_APP_OWNCAST_URL;

  // Check stream status
  const checkStreamStatus = async () => {
    setIsLoadingStatus(true);
    const status = await owncastAPI.getStatus();
    setIsOwncastStreaming(status.isLive);
    setViewerCount(status.viewerCount);
    setIsLoadingStatus(false);
  };

  // Get stream key
  const fetchStreamKey = async () => {
    const key = await owncastAPI.getStreamKey();
    setStreamKey(key);
  };

  // Start Owncast stream
  const startOwncastStream = async () => {
    setIsStartingStream(true);
    const result = await owncastAPI.startStream();
    if (result.success) {
      shopify.toast.show("Owncast stream started successfully");
      await checkStreamStatus();
    } else {
      shopify.toast.show("Failed to start stream", { isError: true });
    }
    setIsStartingStream(false);
  };

  // Stop Owncast stream
  const stopOwncastStream = async () => {
    if (!window.confirm("Are you sure you want to stop the live stream?")) {
      return;
    }
    
    setIsStoppingStream(true);
    const result = await owncastAPI.stopStream();
    if (result.success) {
      shopify.toast.show("Owncast stream stopped successfully");
      await checkStreamStatus();
    } else {
      shopify.toast.show("Failed to stop stream", { isError: true });
    }
    setIsStoppingStream(false);
  };

  // Load initial data
  useEffect(() => {
    checkStreamStatus();
    fetchStreamKey();
    
    const interval = setInterval(checkStreamStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const toggleProduct = (productId) => {
    setSelectedProductIds((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
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

  const startLiveStream = async () => {
    if (!streamId.trim()) {
      shopify.toast.show("Please enter a Stream ID", { isError: true });
      return;
    }

    if (selectedProductIds.length === 0) {
      shopify.toast.show("Please select at least one product", { isError: true });
      return;
    }

    if (!isOwncastStreaming) {
      shopify.toast.show("Please start the Owncast stream first", { isError: true });
      return;
    }

    setIsStarting(true);
    const idsParam = selectedProductIds.join(",");

    try {
      const response = await fetch("/api/live-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop,
          streamId: streamId.trim(),
          productIds: selectedProductIds,
        }),
      });

      if (!response.ok) {
        shopify.toast.show("Could not record live session", { isError: true });
      } else {
        shopify.toast.show(`Live stream "${streamId}" started.`);
      }
    } catch (err) {
      console.error("Error:", err);
      shopify.toast.show("Error recording live session", { isError: true });
    } finally {
      setIsStarting(false);
    }

    const url = `/viewerstream?shop=${encodeURIComponent(shop)}&streamId=${encodeURIComponent(streamId)}&ids=${encodeURIComponent(idsParam)}`;
    window.open(url, "_blank");
  };

  const clearLiveSessions = async () => {
    if (!window.confirm("Clear all live session records? This cannot be undone.")) {
      return;
    }

    setIsClearing(true);
    try {
      const response = await fetch("/api/clear-livesessions", { method: "POST" });
      const data = await response.json();
      shopify.toast.show(`Cleared ${data.deletedCount ?? 0} session(s).`);
    } catch (error) {
      shopify.toast.show("Error clearing sessions", { isError: true });
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <h1>Live Stream Manager</h1>
      
      {/* Owncast Controls */}
      <div style={{ 
        background: "#f8f9fa", 
        padding: "16px", 
        borderRadius: "8px",
        marginBottom: "20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <div>
          <strong>Stream Status: </strong>
          <span style={{
            display: "inline-block",
            padding: "4px 12px",
            borderRadius: "20px",
            backgroundColor: isOwncastStreaming ? "#28a745" : isLoadingStatus ? "#ffc107" : "#dc3545",
            color: "white",
            fontSize: "14px",
            marginLeft: "8px"
          }}>
            {isOwncastStreaming ? "🔴 LIVE" : isLoadingStatus ? "⏳ Checking..." : "⚫ OFFLINE"}
          </span>
          {isOwncastStreaming && viewerCount > 0 && (
            <span style={{ marginLeft: "12px" }}>👥 {viewerCount} viewers</span>
          )}
        </div>
        
        <div style={{ display: "flex", gap: "8px" }}>
          {!isOwncastStreaming && (
            <button 
              onClick={startOwncastStream}
              disabled={isStartingStream}
              style={{
                padding: "8px 16px",
                background: "#007bff",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer"
              }}
            >
              {isStartingStream ? "Starting..." : "Start Encoder Stream"}
            </button>
          )}
          
          {isOwncastStreaming && (
            <button 
              onClick={stopOwncastStream}
              disabled={isStoppingStream}
              style={{
                padding: "8px 16px",
                background: "#dc3545",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer"
              }}
            >
              {isStoppingStream ? "Stopping..." : "Stop Stream"}
            </button>
          )}
        </div>
      </div>

      {/* Main Form */}
      <div style={{ background: "white", padding: "20px", borderRadius: "8px", marginBottom: "20px" }}>
        <h2>Create Live Stream</h2>
        <hr />
        
        <div style={{ marginTop: "16px" }}>
          <label style={{ display: "block", marginBottom: "8px", fontWeight: 600 }}>
            Stream ID *
          </label>
          <input
            type="text"
            value={streamId}
            onChange={handleStreamIdChange}
            placeholder="Enter a unique stream ID (e.g., summer-sale-2024)"
            style={{
              width: "100%",
              padding: "10px",
              border: "1px solid #ddd",
              borderRadius: "4px",
              marginBottom: "16px"
            }}
          />
          
          <h3>Select Products</h3>
          <div style={{ marginBottom: "12px" }}>
            <button onClick={selectAllProducts} style={{ marginRight: "8px" }}>Select All</button>
            <button onClick={clearAllProducts}>Clear All</button>
          </div>
          
          <div style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "12px", maxHeight: "400px", overflowY: "auto" }}>
            {products.length === 0 ? (
              <p>No active products found...</p>
            ) : (
              products.map((product) => (
                <label key={product.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px", borderBottom: "1px solid #f0f0f0" }}>
                  <input
                    type="checkbox"
                    checked={selectedProductIds.includes(product.id)}
                    onChange={() => toggleProduct(product.id)}
                  />
                  {product.featuredImage && (
                    <img src={product.featuredImage.url} alt={product.title} style={{ width: "40px", height: "40px", objectFit: "cover", borderRadius: "4px" }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <div>{product.title}</div>
                    <small>{product.handle}</small>
                  </div>
                  <div>{product.priceRangeV2?.minVariantPrice?.amount} {product.priceRangeV2?.minVariantPrice?.currencyCode}</div>
                </label>
              ))
            )}
          </div>
          
          <div style={{ marginTop: "16px" }}>
            Selected: {selectedProductIds.length} products
          </div>
        </div>
        
        <hr style={{ margin: "20px 0" }} />
        
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={startLiveStream}
            disabled={!streamId || selectedProductIds.length === 0 || !isOwncastStreaming}
            style={{
              padding: "10px 20px",
              background: !streamId || selectedProductIds.length === 0 || !isOwncastStreaming ? "#ccc" : "#28a745",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer"
            }}
          >
            {isStarting ? "Starting..." : "Start Live Stream"}
          </button>
        </div>
      </div>

      {/* Owncast Info */}
      <div style={{ background: "white", padding: "20px", borderRadius: "8px", marginBottom: "20px" }}>
        <h2>Owncast Streaming Setup</h2>
        <hr />
        <div>
          <strong>Stream URL:</strong>
          <div style={{ background: "#f5f5f5", padding: "8px", borderRadius: "4px", marginTop: "4px", marginBottom: "12px", fontFamily: "monospace" }}>
            {OWNCAST_URL}
          </div>
          
          <strong>Stream Key:</strong>
          <div style={{ background: "#f5f5f5", padding: "8px", borderRadius: "4px", marginTop: "4px", fontFamily: "monospace" }}>
            {streamKey || "Loading..."}
          </div>
          
          <hr style={{ margin: "16px 0" }} />
          
          <h3>How to stream with OBS:</h3>
          <ol style={{ marginTop: "8px", paddingLeft: "20px" }}>
            <li>Open OBS Studio</li>
            <li>Go to Settings → Stream</li>
            <li>Service: Custom...</li>
            <li>Server: <code>{OWNCAST_URL}</code></li>
            <li>Stream Key: Use the key shown above</li>
            <li>Click "Start Streaming" in OBS</li>
          </ol>
        </div>
      </div>

      {/* Instructions */}
      <div style={{ background: "white", padding: "20px", borderRadius: "8px", marginBottom: "20px" }}>
        <h2>How to Use</h2>
        <hr />
        <ol style={{ paddingLeft: "20px" }}>
          <li>Click "Start Encoder Stream" to prepare Owncast</li>
          <li>Configure OBS with the Stream URL and Key above</li>
          <li>Start streaming from OBS</li>
          <li>Enter a unique Stream ID</li>
          <li>Select products to feature</li>
          <li>Click "Start Live Stream" to open viewer page</li>
          <li>Share the viewer URL with customers</li>
          <li>Click "Stop Stream" when finished</li>
        </ol>
      </div>

      {/* Maintenance */}
      <div style={{ background: "white", padding: "20px", borderRadius: "8px" }}>
        <h2>Maintenance</h2>
        <hr />
        <button onClick={clearLiveSessions} disabled={isClearing} style={{ padding: "8px 16px", background: "#dc3545", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>
          {isClearing ? "Clearing..." : "Clear all live sessions"}
        </button>
      </div>
    </div>
  );
}