import { useLoaderData } from "react-router";
import prisma from "../db.server";

/**
 * Helper function to return JSON responses with CORS headers
 */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

/**
 * Public loader for storefront / iframe use.
 * Reads `shop` from the query string, looks up the LiveSession,
 * and builds a public viewer URL.
 * Supports both HTML (default) and JSON (format=json) responses.
 */
export async function loader({ request }) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const format = url.searchParams.get("format"); // 'json' or 'html'
  
  // Handle CORS preflight requests
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  // Validate shop parameter
  if (!shop) {
    if (format === 'json') {
      return jsonResponse({ 
        error: "Missing 'shop' query parameter.", 
        viewerLink: null 
      }, 400);
    }
    
    // Return HTML error page
    return new Response(
      `<!DOCTYPE html>
      <html>
        <head>
          <title>Error - Missing Shop Parameter</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: #f5f5f5;
            }
            .error-container {
              text-align: center;
              padding: 2rem;
              background: white;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              max-width: 400px;
            }
            h1 { color: #dc2626; margin-bottom: 1rem; }
            p { color: #666; line-height: 1.5; }
          </style>
        </head>
        <body>
          <div class="error-container">
            <h1>⚠️ Error</h1>
            <p>Missing <code>shop</code> parameter in URL.</p>
            <p>Please ensure the URL includes ?shop=yourstore.myshopify.com</p>
          </div>
        </body>
      </html>`,
      {
        status: 400,
        headers: { 'Content-Type': 'text/html' },
      }
    );
  }

  try {
    // Query the database for the live session
    const liveSession = await prisma.liveSession.findUnique({
      where: { shop },
    });

    // No active live session found
    if (!liveSession) {
      if (format === 'json') {
        return jsonResponse({ 
          error: null, 
          viewerLink: null 
        });
      }
      
      // Return HTML page with "no active stream" message
      return new Response(
        `<!DOCTYPE html>
        <html>
          <head>
            <title>No Active Live Stream</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background: #f5f5f5;
              }
              .container {
                text-align: center;
                padding: 2rem;
                background: white;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                max-width: 400px;
              }
              h2 { color: #374151; margin-bottom: 1rem; }
              p { color: #6b7280; line-height: 1.5; }
              .icon {
                font-size: 48px;
                margin-bottom: 1rem;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="icon">📺</div>
              <h2>No Active Live Stream</h2>
              <p>There is currently no live stream active for this store.</p>
              <p style="font-size: 14px; margin-top: 1rem;">Check back later for live shopping events!</p>
            </div>
          </body>
        </html>`,
        {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }
      );
    }

    // Parse productIds from database (supports both JSON string and CSV)
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

    // If no products, return error
    if (productIdsArray.length === 0) {
      if (format === 'json') {
        return jsonResponse({ 
          error: "No products found for this live stream.", 
          viewerLink: null 
        }, 400);
      }
      
      return new Response(
        `<!DOCTYPE html>
        <html>
          <head>
            <title>Error - No Products</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background: #f5f5f5;
              }
              .error-container {
                text-align: center;
                padding: 2rem;
                background: white;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                max-width: 400px;
              }
              h1 { color: #dc2626; margin-bottom: 1rem; }
              p { color: #666; }
            </style>
          </head>
          <body>
            <div class="error-container">
              <h1>⚠️ Error</h1>
              <p>No products found for this live stream.</p>
              <p>Please contact the store administrator.</p>
            </div>
          </body>
        </html>`,
        {
          status: 400,
          headers: { 'Content-Type': 'text/html' },
        }
      );
    }

    // Encode product IDs for URL parameter
    const idsParam = encodeURIComponent(productIdsArray.join(","));

    // Base URL where viewerstream is hosted (your Vercel app)
    const PUBLIC_VIEWER_BASE =
      process.env.PUBLIC_VIEWER_BASE || "https://liveselling-eta.vercel.app";

    // Build the full viewer URL
    const fullViewerUrl = `${PUBLIC_VIEWER_BASE}/viewerstream?shop=${encodeURIComponent(
      liveSession.shop,
    )}&streamId=${encodeURIComponent(
      liveSession.streamId,
    )}&ids=${idsParam}`;

    const viewerData = {
      shop: liveSession.shop,
      streamId: liveSession.streamId,
      productIds: productIdsArray,
      productCount: productIdsArray.length,
      updatedAt: liveSession.updatedAt,
      fullViewerUrl,
    };

    // Return JSON response for API calls (used by header button)
    if (format === 'json') {
      return jsonResponse({ 
        error: null, 
        viewerLink: viewerData 
      });
    }

    // Return HTML response with the embedded viewer component
    return (
      <ViewerFrontendPageComponent viewerLink={viewerData} error={null} />
    );
    
  } catch (err) {
    console.error("Error loading LiveSession in viewerfrontend:", err);
    
    if (format === 'json') {
      return jsonResponse({ 
        error: "Failed to load current live stream. Please try again later.", 
        viewerLink: null 
      }, 500);
    }
    
    // Return HTML error page
    return new Response(
      `<!DOCTYPE html>
      <html>
        <head>
          <title>Error - Server Issue</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: #f5f5f5;
            }
            .error-container {
              text-align: center;
              padding: 2rem;
              background: white;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              max-width: 400px;
            }
            h1 { color: #dc2626; margin-bottom: 1rem; }
            p { color: #666; line-height: 1.5; }
          </style>
        </head>
        <body>
          <div class="error-container">
            <h1>⚠️ Server Error</h1>
            <p>Failed to load the live stream information.</p>
            <p>Please try again later or contact support.</p>
          </div>
        </body>
      </html>`,
      {
        status: 500,
        headers: { 'Content-Type': 'text/html' },
      }
    );
  }
}

