import {
  extension,
  Banner,
  BlockStack,
  InlineStack,
  Text,
  Image,
  Button,
  Spinner,
} from "@shopify/ui-extensions/checkout";
import type { RootNode } from "@shopify/ui-extensions/checkout";

// Injected by Shopify CLI at build time (process.env.SHOPIFY_APP_URL)
declare const process: { env: { SHOPIFY_APP_URL?: string } };
const APP_URL = (
  typeof process !== "undefined" ? (process.env.SHOPIFY_APP_URL ?? "") : ""
).replace(/\/$/, "");

type Phase = "loading" | "ready" | "paid" | "expired" | "error";

interface State {
  phase: Phase;
  qrCodeImage?: string;
  amountText?: string;
  errorMessage?: string;
  orderId?: string;
}

export default extension(
  "purchase.checkout.block.render",
  (root, api) => {
    const shop = api.shop.myshopifyDomain;
    let state: State = { phase: "loading" };
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let pollExpiry = 0;

    function stopPolling() {
      if (pollTimer !== null) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    }

    function startPolling(orderId: string) {
      pollExpiry = Date.now() + 15 * 60 * 1000;

      function tick() {
        if (Date.now() >= pollExpiry) {
          stopPolling();
          update({ phase: "expired" });
          return;
        }

        fetch(
          `${APP_URL}/api/payment/status?orderId=${encodeURIComponent(orderId)}&shop=${encodeURIComponent(shop)}`
        )
          .then((r) => r.json() as Promise<{ status: string }>)
          .then(({ status }) => {
            if (status === "PAID") {
              stopPolling();
              update({ phase: "paid" });
            } else if (status === "EXPIRED") {
              stopPolling();
              update({ phase: "expired" });
            } else {
              pollTimer = setTimeout(tick, 3000);
            }
          })
          .catch(() => {
            pollTimer = setTimeout(tick, 3000);
          });
      }

      pollTimer = setTimeout(tick, 3000);
    }

    async function createQR() {
      stopPolling();
      update({ phase: "loading" });

      try {
        const checkoutToken = api.checkoutToken.current;
        const totalAmount = api.cost.totalAmount.current;
        const amount = totalAmount?.amount ?? "0";
        const currency = totalAmount?.currencyCode ?? "VND";

        const res = await fetch(`${APP_URL}/api/payment/create-qr`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: checkoutToken,
            amount,
            currency,
            shop,
          }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const { qrCodeImage } = (await res.json()) as { qrCodeImage: string };

        const amountText = new Intl.NumberFormat("vi-VN", {
          style: "currency",
          currency,
          minimumFractionDigits: 0,
        }).format(parseFloat(amount));

        update({
          phase: "ready",
          qrCodeImage,
          amountText,
          orderId: checkoutToken ?? undefined,
        });
        startPolling(checkoutToken!);
      } catch (err) {
        update({ phase: "error", errorMessage: String(err) });
      }
    }

    function update(newState: State) {
      state = newState;
      render(root);
    }

    function render(r: RootNode) {
      const children = buildUI();
      r.replaceChildren(...children);
    }

    function buildUI() {
      const stack = root.createComponent(BlockStack, { spacing: "base" });

      switch (state.phase) {
        case "loading": {
          const spinner = root.createComponent(Spinner, {});
          stack.appendChild(spinner);

          const loadingText = root.createComponent(Text, {
            appearance: "subdued",
          });
          loadingText.appendChild(root.createText("Đang tải mã QR thanh toán…"));
          stack.appendChild(loadingText);
          break;
        }

        case "ready": {
          const infoBanner = root.createComponent(Banner, {
            title: "Thanh toán bằng chuyển khoản ngân hàng",
            status: "info",
          });
          const instruction = root.createComponent(Text, {});
          instruction.appendChild(
            root.createText(
              "Quét mã QR bên dưới bằng ứng dụng ngân hàng của bạn. Trang sẽ tự động xác nhận sau khi thanh toán hoàn tất."
            )
          );
          infoBanner.appendChild(instruction);
          stack.appendChild(infoBanner);

          const center = root.createComponent(InlineStack, {
            inlineAlignment: "center",
            blockAlignment: "center",
          });
          const img = root.createComponent(Image, {
            source: `data:image/png;base64,${state.qrCodeImage}`,
            accessibilityDescription: "Mã QR thanh toán VietQR",
          });
          center.appendChild(img);
          stack.appendChild(center);

          const amountRow = root.createComponent(Text, { emphasis: "bold" });
          amountRow.appendChild(
            root.createText(`Số tiền cần thanh toán: ${state.amountText}`)
          );
          stack.appendChild(amountRow);

          const hint = root.createComponent(Text, { appearance: "subdued" });
          hint.appendChild(
            root.createText("Nội dung chuyển khoản đã được điền sẵn trong mã QR.")
          );
          stack.appendChild(hint);
          break;
        }

        case "paid": {
          const successBanner = root.createComponent(Banner, {
            title: "Thanh toán thành công!",
            status: "success",
          });
          const msg = root.createComponent(Text, {});
          msg.appendChild(
            root.createText(
              "Giao dịch của bạn đã được xác nhận. Đơn hàng sẽ được xử lý ngay."
            )
          );
          successBanner.appendChild(msg);
          stack.appendChild(successBanner);
          break;
        }

        case "expired": {
          const expiredBanner = root.createComponent(Banner, {
            title: "QR code đã hết hạn",
            status: "warning",
          });
          const expiredMsg = root.createComponent(Text, {});
          expiredMsg.appendChild(
            root.createText(
              "Mã QR có hiệu lực trong 15 phút. Vui lòng tạo mã mới để tiếp tục."
            )
          );
          expiredBanner.appendChild(expiredMsg);
          stack.appendChild(expiredBanner);

          const retryBtn = root.createComponent(Button, {
            kind: "secondary",
            onPress: () => void createQR(),
          });
          retryBtn.appendChild(root.createText("Tạo mã QR mới"));
          stack.appendChild(retryBtn);
          break;
        }

        case "error": {
          const errBanner = root.createComponent(Banner, {
            title: "Không thể tải mã QR",
            status: "critical",
          });
          const errMsg = root.createComponent(Text, {});
          errMsg.appendChild(
            root.createText(state.errorMessage ?? "Đã xảy ra lỗi không xác định.")
          );
          errBanner.appendChild(errMsg);
          stack.appendChild(errBanner);

          const retryBtn = root.createComponent(Button, {
            kind: "secondary",
            onPress: () => void createQR(),
          });
          retryBtn.appendChild(root.createText("Thử lại"));
          stack.appendChild(retryBtn);
          break;
        }
      }

      return [stack];
    }

    // Kick off on mount
    void createQR();
  }
);
