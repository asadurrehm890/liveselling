// app/routes/viewerstream.jsx
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Pusher from "pusher-js";
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
//import './viewerstream.css'; // We'll create this CSS file

// Extract numeric ID from a GraphQL GID
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
  const [isStreamOnline, setIsStreamOnline] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);

  // Chat state
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const pusherRef = useRef(null);
  const channelRef = useRef(null);

  // Video player refs
  const videoRef = useRef(null);
  const playerRef = useRef(null);

  // Client ID
  const [clientId, setClientId] = useState(null);

  // Product variant states
  const [selectedVariants, setSelectedVariants] = useState({});
  const [quantities, setQuantities] = useState({});

  // Cart states
  const [cartItems, setCartItems] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const OWNCAST_URL = process.env.REACT_APP_OWNCAST_URL || "https://silver-yodel-qrpqrwgxg4pc6wwq-8080.app.github.dev";

  // Generate client ID
  useEffect(() => {
    let id = localStorage.getItem("chat_client_id");
    if (!id) {
      id = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem("chat_client_id", id);
    }
    setClientId(id);
  }, []);

  // Check stream status periodically
  useEffect(() => {
    if (!streamId) return;

    const checkStreamStatus = async () => {
      try {
        const response = await fetch(`${OWNCAST_URL}/api/status`);
        const data = await response.json();
        setIsStreamOnline(data.online || false);
        setViewerCount(data.viewerCount || 0);
      } catch (err) {
        console.error("Error checking stream status:", err);
      }
    };

    checkStreamStatus();
    const interval = setInterval(checkStreamStatus, 10000);

    return () => clearInterval(interval);
  }, [streamId, OWNCAST_URL]);

  // Initialize video player with Owncast HLS stream
  useEffect(() => {
    if (!streamId || !videoRef.current) return;

    const streamUrl = `${OWNCAST_URL}/hls/stream.m3u8`;

    if (!playerRef.current) {
      playerRef.current = videojs(videoRef.current, {
        controls: true,
        autoplay: false,
        preload: 'auto',
        fluid: true,
        sources: [{
          src: streamUrl,
          type: 'application/x-mpegURL'
        }],
        controlBar: {
          volumePanel: true,
          playToggle: true,
          currentTimeDisplay: true,
          timeDivider: true,
          durationDisplay: true,
          progressControl: true,
          liveDisplay: true,
          fullscreenToggle: true
        }
      });

      playerRef.current.on('error', (e) => {
        console.error('Video player error:', e);
      });
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [streamId, OWNCAST_URL]);

  // Load products
  useEffect(() => {
    if (!shop || !idsParam) return;

    setError("");
    setLoadingProducts(true);

    const url = `/api/showproducts?shop=${encodeURIComponent(shop)}&ids=${encodeURIComponent(idsParam)}`;

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

        const initialVariants = {};
        const initialQuantities = {};

        (data.products || []).forEach((product) => {
          const availableVariant = product.variants?.find((v) => v.availableForSale) || product.variants?.[0];
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

  // Set up Pusher for chat
  useEffect(() => {
    if (!streamId || !clientId) return;

    const pusherKey = window.ENV?.PUSHER_KEY;
    const pusherCluster = window.ENV?.PUSHER_CLUSTER;

    if (!pusherKey || !pusherCluster) {
      setChatError("Chat configuration error.");
      return;
    }

    try {
      const pusher = new Pusher(pusherKey, {
        cluster: pusherCluster,
        forceTLS: true,
      });

      pusherRef.current = pusher;

      pusher.connection.bind("connected", () => {
        setIsConnected(true);
        setChatError("");
      });

      pusher.connection.bind("disconnected", () => {
        setIsConnected(false);
      });

      pusher.connection.bind("error", (error) => {
        console.error("Pusher error:", error);
        setChatError("Chat connection failed.");
        setIsConnected(false);
      });

      const channelName = `stream-${streamId}`;
      const channel = pusher.subscribe(channelName);
      channelRef.current = channel;

      channel.bind("new-message", (message) => {
        if (message.clientId === clientId) return;
        setMessages((prev) => [...prev, message]);
      });

      channel.bind("pusher:subscription_succeeded", () => {
        console.log(`Subscribed to ${channelName}`);
      });

    } catch (error) {
      console.error("Pusher initialization error:", error);
      setChatError("Failed to initialize chat.");
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
      setChatError("Chat not connected.");
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
        throw new Error("Failed to send message");
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempMessage.id ? { ...msg, isPending: false } : msg
        )
      );
    } catch (err) {
      console.error("Error sending message:", err);
      setChatError(`Failed to send message: ${err.message}`);
      setMessages((prev) => prev.filter((msg) => msg.id !== tempMessage.id));
    }
  };

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

  const handleQuantityChange = (productId, value) => {
    const parsed = parseInt(value, 10);
    const safeValue = Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
    setQuantities((prev) => ({
      ...prev,
      [productId]: safeValue,
    }));
  };

  const handleAddToCart = (productId) => {
    const product = products.find((p) => p.id === productId);
    const selectedVariant = selectedVariants[productId];
    const quantity = quantities[productId] || 1;

    if (!product || !selectedVariant) {
      alert("No variant selected.");
      return;
    }

    const numericVariantId = getNumericIdFromGid(selectedVariant.id);
    if (!numericVariantId) {
      alert("Invalid variant.");
      return;
    }

    setCartItems((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.variantId === selectedVariant.id
      );
      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + quantity,
        };
        return updated;
      }

      const price = selectedVariant?.price ?? product.priceRangeV2?.minVariantPrice;
      const currencyCode = price?.currencyCode ||
        product.priceRangeV2?.minVariantPrice?.currencyCode;

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

  const handleRemoveCartItem = (variantId) => {
    setCartItems((prev) => prev.filter((item) => item.variantId !== variantId));
  };

  const getProductUrl = (product, variant) => {
    if (!shop) return null;
    let url = `https://${shop}/products/${product.handle}`;
    if (variant && variant.selectedOptions?.length > 0) {
      const variantParams = variant.selectedOptions
        .map((opt) => `${encodeURIComponent(opt.name)}=${encodeURIComponent(opt.value)}`)
        .join("&");
      if (variantParams) {
        url += `?${variantParams}`;
      }
    }
    return url;
  };

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
    return `https://${shop}/cart/${parts.join(",")}`;
  };

  const handleCheckout = () => {
    const url = getCartCheckoutUrl(cartItems);
    if (!url) {
      alert("Your cart is empty.");
      return;
    }
    window.location.href = url;
  };

  const formatPrice = (price, fallbackCurrencyCode) => {
    if (price == null) return "N/A";
    if (typeof price === "object" && "amount" in price) {
      return `${price.amount} ${price.currencyCode || fallbackCurrencyCode || ""}`.trim();
    }
    if (fallbackCurrencyCode) {
      return `${price} ${fallbackCurrencyCode}`;
    }
    return String(price);
  };

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
      return sum + amount * (item.quantity || 1);
    }, 0);
    return `${totalAmount.toFixed(2)} ${currencyCode}`.trim();
  };

  return (
    <div className="live-stream-container">
      <header style={{ marginBottom: "2rem", textAlign: "center" }}>
        <h1>Live Stream</h1>
        {streamId ? (
          <>
            <p>Stream ID: <strong>{streamId}</strong></p>
            <div style={{ marginTop: "8px" }}>
              <span style={{
                display: "inline-block",
                padding: "4px 12px",
                borderRadius: "20px",
                fontSize: "14px",
                fontWeight: "bold",
                backgroundColor: isStreamOnline ? "#28a745" : "#dc3545",
                color: "white"
              }}>
                {isStreamOnline ? "🔴 LIVE" : "⚫ OFFLINE"}
              </span>
              {isStreamOnline && viewerCount > 0 && (
                <span style={{ marginLeft: "12px" }}>
                  👥 {viewerCount} viewers
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="live-stream-error">Missing streamId parameter</div>
        )}
      </header>

      <div className="live-stream-two-columns">
        {/* Video Column */}
        <div className="live-stream-video-column">
          <div className="live-stream-iframe-wrapper">
            <video
              ref={videoRef}
              className="video-js vjs-default-skin vjs-big-play-centered"
              style={{ width: '100%', height: '100%', minHeight: '500px' }}
            >
              <p className="vjs-no-js">
                Please enable JavaScript to view this video.
              </p>
            </video>
          </div>
        </div>

        {/* Chat Column */}
        <div className="live-stream-chat-column">
          <div className="live-stream-chat-header">
            <h2>
              Live Chat
              {isConnected && (
                <span className="live-stream-chat-status-connected"> ● Connected</span>
              )}
              {!isConnected && clientId && (
                <span className="live-stream-chat-status-connecting"> ● Connecting...</span>
              )}
            </h2>
          </div>

          <div className="live-stream-chat-messages">
            {messages.length === 0 ? (
              <p style={{ textAlign: "center", padding: "20px", color: "#777" }}>
                No messages yet. Be the first to chat!
              </p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`live-stream-chat-message ${msg.clientId === clientId ? 'live-stream-chat-message-own' : ''}`}
                >
                  <span className="live-stream-chat-author">
                    {msg.author || "Viewer"}:
                  </span>
                  <span>{msg.text}</span>
                  <span className="live-stream-chat-time">
                    {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ""}
                  </span>
                </div>
              ))
            )}
          </div>

          <form className="live-stream-chat-form" onSubmit={handleChatSubmit}>
            <input
              type="text"
              className="live-stream-chat-input"
              placeholder={isConnected ? "Type your message..." : "Connecting to chat..."}
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

      {error && <div className="live-stream-error">{error}</div>}
      {chatError && <div className="live-stream-warning">⚠️ {chatError}</div>}

      {/* Products Section */}
      {loadingProducts && <div className="live-stream-loading">Loading products...</div>}

      {!loadingProducts && !error && products.length === 0 && (
        <div className="live-stream-info">No products found for this stream.</div>
      )}

      {!loadingProducts && products.length > 0 && (
        <section className="live-stream-products-section">
          <div className="live-stream-products-header">
            <h2>Products in this stream</h2>
            <button className="live-stream-cart-toggle-button" onClick={() => setIsCartOpen(true)}>
              Cart ({cartItems.length})
            </button>
          </div>

          <div className="live-stream-products-grid">
            {products.map((product) => {
              const selectedVariant = selectedVariants[product.id];
              const image = selectedVariant?.image || product.featuredImage;
              const price = selectedVariant?.price ?? product.priceRangeV2?.minVariantPrice;
              const isAvailable = selectedVariant?.availableForSale !== false;
              const quantity = quantities[product.id] ?? 1;

              return (
                <article key={product.id} className="live-stream-product-card">
                  <div className="live-stream-product-image-wrapper">
                    {image ? (
                      <img src={image.url} alt={image.altText || product.title} />
                    ) : (
                      <div className="live-stream-product-image-placeholder">No image</div>
                    )}
                  </div>

                  <div className="live-stream-product-details">
                    <h3>{product.title}</h3>
                    
                    {/* Variant Options */}
                    {product.options && product.options.length > 0 && (
                      <div className="live-stream-variant-options">
                        {product.options.map((option) => {
                          const currentVariant = selectedVariants[product.id];
                          const currentValue = currentVariant?.selectedOptions?.find(
                            (opt) => opt.name === option.name
                          )?.value || option.values[0];

                          return (
                            <div key={option.id} className="live-stream-variant-option">
                              <label>{option.name}:</label>
                              <select
                                value={currentValue}
                                onChange={(e) => {
                                  const newValue = e.target.value;
                                  const currentVariant = selectedVariants[product.id];
                                  
                                  const desiredOptions = product.options.map((optDef) => {
                                    if (optDef.name === option.name) {
                                      return { name: optDef.name, value: newValue };
                                    }
                                    const currentOptValue = currentVariant?.selectedOptions?.find(
                                      (o) => o.name === optDef.name
                                    )?.value || optDef.values[0];
                                    return { name: optDef.name, value: currentOptValue };
                                  });

                                  const newVariant = product.variants?.find((v) => {
                                    if (!v.selectedOptions) return false;
                                    return desiredOptions.every((desiredOpt) =>
                                      v.selectedOptions.some(
                                        (opt) => opt.name === desiredOpt.name && opt.value === desiredOpt.value
                                      )
                                    );
                                  });

                                  if (newVariant) {
                                    handleVariantChange(product.id, newVariant.id);
                                  }
                                }}
                              >
                                {option.values.map((value) => (
                                  <option key={value} value={value}>
                                    {value}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <p className="live-stream-product-price">
                      Price: {formatPrice(price, product.priceRangeV2?.minVariantPrice?.currencyCode)}
                    </p>

                    <div className="live-stream-button-group">
                      <div className="live-stream-quantity-wrapper">
                        <label>Quantity:</label>
                        <div className="live-stream-quantity-controls">
                          <button onClick={() => handleQuantityChange(product.id, quantity - 1)} disabled={quantity <= 1}>
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={quantity}
                            onChange={(e) => handleQuantityChange(product.id, e.target.value)}
                          />
                          <button onClick={() => handleQuantityChange(product.id, quantity + 1)}>
                            +
                          </button>
                        </div>
                      </div>

                      <button
                        className={`live-stream-buy-button ${!isAvailable ? 'disabled' : ''}`}
                        onClick={() => handleAddToCart(product.id)}
                        disabled={!isAvailable}
                      >
                        {isAvailable ? 'Add to Cart' : 'Sold Out'}
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
          <div className="live-stream-cart-sidebar" onClick={(e) => e.stopPropagation()}>
            <div className="live-stream-cart-header">
              <h3>Your Cart</h3>
              <button onClick={() => setIsCartOpen(false)}>✕</button>
            </div>

            {cartItems.length === 0 ? (
              <div className="live-stream-cart-empty">Your cart is empty.</div>
            ) : (
              <>
                <div className="live-stream-cart-items">
                  {cartItems.map((item) => (
                    <div key={item.variantId} className="live-stream-cart-item">
                      <div className="live-stream-cart-item-image">
                        {item.image ? (
                          <img src={item.image.url} alt={item.productTitle} />
                        ) : (
                          <div>No image</div>
                        )}
                      </div>
                      <div className="live-stream-cart-item-details">
                        <div className="live-stream-cart-item-title">{item.productTitle}</div>
                        <div className="live-stream-cart-item-variant">{item.variantTitle}</div>
                        <div className="live-stream-cart-item-meta">
                          <span>{formatPrice(item.price, item.currencyCode)}</span>
                          <span>× {item.quantity}</span>
                        </div>
                      </div>
                      <button onClick={() => handleRemoveCartItem(item.variantId)}>Remove</button>
                    </div>
                  ))}
                </div>

                <div className="live-stream-cart-footer">
                  <div className="live-stream-cart-total">
                    <span>Total:</span>
                    <span>{getCartTotal() || "-"}</span>
                  </div>
                  <button className="live-stream-cart-checkout-button" onClick={handleCheckout}>
                    Checkout
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}