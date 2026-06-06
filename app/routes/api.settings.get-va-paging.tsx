import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getVirtualAccounts } from "../lib/tingee.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);

  const body = await request.json();
  const { clientId, secretKey, page, size } = body as {
    clientId?: string;
    secretKey?: string;
    page?: number;
    size?: number;
  };

  if (!clientId || !secretKey) {
    return Response.json(
      { error: "clientId and secretKey are required" },
      { status: 400 }
    );
  }

  try {
    const result = await getVirtualAccounts(clientId, secretKey, { page, size });
    return Response.json(result);
  } catch {
    return Response.json(
      { error: "Invalid credentials or Tingee API error" },
      { status: 400 }
    );
  }
};
