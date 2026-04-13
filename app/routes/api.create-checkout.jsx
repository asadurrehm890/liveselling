// app/routes/api.create-checkout.jsx
import { authenticate } from "../shopify.server";

export async function action({ request }) {
  try {
    // Use public.appProxy for app proxy / public routes
    const { storefront } = await authenticate.public.appProxy(request);

    const body = await request.json();
    const { shop, lineItems } = body;

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

    const response = await storefront.graphql(mutation, {
      variables,
    });

    const responseJson = await response.json();
    console.log(
      "Storefront cartCreate response JSON:",
      JSON.stringify(responseJson, null, 2),
    );

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
    // Better error logging for different error shapes
    console.error("Checkout (cart) creation error (raw):", error);

    // If the error is a Response (e.g., fetch or GraphQL client threw it)
    if (error instanceof Response) {
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

    // Generic fallback for other error types
    const message = error?.message || "Failed to create checkout";
    console.error("Error message:", message);

    // If the error has a 'body' property (e.g. GraphqlQueryError)
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