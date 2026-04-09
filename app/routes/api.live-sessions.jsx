// app/routes/api.live-sessions.jsx
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function action({ request }) {
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Get the authenticated shop
  const { session } = await authenticate.admin(request);
  const shopFromSession = session.shop;

  const contentType = request.headers.get("content-type") || "";

  let payload;
  if (contentType.includes("application/json")) {
    payload = await request.json();
  } else if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();
    payload = Object.fromEntries(formData.entries());
  } else {
    return new Response(
      JSON.stringify({ error: "Unsupported content type" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const { streamId, productIds } = payload;

  if (!streamId || !productIds) {
    return new Response(
      JSON.stringify({ error: "Missing streamId or productIds" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  try {
    const productIdsToStore =
      typeof productIds === "string"
        ? productIds
        : JSON.stringify(productIds);

    // One row per shop: use upsert
    const record = await prisma.liveSession.upsert({
      where: {
        shop: shopFromSession,  // UNIQUE field
      },
      update: {
        streamId,
        productIds: productIdsToStore,
      },
      create: {
        shop: shopFromSession,
        streamId,
        productIds: productIdsToStore,
      },
    });

    return new Response(JSON.stringify({ ok: true, session: record }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error upserting live session:", error);
    return new Response(
      JSON.stringify({ error: "Failed to save live session" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}