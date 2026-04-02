// app/routes/sellerstream.jsx
import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router";

export default function SellerstreamPublicPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const shop = searchParams.get("shop");

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
        : [...current, id]
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
    <div className="live-stream-container">
      <h1 className="live-stream-title">Sellerstream Live</h1>

      {!shop && (
        <div className="live-stream-error">
          Add <code>?shop=your-store.myshopify.com</code> to the URL.
        </div>
      )}

      {error && <div className="live-stream-error">{error}</div>}

      <form onSubmit={handleSubmit}>
        {/* Stream ID field */}
        <div className="live-stream-form-group">
          <label htmlFor="streamId" className="live-stream-label">
            Stream ID
          </label>
          <input
            id="streamId"
            name="streamId"
            type="text"
            className="live-stream-input"
            value={streamId}
            onChange={(e) => setStreamId(e.target.value)}
            placeholder="Enter your stream ID"
            required
          />
        </div>

        {/* Product list */}
        <div className="live-stream-form-group">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: "0.5rem",
            }}
          >
            <label className="live-stream-label">
              Select products to feature in the stream
            </label>
            {loadingProducts && (
              <span className="live-stream-info" style={{ fontSize: "0.875rem" }}>
                Loading products...
              </span>
            )}
          </div>

          {products.length === 0 && !loadingProducts && (
            <p className="live-stream-info">No products found for this shop.</p>
          )}

          {products.length > 0 && (
            <div className="live-stream-product-grid">
              <ul className="live-stream-product-list">
                {products.map((product) => (
                  <li key={product.id} className="live-stream-product-item">
                    <label className="live-stream-product-label">
                      <input
                        type="checkbox"
                        className="live-stream-product-checkbox"
                        checked={selectedProductIds.includes(product.id)}
                        onChange={() => toggleProduct(product.id)}
                      />
                      <div className="live-stream-product-info">
                        <div className="live-stream-product-title">{product.title}</div>
                        <div className="live-stream-product-handle">
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
          className="live-stream-button live-stream-button-primary"
          disabled={!streamId || selectedProductIds.length === 0 || !shop}
        >
          Go live
        </button>
      </form>
    </div>
  );
}