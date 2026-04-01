// app/routes/viewerstream.jsx
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { io } from "socket.io-client";

export default function ViewerstreamPage() {
  const [searchParams] = useSearchParams();

  const shop = searchParams.get("shop"); // e.g. "checkcos.myshopify.com"
  const streamId = searchParams.get("streamId");
  const idsParam = searchParams.get("ids"); // "1,2,3" or "gid://shopify/Product/..."

  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [error, setError] = useState("");

  // Chat state
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const socketRef = useRef(null);

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

  // Set up socket.io connection for chat
 useEffect(() => {
  if (!streamId) return;

  // Connect specifically to our standalone server on 3001
  const socket = io("http://localhost:3001", {
    transports: ["websocket"] 
  });

  socketRef.current = socket;
  socket.emit("joinStream", { streamId });

  socket.on("chatMessage", (message) => {
    // Add messages from other users to your list
    setMessages((prev) => [...prev, message]);
  });

  return () => socket.disconnect();
}, [streamId]);


  

  const handleChatSubmit = (e) => {
  e.preventDefault();
  if (!chatInput.trim() || !socketRef.current || !streamId) return;

  const text = chatInput.trim();
  
  const myMsg = {
    id: Date.now() + Math.random(),
    author: "Viewer", 
    text: text,
    ts: new Date().toISOString(),
    streamId: streamId // CRITICAL: This must match the room ID
  };

  // Add to your own screen
  setMessages((prev) => [...prev, myMsg]);

  // Send to server
  socketRef.current.emit("chatMessage", myMsg);
  
  setChatInput("");
};

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

  // 👇 Build the product URL using the shop + handle
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

        {/* 👇 Explicit "View product" link/button */}
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
        <h2 style={{ marginBottom: "0.75rem" }}>Live Chat</h2>

        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: "8px",
            padding: "0.75rem",
            minHeight: "250px",
            overflowY: "auto",
            marginBottom: "0.75rem",
            background: "#fafafa",
          }}
        >
          {messages.length === 0 ? (
            <p style={{ color: "#777", margin: 0 }}>No messages yet.</p>
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
                  }}
                >
                  <span
                    style={{
                      fontWeight: 600,
                      marginRight: "0.25rem",
                    }}
                  >
                    {msg.author || "Viewer"}:
                  </span>
                  <span>{msg.text}</span>
                  <span
                    style={{
                      marginLeft: "0.5rem",
                      fontSize: "0.75rem",
                      color: "#999",
                    }}
                  >
                    {msg.ts
                      ? new Date(msg.ts).toLocaleTimeString()
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
            placeholder="Type your message..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            style={{
              flex: 1,
              padding: "0.5rem 0.75rem",
              borderRadius: "4px",
              border: "1px solid #ccc",
              fontSize: "0.95rem",
            }}
          />
          <button
            type="submit"
            disabled={!streamId || !chatInput.trim()}
            style={{
              padding: "0.5rem 1rem",
              fontSize: "0.95rem",
              fontWeight: 600,
              borderRadius: "4px",
              border: "none",
              backgroundColor: !streamId || !chatInput.trim() ? "#ccc" : "#008060",
              color: "#fff",
              cursor: !streamId || !chatInput.trim() ? "not-allowed" : "pointer",
            }}
          >
            Send
          </button>
        </form>
      </section>
    </div>
  );
}