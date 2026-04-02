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
    if (!streamId) return;

    // Get Pusher credentials from window.ENV
    const pusherKey = window.ENV?.PUSHER_KEY;
    const pusherCluster = window.ENV?.PUSHER_CLUSTER;

    // Debug: Log what we have
    console.log('Pusher config from window.ENV:', {
      hasKey: !!pusherKey,
      keyPrefix: pusherKey ? pusherKey.substring(0, 8) : 'none',
      cluster: pusherCluster,
      streamId: streamId
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

      // Bind to the 'new-message' event
      channel.bind('new-message', (message) => {
        console.log('📨 Received message:', message);
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
  }, [streamId]);

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

    const text = chatInput.trim();
    
    const tempMessage = {
      id: Date.now() + Math.random(),
      author: "Viewer", 
      text: text,
      timestamp: new Date().toISOString(),
      streamId: streamId,
      isPending: true
    };

    setMessages((prev) => [...prev, tempMessage]);
    setChatInput("");

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          streamId: streamId,
          text: text,
          author: "Viewer",
          timestamp: new Date().toISOString()
        })
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const data = await response.json();
      console.log('📤 Message sent successfully:', data);
      
      setMessages((prev) => 
        prev.map(msg => 
          msg.id === tempMessage.id 
            ? { ...msg, isPending: false }
            : msg
        )
      );
      
    } catch (err) {
      console.error('Error sending message:', err);
      setChatError("Failed to send message. Please try again.");
      
      setMessages((prev) => 
        prev.filter(msg => msg.id !== tempMessage.id)
      );
    }
  };

  // ... rest of your component JSX (keep the same as before)
  return (
    <div
      style={{
        maxWidth: "960px",
        margin: "0 auto",
        padding: "2rem 1rem",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ marginBottom: "0.25rem" }}>Live Stream</h1>
        {streamId ? (
          <p style={{ margin: 0, color: "#555" }}>
            Stream ID: <strong>{streamId}</strong>
          </p>
        ) : (
          <p style={{ margin: 0, color: "red" }}>
            Missing <code>streamId</code> in URL.
          </p>
        )}
        {!shop && (
          <p style={{ margin: "0.5rem 0 0", color: "red" }}>
            Missing <code>shop</code> parameter in URL.
          </p>
        )}
        {!idsParam && (
          <p style={{ margin: "0.25rem 0 0", color: "red" }}>
            Missing <code>ids</code> parameter in URL (comma-separated product
            IDs).
          </p>
        )}
      </header>

      {/* Live stream iframe */}
      <div style={{ marginBottom: "2rem" }}>
        <iframe
          src="https://embed.api.video/live/li40wqrTDScsJm4f5xT1qK2m"
          width="100%"
          height="500"
          frameBorder="0"
          scrolling="no"
          allowFullScreen={true}
          title="Live stream"
        ></iframe>
      </div>

      {error && (
        <p style={{ color: "red", marginBottom: "1rem" }}>
          {error}
        </p>
      )}

      {chatError && (
        <p style={{ 
          color: "orange", 
          marginBottom: "1rem", 
          backgroundColor: "#fff3e0", 
          padding: "0.5rem", 
          borderRadius: "4px" 
        }}>
          ⚠️ {chatError}
        </p>
      )}

      {loadingProducts && (
        <p style={{ color: "#666" }}>Loading products for this stream…</p>
      )}

      {!loadingProducts && !error && products.length === 0 && (
        <p style={{ color: "#666" }}>
          No products found for this stream. Check the <code>ids</code> param.
        </p>
      )}

      {!loadingProducts && products.length > 0 && (
        <section style={{ marginBottom: "2rem" }}>
          <h2 style={{ marginBottom: "1rem" }}>Products in this stream</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "1rem",
            }}
          >
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
                <article
                  key={product.id}
                  style={{
                    border: "1px solid #e1e1e1",
                    borderRadius: "8px",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    background: "#fff",
                  }}
                >
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
                        style={{
                          width: "100%",
                          height: "180px",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    </a>
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: "180px",
                        background: "#f5f5f5",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#999",
                        fontSize: "0.9rem",
                      }}
                    >
                      No image
                    </div>
                  )}

                  <div style={{ padding: "0.75rem 0.9rem 1rem" }}>
                    <h3 style={{ margin: "0 0 0.25rem", fontSize: "1.05rem" }}>
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
                    <p
                      style={{
                        margin: "0 0 0.5rem",
                        fontSize: "0.9rem",
                        color: "#666",
                      }}
                    >
                      {product.handle}
                      {product.status ? ` – ${product.status}` : ""}
                    </p>
                    <p
                      style={{
                        margin: 0,
                        fontWeight: 600,
                        fontSize: "0.98rem",
                      }}
                    >
                      Price: {priceDisplay}
                    </p>

                    {productUrl && (
                      <a
                        href={productUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-block",
                          marginTop: "0.5rem",
                          padding: "0.4rem 0.8rem",
                          fontSize: "0.9rem",
                          fontWeight: 600,
                          borderRadius: "4px",
                          backgroundColor: "#008060",
                          color: "#fff",
                          textDecoration: "none",
                        }}
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
      <section>
        <h2 style={{ marginBottom: "0.75rem" }}>
          Live Chat
          {isConnected && (
            <span style={{ fontSize: "0.8rem", marginLeft: "0.5rem", color: "green" }}>
              ● Connected
            </span>
          )}
          {!isConnected && (
            <span style={{ fontSize: "0.8rem", marginLeft: "0.5rem", color: "orange" }}>
              ● Connecting...
            </span>
          )}
        </h2>

        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: "8px",
            padding: "0.75rem",
            minHeight: "250px",
            maxHeight: "300px",
            overflowY: "auto",
            marginBottom: "0.75rem",
            background: "#fafafa",
          }}
        >
          {messages.length === 0 ? (
            <p style={{ color: "#777", margin: 0 }}>No messages yet. Be the first to chat!</p>
          ) : (
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
              }}
            >
              {messages.map((msg) => (
                <li
                  key={msg.id}
                  style={{
                    marginBottom: "0.5rem",
                    fontSize: "0.9rem",
                    padding: "0.25rem",
                    borderBottom: "1px solid #eee",
                    opacity: msg.isPending ? 0.6 : 1,
                  }}
                >
                  <span
                    style={{
                      fontWeight: 600,
                      marginRight: "0.25rem",
                      color: "#008060",
                    }}
                  >
                    {msg.author || "Viewer"}:
                  </span>
                  <span>{msg.text}</span>
                  {msg.isPending && (
                    <span style={{ marginLeft: "0.5rem", fontSize: "0.7rem", color: "#999" }}>
                      (sending...)
                    </span>
                  )}
                  <span
                    style={{
                      marginLeft: "0.5rem",
                      fontSize: "0.7rem",
                      color: "#999",
                    }}
                  >
                    {msg.timestamp
                      ? new Date(msg.timestamp).toLocaleTimeString()
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form onSubmit={handleChatSubmit} style={{ display: "flex", gap: "0.5rem" }}>
          <input
            type="text"
            placeholder={isConnected ? "Type your message..." : "Connecting to chat..."}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            disabled={!isConnected}
            style={{
              flex: 1,
              padding: "0.5rem 0.75rem",
              borderRadius: "4px",
              border: "1px solid #ccc",
              fontSize: "0.95rem",
              backgroundColor: !isConnected ? "#f5f5f5" : "white",
            }}
          />
          <button
            type="submit"
            disabled={!streamId || !chatInput.trim() || !isConnected}
            style={{
              padding: "0.5rem 1rem",
              fontSize: "0.95rem",
              fontWeight: 600,
              borderRadius: "4px",
              border: "none",
              backgroundColor: !streamId || !chatInput.trim() || !isConnected 
                ? "#ccc" 
                : "#008060",
              color: "#fff",
              cursor: !streamId || !chatInput.trim() || !isConnected 
                ? "not-allowed" 
                : "pointer",
            }}
          >
            Send
          </button>
        </form>
      </section>
    </div>
  );
}