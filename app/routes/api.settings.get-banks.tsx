import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getBanks } from "../lib/tingee.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const clientId = url.searchParams.get("clientId");
  const secretKey = url.searchParams.get("secretKey");

  if (!clientId || !secretKey) {
    return Response.json(
      { error: "clientId and secretKey are required" },
      { status: 400 }
    );
  }

  try {
    const banks = await getBanks(clientId, secretKey);
    return Response.json({ banks });
  } catch {
    return Response.json(
      { error: "Invalid credentials or Tingee API error" },
      { status: 400 }
    );
  }
};
