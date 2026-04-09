// app/routes/api.clear-livesessions.jsx
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

/**
 * Deletes ALL rows from the LiveSession table.
 * Protected by Shopify admin auth so only the merchant can trigger it.
 */
export async function action({ request }) {
  // Only allow POST (or DELETE) to perform destructive operation
  if (request.method !== "POST" && request.method !== "DELETE") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Ensure this call is from an authenticated embedded app session
  await authenticate.admin(request);

  try {
    const result = await prisma.liveSession.deleteMany({});

    return new Response(
      JSON.stringify({
        ok: true,
        deletedCount: result.count,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error clearing LiveSession table:", error);
    return new Response(
      JSON.stringify({ error: "Failed to clear live sessions" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}