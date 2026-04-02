// app/routes/api.showproducts.jsx
import { unauthenticated } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

// Storefront API query – validated against Storefront schema
const VIEWER_STREAM_PRODUCTS_QUERY = `#graphql
  query ViewerStreamProducts($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        title
        handle
        featuredImage {
          url
          altText
        }
        priceRange {
          minVariantPrice {
            amount
            currencyCode
          }
          maxVariantPrice {
            amount
            currencyCode
          }
        }
        options(first: 10) {
          name
          values
        }
        variants(first: 50) {
          nodes {
            id
            title
            availableForSale
            selectedOptions {
              name
              value
            }
            price {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
`;

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
          "Missing ?ids=gid://shopify/Product/...,gid://shopify/Product/... or numeric IDs",
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

  // Allow both numeric IDs and full GIDs
  const ids = rawIds.map((id) =>
    id.startsWith("gid://shopify/Product/")
      ? id
      : `gid://shopify/Product/${id}`,
  );

  let storefront;

  try {
    const ctx = await unauthenticated.storefront(shop);
    storefront = ctx.storefront;
  } catch (error) {
    console.error(
      "Error creating unauthenticated storefront context for",
      shop,
      ":",
      error,
    );

    // Common cause: Storefront access token not configured
    return new Response(
      JSON.stringify({
        error:
          "Failed to create unauthenticated storefront context. Check Storefront API configuration for this shop.",
        detail: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  try {
    const response = await storefront.graphql(VIEWER_STREAM_PRODUCTS_QUERY, {
      variables: { ids },
    });

    const json = await response.json();

    if (json.errors && json.errors.length) {
      console.error(
        "Storefront GraphQL errors in /api/showproducts:",
        JSON.stringify(json.errors, null, 2),
      );
      return new Response(
        JSON.stringify({
          error: "Storefront GraphQL error",
          details: json.errors,
        }),
        {
          status: 502,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (!json.data || !json.data.nodes) {
      console.error(
        "Unexpected Storefront response in /api/showproducts:",
        JSON.stringify(json, null, 2),
      );
      return new Response(
        JSON.stringify({
          error: "Unexpected response from Storefront API",
          raw: json,
        }),
        {
          status: 502,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Filter out nulls (if some IDs are not Products)
    const products = (json.data.nodes || []).filter(Boolean);

    // Map priceRange -> priceRangeV2 to keep your existing viewer code working
    const mappedProducts = products.map((p) => ({
      ...p,
      priceRangeV2: p.priceRange,
    }));

    return new Response(JSON.stringify({ products: mappedProducts }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Unexpected error in /api/showproducts:", error);
    return new Response(
      JSON.stringify({
        error: "Unexpected server error in /api/showproducts",
        detail: error instanceof Error ? error.message : String(error),
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