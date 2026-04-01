// app/routes/api.showproducts.jsx
import { unauthenticated } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const idsParam = url.searchParams.get("ids");

  if (!shop) {
    return new Response(
      JSON.stringify({ error: "Missing ?shop=your-store.myshopify.com" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (!idsParam) {
    return new Response(
      JSON.stringify({
        error:
          "Missing ?ids=1,2,3 or ?ids=gid://shopify/Product/...,gid://shopify/Product/...",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Parse comma-separated IDs, trim, remove empties
  const rawIds = idsParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (rawIds.length === 0) {
    return new Response(
      JSON.stringify({ error: "No valid product IDs provided." }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Allow both numeric IDs (1,2,3) and full GIDs
  const ids = rawIds.map((id) =>
    id.startsWith("gid://shopify/Product/")
      ? id
      : `gid://shopify/Product/${id}`,
  );

  let admin;

  try {
    const ctx = await unauthenticated.admin(shop);
    admin = ctx.admin;
    // const session = ctx.session; // available if you need shop-specific data
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Could not find a session for shop")
    ) {
      return new Response(
        JSON.stringify({
          error:
            "No offline session for this shop. Make sure the app is installed on this store and opened at least once in the Shopify Admin.",
          shop,
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    console.error("Error creating unauthenticated admin context:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to create unauthenticated admin context.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Call Admin GraphQL using the validated ShowProducts query
  const response = await admin.graphql(
    `#graphql
      query ShowProducts($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            title
            handle
            status
            featuredImage {
              url
              altText
            }
            priceRangeV2 {
              minVariantPrice {
                amount
                currencyCode
              }
              maxVariantPrice {
                amount
                currencyCode
              }
            }
          }
        }
      }
    `,
    {
      variables: {
        ids,
      },
    },
  );

  const json = await response.json();

  if (!json.data || !json.data.nodes) {
    return new Response(
      JSON.stringify({
        error: "Unexpected response from Admin API",
        raw: json,
      }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Filter out nulls (if some IDs were not Products)
  const products = (json.data.nodes || []).filter(Boolean);

  return new Response(JSON.stringify({ products }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

// IMPORTANT: no default export here so this stays a resource route
// (React Router sends loader Response body directly for HTTP requests)