import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const pageSize = 20;

  const [total, transactions] = await Promise.all([
    db.transaction.count({ where: { shop: session.shop } }),
    db.transaction.findMany({
      where: { shop: session.shop },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        orderId: true,
        amount: true,
        status: true,
        transactionCode: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    transactions: transactions.map((t) => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  };
};

function statusTone(status: string): "success" | "caution" | "critical" | "neutral" {
  if (status === "PAID") return "success";
  if (status === "PENDING") return "caution";
  if (status === "EXPIRED" || status === "UNMATCHED") return "critical";
  return "neutral";
}

export default function TransactionsPage() {
  const { transactions, total, page, pageSize } = useLoaderData<typeof loader>();
  const totalPages = Math.ceil(total / pageSize);

  return (
    <s-page heading="Lịch sử giao dịch">
      <s-section>
        {transactions.length === 0 ? (
          <s-paragraph>Chưa có giao dịch nào.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Mã đơn hàng</s-table-header>
              <s-table-header>Số tiền (VND)</s-table-header>
              <s-table-header>Trạng thái</s-table-header>
              <s-table-header>Mã GD Tingee</s-table-header>
              <s-table-header>Thời gian</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {transactions.map((t) => (
                <s-table-row key={t.id}>
                  <s-table-cell>{t.orderId}</s-table-cell>
                  <s-table-cell>{t.amount.toLocaleString("vi-VN")}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={statusTone(t.status)}>{t.status}</s-badge>
                  </s-table-cell>
                  <s-table-cell>{t.transactionCode ?? "—"}</s-table-cell>
                  <s-table-cell>
                    {new Date(t.createdAt).toLocaleString("vi-VN")}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      {totalPages > 1 && (
        <s-section>
          <s-stack direction="inline" gap="base" alignItems="center">
            {page > 1 && (
              <s-button
                variant="tertiary"
                onClick={() =>
                  (window.location.href = `/app/transactions?page=${page - 1}`)
                }
              >
                Trang trước
              </s-button>
            )}
            <s-text>
              Trang {page} / {totalPages} (Tổng: {total})
            </s-text>
            {page < totalPages && (
              <s-button
                variant="tertiary"
                onClick={() =>
                  (window.location.href = `/app/transactions?page=${page + 1}`)
                }
              >
                Trang tiếp
              </s-button>
            )}
          </s-stack>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