/**
 * Component for the HTML response (embedded iframe viewer)
 */
function ViewerFrontendPageComponent({ viewerLink, error }) {
  const openViewer = () => {
    if (!viewerLink?.fullViewerUrl) return;
    window.open(viewerLink.fullViewerUrl, "_blank");
  };

  const copyViewerUrl = async () => {
    if (!viewerLink?.fullViewerUrl) return;
    try {
      await navigator.clipboard.writeText(viewerLink.fullViewerUrl);
      alert("✓ Viewer URL copied to clipboard!");
    } catch (e) {
      console.error("Failed to copy viewer URL", e);
      alert("Could not copy viewer URL. Please copy it manually.");
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
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          maxWidth: "480px",
          width: "100%",
          margin: "0 auto",
          border: "1px solid #e5e7eb",
          borderRadius: "12px",
          padding: "24px",
          boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)",
          backgroundColor: "#ffffff",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <div style={{ fontSize: "48px", marginBottom: "12px" }}>📺</div>
          <h2
            style={{
              fontSize: "24px",
              fontWeight: "700",
              margin: "0 0 8px 0",
              color: "#111827",
            }}
          >
            Live Stream
          </h2>
          <p style={{ margin: 0, color: "#6b7280", fontSize: "14px" }}>
            Join the live shopping experience
          </p>
        </div>

        {error && (
          <div
            style={{
              marginTop: "16px",
              padding: "12px",
              backgroundColor: "#fee2e2",
              borderLeft: "4px solid #dc2626",
              borderRadius: "6px",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "14px",
                color: "#991b1b",
              }}
            >
              ⚠️ {error}
            </p>
          </div>
        )}

        {!error && !viewerLink && (
          <div
            style={{
              marginTop: "16px",
              padding: "12px",
              backgroundColor: "#f3f4f6",
              borderRadius: "6px",
              textAlign: "center",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "14px",
                color: "#6b7280",
              }}
            >
              ℹ️ No active live stream is currently available.
            </p>
            <p
              style={{
                margin: "8px 0 0 0",
                fontSize: "12px",
                color: "#9ca3af",
              }}
            >
              Check back later for live shopping events!
            </p>
          </div>
        )}

        {viewerLink && !error && (
          <div style={{ marginTop: "16px" }}>
            <div
              style={{
                backgroundColor: "#f9fafb",
                borderRadius: "8px",
                padding: "16px",
                marginBottom: "20px",
                border: "1px solid #e5e7eb",
              }}
            >
              <div style={{ marginBottom: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <span style={{ fontWeight: "600", color: "#374151", fontSize: "14px" }}>🏪 Shop:</span>
                  <span style={{ color: "#6b7280", fontSize: "14px", wordBreak: "break-all" }}>{viewerLink.shop}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <span style={{ fontWeight: "600", color: "#374151", fontSize: "14px" }}>🔑 Stream ID:</span>
                  <span style={{ color: "#6b7280", fontSize: "14px" }}>{viewerLink.streamId}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <span style={{ fontWeight: "600", color: "#374151", fontSize: "14px" }}>📦 Products:</span>
                  <span style={{ color: "#6b7280", fontSize: "14px" }}>{viewerLink.productCount || 0} items</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontWeight: "600", color: "#374151", fontSize: "14px" }}>🕒 Last updated:</span>
                  <span style={{ color: "#6b7280", fontSize: "14px" }}>
                    {viewerLink.updatedAt
                      ? new Date(viewerLink.updatedAt).toLocaleString()
                      : "Unknown"}
                  </span>
                </div>
              </div>

              <div
                style={{
                  padding: "10px",
                  backgroundColor: "#ffffff",
                  borderRadius: "6px",
                  border: "1px solid #e5e7eb",
                  marginTop: "12px",
                }}
              >
                <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "4px" }}>
                  🔗 Viewer URL:
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#4b5563",
                    wordBreak: "break-all",
                    fontFamily: "monospace",
                    backgroundColor: "#f3f4f6",
                    padding: "8px",
                    borderRadius: "4px",
                  }}
                >
                  {viewerLink.fullViewerUrl}
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "center",
              }}
            >
              <button
                type="button"
                onClick={openViewer}
                style={{
                  padding: "10px 24px",
                  borderRadius: "9999px",
                  border: "none",
                  backgroundColor: "#dc2626",
                  color: "#ffffff",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = "#b91c1c";
                  e.target.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = "#dc2626";
                  e.target.style.transform = "translateY(0)";
                }}
              >
                🎬 Watch Live Stream
              </button>
              <button
                type="button"
                onClick={copyViewerUrl}
                style={{
                  padding: "10px 24px",
                  borderRadius: "9999px",
                  border: "1px solid #d1d5db",
                  backgroundColor: "#ffffff",
                  color: "#374151",
                  fontSize: "14px",
                  fontWeight: "500",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = "#f9fafb";
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = "#ffffff";
                }}
              >
                📋 Copy Link
              </button>
            </div>

            <div
              style={{
                marginTop: "16px",
                padding: "12px",
                backgroundColor: "#fef3c7",
                borderRadius: "6px",
                borderLeft: "4px solid #f59e0b",
              }}
            >
              <p style={{ margin: 0, fontSize: "12px", color: "#92400e" }}>
                💡 Tip: Share the viewer URL with your customers so they can join the live stream!
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Main exported component
 * This is automatically used for HTML responses
 */
export default function ViewerFrontendPage() {
  const { viewerLink, error } = useLoaderData();
  return <ViewerFrontendPageComponent viewerLink={viewerLink} error={error} />;
}