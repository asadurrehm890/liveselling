// app/routes/viewerfrontend.jsx
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

/**
 * Loader runs on the server in the React Router template.
 * It calls your /api/viewerlink endpoint (same origin) to get
 * the current live session for this shop.
 */
export async function loader({ request }) {
  // Call the internal API route
  const url = new URL(request.url);
  const origin = url.origin; // e.g., https://your-tunnel-url
  const res = await fetch(`${origin}/api/viewerlink`, {
    headers: {
      // Forward cookies for session auth (important)
      cookie: request.headers.get("cookie") || "",
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("Error fetching /api/viewerlink:", errorText);
    return {
      error: `Failed to load current live stream (${res.status})`,
      viewerLink: null,
    };
  }

  const data = await res.json();

  // If you deploy your viewer on a separate domain (e.g. Vercel),
  // you can map the relative viewerUrl to full public URL here.
  // Example:
  const PUBLIC_VIEWER_BASE =
    process.env.PUBLIC_VIEWER_BASE || "https://liveselling-eta.vercel.app";

  const fullViewerUrl =
    data.viewerUrl.startsWith("http")
      ? data.viewerUrl
      : `${PUBLIC_VIEWER_BASE}${data.viewerUrl}`;

  return {
    viewerLink: {
      ...data,
      fullViewerUrl,
    },
    error: null,
  };
}

/**
 * Admin UI component that shows a button with the viewer URL
 * from api.viewerlink.jsx.
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
    <s-page heading="Live Stream Viewer Link">
      <s-card>
        <s-text variant="headingMd" as="h2">
          Current Live Stream
        </s-text>
        <s-divider />

        {error && (
          <div style={{ marginTop: "16px" }}>
            <s-text tone="critical">{error}</s-text>
          </div>
        )}

        {!error && !viewerLink && (
          <div style={{ marginTop: "16px" }}>
            <s-text tone="subdued">
              No active live stream found for this shop.
            </s-text>
          </div>
        )}

        {viewerLink && !error && (
          <div style={{ marginTop: "16px" }}>
            <div style={{ marginBottom: "12px" }}>
              <s-text variant="bodyMd">
                <strong>Shop:</strong> {viewerLink.shop}
              </s-text>
              <br />
              <s-text variant="bodyMd">
                <strong>Stream ID:</strong> {viewerLink.streamId}
              </s-text>
              <br />
              <s-text variant="bodySm" tone="subdued">
                Products: {viewerLink.productIds?.length || 0}
              </s-text>
              <br />
              <s-text variant="bodySm" tone="subdued">
                Last updated:{" "}
                {viewerLink.updatedAt
                  ? new Date(viewerLink.updatedAt).toLocaleString()
                  : "Unknown"}
              </s-text>
            </div>

            <div
              style={{
                padding: "8px 12px",
                backgroundColor: "#f6f6f7",
                borderRadius: "4px",
                wordBreak: "break-all",
                marginBottom: "16px",
              }}
            >
              <s-text variant="bodySm">
                <strong>Viewer URL:</strong> {viewerLink.fullViewerUrl}
              </s-text>
            </div>

            <div
              style={{
                display: "flex",
                gap: "12px",
                marginTop: "8px",
              }}
            >
              <s-button variant="primary" onClick={openViewer}>
                Open Live Viewer
              </s-button>
              <s-button variant="tertiary" onClick={copyViewerUrl}>
                Copy Link
              </s-button>
            </div>
          </div>
        )}
      </s-card>

      <s-card>
        <s-text variant="headingMd" as="h2">
          How this works
        </s-text>
        <s-divider />
        <div style={{ marginTop: "12px" }}>
          <s-list>
            <s-list-item>
              Every time you click <strong>Start Live Stream</strong> in{" "}
              <code>app.sellerlive.jsx</code>, the app updates a single{" "}
              <code>LiveSession</code> row for your shop.
            </s-list-item>
            <s-list-item>
              The <code>/api/viewerlink</code> endpoint returns the current{" "}
              <strong>shop</strong>, <strong>streamId</strong>, and{" "}
              <strong>product IDs</strong>, and builds the viewer URL.
            </s-list-item>
            <s-list-item>
              This page calls <code>/api/viewerlink</code> and shows the
              button that opens: <code>viewerstream?shop=&amp;streamId=&amp;ids=...</code>.
            </s-list-item>
          </s-list>
        </div>
      </s-card>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};