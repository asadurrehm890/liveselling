// app/routes/viewerstream.jsx
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import Pusher from 'pusher-js';

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

  // Generate client ID only on the client side
  useEffect(() => {
    // This code only runs in the browser, not during SSR
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
    // Don't set up Pusher until we have both streamId and clientId
    if (!streamId || !clientId) return;

    // Get Pusher credentials from window.ENV
    const pusherKey = window.ENV?.PUSHER_KEY;
    const pusherCluster = window.ENV?.PUSHER_CLUSTER;

    // Debug: Log what we have
    console.log('Pusher config from window.ENV:', {
      hasKey: !!pusherKey,
      keyPrefix: pusherKey ? pusherKey.substring(0, 8) : 'none',
      cluster: pusherCluster,
      streamId: streamId,
      clientId: clientId
    });

    // Check if credentials are available
    if (!pusherKey || !pusherCluster) {
      console.error('Pusher credentials not found. Make sure environment variables are set.');
      setChatError("Chat configuration error. Please contact support.");
      return;
    }

    // Validate that we're not using placeholder values
    if (pusherKey === 'YOUR_PUSHER_KEY' || pusherKey.includes('YOUR_')) {
      console.error('Invalid Pusher key. Please set correct credentials in Vercel environment variables.');
      setChatError("Chat configuration error. Invalid API key.");
      return;
    }

    setChatError("");
    
    try {
      console.log('Initializing Pusher with cluster:', pusherCluster);
      
      // Initialize Pusher
      const pusher = new Pusher(pusherKey, {
        cluster: pusherCluster,
        forceTLS: true,
        enabledTransports: ['ws', 'wss'],
      });

      pusherRef.current = pusher;

      // Connection event handlers
      pusher.connection.bind('connected', () => {
        console.log('✅ Connected to Pusher');
        setIsConnected(true);
        setChatError("");
      });

      pusher.connection.bind('disconnected', () => {
        console.log('🔌 Disconnected from Pusher');
        setIsConnected(false);
      });

      pusher.connection.bind('error', (error) => {
        console.error('❌ Pusher connection error:', error);
        setChatError("Chat connection failed. Please refresh the page.");
        setIsConnected(false);
      });

      // Subscribe to the stream's channel
      const channelName = `stream-${streamId}`;
      const channel = pusher.subscribe(channelName);
      channelRef.current = channel;

      // Bind to the 'new-message' event - FILTER OUT OWN MESSAGES
      channel.bind('new-message', (message) => {
        console.log('📨 Received message from Pusher:', message);
        
        // Don't add the message if it came from this client
        if (message.clientId === clientId) {
          console.log('🔇 Ignoring own message from Pusher (already displayed)');
          return;
        }
        
        console.log('✅ Adding message from another client:', message.text);
        setMessages((prev) => [...prev, message]);
      });

      // Handle subscription success
      channel.bind('pusher:subscription_succeeded', () => {
        console.log(`✅ Subscribed to channel: ${channelName}`);
      });

      // Handle subscription error
      channel.bind('pusher:subscription_error', (error) => {
        console.error(`❌ Subscription error:`, error);
        setChatError("Failed to join chat room. Please refresh the page.");
      });

    } catch (error) {
      console.error('Pusher initialization error:', error);
      setChatError("Failed to initialize chat. Please check your configuration.");
    }

    // Cleanup on unmount
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
    
    if (!chatInput.trim()) {
      return;
    }
    
    if (!isConnected) {
      setChatError("Chat not connected. Please wait for connection or refresh the page.");
      return;
    }
    
    if (!streamId) {
      console.error("No stream ID available");
      return;
    }

    if (!clientId) {
      console.error("Client ID not initialized");
      setChatError("Chat not ready. Please refresh the page.");
      return;
    }

    const text = chatInput.trim();
    
    // Create message with client ID to identify it came from this user
    const tempMessage = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      author: "Viewer", 
      text: text,
      timestamp: new Date().toISOString(),
      streamId: streamId,
      clientId: clientId,
      isPending: true
    };

    // Add to UI immediately (optimistic update)
    setMessages((prev) => [...prev, tempMessage]);
    setChatInput("");

    try {
      console.log('📤 Sending message to API:', {
        streamId: streamId,
        text: text,
        author: "Viewer",
        clientId: clientId
      });

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
      
      // Update the pending message to confirmed
      setMessages((prev) => 
        prev.map(msg => 
          msg.id === tempMessage.id 
            ? { ...msg, isPending: false }
            : msg
        )
      );
      
    } catch (err) {
      console.error('Error sending message:', err);
      setChatError(`Failed to send message: ${err.message}`);
      
      // Remove the failed message
      setMessages((prev) => 
        prev.filter(msg => msg.id !== tempMessage.id)
      );
    }
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
            Missing <code>ids</code> parameter in URL (comma-separated product
            IDs).
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
              const image = product.featuredImage;
              const priceRange = product.priceRangeV2;

              const minPrice = priceRange?.minVariantPrice;
              const maxPrice = priceRange?.maxVariantPrice;

              const formatPrice = (p) =>
                p ? `${p.amount} ${p.currencyCode ?? ""}`.trim() : "N/A";

              let priceDisplay = "N/A";
              if (minPrice && maxPrice) {
                if (
                  minPrice.amount === maxPrice.amount &&
                  minPrice.currencyCode === maxPrice.currencyCode
                ) {
                  priceDisplay = formatPrice(minPrice);
                } else {
                  priceDisplay = `${formatPrice(minPrice)} – ${formatPrice(maxPrice)}`;
                }
              }

              const productUrl = shop
                ? `https://${shop}/products/${product.handle}`
                : null;

              return (
                <article key={product.id} className="live-stream-product-card">
                  {image ? (
                    <a
                      href={productUrl || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: "block" }}
                    >
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
                      {productUrl ? (
                        <a
                          href={productUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: "inherit",
                            textDecoration: "none",
                          }}
                        >
                          {product.title}
                        </a>
                      ) : (
                        product.title
                      )}
                    </h3>
                    <p className="live-stream-product-meta">
                      {product.handle}
                      {product.status ? ` – ${product.status}` : ""}
                    </p>
                    <p className="live-stream-product-price">
                      Price: {priceDisplay}
                    </p>

                    {productUrl && (
                      <a
                        href={productUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="live-stream-view-button"
                      >
                        View product
                      </a>
                    )}
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