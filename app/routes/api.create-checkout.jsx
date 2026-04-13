// app/routes/api.create-checkout.jsx
import { authenticate } from "../shopify.server";

export async function action({ request }) {
  try {
    // Use Admin context for REST Admin API
    const { admin, session } = await authenticate.admin(request);

    const body = await request.json();
    const { shop, lineItems } = body;

    console.log("Creating checkout via Admin REST for shop:", shop);
    console.log("Line items payload:", lineItems);

    if (!shop || !lineItems || lineItems.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Invalid request: missing shop or lineItems",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Build the Checkout using Admin REST resources
    const checkout = new admin.rest.resources.Checkout({ session });

    checkout.line_items = lineItems.map((item) => ({
      // REST Checkout expects a numeric variant_id
      variant_id: Number(item.variantId),
      quantity: item.quantity,
    }));

    console.log("Checkout line_items to send:", checkout.line_items);

    // Save the checkout (Admin REST call)
    await checkout.save({ update: true });

    console.log("Checkout created:", {
      id: checkout.id,
      checkout_url: checkout.checkout_url,
    });

    if (!checkout.checkout_url) {
      console.error("No checkout_url returned from Admin REST Checkout");
      return new Response(
        JSON.stringify({
          error: "No checkout URL returned from Shopify Admin API",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        checkoutUrl: checkout.checkout_url,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Checkout creation error (Admin REST):", error);

    // If the Admin REST SDK wraps an HTTP error, it may have a response property
    if (error?.response) {
      try {
        const errorBody = await error.response.json();
        console.error(
          "Admin REST error status:",
          error.response.status,
          "body:",
          JSON.stringify(errorBody, null, 2),
        );

        return new Response(
          JSON.stringify({
            error: "Failed to create checkout",
            status: error.response.status,
            responseBody: errorBody,
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      } catch (parseError) {
        console.error("Failed to parse Admin REST error body:", parseError);
      }
    }

    // Fallback for generic error
    const message = error?.message || "Failed to create checkout";
    return new Response(
      JSON.stringify({
        error: message,
        details: error.toString(),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}