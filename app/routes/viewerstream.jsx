// app/routes/viewerstream.jsx
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import Pusher from 'pusher-js';

// Extract numeric ID from a GraphQL GID like "gid://shopify/ProductVariant/1234567890"
const getNumericIdFromGid = (gid) => {
  if (!gid) return null;
  const parts = gid.split('/');
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

  // Chat state
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const pusherRef = useRef(null);
  const channelRef = useRef(null);
  
  // Create a unique client ID for this browser session
  const [clientId, setClientId] = useState(null);

  // Track selected variants for each product
  const [selectedVariants, setSelectedVariants] = useState({});

  // Generate client ID only on the client side
  useEffect(() => {
    let id = localStorage.getItem('chat_client_id');
    if (!id) {
      id = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('chat_client_id', id);
    }
    setClientId(id);
  }, []);

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
        (data.products || []).forEach(product => {
          const availableVariant = product.variants?.find(v => v.availableForSale) || product.variants?.[0];
          if (availableVariant) {
            initialVariants[product.id] = availableVariant;
          }
        });
        setSelectedVariants(initialVariants);
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

    console.log('Pusher config from window.ENV:', {
      hasKey: !!pusherKey,
      keyPrefix: pusherKey ? pusherKey.substring(0, 8) : 'none',
      cluster: pusherCluster,
      streamId: streamId,
      clientId: clientId
    });

    if (!pusherKey || !pusherCluster) {
      console.error('Pusher credentials not found.');
      setChatError("Chat configuration error. Please contact support.");
      return;
    }

    if (pusherKey === 'YOUR_PUSHER_KEY' || pusherKey.includes('YOUR_')) {
      console.error('Invalid Pusher key.');
      setChatError("Chat configuration error. Invalid API key.");
      return;
    }

    setChatError("");
    
    try {
      console.log('Initializing Pusher with cluster:', pusherCluster);
      
      const pusher = new Pusher(pusherKey, {
        cluster: pusherCluster,
        forceTLS: true,
        enabledTransports: ['ws', 'wss'],
      });

      pusherRef.current = pusher;

      pusher.connection.bind('connected', () => {
        console.log('✅ Connected to Pusher');
        setIsConnected(true);
        setChatError("");
      });

      pusher.connection.bind('disconnected', () => {
        setIsConnected(false);
      });

      pusher.connection.bind('error', (error) => {
        console.error('❌ Pusher connection error:', error);
        setChatError("Chat connection failed. Please refresh the page.");
        setIsConnected(false);
      });

      const channelName = `stream-${streamId}`;
      const channel = pusher.subscribe(channelName);
      channelRef.current = channel;

      channel.bind('new-message', (message) => {
        console.log('📨 Received message from Pusher:', message);
        
        if (message.clientId === clientId) {
          console.log('🔇 Ignoring own message from Pusher');
          return;
        }
        
        console.log('✅ Adding message from another client:', message.text);
        setMessages((prev) => [...prev, message]);
      });

      channel.bind('pusher:subscription_succeeded', () => {
        console.log(`✅ Subscribed to channel: ${channelName}`);
      });

      channel.bind('pusher:subscription_error', (error) => {
        console.error(`❌ Subscription error:`, error);
        setChatError("Failed to join chat room. Please refresh the page.");
      });

    } catch (error) {
      console.error('Pusher initialization error:', error);
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
      setChatError("Chat not connected. Please wait for connection or refresh the page.");
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
      isPending: true
    };

    setMessages((prev) => [...prev, tempMessage]);
    setChatInput("");

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          streamId: streamId,
          text: text,
          author: "Viewer",
          timestamp: new Date().toISOString(),
          clientId: clientId
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send message');
      }

      const data = await response.json();
      console.log('📤 Message sent successfully:', data);
      
      setMessages((prev) => 
        prev.map(msg => 
          msg.id === tempMessage.id ? { ...msg, isPending: false } : msg
        )
      );
      
    } catch (err) {
      console.error('Error sending message:', err);
      setChatError(`Failed to send message: ${err.message}`);
      setMessages((prev) => prev.filter(msg => msg.id !== tempMessage.id));
    }
  };

  // Handle variant selection change
  const handleVariantChange = (productId, variantId) => {
    const product = products.find(p => p.id === productId);
    const variant = product?.variants?.find(v => v.id === variantId);
    if (variant) {
      setSelectedVariants(prev => ({
        ...prev,
        [productId]: variant
      }));
    }
  };

  // Handle "Add to Cart & Checkout" button click
  const handleBuyNow = (productId) => {
    const product = products.find(p => p.id === productId);
    const selectedVariant = selectedVariants[productId];

    if (!product || !selectedVariant) {
      alert("No variant selected for this product.");
      return;
    }

    const checkoutUrl = getCheckoutUrl(product, selectedVariant);
    if (!checkoutUrl) {
      alert("Could not create checkout link. Please try again.");
      return;
    }

    // Redirect viewer to Shopify checkout
    window.location.href = checkoutUrl;
    // Or open in new tab:
    // window.open(checkoutUrl, "_blank");
  };

  // Get product URL with selected variant
  const getProductUrl = (product, variant) => {
    if (!shop) return null;
    let url = `https://${shop}/products/${product.handle}`;
    if (variant && variant.selectedOptions?.length > 0) {
      const variantParams = variant.selectedOptions
        .map(opt => `${encodeURIComponent(opt.name)}=${encodeURIComponent(opt.value)}`)
        .join('&');
      if (variantParams) {
        url += `?${variantParams}`;
      }
    }
    return url;
  };

  // Get checkout URL for a given product + selected variant
  const getCheckoutUrl = (product, variant) => {
    if (!shop || !variant?.id) return null;

    // If your variant IDs are GraphQL GIDs, convert them
    const numericVariantId = getNumericIdFromGid(variant.id);
    if (!numericVariantId) return null;

    const quantity = 1; // adjust if you want more than 1
    // Cart permalink: https://{shop}/cart/{variant_id}:{quantity}
    let url = `https://${shop}/cart/${numericVariantId}:${quantity}`;

    // Optional tracking parameters (example)
    // url += `?utm_source=livestream&utm_medium=viewerstream`;

    return url;
  };

  // Format price
  const formatPrice = (price) => {
    if (!price) return "N/A";
    return `${price.amount} ${price.currencyCode}`;
  };

  return (
    <div className="live-stream-container">
      <header style={{ marginBottom: "2rem" }}>
        <h1 className="live-stream-title">Live Stream</h1>
        {streamId ? (
          <p style={{ margin: 0, color: "#555" }}>
            Stream ID: <strong>{streamId}</strong>
          </p>
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

      {/* Live stream iframe */}
      <div className="live-stream-iframe-wrapper">
        <iframe
          src="https://embed.api.video/live/li40wqrTDScsJm4f5xT1qK2m"
          width="100%"
          height="500"
          frameBorder="0"
          scrolling="no"
          allowFullScreen={true}
          title="Live stream"
          className="live-stream-iframe"
        ></iframe>
      </div>

      {error && <div className="live-stream-error">{error}</div>}
      {chatError && <div className="live-stream-warning">⚠️ {chatError}</div>}

      {loadingProducts && <div className="live-stream-loading">Loading products for this stream…</div>}

      {!loadingProducts && !error && products.length === 0 && (
        <div className="live-stream-info">
          No products found for this stream. Check the <code>ids</code> param.
        </div>
      )}

      {!loadingProducts && products.length > 0 && (
        <section style={{ marginBottom: "2rem" }}>
          <h2 className="live-stream-section-title">Products in this stream</h2>
          <div className="live-stream-products-grid">
            {products.map((product) => {
              const selectedVariant = selectedVariants[product.id];
              const image = selectedVariant?.image || product.featuredImage;
              const price = selectedVariant?.price || product.priceRangeV2?.minVariantPrice;
              const isAvailable = selectedVariant?.availableForSale !== false;
              const productUrl = getProductUrl(product, selectedVariant);

              return (
                <article key={product.id} className="live-stream-product-card">
                  {image ? (
                    <a href={productUrl || "#"} target="_blank" rel="noopener noreferrer">
                      <img
                        src={image.url}
                        alt={image.altText || product.title}
                        className="live-stream-product-image"
                      />
                    </a>
                  ) : (
                    <div className="live-stream-product-image-placeholder">
                      No image
                    </div>
                  )}

                  <div className="live-stream-product-details">
                    <h3 className="live-stream-product-name">
                      <a
                        href={productUrl || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {product.title}
                      </a>
                    </h3>
                    
                    <p className="live-stream-product-meta">
                      {product.handle}
                      {product.status ? ` – ${product.status}` : ""}
                    </p>

                    {/* Variant Options */}
                    {/* Variant Options */}
{product.options && product.options.length > 0 && (
  <div className="live-stream-variant-options">
    {product.options.map((option) => {
      const currentVariant = selectedVariants[product.id];
      const currentValue =
        currentVariant?.selectedOptions?.find(
          (opt) => opt.name === option.name
        )?.value || option.values[0];

      return (
        <div key={option.id} className="live-stream-variant-option">
          <label className="live-stream-variant-label">
            {option.name}:
          </label>
          <select
            className="live-stream-variant-select"
            value={currentValue}
            onChange={(e) => {
              const newValue = e.target.value;

              const currentVariant = selectedVariants[product.id];

              // Build the desired combination of all options:
              // - use the new value for this option
              // - keep current values for the other options (if any)
              const desiredOptions = product.options.map((optDef) => {
                if (optDef.name === option.name) {
                  // This is the option we just changed
                  return {
                    name: optDef.name,
                    value: newValue,
                  };
                }

                // For other options, keep the current selection if available
                const currentOptValue =
                  currentVariant?.selectedOptions?.find(
                    (o) => o.name === optDef.name
                  )?.value || optDef.values[0];

                return {
                  name: optDef.name,
                  value: currentOptValue,
                };
              });

              // Find the variant that matches ALL desiredOptions
              const newVariant = product.variants?.find((v) => {
                if (!v.selectedOptions) return false;
                return desiredOptions.every((desiredOpt) =>
                  v.selectedOptions.some(
                    (opt) =>
                      opt.name === desiredOpt.name &&
                      opt.value === desiredOpt.value
                  )
                );
              });

              if (newVariant) {
                handleVariantChange(product.id, newVariant.id);
              } else {
                // Optional: handle missing variant combination
                console.warn(
                  "No variant found for option combination:",
                  desiredOptions
                );
              }
            }}
          >
            {option.values.map((value) => {
              // For disabling "Sold Out" options, we need to know if there
              // exists ANY variant with this value AND the other current selections
              const currentVariant = selectedVariants[product.id];

              const desiredOptionsForThisValue = product.options.map(
                (optDef) => {
                  if (optDef.name === option.name) {
                    return {
                      name: optDef.name,
                      value: value,
                    };
                  }

                  const currentOptValue =
                    currentVariant?.selectedOptions?.find(
                      (o) => o.name === optDef.name
                    )?.value || optDef.values[0];

                  return {
                    name: optDef.name,
                    value: currentOptValue,
                  };
                }
              );

              const variantForValue = product.variants?.find((v) => {
                if (!v.selectedOptions) return false;
                return desiredOptionsForThisValue.every((desiredOpt) =>
                  v.selectedOptions.some(
                    (opt) =>
                      opt.name === desiredOpt.name &&
                      opt.value === desiredOpt.value
                  )
                );
              });

              return (
                <option
                  key={value}
                  value={value}
                  disabled={!variantForValue?.availableForSale}
                >
                  {value}{" "}
                  {!variantForValue?.availableForSale ? "(Sold Out)" : ""}
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
                    <p className="live-stream-product-price">
                      Price: {formatPrice(price)}
                      {!isAvailable && <span className="live-stream-sold-out"> (Sold Out)</span>}
                    </p>

                    {/* View Product Button 
                    {productUrl && (
                      <a
                        href={productUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="live-stream-view-button"
                        style={{ 
                          backgroundColor: isAvailable ? 'var(--color-button-primary-background)' : '#cccccc',
                          cursor: isAvailable ? 'pointer' : 'not-allowed'
                        }}
                      >
                        {isAvailable ? 'View product' : 'Sold Out'}
                      </a>
                    )}*/}

                    {/* Add to Cart & Checkout Button */}
                    <button
                      type="button"
                      className="live-stream-buy-button"
                      onClick={() => handleBuyNow(product.id)}
                      disabled={!isAvailable}
                      style={{ 
                        marginTop: '0.5rem',
                        width: '100%',
                        padding: '0.75rem 1rem',
                        border: 'none',
                        borderRadius: '4px',
                        backgroundColor: isAvailable ? '#008060' : '#cccccc',
                        color: 'white',
                        fontWeight: 'bold',
                        cursor: isAvailable ? 'pointer' : 'not-allowed'
                      }}
                    >
                      {isAvailable ? 'Add to cart & checkout' : 'Sold Out'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* Chat section */}
      <section className="live-stream-chat-section">
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
            <p style={{ color: "#777", margin: 0 }}>No messages yet. Be the first to chat!</p>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`live-stream-chat-message ${msg.isPending ? 'live-stream-chat-message-pending' : ''} ${msg.clientId === clientId ? 'live-stream-chat-message-own' : ''}`}
              >
                <span className={`live-stream-chat-author ${msg.clientId === clientId ? 'live-stream-chat-author-own' : ''}`}>
                  {msg.author || "Viewer"}:
                </span>
                <span>{msg.text}</span>
                {msg.isPending && <span className="live-stream-chat-pending">(sending...)</span>}
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
      </section>
    </div>
  );
}