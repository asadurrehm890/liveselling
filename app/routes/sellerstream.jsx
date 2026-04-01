// app/routes/sellerstream.jsx
import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router";

export default function SellerstreamPublicPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate(); // 👈 NEW
  const shop = searchParams.get("shop"); // e.g. "store-name.myshopify.com"

  const [streamId, setStreamId] = useState("");
  const [products, setProducts] = useState([]);
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [error, setError] = useState("");

  // Load products from your API whenever `shop` changes
  useEffect(() => {
    if (!shop) {
      setError("Missing shop parameter in URL (?shop=your-store.myshopify.com)");
      return;
    }

    setError("");
    setLoadingProducts(true);

    fetch(`/api/selectallproducts?shop=${encodeURIComponent(shop)}`)
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
        setError("Could not load products for this shop.");
      })
      .finally(() => {
        setLoadingProducts(false);
      });
  }, [shop]);

  const toggleProduct = (id) => {
    setSelectedProductIds((current) =>
      current.includes(id)
        ? current.filter((pId) => pId !== id)
        : [...current, id],
    );
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!shop || !streamId || selectedProductIds.length === 0) {
      return;
    }

    // Build ids param: comma-separated list of product IDs (GIDs)
    const idsParam = selectedProductIds.join(",");

    // Build viewer URL
    const viewerUrl =
      `/viewerstream` +
      `?shop=${encodeURIComponent(shop)}` +
      `&streamId=${encodeURIComponent(streamId)}` +
      `&ids=${encodeURIComponent(idsParam)}`;

    // Navigate to the viewer page
    navigate(viewerUrl);

    // (optional) If you also want to log:
    console.log("Navigating to viewer stream:", viewerUrl);
  };

  return (
    <div
      style={{
        maxWidth: "800px",
        margin: "0 auto",
        padding: "2rem 1rem",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <h1>Sellerstream Live</h1>

      {!shop && (
        <p style={{ color: "red" }}>
          Add <code>?shop=your-store.myshopify.com</code> to the URL.
        </p>
      )}

      {error && <p style={{ color: "red" }}>{error}</p>}

      <form onSubmit={handleSubmit}>
        {/* Stream ID field */}
        <div style={{ marginBottom: "1.5rem" }}>
          <label
            htmlFor="streamId"
            style={{
              display: "block",
              marginBottom: "0.5rem",
              fontWeight: 600,
            }}
          >
            Stream ID
          </label>
          <input
            id="streamId"
            name="streamId"
            type="text"
            value={streamId}
            onChange={(e) => setStreamId(e.target.value)}
            placeholder="Enter your stream ID"
            required
            style={{
              width: "100%",
              padding: "0.5rem 0.75rem",
              borderRadius: "4px",
              border: "1px solid #ccc",
              fontSize: "1rem",
            }}
          />
        </div>

        {/* Product list */}
        <div style={{ marginBottom: "1.5rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: "0.5rem",
            }}
          >
            <label style={{ fontWeight: 600 }}>
              Select products to feature in the stream
            </label>
            {loadingProducts && (
              <span style={{ fontSize: "0.875rem", color: "#666" }}>
                Loading products...
              </span>
            )}
          </div>

          {products.length === 0 && !loadingProducts && (
            <p style={{ color: "#666" }}>No products found for this shop.</p>
          )}

          {products.length > 0 && (
            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "4px",
                padding: "0.75rem",
                maxHeight: "300px",
                overflowY: "auto",
              }}
            >
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {products.map((product) => (
                  <li
                    key={product.id}
                    style={{
                      marginBottom: "0.5rem",
                      borderBottom: "1px solid #f1f1f1",
                      paddingBottom: "0.5rem",
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedProductIds.includes(product.id)}
                        onChange={() => toggleProduct(product.id)}
                      />
                      <div>
                        <div style={{ fontWeight: 500 }}>{product.title}</div>
                        <div style={{ fontSize: "0.85rem", color: "#666" }}>
                          {product.handle}
                          {product.status ? ` – ${product.status}` : ""}
                        </div>
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Live stream button */}
        <button
          type="submit"
          disabled={!streamId || selectedProductIds.length === 0 || !shop}
          style={{
            padding: "0.75rem 1.5rem",
            fontSize: "1rem",
            fontWeight: 600,
            borderRadius: "4px",
            border: "none",
            backgroundColor:
              !streamId || selectedProductIds.length === 0 || !shop
                ? "#cccccc"
                : "#008060",
            color: "#ffffff",
            cursor:
              !streamId || selectedProductIds.length === 0 || !shop
                ? "not-allowed"
                : "pointer",
          }}
        >
          Go live
        </button>
      </form>
    </div>
  );
}