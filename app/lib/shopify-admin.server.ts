import type { AdminApiContext } from '@shopify/shopify-app-react-router/server';

export interface ShopifyOrder {
  id: string;
  totalPrice: string;
  currency: string;
}

// Accepts either a numeric order ID ("123456") or a full GID.
function toOrderGid(orderId: string): string {
  return orderId.startsWith('gid://') ? orderId : `gid://shopify/Order/${orderId}`;
}

export async function getOrder(
  admin: AdminApiContext,
  orderId: string
): Promise<ShopifyOrder> {
  const response = await admin.graphql(
    `#graphql
    query getOrder($id: ID!) {
      order(id: $id) {
        id
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
      }
    }`,
    { variables: { id: toOrderGid(orderId) } }
  );

  const { data } = await response.json();
  if (!data?.order) {
    throw new Error(`Order ${orderId} not found`);
  }

  return {
    id: data.order.id,
    totalPrice: data.order.totalPriceSet.shopMoney.amount,
    currency: data.order.totalPriceSet.shopMoney.currencyCode,
  };
}

// Marks a Shopify order as paid via the orderMarkAsPaid GraphQL mutation.
// amount and currency are accepted for interface consistency but the mutation
// only requires the order ID — Shopify derives the amount from the order total.
export async function markOrderPaid(
  admin: AdminApiContext,
  orderId: string,
  _amount: number,
  _currency: string
): Promise<void> {
  const response = await admin.graphql(
    `#graphql
    mutation markOrderPaid($input: OrderMarkAsPaidInput!) {
      orderMarkAsPaid(input: $input) {
        order {
          id
          displayPaymentStatus
        }
        userErrors {
          field
          message
        }
      }
    }`,
    { variables: { input: { id: toOrderGid(orderId) } } }
  );

  const { data } = await response.json();
  const userErrors = data?.orderMarkAsPaid?.userErrors ?? [];
  if (userErrors.length > 0) {
    const messages = userErrors.map((e: { message: string }) => e.message).join(', ');
    throw new Error(`markOrderPaid failed: ${messages}`);
  }
}
