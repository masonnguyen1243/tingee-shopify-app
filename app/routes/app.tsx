import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  // Sync current app URL into a shop metafield readable via Storefront API
  const appUrl = process.env.SHOPIFY_APP_URL;
  if (appUrl) {
    // Ensure metafield definition exists with PUBLIC_READ storefront access
    // (userErrors code TAKEN = already exists — safe to ignore)
    await admin.graphql(`#graphql
      mutation {
        metafieldDefinitionCreate(definition: {
          name: "Tingee App URL"
          namespace: "tingee"
          key: "api_url"
          type: "single_line_text_field"
          ownerType: SHOP
          access: { storefront: PUBLIC_READ }
        }) {
          userErrors { code message }
        }
      }
    `);

    const shopRes = await admin.graphql(`#graphql
      query { shop { id } }
    `);
    const { data } = await shopRes.json() as { data: { shop: { id: string } } };
    const mfRes = await admin.graphql(`#graphql
      mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id namespace key value }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        metafields: [{
          namespace: "tingee",
          key: "api_url",
          ownerId: data.shop.id,
          type: "single_line_text_field",
          value: appUrl,
        }],
      },
    });
    const mfData = await mfRes.json() as { data: { metafieldsSet: { metafields: { id: string; namespace: string; key: string; value: string }[]; userErrors: { field: string; message: string }[] } } };
    const errs = mfData?.data?.metafieldsSet?.userErrors;
    const created = mfData?.data?.metafieldsSet?.metafields;
    if (errs?.length) console.error("[tingee] metafieldsSet errors:", JSON.stringify(errs));
    if (created?.length) console.log("[tingee] metafield set OK:", JSON.stringify(created));
  }

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Tổng quan</s-link>
        <s-link href="/app/settings">Cài đặt</s-link>
        <s-link href="/app/transactions">Lịch sử giao dịch</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
