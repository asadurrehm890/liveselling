// app/routes/api.create-checkout.jsx
import { authenticate } from "../shopify.server";

export async function action({ request }) {
  try {
    // For an app proxy or “public” request, use public.appProxy
    const { storefront, session } = await authenticate.public.appProxy(request);

    const body = await request.json();
    const { shop, lineItems } = body;

    console.log("Creating checkout (cart) for shop:", shop);
    console.log("Line items:", lineItems);

    if (!shop || !lineItems || lineItems.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Invalid request: missing shop or lineItems",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Storefront Cart API mutation (recommended instead of checkoutCreate)
    const mutation = `#graphql
      mutation CartCreateForVariants($cartInput: CartInput) {
        cartCreate(input: $cartInput) {
          cart {
            id
            checkoutUrl
            lines(first: 10) {
              edges {
                node {
                  quantity
                  merchandise {
                    ... on ProductVariant {
                      id
                      title
                    }
                  }
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      cartInput: {
        lines: lineItems.map((item) => ({
          quantity: item.quantity,
          merchandiseId: item.variantId, // must be a ProductVariant GID
        })),
        // Optional: buyerIdentity, attributes, discounts, etc.
      },
    };

    const response = await storefront.graphql(mutation, {
      variables,
    });

    const responseJson = await response.json();
    console.log(
      "Storefront cartCreate response:",
      JSON.stringify(responseJson, null, 2),
    );

    const result = responseJson.data?.cartCreate;
    const userErrors = result?.userErrors || [];

    if (userErrors.length > 0) {
      const message =
        userErrors.map((e) => `${e.field?.join(".") ?? ""}: ${e.message}`).join(
          "; ",
        ) || "Cart creation failed due to userErrors";

      console.error("cartCreate userErrors:", userErrors);

      return new Response(
        JSON.stringify({ error: message, userErrors }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const checkoutUrl = result?.cart?.checkoutUrl;

    if (!checkoutUrl) {
      console.error("No checkoutUrl returned from cartCreate");
      return new Response(
        JSON.stringify({
          error: "No checkout URL returned from Shopify",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        checkoutUrl,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Checkout (cart) creation error:", error);

    return new Response(
      JSON.stringify({
        error: error.message || "Failed to create checkout",
        details: error.toString(),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}