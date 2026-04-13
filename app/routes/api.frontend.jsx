import prisma from "../db.server";

/**
 * API endpoint for frontend to check live stream status
 * Returns JSON response with shop, streamId, and productIds
 * 
 * Usage: /api/frontend?shop=burdauae.myshopify.com
 * 
 * Response formats:
 * - Success: { success: true, data: { shop, streamId, productIds, fullViewerUrl, updatedAt } }
 * - No active stream: { success: false, message: "No active live stream", data: null }
 * - Error: { success: false, error: "Error message", data: null }
 */
export async function loader({ request }) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  
  // Set CORS headers for cross-origin requests from Shopify stores
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // Handle preflight OPTIONS request
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // Validate shop parameter
  if (!shop) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Missing 'shop' query parameter",
        data: null,
      }),
      {
        status: 400,
        headers: corsHeaders,
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
      return new Response(
        JSON.stringify({
          success: false,
          message: "No active live stream",
          data: null,
        }),
        {
          status: 200,
          headers: corsHeaders,
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
      return new Response(
        JSON.stringify({
          success: false,
          error: "No products found for this live stream",
          data: null,
        }),
        {
          status: 200,
          headers: corsHeaders,
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
    )}&streamId=${encodeURIComponent(liveSession.streamId)}&ids=${idsParam}`;

    // Return success response with data
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          shop: liveSession.shop,
          streamId: liveSession.streamId,
          productIds: productIdsArray,
          productCount: productIdsArray.length,
          fullViewerUrl: fullViewerUrl,
          updatedAt: liveSession.updatedAt,
          createdAt: liveSession.createdAt,
        },
      }),
      {
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (err) {
    console.error("Error in api.frontend:", err);
    
    // Return error response
    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to load live stream information",
        message: err.message,
        data: null,
      }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
}