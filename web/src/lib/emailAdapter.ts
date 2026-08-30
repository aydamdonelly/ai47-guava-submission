import type { EmailAction } from "../product/types";

export interface EmailDelivery {
  id: string;
  status: "sent" | "demo_sent";
  recipient: string;
  provider: "configured_endpoint" | "demo_adapter";
}

const endpoint = import.meta.env.VITE_EMAIL_ACTION_ENDPOINT as string | undefined;

export async function sendRetentionEmail(action: EmailAction): Promise<EmailDelivery> {
  if (endpoint) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    });
    if (!response.ok) throw new Error("Email delivery failed");
    const payload = (await response.json()) as { id?: string };
    return {
      id: payload.id ?? `email-${action.customerId}`,
      status: "sent",
      recipient: action.to,
      provider: "configured_endpoint",
    };
  }

  await new Promise((resolve) => window.setTimeout(resolve, 320));
  return {
    id: `demo-email-${action.customerId}`,
    status: "demo_sent",
    recipient: action.to,
    provider: "demo_adapter",
  };
}

export const emailAdapter = { send: sendRetentionEmail };
