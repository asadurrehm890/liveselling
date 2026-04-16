// app/routes/viewerstream.jsx
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import Pusher from "pusher-js";

// Extract numeric ID from a GraphQL GID like "gid://shopify/ProductVariant/1234567890"
const getNumericIdFromGid = (gid) => {
  if (!gid) return null;
  const parts = gid.split("/");
  return parts[parts.length - 1] || null;
};

export default function ViewerstreamPage() {
  const [searchParams] = useSearchParams();

  const shop = searchParams.get("shop");
  const streamId = searchParams.get("streamId");
  const idsParam = searchParams.get("ids");

  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [error, setError] = useState("");
  const [chatError, setChatError] = useState("");
  
  // VDO.Ninja stream status
  const [isStreamLive, setIsStreamLive] = useState(false);
  const [checkingStream, setCheckingStream] = useState(true);

  // Chat state
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const pusherRef = useRef(null);
  const channelRef = useRef(null);
  const iframeRef = useRef(null);
  const videoElementRef = useRef(null);

  // Create a unique client ID for this browser session
  const [clientId, setClientId] = useState(null);

  // Track selected variants for each product
  const [selectedVariants, setSelectedVariants] = useState({});

  // Track quantity for each product
  const [quantities, setQuantities] = useState({});

  // Cart sidebar
  const [cartItems, setCartItems] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Generate client ID only on the client side
  useEffect(() => {
    let id = localStorage.getItem("chat_client_id");
    if (!id) {
      id = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem("chat_client_id", id);
    }
    setClientId(id);
  }, []);

  // Check if VDO.Ninja stream is active using multiple methods
  useEffect(() => {
    if (!streamId) {
      setCheckingStream(false);
      return;
    }

    let checkInterval;
    let retryCount = 0;
    const maxRetries = 3;

    const checkStreamStatus = () => {
      // Method 1: Try to load a small image from VDO.Ninja (most reliable)
      const img = new Image();
      const imgUrl = `https://vdo.ninja/${streamId}/favicon.ico?t=${Date.now()}`;
      
      let timeoutId;
      
      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        img.onload = null;
        img.onerror = null;
      };
      
      img.onload = () => {
        // Image loaded - stream might be active
        cleanup();
        setIsStreamLive(true);
        setCheckingStream(false);
      };
      
      img.onerror = () => {
        cleanup();
        
        // Method 2: Check if iframe has loaded content
        if (iframeRef.current) {
          try {
            // Try to access iframe content (might fail due to CORS)
            const iframeDoc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
            if (iframeDoc && iframeDoc.readyState === 'complete') {
              // Iframe loaded, likely stream is active
              setIsStreamLive(true);
              setCheckingStream(false);
              return;
            }
          } catch (e) {
            // CORS error means iframe loaded but can't access - that's good!
            setIsStreamLive(true);
            setCheckingStream(false);
            return;
          }
        }
        
        // Method 3: Check video element metadata
        if (videoElementRef.current) {
          const video = videoElementRef.current;
          if (video.readyState >= 2) { // HAVE_CURRENT_DATA or more
            setIsStreamLive(true);
            setCheckingStream(false);
            return;
          }
        }
        
        // If all methods failed, stream might be offline
        if (retryCount < maxRetries) {
          retryCount++;
          // Retry after delay
          setTimeout(checkStreamStatus, 2000);
        } else {
          setIsStreamLive(false);
          setCheckingStream(false);
        }
      };
      
      timeoutId = setTimeout(() => {
        img.onerror(new Error('Timeout'));
      }, 3000);
      
      img.src = imgUrl;
    };
    
    // Initial check
    checkStreamStatus();
    
    // Check every 15 seconds for status changes
    checkInterval = setInterval(() => {
      retryCount = 0;
      checkStreamStatus();
    }, 15000);
    
    return () => {
      if (checkInterval) clearInterval(checkInterval);
    };
  }, [streamId]);

  // Also listen to iframe load events
  useEffect(() => {
    if (!iframeRef.current) return;
    
    const handleIframeLoad = () => {
      // If iframe loads, stream is likely active
      setIsStreamLive(true);
      setCheckingStream(false);
    };
    
    const iframe = iframeRef.current;
    iframe.addEventListener('load', handleIframeLoad);
    
    return () => {
      iframe.removeEventListener('load', handleIframeLoad);
    };
  }, [iframeRef.current]);

  // Load products for this stream
  useEffect(() => {
    if (!shop || !idsParam) {
      return;
    }

    setError("");
    setLoadingProducts(true);

    const url = `/api/showproducts?shop=${encodeURIComponent(
      shop,
    )}&ids=${encodeURIComponent(idsParam)}`;

    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Request failed with status ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        setProducts(data.products || []);

        // Initialize selected variants with first available variant for each product
        const initialVariants = {};
        const initialQuantities = {};

        (data.products || []).forEach((product) => {
          const availableVariant =
            product.variants?.find((v) => v.availableForSale) ||
            product.variants?.[0];
          if (availableVariant) {
            initialVariants[product.id] = availableVariant;
            initialQuantities[product.id] = 1;
          }
        });

        setSelectedVariants(initialVariants);
        setQuantities(initialQuantities);
      })
      .catch((err) => {
        console.error("Error fetching products:", err);
        setError("Could not load products for this stream.");
      })
      .finally(() => {
        setLoadingProducts(false);
      });
  }, [shop, idsParam]);

  // Set up Pusher connection for chat
  useEffect(() => {
    if (!streamId || !clientId) return;

    const pusherKey = window.ENV?.PUSHER_KEY;
    const pusherCluster = window.ENV?.PUSHER_CLUSTER;

    console.log("Pusher config from window.ENV:", {
      hasKey: !!pusherKey,
      keyPrefix: pusherKey ? pusherKey.substring(0, 8) : "none",
      cluster: pusherCluster,
      streamId: streamId,
      clientId: clientId,
    });

    if (!pusherKey || !pusherCluster) {
      console.error("Pusher credentials not found.");
      setChatError("Chat configuration error. Please contact support.");
      return;
    }

    if (pusherKey === "YOUR_PUSHER_KEY" || pusherKey.includes("YOUR_")) {
      console.error("Invalid Pusher key.");
      setChatError("Chat configuration error. Invalid API key.");
      return;
    }

    setChatError("");

    try {
      console.log("Initializing Pusher with cluster:", pusherCluster);

      const pusher = new Pusher(pusherKey, {
        cluster: pusherCluster,
        forceTLS: true,
        enabledTransports: ["ws", "wss"],
      });

      pusherRef.current = pusher;

      pusher.connection.bind("connected", () => {
        console.log("✅ Connected to Pusher");
        setIsConnected(true);
        setChatError("");
      });

      pusher.connection.bind("disconnected", () => {
        setIsConnected(false);
      });

      pusher.connection.bind("error", (error) => {
        console.error("❌ Pusher connection error:", error);
        setChatError("Chat connection failed. Please refresh the page.");
        setIsConnected(false);
      });

      const channelName = `stream-${streamId}`;
      const channel = pusher.subscribe(channelName);
      channelRef.current = channel;

      channel.bind("new-message", (message) => {
        console.log("📨 Received message from Pusher:", message);

        if (message.clientId === clientId) {
          console.log("🔇 Ignoring own message from Pusher");
          return;
        }

        console.log("✅ Adding message from another client:", message.text);
        setMessages((prev) => [...prev, message]);
      });

      channel.bind("pusher:subscription_succeeded", () => {
        console.log(`✅ Subscribed to channel: ${channelName}`);
      });

      channel.bind("pusher:subscription_error", (error) => {
        console.error(`❌ Subscription error:`, error);
        setChatError("Failed to join chat room. Please refresh the page.");
      });
    } catch (error) {
      console.error("Pusher initialization error:", error);
      setChatError("Failed to initialize chat. Please check your configuration.");
    }

    return () => {
      if (channelRef.current) {
        channelRef.current.unbind_all();
        channelRef.current.unsubscribe();
      }
      if (pusherRef.current) {
        pusherRef.current.disconnect();
      }
    };
  }, [streamId, clientId]);

  const handleChatSubmit = async (e) => {
    e.preventDefault();

    if (!chatInput.trim()) return;
    if (!isConnected) {
      setChatError(
        "Chat not connected. Please wait for connection or refresh the page.",
      );
      return;
    }
    if (!streamId) return;
    if (!clientId) {
      setChatError("Chat not ready. Please refresh the page.");
      return;
    }

    const text = chatInput.trim();

    const tempMessage = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      author: "Viewer",
      text: text,
      timestamp: new Date().toISOString(),
      streamId: streamId,
      clientId: clientId,
      isPending: true,
    };

    setMessages((prev) => [...prev, tempMessage]);
    setChatInput("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          streamId: streamId,
          text: text,
          author: "Viewer",
          timestamp: new Date().toISOString(),
          clientId: clientId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to send message");
      }

      const data = await response.json();
      console.log("📤 Message sent successfully:", data);

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempMessage.id ? { ...msg, isPending: false } : msg,
        ),
      );
    } catch (err) {
      console.error("Error sending message:", err);
      setChatError(`Failed to send message: ${err.message}`);
      setMessages((prev) => prev.filter((msg) => msg.id !== tempMessage.id));
    }
  };

  // Handle variant selection change
  const handleVariantChange = (productId, variantId) => {
    const product = products.find((p) => p.id === productId);
    const variant = product?.variants?.find((v) => v.id === variantId);
    if (variant) {
      setSelectedVariants((prev) => ({
        ...prev,
        [productId]: variant,
      }));
    }
  };

  // Handle quantity change
  const handleQuantityChange = (productId, value) => {
    const parsed = parseInt(value, 10);
    const safeValue = Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;

    setQuantities((prev) => ({
      ...prev,
      [productId]: safeValue,
    }));
  };

  // Add current product + variant + quantity to local cart & open sidebar
  const handleAddToCart = (productId) => {
    const product = products.find((p) => p.id === productId);
    const selectedVariant = selectedVariants[productId];
    const quantity = quantities[productId] || 1;

    if (!product || !selectedVariant) {
      alert("No variant selected for this product.");
      return;
    }

    if (!quantity || quantity < 1) {
      alert("Please enter a valid quantity (minimum 1).");
      return;
    }

    const numericVariantId = getNumericIdFromGid(selectedVariant.id);
    if (!numericVariantId) {
      alert("Could not find a valid variant for this product.");
      return;
    }

    // Merge items by variantId if already in cart
    setCartItems((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.variantId === selectedVariant.id,
      );
      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + quantity,
        };
        return updated;
      }

      const price =
        selectedVariant?.price ?? product.priceRangeV2?.minVariantPrice;
      const currencyCode =
        price?.currencyCode ||
        product.priceRangeV2?.minVariantPrice?.currencyCode ||
        undefined;

      const image = selectedVariant?.image || product.featuredImage;

      return [
        ...prev,
        {
          productId: product.id,
          productTitle: product.title,
          productHandle: product.handle,
          variantId: selectedVariant.id,
          variantTitle: selectedVariant.title,
          image,
          price,
          currencyCode,
          quantity,
        },
      ];
    });

    setIsCartOpen(true);
  };

  // Remove item from cart
  const handleRemoveCartItem = (variantId) => {
    setCartItems((prev) => prev.filter((item) => item.variantId !== variantId));
  };

  // Get product URL with selected variant
  const getProductUrl = (product, variant) => {
    if (!shop) return null;
    let url = `https://${shop}/products/${product.handle}`;
    if (variant && variant.selectedOptions?.length > 0) {
      const variantParams = variant.selectedOptions
        .map(
          (opt) =>
            `${encodeURIComponent(opt.name)}=${encodeURIComponent(opt.value)}`,
        )
        .join("&");
      if (variantParams) {
        url += `?${variantParams}`;
      }
    }
    return url;
  };

  // Build checkout URL for all items in local cart
  const getCartCheckoutUrl = (items) => {
    if (!shop || !items || items.length === 0) return null;

    const parts = [];

    items.forEach((item) => {
      const numericVariantId = getNumericIdFromGid(item.variantId);
      if (!numericVariantId) return;

      const safeQuantity = !item.quantity || item.quantity < 1 ? 1 : item.quantity;
      parts.push(`${numericVariantId}:${safeQuantity}`);
    });

    if (parts.length === 0) return null;

    // /cart/<variant1>:<qty1>,<variant2>:<qty2>,...
    return `https://${shop}/cart/${parts.join(",")}`;
  };

  const handleCheckout = () => {
    const url = getCartCheckoutUrl(cartItems);
    if (!url) {
      alert("Your cart is empty or invalid.");
      return;
    }

    window.location.href = url;
  };

  // Format price
  const formatPrice = (price, fallbackCurrencyCode) => {
    if (price == null) return "N/A";

    if (typeof price === "object" && "amount" in price) {
      const amount = price.amount;
      const currencyCode = price.currencyCode || fallbackCurrencyCode || "";
      return `${amount} ${currencyCode}`.trim();
    }

    if (fallbackCurrencyCode) {
      return `${price} ${fallbackCurrencyCode}`;
    }

    return String(price);
  };

  // Calculate cart total
  const getCartTotal = () => {
    if (!cartItems.length) return null;

    const currencyCode = cartItems[0].currencyCode || "";

    const totalAmount = cartItems.reduce((sum, item) => {
      const priceObj = item.price;
      let amount = 0;

      if (priceObj && typeof priceObj === "object" && "amount" in priceObj) {
        amount = parseFloat(priceObj.amount || "0");
      } else if (typeof priceObj === "number" || typeof priceObj === "string") {
        amount = parseFloat(priceObj);
      }

      const qty = item.quantity || 1;
      return sum + amount * qty;
    }, 0);

    return `${totalAmount.toFixed(2)} ${currencyCode}`.trim();
  };

  return (
    <div className="live-stream-container">
      {/* Header */}
      <header style={{ marginBottom: "2rem", textAlign: "center" }}>
        <h1 className="live-stream-title">Live Stream</h1>
        {streamId ? (
          <div>
            <p style={{ margin: 0, color: "#555" }}>
              Stream ID: <strong>{streamId}</strong>
            </p>
            {/* Live/Offline Status Badge */}
            <div style={{ marginTop: "8px" }}>
              {checkingStream ? (
                <span style={{
                  display: "inline-block",
                  padding: "4px 12px",
                  backgroundColor: "#ff9800",
                  color: "white",
                  borderRadius: "20px",
                  fontSize: "12px",
                  fontWeight: "bold",
                }}>
                  ⏳ Checking stream...
                </span>
              ) : isStreamLive ? (
                <span style={{
                  display: "inline-block",
                  padding: "4px 12px",
                  backgroundColor: "#ff0000",
                  color: "white",
                  borderRadius: "20px",
                  fontSize: "12px",
                  fontWeight: "bold",
                  animation: "pulse 1.5s infinite"
                }}>
                  🔴 LIVE
                </span>
              ) : (
                <span style={{
                  display: "inline-block",
                  padding: "4px 12px",
                  backgroundColor: "#666",
                  color: "white",
                  borderRadius: "20px",
                  fontSize: "12px"
                }}>
                  ⚫ OFFLINE
                </span>
              )}
            </div>
            {!isStreamLive && !checkingStream && (
              <div style={{ 
                marginTop: "8px", 
                padding: "8px", 
                backgroundColor: "#fff3cd", 
                border: "1px solid #ffeeba",
                borderRadius: "4px",
                fontSize: "12px",
                color: "#856404"
              }}>
                💡 The streamer hasn't started broadcasting yet. Check back soon!
              </div>
            )}
          </div>
        ) : (
          <div className="live-stream-error">
            Missing <code>streamId</code> in URL.
          </div>
        )}
        {!shop && (
          <div className="live-stream-error">
            Missing <code>shop</code> parameter in URL.
          </div>
        )}
        {!idsParam && (
          <div className="live-stream-error">
            Missing <code>ids</code> parameter in URL.
          </div>
        )}
      </header>

      {/* Two Column Layout: Live Stream + Chat */}
      <div className="live-stream-two-columns">
        {/* Left Column: Live Stream Video */}
        <div className="live-stream-video-column">
          <div className="live-stream-iframe-wrapper">
            {streamId ? (
              <>
                <iframe
                  ref={iframeRef}
                  src={`https://vdo.ninja/?view=${streamId}`}
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  scrolling="no"
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen; camera; microphone"
                  allowFullScreen={true}
                  title="Live stream"
                  className="live-stream-iframe"
                  style={{ minHeight: "500px" }}
                ></iframe>
                {/* Hidden video element for additional detection */}
                <video
                  ref={videoElementRef}
                  src={`https://vdo.ninja/${streamId}`}
                  style={{ display: "none" }}
                  autoPlay
                  muted
                />
              </>
            ) : (
              <div className="live-stream-placeholder" style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "500px",
                backgroundColor: "#f0f0f0",
                borderRadius: "8px"
              }}>
                <p>Waiting for stream to start...</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Chat Box */}
        <div className="live-stream-chat-column">
          <div className="live-stream-chat-header">
            <h2 className="live-stream-chat-title">
              Live Chat
              {isConnected && (
                <span className="live-stream-chat-status live-stream-chat-status-connected">
                  ● Connected
                </span>
              )}
              {!isConnected && clientId && (
                <span className="live-stream-chat-status live-stream-chat-status-connecting">
                  ● Connecting...
                </span>
              )}
            </h2>
          </div>

          <div className="live-stream-chat-messages">
            {messages.length === 0 ? (
              <p
                style={{
                  color: "#777",
                  margin: 0,
                  textAlign: "center",
                  padding: "20px",
                }}
              >
                No messages yet. Be the first to chat!
              </p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`live-stream-chat-message ${
                    msg.isPending ? "live-stream-chat-message-pending" : ""
                  } ${
                    msg.clientId === clientId
                      ? "live-stream-chat-message-own"
                      : ""
                  }`}
                >
                  <span
                    className={`live-stream-chat-author ${
                      msg.clientId === clientId
                        ? "live-stream-chat-author-own"
                        : ""
                    }`}
                  >
                    {msg.author || "Viewer"}:
                  </span>
                  <span>{msg.text}</span>
                  {msg.isPending && (
                    <span className="live-stream-chat-pending">
                      (sending...)
                    </span>
                  )}
                  <span className="live-stream-chat-time">
                    {msg.timestamp
                      ? new Date(msg.timestamp).toLocaleTimeString()
                      : ""}
                  </span>
                </div>
              ))
            )}
          </div>

          <form className="live-stream-chat-form" onSubmit={handleChatSubmit}>
            <input
              type="text"
              className="live-stream-chat-input"
              placeholder={
                isConnected ? "Type your message..." : "Connecting to chat..."
              }
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={!isConnected}
            />
            <button
              type="submit"
              className="live-stream-chat-send"
              disabled={!streamId || !chatInput.trim() || !isConnected}
            >
              Send
            </button>
          </form>
        </div>
      </div>

      {/* Error Messages */}
      {error && <div className="live-stream-error">{error}</div>}
      {chatError && (
        <div className="live-stream-warning">⚠️ {chatError}</div>
      )}

      {/* Products Section - Full Width */}
      {loadingProducts && (
        <div className="live-stream-loading">
          Loading products for this stream…
        </div>
      )}

      {!loadingProducts && !error && products.length === 0 && (
        <div className="live-stream-info">
          No products found for this stream. Check the <code>ids</code> param.
        </div>
      )}

      {!loadingProducts && products.length > 0 && (
        <section className="live-stream-products-section">
          <div className="live-stream-products-header">
            <h2 className="live-stream-section-title">
              Products in this stream
            </h2>
            <button
              type="button"
              className="live-stream-cart-toggle-button"
              onClick={() => setIsCartOpen(true)}
            >
              Cart ({cartItems.length})
            </button>
          </div>

          <div className="live-stream-products-grid-full">
            {products.map((product) => {
              const selectedVariant = selectedVariants[product.id];
              const image = selectedVariant?.image || product.featuredImage;
              const price =
                selectedVariant?.price ??
                product.priceRangeV2?.minVariantPrice;
              const currencyCode =
                product.priceRangeV2?.minVariantPrice?.currencyCode ||
                undefined;
              const isAvailable = selectedVariant?.availableForSale !== false;
              const productUrl = getProductUrl(product, selectedVariant);
              const quantity = quantities[product.id] ?? 1;

              return (
                <article
                  key={product.id}
                  className="live-stream-product-card-full"
                >
                  <div className="live-stream-product-image-wrapper">
                    {image ? (
                      <a
                        href={productUrl || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <img
                          src={image.url}
                          alt={image.altText || product.title}
                          className="live-stream-product-image-full"
                        />
                      </a>
                    ) : (
                      <div className="live-stream-product-image-placeholder-full">
                        No image
                      </div>
                    )}
                  </div>

                  <div className="live-stream-product-details-full">
                    <h3 className="live-stream-product-name-full">
                      <a
                        href={productUrl || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {product.title}
                      </a>
                    </h3>

                    <p className="live-stream-product-meta-full">
                      {product.handle}
                      {product.status ? ` – ${product.status}` : ""}
                    </p>

                    {/* Variant Options */}
                    {product.options && product.options.length > 0 && (
                      <div className="live-stream-variant-options-full">
                        {product.options.map((option) => {
                          const currentVariant = selectedVariants[product.id];
                          const currentValue =
                            currentVariant?.selectedOptions?.find(
                              (opt) => opt.name === option.name,
                            )?.value || option.values[0];

                          return (
                            <div
                              key={option.id}
                              className="live-stream-variant-option-full"
                            >
                              <label className="live-stream-variant-label-full">
                                {option.name}:
                              </label>
                              <select
                                className="live-stream-variant-select-full"
                                value={currentValue}
                                onChange={(e) => {
                                  const newValue = e.target.value;
                                  const currentVariant =
                                    selectedVariants[product.id];

                                  const desiredOptions = product.options.map(
                                    (optDef) => {
                                      if (optDef.name === option.name) {
                                        return {
                                          name: optDef.name,
                                          value: newValue,
                                        };
                                      }
                                      const currentOptValue =
                                        currentVariant?.selectedOptions?.find(
                                          (o) => o.name === optDef.name,
                                        )?.value || optDef.values[0];
                                      return {
                                        name: optDef.name,
                                        value: currentOptValue,
                                      };
                                    },
                                  );

                                  const newVariant = product.variants?.find(
                                    (v) => {
                                      if (!v.selectedOptions) return false;
                                      return desiredOptions.every(
                                        (desiredOpt) =>
                                          v.selectedOptions.some(
                                            (opt) =>
                                              opt.name === desiredOpt.name &&
                                              opt.value === desiredOpt.value,
                                          ),
                                      );
                                    },
                                  );

                                  if (newVariant) {
                                    handleVariantChange(
                                      product.id,
                                      newVariant.id,
                                    );
                                  }
                                }}
                              >
                                {option.values.map((value) => {
                                  const currentVariant =
                                    selectedVariants[product.id];
                                  const desiredOptionsForThisValue =
                                    product.options.map((optDef) => {
                                      if (optDef.name === option.name) {
                                        return {
                                          name: optDef.name,
                                          value: value,
                                        };
                                      }
                                      const currentOptValue =
                                        currentVariant?.selectedOptions?.find(
                                          (o) => o.name === optDef.name,
                                        )?.value || optDef.values[0];
                                      return {
                                        name: optDef.name,
                                        value: currentOptValue,
                                      };
                                    });

                                  const variantForValue = product.variants?.find(
                                    (v) => {
                                      if (!v.selectedOptions) return false;
                                      return desiredOptionsForThisValue.every(
                                        (desiredOpt) =>
                                          v.selectedOptions.some(
                                            (opt) =>
                                              opt.name === desiredOpt.name &&
                                              opt.value === desiredOpt.value,
                                          ),
                                      );
                                    },
                                  );

                                  return (
                                    <option
                                      key={value}
                                      value={value}
                                      disabled={
                                        !variantForValue?.availableForSale
                                      }
                                    >
                                      {value}{" "}
                                      {!variantForValue?.availableForSale
                                        ? "(Sold Out)"
                                        : ""}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Price */}
                    <p className="live-stream-product-price-full">
                      Price: {formatPrice(price, currencyCode)}
                      {!isAvailable && (
                        <span className="live-stream-sold-out-full">
                          {" "}
                          (Sold Out)
                        </span>
                      )}
                    </p>

                    {/* Quantity Selector & Add to Cart */}
                    <div className="live-stream-button-group-full">
                      <div className="live-stream-quantity-wrapper-full">
                        <label className="live-stream-quantity-label-full" htmlFor={`qty-${product.id}`}>
                          Quantity
                        </label>
                        <div className="live-stream-quantity-controls">
                          <button 
                            type="button"
                            className="live-stream-quantity-btn"
                            onClick={() => handleQuantityChange(product.id, quantity - 1)}
                            disabled={!isAvailable || quantity <= 1}
                          >
                            −
                          </button>
                          <input
                            id={`qty-${product.id}`}
                            type="number"
                            min="1"
                            step="1"
                            className="live-stream-quantity-input-full"
                            value={quantity}
                            onChange={(e) => handleQuantityChange(product.id, e.target.value)}
                            disabled={!isAvailable}
                          />
                          <button 
                            type="button"
                            className="live-stream-quantity-btn"
                            onClick={() => handleQuantityChange(product.id, quantity + 1)}
                            disabled={!isAvailable}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        className={`live-stream-buy-button-full ${!isAvailable ? 'disabled' : ''}`}
                        onClick={() => handleAddToCart(product.id)}
                        disabled={!isAvailable}
                      >
                        {isAvailable ? (
                          <>
                            <span className="button-text">Add to Cart</span>
                            <span className="button-icon">→</span>
                          </>
                        ) : (
                          'Sold Out'
                        )}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* Cart Sidebar */}
      {isCartOpen && (
        <div className="live-stream-cart-overlay" onClick={() => setIsCartOpen(false)}>
          <div
            className="live-stream-cart-sidebar"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="live-stream-cart-header">
              <h3>Your Cart</h3>
              <button
                type="button"
                className="live-stream-cart-close-button"
                onClick={() => setIsCartOpen(false)}
              >
                ✕
              </button>
            </div>

            {cartItems.length === 0 ? (
              <div className="live-stream-cart-empty">
                Your cart is empty.
              </div>
            ) : (
              <>
                <div className="live-stream-cart-items">
                  {cartItems.map((item) => (
                    <div
                      key={item.variantId}
                      className="live-stream-cart-item"
                    >
                      <div className="live-stream-cart-item-image">
                        {item.image ? (
                          <img
                            src={item.image.url}
                            alt={item.image.altText || item.productTitle}
                          />
                        ) : (
                          <div className="live-stream-cart-item-image-placeholder">
                            No image
                          </div>
                        )}
                      </div>
                      <div className="live-stream-cart-item-details">
                        <div className="live-stream-cart-item-title">
                          {item.productTitle}
                        </div>
                        <div className="live-stream-cart-item-variant">
                          {item.variantTitle}
                        </div>
                        <div className="live-stream-cart-item-meta">
                          <span>
                            {formatPrice(item.price, item.currencyCode)}
                          </span>
                          <span>× {item.quantity}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="live-stream-cart-item-remove"
                        onClick={() => handleRemoveCartItem(item.variantId)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>

                <div className="live-stream-cart-footer">
                  <div className="live-stream-cart-total">
                    <span>Total:</span>
                    <span>{getCartTotal() || "-"}</span>
                  </div>
                  <button
                    type="button"
                    className="live-stream-cart-checkout-button"
                    onClick={handleCheckout}
                  >
                    Checkout
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Add animation CSS for live badge */}
      <style>{`
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.6; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}