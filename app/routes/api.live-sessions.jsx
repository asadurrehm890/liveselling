// app/routes/api.live-sessions.jsx
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function action({ request }) {
  // Enforce POST-only for this endpoint
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Get the authenticated shop from Shopify session
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
    // productIds can be an array or a string; normalize to string for storage
    const productIdsToStore =
      typeof productIds === "string"
        ? productIds
        : JSON.stringify(productIds);

    const record = await prisma.liveSession.create({
      data: {
        shop: shopFromSession, // trust shop from session, not client
        streamId,
        productIds: productIdsToStore,
      },
    });

    return new Response(
      JSON.stringify({ ok: true, session: record }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error creating live session:", error);
    return new Response(
      JSON.stringify({ error: "Failed to create live session" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}