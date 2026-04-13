import { authenticate } from "../shopify.server";

export async function action({ request }) {
  const { session } = await authenticate.public.appProxy(request);
  const { shop, lineItems } = await request.json();

  if (!shop || !lineItems || lineItems.length === 0) {
    return new Response(
      JSON.stringify({ error: "Invalid request" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // Create checkout using Shopify Storefront API or Admin API
    const response = await fetch(`https://${shop}/admin/api/2024-01/checkouts.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": session.accessToken,
      },
      body: JSON.stringify({
        checkout: {
          line_items: lineItems.map(item => ({
            variant_id: item.variantId,
            quantity: item.quantity,
          })),
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.errors || "Failed to create checkout");
    }

    return new Response(
      JSON.stringify({
        success: true,
        checkoutUrl: data.checkout.checkout_url,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Checkout creation error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}