import { useEffect, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import type { VirtualAccount } from "../lib/tingee.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const config = await db.merchantConfig.findUnique({
    where: { shop: session.shop },
    select: { clientId: true, bankAccountId: true, accountNumber: true, bankBin: true },
  });
  return { config };
};

export default function SettingsPage() {
  const { config } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const saveFetcher = useFetcher<{ success?: boolean; error?: string }>();

  const [clientId, setClientId] = useState(config?.clientId ?? "");
  const [secretKey, setSecretKey] = useState("");
  const [virtualAccounts, setVirtualAccounts] = useState<VirtualAccount[]>([]);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState(
    config?.bankAccountId ?? "",
  );
  const [checkError, setCheckError] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  const isSaving = ["loading", "submitting"].includes(saveFetcher.state);

  useEffect(() => {
    if (saveFetcher.data?.success) {
      shopify.toast.show("Cấu hình đã được lưu thành công");
    } else if (saveFetcher.data?.error) {
      shopify.toast.show(saveFetcher.data.error, { isError: true });
    }
  }, [saveFetcher.data, shopify]);

  async function handleCheck() {
    if (!clientId || !secretKey) {
      setCheckError("Vui lòng nhập đầy đủ Client ID và Secret Key.");
      return;
    }
    setIsChecking(true);
    setCheckError("");
    setHasChecked(false);
    setVirtualAccounts([]);

    try {
      const [banksRes, vaRes] = await Promise.all([
        fetch(
          `/api/settings/get-banks?clientId=${encodeURIComponent(clientId)}&secretKey=${encodeURIComponent(secretKey)}`,
        ),
        fetch("/api/settings/get-va-paging", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, secretKey }),
        }),
      ]);

      if (!banksRes.ok) {
        const err = (await banksRes.json()) as { error?: string };
        setCheckError(err.error ?? "Thông tin xác thực không hợp lệ.");
        return;
      }

      const vaData = (await vaRes.json()) as { items?: VirtualAccount[]; error?: string };
      if (!vaRes.ok || !vaData.items?.length) {
        setCheckError(
          vaData.error ?? "Không tìm thấy tài khoản ảo nào được liên kết. Vui lòng kiểm tra lại.",
        );
        return;
      }

      setVirtualAccounts(vaData.items);
      setHasChecked(true);
      if (!selectedBankAccountId) {
        setSelectedBankAccountId(vaData.items[0].bankAccountId);
      }
    } catch {
      setCheckError("Đã xảy ra lỗi kết nối. Vui lòng thử lại.");
    } finally {
      setIsChecking(false);
    }
  }

  function handleSave() {
    const va = virtualAccounts.find((v) => v.bankAccountId === selectedBankAccountId);
    if (!va) return;
    saveFetcher.submit(
      {
        clientId,
        secretKey,
        bankAccountId: va.bankAccountId,
        accountNumber: va.accountNumber,
        bankBin: va.bankBin,
      },
      { method: "POST", action: "/api/settings/save", encType: "application/json" },
    );
  }

  return (
    <s-page heading="Cài đặt Tingee">
      {config && (
        <s-banner tone="success">
          <s-paragraph>
            Đã cấu hình — Client ID:{" "}
            <s-text type="strong">{config.clientId}</s-text>
            {" — "}Tài khoản:{" "}
            <s-text type="strong">{config.accountNumber}</s-text>
          </s-paragraph>
        </s-banner>
      )}

      <s-section heading="Thông tin xác thực Tingee">
        {checkError && (
          <s-banner tone="critical">
            <s-paragraph>{checkError}</s-paragraph>
          </s-banner>
        )}
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Client ID (x-client-id)"
            value={clientId}
            onInput={(e) => setClientId(e.currentTarget.value)}
          />
          <s-text-field
            label="Secret Key (x-secret-key)"
            value={secretKey}
            onInput={(e) => setSecretKey(e.currentTarget.value)}
          />
          <s-button onClick={handleCheck} {...(isChecking ? { loading: true } : {})}>
            Kiểm tra &amp; Lấy danh sách
          </s-button>
        </s-stack>
      </s-section>

      {hasChecked && virtualAccounts.length > 0 && (
        <s-section heading="Chọn tài khoản thanh toán">
          <s-stack direction="block" gap="base">
            <s-select
              label="Tài khoản ảo (Virtual Account)"
              value={selectedBankAccountId}
              onChange={(e) => setSelectedBankAccountId(e.currentTarget.value)}
            >
              {virtualAccounts.map((va) => (
                <s-option key={va.bankAccountId} value={va.bankAccountId}>
                  {va.accountNumber} — {va.accountName}
                </s-option>
              ))}
            </s-select>
            <s-button
              variant="primary"
              onClick={handleSave}
              {...(isSaving ? { loading: true } : {})}
            >
              Lưu cấu hình
            </s-button>
          </s-stack>
        </s-section>
      )}

      <s-section slot="aside" heading="Hướng dẫn">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            <s-text type="strong">1. Nhập thông tin xác thực</s-text>
          </s-paragraph>
          <s-paragraph>
            Nhập Client ID và Secret Key từ tài khoản Tingee Partner.
          </s-paragraph>
          <s-paragraph>
            <s-text type="strong">2. Kiểm tra &amp; Lấy danh sách</s-text>
          </s-paragraph>
          <s-paragraph>
            Xác thực thông tin và lấy danh sách tài khoản ảo đã liên kết.
          </s-paragraph>
          <s-paragraph>
            <s-text type="strong">3. Chọn tài khoản &amp; Lưu</s-text>
          </s-paragraph>
          <s-paragraph>
            Chọn tài khoản ảo nhận thanh toán rồi nhấn "Lưu cấu hình".
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
