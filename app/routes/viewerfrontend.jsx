// app/routes/viewerfrontend.jsx
import { useLoaderData } from "react-router";
import prisma from "../db.server";

/**
 * Public loader for storefront / iframe use.
 * Reads `shop` from the query string, looks up the LiveSession,
 * and builds a public viewer URL.
 */
export async function loader({ request }) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return {
      error: "Missing 'shop' query parameter.",
      viewerLink: null,
    };
  }

  try {
    // One row per shop (shop is @unique in Prisma)
    const liveSession = await prisma.liveSession.findUnique({
      where: { shop },
    });

    if (!liveSession) {
      return {
        error: null,
        viewerLink: null,
      };
    }

    // Normalize productIds to array
    let productIdsArray;
    try {
      const parsed = JSON.parse(liveSession.productIds);
      if (Array.isArray(parsed)) {
        productIdsArray = parsed;
      } else {
        productIdsArray = String(liveSession.productIds)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
    } catch {
      productIdsArray = String(liveSession.productIds)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    const idsParam = encodeURIComponent(productIdsArray.join(","));

    // Base URL where viewerstream is hosted (your Vercel app)
    const PUBLIC_VIEWER_BASE =
      process.env.PUBLIC_VIEWER_BASE || "https://liveselling-eta.vercel.app";

    const fullViewerUrl = `${PUBLIC_VIEWER_BASE}/viewerstream?shop=${encodeURIComponent(
      liveSession.shop,
    )}&streamId=${encodeURIComponent(
      liveSession.streamId,
    )}&ids=${idsParam}`;

    return {
      error: null,
      viewerLink: {
        shop: liveSession.shop,
        streamId: liveSession.streamId,
        productIds: productIdsArray,
        updatedAt: liveSession.updatedAt,
        fullViewerUrl,
      },
    };
  } catch (err) {
    console.error("Error loading LiveSession in viewerfrontend:", err);
    return {
      error: "Failed to load current live stream.",
      viewerLink: null,
    };
  }
}

/**
 * Public UI component – plain HTML/CSS, no Polaris.
 * Designed to be embedded in a storefront iframe.
 */
export default function ViewerFrontendPage() {
  const { viewerLink, error } = useLoaderData();

  const openViewer = () => {
    if (!viewerLink?.fullViewerUrl) return;
    window.open(viewerLink.fullViewerUrl, "_blank");
  };

  const copyViewerUrl = async () => {
    if (!viewerLink?.fullViewerUrl) return;
    try {
      await navigator.clipboard.writeText(viewerLink.fullViewerUrl);
      alert("Viewer URL copied to clipboard");
    } catch (e) {
      console.error("Failed to copy viewer URL", e);
      alert("Could not copy viewer URL");
    }
  };

  return (
    <div
      style={{
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        padding: "16px",
        backgroundColor: "#ffffff",
        color: "#111827",
      }}
    >
      <div
        style={{
          maxWidth: "480px",
          margin: "0 auto",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          padding: "16px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        <h2
          style={{
            fontSize: "18px",
            fontWeight: 600,
            marginBottom: "8px",
            textAlign: "center",
          }}
        >
          Live Stream
        </h2>

        {error && (
          <p
            style={{
              marginTop: "8px",
              marginBottom: "0",
              fontSize: "14px",
              color: "#b91c1c",
              textAlign: "center",
            }}
          >
            {error}
          </p>
        )}

        {!error && !viewerLink && (
          <p
            style={{
              marginTop: "8px",
              marginBottom: "0",
              fontSize: "14px",
              color: "#6b7280",
              textAlign: "center",
            }}
          >
            No active live stream is currently available.
          </p>
        )}

        {viewerLink && !error && (
          <div style={{ marginTop: "12px" }}>
            <p
              style={{
                margin: "4px 0",
                fontSize: "14px",
                color: "#374151",
              }}
            >
              <strong>Shop:</strong> {viewerLink.shop}
            </p>
            <p
              style={{
                margin: "4px 0",
                fontSize: "14px",
                color: "#374151",
              }}
            >
              <strong>Stream ID:</strong> {viewerLink.streamId}
            </p>
            <p
              style={{
                margin: "4px 0",
                fontSize: "12px",
                color: "#6b7280",
              }}
            >
              Products: {viewerLink.productIds?.length || 0}
            </p>
            <p
              style={{
                margin: "4px 0 12px",
                fontSize: "12px",
                color: "#6b7280",
              }}
            >
              Last updated:{" "}
              {viewerLink.updatedAt
                ? new Date(viewerLink.updatedAt).toLocaleString()
                : "Unknown"}
            </p>

            <div
              style={{
                padding: "8px 10px",
                backgroundColor: "#f9fafb",
                borderRadius: "6px",
                wordBreak: "break-all",
                marginBottom: "12px",
                fontSize: "12px",
                color: "#4b5563",
              }}
            >
              <strong>Viewer URL:</strong>
              <br />
              {viewerLink.fullViewerUrl}
            </div>

            <div
              style={{
                display: "flex",
                gap: "8px",
                justifyContent: "center",
                marginTop: "4px",
              }}
            >
              <button
                type="button"
                onClick={openViewer}
                style={{
                  padding: "8px 16px",
                  borderRadius: "9999px",
                  border: "none",
                  backgroundColor: "#111827",
                  color: "#ffffff",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Watch Live
              </button>
              <button
                type="button"
                onClick={copyViewerUrl}
                style={{
                  padding: "8px 16px",
                  borderRadius: "9999px",
                  border: "1px solid #d1d5db",
                  backgroundColor: "#ffffff",
                  color: "#374151",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Copy Link
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}