import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

 
};

export default function SellerLiveStream() {
  

  return (
    <s-page heading="Additional page">
      <s-section heading="Multiple pages">
        <s-paragraph>
          The app template comes with an additional page which demonstrates how
          to create multiple pages within app navigation using{" "}
          <s-link
            href="https://shopify.dev/docs/apps/tools/app-bridge"
            target="_blank"
          >
            App Bridge
          </s-link>
          .
        </s-paragraph>
        <s-paragraph>
          To create your own page and have it show up in the app navigation, add
          a page inside <code>app/routes</code>, and a link to it in the{" "}
          <code>&lt;ui-nav-menu&gt;</code> component found in{" "}
          <code>app/routes/app.jsx</code>.
        </s-paragraph>
      </s-section>

      {/* New iframe section */}
      <s-section heading="Live Seller stream">
        <s-paragraph>
          This iframe loads your Seller Live stream for the current shop,
          passing the shop domain as a query parameter.
        </s-paragraph>

        <s-box
          padding="none"
          borderWidth="base"
          borderRadius="base"
          background="subdued"
          minHeight="400px"
        >
          <iframe
            src="https://liveselling-eta.vercel.app/sellerstream?shop=burdauae.myshopify.com"
            title="Seller Live stream"
            style={{
              width: "100%",
              height: "900px",
              border: "none",
            }}
          />
        </s-box>
      </s-section>

      <s-section slot="aside" heading="Resources">
        <s-unordered-list>
          <s-list-item>
            <s-link
              href="https://shopify.dev/docs/apps/design-guidelines/navigation#app-nav"
              target="_blank"
            >
              App nav best practices
            </s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};