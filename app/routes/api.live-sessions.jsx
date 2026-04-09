// app/routes/api.live-sessions.jsx
import { json } from "@remix-run/node"; // or from "react-router" server helpers depending on your template
import { authenticate } from "../shopify.server";
import prisma from "../db.server"; // adjust the import to wherever you initialize Prisma

export async function action({ request }) {
  // Ensure the request is authenticated to this shop
  const { session } = await authenticate.admin(request);
  const shopFromSession = session.shop;

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const contentType = request.headers.get("content-type") || "";

  let payload;
  if (contentType.includes("application/json")) {
    payload = await request.json();
  } else if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    payload = Object.fromEntries(formData.entries());
  } else {
    return json({ error: "Unsupported content type" }, { status: 400 });
  }

  const { shop, streamId, productIds } = payload;

  if (!streamId || !productIds) {
    return json({ error: "Missing streamId or productIds" }, { status: 400 });
  }

  // Make sure we trust the shop from the session, not from the client
  const shopToStore = shopFromSession || shop;

  try {
    const record = await prisma.liveSession.create({
      data: {
        shop: shopToStore,
        streamId,
        productIds: typeof productIds === "string"
          ? productIds
          : JSON.stringify(productIds),
      },
    });

    return json({ ok: true, session: record }, { status: 201 });
  } catch (error) {
    console.error("Error creating live session:", error);
    return json(
      { error: "Failed to create live session" },
      { status: 500 },
    );
  }
}