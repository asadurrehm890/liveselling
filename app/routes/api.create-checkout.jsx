// app/routes/api.create-checkout.jsx
import { unauthenticated } from "../shopify.server";

export async function action({ request }) {
  try {
    const body = await request.json().catch(() => ({}));
    const { shop: shopFromBody, lineItems } = body || {};

    // Also accept shop from query string as a fallback
    const url = new URL(request.url);
    const shopFromQuery = url.searchParams.get("shop");

    const shop = shopFromBody || shopFromQuery;

    console.log("Creating checkout (cart) for shop:", shop);
    console.log("Raw line items payload:", lineItems);

    if (!shop || !lineItems || lineItems.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Invalid request: missing shop or lineItems",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Get unauthenticated Storefront client for this shop
    // Requires storefront config + token in shopify.server.js
    const { storefront } = await unauthenticated.storefront(shop);

    // Ensure merchandiseId is a ProductVariant GID
    const lines = lineItems.map((item) => {
      let merchandiseId = item.variantId;

      // If it's a plain numeric ID (e.g. "45443281748012"), convert to GID
      if (typeof merchandiseId === "string" && !merchandiseId.startsWith("gid://")) {
        merchandiseId = `gid://shopify/ProductVariant/${merchandiseId}`;
      }

      return {
        quantity: item.quantity,
        merchandiseId,
      };
    });

    console.log("Lines sent to cartCreate:", lines);

    // VALIDATED Storefront mutation (against Storefront schema)
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
        lines,
      },
    };

    const response = await storefront.graphql(mutation, { variables });
    const responseJson = await response.json();

    console.log(
      "Storefront cartCreate response JSON:",
      JSON.stringify(responseJson, null, 2),
    );

    // Handle top-level GraphQL errors
    if (responseJson.errors && responseJson.errors.length > 0) {
      console.error("GraphQL errors:", responseJson.errors);
      return new Response(
        JSON.stringify({
          error: "GraphQL error while creating cart",
          graphqlErrors: responseJson.errors,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const result = responseJson.data?.cartCreate;
    const userErrors = result?.userErrors || [];

    if (userErrors.length > 0) {
      const message =
        userErrors
          .map((e) => `${e.field?.join(".") ?? ""}: ${e.message}`)
          .join("; ") || "Cart creation failed due to userErrors";

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
          error: "No checkout URL returned from Shopify Storefront API",
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
    console.error("Checkout (cart) creation error (Storefront):", error);

    // Handle Response-like errors (e.g., internal fetch errors)
    if (
      error &&
      typeof error.status === "number" &&
      typeof error.text === "function"
    ) {
      let bodyText = "";
      try {
        bodyText = await error.text();
      } catch (e) {
        bodyText = "<unable to read body>";
      }

      console.error("Error Response status:", error.status);
      console.error("Error Response body:", bodyText);

      return new Response(
        JSON.stringify({
          error: "Failed to create checkout",
          status: error.status,
          responseBody: bodyText,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const message = error?.message || "Failed to create checkout";
    console.error("Error message:", message);

    if (error?.body) {
      console.error("Error body:", JSON.stringify(error.body, null, 2));
    }

    return new Response(
      JSON.stringify({
        error: message,
        details: error.toString(),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}