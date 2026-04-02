// app/routes/api.selectallproducts.jsx
import { unauthenticated } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return new Response(
      JSON.stringify({ error: "Missing ?shop=your-store.myshopify.com" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  let admin;

  try {
    // Uses offline session stored in your Prisma Session table
    const ctx = await unauthenticated.admin(shop);
    admin = ctx.admin;
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

  const allProducts = [];
  let hasNextPage = true;
  let cursor = null;
  const pageSize = 100;

  while (hasNextPage) {
    const response = await admin.graphql(
      `#graphql
        query AllProductsPage($first: Int!, $after: String) {
          products(first: $first, after: $after, query: "status:active") {
            edges {
              node {
                id
                title
                handle
                status
              }
              cursor
            }
            pageInfo {
              hasNextPage
            }
          }
        }
      `,
      {
        variables: {
          first: pageSize,
          after: cursor,
        },
      },
    );

    const json = await response.json();

    if (!json.data || !json.data.products) {
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

    const { edges, pageInfo } = json.data.products;
    allProducts.push(...edges.map((edge) => edge.node));

    hasNextPage = pageInfo.hasNextPage;
    if (hasNextPage && edges.length > 0) {
      cursor = edges[edges.length - 1].cursor;
    } else {
      cursor = null;
    }
  }

  return new Response(JSON.stringify({ products: allProducts }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
};

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};