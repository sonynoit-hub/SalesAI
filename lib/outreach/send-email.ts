import {
  isGmailConfigured,
  isGmailConnected,
  sendMailWithGmail,
} from "@/lib/gmail/client";
import { SentEmailStatus } from "@/lib/generated/prisma/client";
import {
  isOutlookConfigured,
  isOutlookConnected,
  sendMailWithOutlook,
} from "@/lib/outlook/client";

export const deliveryProviders = ["manual", "gmail", "outlook"] as const;

export type DeliveryProvider = (typeof deliveryProviders)[number];

export type DeliveryOption = {
  id: DeliveryProvider;
  label: string;
  description: string;
  available: boolean;
};

export type SendOutboundEmailInput = {
  provider?: DeliveryProvider;
  toEmail: string;
  subject: string;
  body: string;
};

export type SendOutboundEmailResult = {
  provider: DeliveryProvider;
  status: SentEmailStatus;
  messageId?: string | null;
  errorMessage?: string | null;
};

export function getDefaultDeliveryProvider(): DeliveryProvider {
  return "manual";
}

export function getDeliveryOptions(): DeliveryOption[] {
  return [
    {
      id: "manual",
      label: "手動送信（記録のみ）",
      description:
        "外部で送った場合は、ここを選んで送信すると送信履歴とフォロータスクを残します。",
      available: true,
    },
    {
      id: "gmail",
      label: "Gmail",
      description: isGmailConfigured()
        ? isGmailConnected()
          ? "接続済みの Gmail アカウントから承認済み下書きを送信します。"
          : "Gmail の認証情報は設定済みです。送信前に Gmail OAuth 連携を完了してください。"
        : ".env.local に Google OAuth 情報を設定すると Gmail 送信を使えます。",
      available: isGmailConfigured() && isGmailConnected(),
    },
    {
      id: "outlook",
      label: "Outlook",
      description: isOutlookConfigured()
        ? isOutlookConnected()
          ? "接続済みの Microsoft 365 メールボックスから承認済み下書きを送信します。"
          : "Microsoft 認証情報を設定し、設定ページでメールボックス連携を完了してください。"
        : ".env.local に Microsoft アプリ認証情報を設定すると Outlook 送信を使えます。",
      available: isOutlookConfigured() && isOutlookConnected(),
    },
  ];
}

export async function sendOutboundEmail({
  provider = getDefaultDeliveryProvider(),
  toEmail,
  subject,
  body,
}: SendOutboundEmailInput): Promise<SendOutboundEmailResult> {
  if (provider === "manual") {
    return {
      provider,
      status: SentEmailStatus.SENT,
      messageId: null,
      errorMessage: null,
    };
  }

  if (provider === "outlook") {
    try {
      const result = await sendMailWithOutlook({
        toEmail,
        subject,
        body,
      });

      return {
        provider,
        status: SentEmailStatus.SENT,
        messageId: result.messageId,
        errorMessage: null,
      };
    } catch (error) {
      return {
        provider,
        status: SentEmailStatus.FAILED,
        messageId: null,
        errorMessage:
          error instanceof Error
            ? error.message
            : "Outlook sending failed.",
      };
    }
  }

  if (provider === "gmail") {
    try {
      const result = await sendMailWithGmail({
        toEmail,
        subject,
        body,
      });

      return {
        provider,
        status: SentEmailStatus.SENT,
        messageId: result.messageId,
        errorMessage: null,
      };
    } catch (error) {
      return {
        provider,
        status: SentEmailStatus.FAILED,
        messageId: null,
        errorMessage:
          error instanceof Error ? error.message : "Gmail sending failed.",
      };
    }
  }

  throw new Error(`Unsupported delivery provider: ${provider satisfies never}`);
}
