// app/root.jsx
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData } from "react-router";
import styles from "./styles/live-stream.css?url";

// Add loader function to expose environment variables
export async function loader() {
  return {
    ENV: {
      PUSHER_KEY: process.env.PUSHER_KEY,
      PUSHER_CLUSTER: process.env.PUSHER_CLUSTER,
    }
  };
}

// Export links for CSS
export function links() {
  return [
    { rel: "stylesheet", href: styles },
    // Add Google Fonts for Outfit
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
    { href: "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap", rel: "stylesheet" },
  ];
}

export default function App() {
  const data = useLoaderData();
  
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        {/* Inject environment variables into window */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.ENV = ${JSON.stringify(data.ENV)};`,
          }}
        />
        <Scripts />
      </body>
    </html>
  );
}