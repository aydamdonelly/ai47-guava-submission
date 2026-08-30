import type { CallAnalysis, CallEvent, Customer } from "../product/types";

export type CallEventListener = (event: CallEvent) => void;

export interface CallSession {
  readonly callId: string | null;
  stop: () => void;
  finished: Promise<CallEvent>;
}

export interface LiveWorkflowRule {
  summary: string;
  offerLabel: string | null;
  offerMonths: number;
  condition: string;
}

interface LiveCallOptions {
  workflowRule?: LiveWorkflowRule;
}

interface RemoteCallStatus {
  callId: string;
  status: "starting" | "in_progress" | "completed" | "failed";
  events?: CallEvent[];
  nextCursor?: number;
}

const now = () => new Date().toISOString();

export function startCall(
  customer: Customer,
  onEvent: CallEventListener,
  options: LiveCallOptions = {},
): CallSession {
  const controller = new AbortController();
  let pollTimer: number | undefined;
  let stopped = false;
  let cursor = 0;
  let completionReceived = false;
  let remoteCallId: string | null = null;
  let resolveFinished: (event: CallEvent) => void = () => undefined;
  const finished = new Promise<CallEvent>((resolve) => {
    resolveFinished = resolve;
  });

  function handleFailure(error: unknown) {
    if (stopped || (error instanceof DOMException && error.name === "AbortError")) return;
    const failed: CallEvent = {
      type: "call_completed",
      timestamp: now(),
      elapsedMs: 0,
      message: error instanceof Error ? error.message : "Live call failed",
      state: { state: "completed", activeNodeId: "outbound_call", followUpDepth: 0 },
      metrics: [{ key: "status", label: "Call status", value: "Failed" }],
    };
    onEvent(failed);
    resolveFinished(failed);
  }

  async function poll(callId: string) {
    if (stopped) return;
    const response = await fetch(`/api/retention/calls/${callId}?cursor=${cursor}`, { signal: controller.signal });
    if (!response.ok) throw new Error("Could not read live call status");
    const payload = (await response.json()) as RemoteCallStatus;
    cursor = payload.nextCursor ?? cursor + (payload.events?.length ?? 0);
    for (const event of payload.events ?? []) {
      onEvent(event);
      if (event.type === "call_completed") {
        completionReceived = true;
        resolveFinished(event);
      }
    }
    if (completionReceived) return;
    if (payload.status === "completed") {
      const completed: CallEvent = {
        type: "call_completed",
        timestamp: now(),
        elapsedMs: 0,
        state: { state: "completed", activeNodeId: "capture", followUpDepth: 0 },
        metrics: [],
      };
      onEvent(completed);
      resolveFinished(completed);
      return;
    }
    if (payload.status === "failed") throw new Error("Guava call failed");
    pollTimer = window.setTimeout(() => void poll(callId).catch(handleFailure), 650);
  }

  void fetch("/api/retention/calls", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: controller.signal,
    body: JSON.stringify({
      customerId: customer.id,
      name: customer.name,
      plan: customer.plan,
      goal: customer.goal,
      baseline: customer.weeklyEvents.baseline,
      recent: customer.weeklyEvents.recent,
      daysInactive: customer.daysInactive,
      churnRisk: customer.churnRisk,
      workflowRule: options.workflowRule?.summary,
      offer:
        options.workflowRule?.offerLabel && options.workflowRule.offerMonths === 1
          ? {
              label: options.workflowRule.offerLabel,
              months: 1,
              condition: options.workflowRule.condition,
            }
          : undefined,
    }),
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(await response.text());
      return response.json() as Promise<{ callId: string }>;
    })
    .then(({ callId }) => {
      remoteCallId = callId;
      return poll(callId);
    })
    .catch(handleFailure);

  return {
    get callId() {
      return remoteCallId;
    },
    stop: () => {
      stopped = true;
      controller.abort();
      if (pollTimer !== undefined) window.clearTimeout(pollTimer);
    },
    finished,
  };
}

export const createLiveCall = startCall;

export async function analyzeCall(callId: string): Promise<CallAnalysis> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, attempt * 350));
    }
    try {
      const response = await fetch(`/api/retention/calls/${callId}/analysis`);
      if (response.status === 409 || response.status === 425) continue;
      if (!response.ok) throw new Error("Could not analyze the completed call");
      return (await response.json()) as CallAnalysis;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Call analysis failed");
    }
  }
  throw lastError ?? new Error("Call analysis failed");
}

export function receiveCallEvent(event: CallEvent, listener: CallEventListener) {
  listener(event);
}

export function finishCall(session: CallSession) {
  return session.finished;
}
