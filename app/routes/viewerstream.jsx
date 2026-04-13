import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import Pusher from "pusher-js";

// Cart item structure
const CartItem = ({ item, onUpdateQuantity, onRemove }) => {
  return (
    <div className="cart-item">
      <div className="cart-item-image">
        {item.image ? (
          <img src={item.image.url} alt={item.title} />
        ) : (
          <div className="cart-item-image-placeholder">No image</div>
        )}
      </div>
      <div className="cart-item-details">
        <div className="cart-item-title">{item.title}</div>
        <div className="cart-item-variant">{item.variantTitle}</div>
        <div className="cart-item-price">{item.price}</div>
        <div className="cart-item-quantity">
          <button
            onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
            className="cart-item-qty-btn"
          >
            -
          </button>
          <span className="cart-item-qty">{item.quantity}</span>
          <button
            onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
            className="cart-item-qty-btn"
          >
            +
          </button>
          <button
            onClick={() => onRemove(item.id)}
            className="cart-item-remove"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
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

  // Cart state
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

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

  // Track quantities for each product (temporary before adding to cart)
  const [quantities, setQuantities] = useState({});

  // Generate client ID only on the client side
  useEffect(() => {
    let id = localStorage.getItem("chat_client_id");
    if (!id) {
      id = `client_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      localStorage.setItem("chat_client_id", id);
    }
    setClientId(id);

    // Load cart from localStorage
    const savedCart = localStorage.getItem(`cart_${shop}`);
    if (savedCart) {
      try {
        setCart(JSON.parse(savedCart));
      } catch (e) {
        console.error("Error loading cart:", e);
      }
    }
  }, [shop]);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    if (shop) {
      localStorage.setItem(`cart_${shop}`, JSON.stringify(cart));
    }
  }, [cart, shop]);

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
          }
          initialQuantities[product.id] = 1;
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

  // Set up Pusher connection for chat (existing code)
  useEffect(() => {
    if (!streamId || !clientId) return;

    const pusherKey = window.ENV?.PUSHER_KEY;
    const pusherCluster = window.ENV?.PUSHER_CLUSTER;

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
        if (message.clientId === clientId) {
          return;
        }
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

  // Cart functions
  const addToCart = (product, variant, quantity) => {
    const price =
      variant.price?.amount ||
      product.priceRangeV2?.minVariantPrice?.amount ||
      "0";
    const currencyCode =
      variant.price?.currencyCode ||
      product.priceRangeV2?.minVariantPrice?.currencyCode ||
      "USD";

    const cartItem = {
      id: `${product.id}_${variant.id}`,
      productId: product.id,
      // IMPORTANT: keep the full GraphQL GID here
      variantId: variant.id,
      title: product.title,
      variantTitle: variant.title || "Default",
      quantity: quantity,
      price: `${price} ${currencyCode}`,
      priceAmount: parseFloat(price),
      image: variant.image || product.featuredImage,
      handle: product.handle,
      shop: shop,
    };

    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.id === cartItem.id);
      if (existingItem) {
        return prevCart.map((item) =>
          item.id === cartItem.id
            ? { ...item, quantity: item.quantity + quantity }
            : item,
        );
      }
      return [...prevCart, cartItem];
    });

    // Show toast notification
    showToast(`${product.title} added to cart!`, "success");

    // Open cart sidebar
    setIsCartOpen(true);
  };

  const updateCartQuantity = (itemId, newQuantity) => {
    if (newQuantity <= 0) {
      removeFromCart(itemId);
      return;
    }

    setCart((prevCart) =>
      prevCart.map((item) =>
        item.id === itemId ? { ...item, quantity: newQuantity } : item,
      ),
    );
  };

  const removeFromCart = (itemId) => {
    setCart((prevCart) => prevCart.filter((item) => item.id !== itemId));
    showToast("Item removed from cart", "info");
  };

  const getCartTotal = () => {
    return cart.reduce(
      (total, item) => total + item.priceAmount * item.quantity,
      0,
    );
  };

  const getCartItemCount = () => {
    return cart.reduce((count, item) => count + item.quantity, 0);
  };

  // Checkout function - creates Shopify checkout via /api/create-checkout
  const handleCheckout = async () => {
    if (cart.length === 0) {
      showToast("Your cart is empty", "error");
      return;
    }

    setIsCheckingOut(true);

    try {
      // Create line items for checkout using GID variantId
      const lineItems = cart.map((item) => ({
        variantId: item.variantId, // GraphQL GID, e.g. "gid://shopify/ProductVariant/..."
        quantity: item.quantity,
      }));

      // Call your backend to create checkout (Storefront Cart API)
      const response = await fetch("/api/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop: shop,
          lineItems: lineItems,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        console.error("Checkout error response:", data);
        throw new Error(data.error || "Failed to create checkout");
      }

      if (data.checkoutUrl) {
        // Clear cart before redirect
        setCart([]);
        localStorage.removeItem(`cart_${shop}`);
        // Redirect to checkout
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error("No checkout URL received");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      showToast("Failed to create checkout. Please try again.", "error");
    } finally {
      setIsCheckingOut(false);
    }
  };

  // Toast notification
  const showToast = (message, type = "info") => {
    const toast = document.createElement("div");
    toast.className = `live-stream-toast live-stream-toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("live-stream-toast-show");
    }, 10);

    setTimeout(() => {
      toast.classList.remove("live-stream-toast-show");
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 300);
    }, 3000);
  };

  // Handle chat submit (existing)
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

  // Handle quantity change for a product
  const handleQuantityChange = (productId, newQuantity) => {
    if (newQuantity >= 1 && newQuantity <= 99) {
      setQuantities((prev) => ({
        ...prev,
        [productId]: newQuantity,
      }));
    }
  };

  // Handle "Add to Cart" button click
  const handleAddToCart = (productId) => {
    const product = products.find((p) => p.id === productId);
    const selectedVariant = selectedVariants[productId];
    const quantity = quantities[productId] || 1;

    if (!product || !selectedVariant) {
      showToast("Please select a variant", "error");
      return;
    }

    addToCart(product, selectedVariant, quantity);
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

  return (
    <div className="live-stream-container">
      {/* Cart Sidebar */}
      <div className={`cart-sidebar ${isCartOpen ? "cart-sidebar-open" : ""}`}>
        <div className="cart-sidebar-header">
          <h2>Shopping Cart ({getCartItemCount()} items)</h2>
          <button
            className="cart-sidebar-close"
            onClick={() => setIsCartOpen(false)}
          >
            ✕
          </button>
        </div>

        <div className="cart-sidebar-items">
          {cart.length === 0 ? (
            <div className="cart-empty">
              <p>Your cart is empty</p>
              <button onClick={() => setIsCartOpen(false)}>
                Continue Shopping
              </button>
            </div>
          ) : (
            <>
              {cart.map((item) => (
                <CartItem
                  key={item.id}
                  item={item}
                  onUpdateQuantity={updateCartQuantity}
                  onRemove={removeFromCart}
                />
              ))}
            </>
          )}
        </div>

        {cart.length > 0 && (
          <div className="cart-sidebar-footer">
            <div className="cart-total">
              <span>Total:</span>
              <span>
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                }).format(getCartTotal())}
              </span>
            </div>
            <button
              className="cart-checkout-btn"
              onClick={handleCheckout}
              disabled={isCheckingOut}
            >
              {isCheckingOut ? "Processing..." : "Proceed to Checkout"}
            </button>
          </div>
        )}
      </div>

      {/* Overlay when cart is open */}
      {isCartOpen && (
        <div className="cart-overlay" onClick={() => setIsCartOpen(false)} />
      )}

      {/* Cart Button */}
      <button className="cart-button" onClick={() => setIsCartOpen(true)}>
        🛒 Cart ({getCartItemCount()})
      </button>

      {/* Header */}
      <header style={{ marginBottom: "2rem", textAlign: "center" }}>
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

      {/* Two Column Layout: Live Stream + Chat */}
      <div className="live-stream-two-columns">
        {/* Left Column: Live Stream Video */}
        <div className="live-stream-video-column">
          <div className="live-stream-iframe-wrapper">
            <iframe
              src="https://embed.api.video/live/li40wqrTDScsJm4f5xT1qK2m"
              width="100%"
              height="100%"
              frameBorder="0"
              scrolling="no"
              allowFullScreen={true}
              title="Live stream"
              className="live-stream-iframe"
              style={{ minHeight: "500px" }}
            ></iframe>
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

      {/* Products Section */}
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
          <h2 className="live-stream-section-title">Products in this stream</h2>
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
              const isAvailable =
                selectedVariant?.availableForSale !== false;
              const quantity = quantities[product.id] || 1;

              return (
                <article
                  key={product.id}
                  className="live-stream-product-card-full"
                >
                  <div className="live-stream-product-image-wrapper">
                    {image ? (
                      <img
                        src={image.url}
                        alt={image.altText || product.title}
                        className="live-stream-product-image-full"
                      />
                    ) : (
                      <div className="live-stream-product-image-placeholder-full">
                        No image
                      </div>
                    )}
                  </div>

                  <div className="live-stream-product-details-full">
                    <h3 className="live-stream-product-name-full">
                      {product.title}
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

                                  const variantForValue =
                                    product.variants?.find((v) => {
                                      if (!v.selectedOptions) return false;
                                      return desiredOptionsForThisValue.every(
                                        (desiredOpt) =>
                                          v.selectedOptions.some(
                                            (opt) =>
                                              opt.name === desiredOpt.name &&
                                              opt.value === desiredOpt.value,
                                          ),
                                      );
                                    });

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

                    {/* Quantity Selector */}
                    <div className="live-stream-quantity-selector">
                      <label>Quantity:</label>
                      <div className="quantity-controls">
                        <button
                          onClick={() =>
                            handleQuantityChange(product.id, quantity - 1)
                          }
                          disabled={quantity <= 1}
                        >
                          -
                        </button>
                        <span>{quantity}</span>
                        <button
                          onClick={() =>
                            handleQuantityChange(product.id, quantity + 1)
                          }
                          disabled={quantity >= 99}
                        >
                          +
                        </button>
                      </div>
                    </div>

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

                    {/* Add to Cart Button */}
                    <button
                      type="button"
                      className="live-stream-add-to-cart-full"
                      onClick={() => handleAddToCart(product.id)}
                      disabled={!isAvailable}
                    >
                      {isAvailable ? `Add to Cart (${quantity})` : "Sold Out"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* Add CSS for cart sidebar */}
      <style jsx>{`
        .cart-button {
          position: fixed;
          top: 20px;
          right: 20px;
          background: #007aff;
          color: white;
          border: none;
          padding: 12px 20px;
          border-radius: 40px;
          cursor: pointer;
          font-size: 16px;
          font-weight: 600;
          z-index: 1000;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
          transition: transform 0.2s;
        }

        .cart-button:hover {
          transform: scale(1.05);
        }

        .cart-sidebar {
          position: fixed;
          top: 0;
          right: -400px;
          width: 400px;
          height: 100vh;
          background: white;
          box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1);
          z-index: 1001;
          transition: right 0.3s ease;
          display: flex;
          flex-direction: column;
        }

        .cart-sidebar-open {
          right: 0;
        }

        .cart-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 1000;
        }

        .cart-sidebar-header {
          padding: 20px;
          border-bottom: 1px solid #e5e5e5;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .cart-sidebar-header h2 {
          margin: 0;
          font-size: 20px;
        }

        .cart-sidebar-close {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          padding: 0;
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .cart-sidebar-items {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
        }

        .cart-empty {
          text-align: center;
          padding: 40px 20px;
        }

        .cart-empty button {
          margin-top: 20px;
          padding: 10px 20px;
          background: #007aff;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
        }

        .cart-item {
          display: flex;
          gap: 15px;
          padding: 15px 0;
          border-bottom: 1px solid #f0f0f0;
        }

        .cart-item-image {
          width: 80px;
          height: 80px;
          flex-shrink: 0;
        }

        .cart-item-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 8px;
        }

        .cart-item-image-placeholder {
          width: 100%;
          height: 100%;
          background: #f5f5f5;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          border-radius: 8px;
        }

        .cart-item-details {
          flex: 1;
        }

        .cart-item-title {
          font-weight: 600;
          margin-bottom: 4px;
        }

        .cart-item-variant {
          font-size: 12px;
          color: #666;
          margin-bottom: 4px;
        }

        .cart-item-price {
          font-weight: 600;
          color: #007aff;
          margin-bottom: 8px;
        }

        .cart-item-quantity {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .cart-item-qty-btn {
          width: 24px;
          height: 24px;
          border: 1px solid #ddd;
          background: white;
          cursor: pointer;
          border-radius: 4px;
        }

        .cart-item-qty {
          min-width: 30px;
          text-align: center;
        }

        .cart-item-remove {
          margin-left: auto;
          background: none;
          border: none;
          color: #ff3b30;
          cursor: pointer;
          font-size: 12px;
        }

        .cart-sidebar-footer {
          padding: 20px;
          border-top: 1px solid #e5e5e5;
        }

        .cart-total {
          display: flex;
          justify-content: space-between;
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 15px;
        }

        .cart-checkout-btn {
          width: 100%;
          padding: 12px;
          background: #007aff;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
        }

        .cart-checkout-btn:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        .live-stream-quantity-selector {
          display: flex;
          align-items: center;
          gap: 15px;
          margin: 10px 0;
        }

        .quantity-controls {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .quantity-controls button {
          width: 30px;
          height: 30px;
          border: 1px solid #ddd;
          background: white;
          cursor: pointer;
          border-radius: 4px;
          font-size: 16px;
        }

        .quantity-controls button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .quantity-controls span {
          min-width: 30px;
          text-align: center;
          font-size: 16px;
        }

        .live-stream-add-to-cart-full {
          width: 100%;
          padding: 12px;
          background: #007aff;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          margin-top: 10px;
        }

        .live-stream-add-to-cart-full:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        .live-stream-toast {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%) translateY(100px);
          padding: 12px 24px;
          border-radius: 8px;
          color: white;
          z-index: 2000;
          transition: transform 0.3s ease;
          font-size: 14px;
        }

        .live-stream-toast-show {
          transform: translateX(-50%) translateY(0);
        }

        .live-stream-toast-success {
          background: #4caf50;
        }

        .live-stream-toast-error {
          background: #f44336;
        }

        .live-stream-toast-info {
          background: #2196f3;
        }

        @media (max-width: 768px) {
          .cart-sidebar {
            width: 100%;
            right: -100%;
          }
        }
      `}</style>
    </div>
  );
}