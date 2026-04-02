// app/routes/api.add-to-cart.jsx
import { unauthenticated } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

const CREATE_CART_MUTATION = `#graphql
  mutation CreateCartAndGetCheckout(
    $lines: [CartLineInput!]!
    $buyerIdentity: CartBuyerIdentityInput
  ) {
    cartCreate(input: { lines: $lines, buyerIdentity: $buyerIdentity }) {
      cart {
        id
        checkoutUrl
        totalQuantity
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const action = async ({ request }) => {
  try {
    const body = await request.json().catch(() => null);

    if (!body) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const { shop, merchandiseId, quantity = 1, countryCode } = body;

    if (!shop || !merchandiseId) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: shop or merchandiseId",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const { storefront } = await unauthenticated.storefront(shop);

    const lines = [
      {
        merchandiseId,
        quantity: Number(quantity) || 1,
      },
    ];

    const buyerIdentity = countryCode ? { countryCode } : undefined;

    const response = await storefront.graphql(CREATE_CART_MUTATION, {
      variables: {
        lines,
        buyerIdentity,
      },
    });

    const { data, errors } = await response.json();

    if (errors) {
      console.error("Storefront errors:", errors);
      return new Response(
        JSON.stringify({
          error: "Storefront API error",
          details: errors,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const result = data.cartCreate;
    if (result.userErrors && result.userErrors.length > 0) {
      console.error("Cart userErrors:", result.userErrors);
      return new Response(
        JSON.stringify({
          error: "Cart creation failed",
          userErrors: result.userErrors,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const cart = result.cart;
    if (!cart || !cart.checkoutUrl) {
      return new Response(
        JSON.stringify({
          error: "No checkoutUrl returned from cartCreate",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        cartId: cart.id,
        checkoutUrl: cart.checkoutUrl,
        totalQuantity: cart.totalQuantity,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("add-to-cart unexpected error:", err);
    return new Response(
      JSON.stringify({
        error: "Unexpected server error",
        message: err.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

// No default export → stays a resource route