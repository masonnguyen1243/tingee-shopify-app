import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getBanks } from "../lib/tingee.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const body = await request.json();
  const { clientId, secretKey, bankAccountId, accountNumber, bankBin } =
    body as {
      clientId?: string;
      secretKey?: string;
      bankAccountId?: string;
      accountNumber?: string;
      bankBin?: string;
    };

  if (!clientId || !secretKey || !bankAccountId || !accountNumber || !bankBin) {
    return Response.json(
      { error: "All fields are required" },
      { status: 400 }
    );
  }

  try {
    await getBanks(clientId, secretKey);
  } catch {
    return Response.json(
      { error: "Invalid Tingee credentials" },
      { status: 400 }
    );
  }

  await db.merchantConfig.upsert({
    where: { shop: session.shop },
    update: { clientId, secretKey, bankAccountId, accountNumber, bankBin },
    create: {
      shop: session.shop,
      clientId,
      secretKey,
      bankAccountId,
      accountNumber,
      bankBin,
    },
  });

  return Response.json({ success: true });
};
