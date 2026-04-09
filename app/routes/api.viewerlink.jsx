// app/routes/api.viewerlink.jsx
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  // Authenticate and get current shop
  const { session } = await authenticate.admin(request);
  const shopFromSession = session.shop;

  try {
    const liveSession = await prisma.liveSession.findUnique({
      where: {
        shop: shopFromSession,   // UNIQUE
      },
    });

    if (!liveSession) {
      return new Response(
        JSON.stringify({
          error: "No live session found for this shop",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
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

    const viewerUrl = `/viewerstream?shop=${encodeURIComponent(
      liveSession.shop,
    )}&streamId=${encodeURIComponent(
      liveSession.streamId,
    )}&ids=${idsParam}`;

    const responseBody = {
      shop: liveSession.shop,
      streamId: liveSession.streamId,
      productIds: productIdsArray,
      viewerUrl,
      updatedAt: liveSession.updatedAt,
    };

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error loading live session:", error);
    return new Response(
      JSON.stringify({ error: "Failed to load live session" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}