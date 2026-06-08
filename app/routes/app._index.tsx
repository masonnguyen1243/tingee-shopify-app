import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const [config, recentTransactions] = await Promise.all([
    db.merchantConfig.findUnique({
      where: { shop: session.shop },
      select: { clientId: true, accountNumber: true },
    }),
    db.transaction.findMany({
      where: { shop: session.shop },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, orderId: true, amount: true, status: true, createdAt: true },
    }),
  ]);

  return {
    config,
    recentTransactions: recentTransactions.map((t) => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
    })),
  };
};

function statusTone(status: string): "success" | "caution" | "critical" | "neutral" {
  if (status === "PAID") return "success";
  if (status === "PENDING") return "caution";
  if (status === "EXPIRED" || status === "UNMATCHED") return "critical";
  return "neutral";
}

export default function Index() {
  const { config, recentTransactions } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Tổng quan Tingee">
      {!config ? (
        <s-banner tone="warning">
          <s-paragraph>
            Bạn chưa cấu hình Tingee.{" "}
            <s-link href="/app/settings">Vào Cài đặt</s-link> để nhập thông tin
            xác thực và bắt đầu nhận thanh toán QR.
          </s-paragraph>
        </s-banner>
      ) : (
        <s-banner tone="success">
          <s-paragraph>
            Đã kết nối Tingee — Client ID:{" "}
            <s-text type="strong">{config.clientId}</s-text>
            {" — "}Tài khoản:{" "}
            <s-text type="strong">{config.accountNumber}</s-text>
          </s-paragraph>
        </s-banner>
      )}

      <s-section heading="Giao dịch gần đây">
        {recentTransactions.length === 0 ? (
          <s-paragraph>Chưa có giao dịch nào.</s-paragraph>
        ) : (
          <>
            <s-table>
              <s-table-header-row>
                <s-table-header>Mã đơn hàng</s-table-header>
                <s-table-header>Số tiền (VND)</s-table-header>
                <s-table-header>Trạng thái</s-table-header>
                <s-table-header>Thời gian</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {recentTransactions.map((t) => (
                  <s-table-row key={t.id}>
                    <s-table-cell>{t.orderId}</s-table-cell>
                    <s-table-cell>{t.amount.toLocaleString("vi-VN")}</s-table-cell>
                    <s-table-cell>
                      <s-badge tone={statusTone(t.status)}>{t.status}</s-badge>
                    </s-table-cell>
                    <s-table-cell>
                      {new Date(t.createdAt).toLocaleString("vi-VN")}
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
            <s-link href="/app/transactions">Xem tất cả giao dịch →</s-link>
          </>
        )}
      </s-section>

      <s-section slot="aside" heading="Hướng dẫn nhanh">
        <s-unordered-list>
          <s-list-item>
            <s-link href="/app/settings">1. Cài đặt thông tin xác thực Tingee</s-link>
          </s-list-item>
          <s-list-item>Khách hàng quét mã QR khi thanh toán</s-list-item>
          <s-list-item>
            Tingee gửi IPN → đơn hàng tự động đánh dấu đã thanh toán
          </s-list-item>
          <s-list-item>
            <s-link href="/app/transactions">Theo dõi lịch sử giao dịch</s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
