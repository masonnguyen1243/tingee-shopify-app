import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", width: "100%", textAlign: "center", padding: "1rem" }}>
      <div style={{ display: "grid", gap: "2rem", maxWidth: "40rem" }}>
        <h1 style={{ margin: 0 }}>Tingee Payment App</h1>
        <p style={{ margin: 0, fontSize: "1.1rem" }}>
          VietQR bank transfer payment for Shopify checkout.
        </p>
        {showForm && (
          <Form style={{ display: "flex", alignItems: "flex-end", gap: "1rem", justifyContent: "center" }} method="post" action="/auth/login">
            <label style={{ display: "grid", gap: "0.25rem", textAlign: "left", fontSize: "1rem" }}>
              <span>Shop domain</span>
              <input style={{ padding: "0.4rem", fontSize: "1rem" }} type="text" name="shop" />
              <span style={{ fontSize: "0.8rem", color: "#666" }}>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button style={{ padding: "0.5rem 1rem", fontSize: "1rem" }} type="submit">
              Log in
            </button>
          </Form>
        )}
      </div>
    </div>
  );
}
