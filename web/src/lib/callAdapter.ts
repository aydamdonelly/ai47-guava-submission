import type { CallAction, CallEvent, Customer, TranscriptLine } from "../product/types";

export type CallEventListener = (event: CallEvent) => void;

export interface CallSession {
  stop: () => void;
  finished: Promise<CallEvent>;
}

const START = Date.UTC(2026, 7, 29, 19, 45);

function transcript(
  id: string,
  speaker: TranscriptLine["speaker"],
  text: string,
  elapsedMs: number,
): CallEvent {
  return {
    type: "transcript_update",
    timestamp: new Date(START + elapsedMs).toISOString(),
    elapsedMs,
    transcript: { id, speaker, text, elapsedMs },
  };
}

const restartAction: CallAction = {
  id: "send-restart-plan",
  type: "send_email",
  label: "Simple restart plan emailed",
  status: "completed",
  offer: {
    code: "SMARTSTART",
    label: "Personalized 3-day restart plan",
    discountPercent: 0,
    durationDays: 3,
    expiresAt: "2026-09-05T23:59:59Z",
  },
  metadata: { deepLink: "smartset://restart", reminderEnabled: true },
};

function scriptedEvents(customer: Customer): readonly CallEvent[] {
  return [
    {
      type: "call_started",
      timestamp: new Date(START).toISOString(),
      elapsedMs: 0,
      customerId: customer.id,
      workflowId: "churn",
      state: { state: "agent_speaking", activeNodeId: "outbound_call", followUpDepth: 0 },
    },
    transcript("t1", "agent", "Hi Ammar, this is Ava, an AI assistant calling for Smartset. This call may be transcribed. Is now a good time for a quick two-minute check-in?", 250),
    transcript("t2", "customer", "Sure, that's fine.", 3_100),
    { type: "workflow_node_entered", timestamp: new Date(START + 4_000).toISOString(), elapsedMs: 4_000, workflowNodeId: "infer_goal" },
    transcript("t3", "agent", "When you first joined Smartset, what were you hoping it would help you achieve?", 4_200),
    transcript("t4", "customer", "I wanted to lose some weight and get consistent with tracking again.", 7_600),
    { type: "state_updated", timestamp: new Date(START + 8_200).toISOString(), elapsedMs: 8_200, state: { state: "thinking", activeNodeId: "infer_goal", goalRelevant: true, followUpDepth: 0 } },
    { type: "workflow_node_entered", timestamp: new Date(START + 9_200).toISOString(), elapsedMs: 9_200, workflowNodeId: "goal_relevant" },
    transcript("t5", "agent", "Is losing weight still something you're actively working toward?", 9_500),
    transcript("t6", "customer", "Yeah, definitely. I actually liked the app, I've just been super busy recently.", 12_800),
    { type: "state_updated", timestamp: new Date(START + 13_400).toISOString(), elapsedMs: 13_400, state: { state: "thinking", activeNodeId: "identify_barrier", goalRelevant: true, barrier: "tracking_effort", followUpDepth: 0 } },
    { type: "workflow_node_entered", timestamp: new Date(START + 14_300).toISOString(), elapsedMs: 14_300, workflowNodeId: "habit" },
    transcript("t7", "agent", "It sounds like Smartset still works for you, but the habit got interrupted. Would a simple three-day restart plan and a direct link back into tracking help?", 14_600),
    transcript("t8", "customer", "Yes, that would actually be useful.", 18_000),
    { type: "workflow_node_entered", timestamp: new Date(START + 18_700).toISOString(), elapsedMs: 18_700, workflowNodeId: "restart" },
    { type: "action_taken", timestamp: new Date(START + 20_000).toISOString(), elapsedMs: 20_000, action: restartAction },
    transcript("t9", "agent", "Done. I've sent the restart plan and Smartset link by email. Thanks for the feedback, Ammar.", 20_500),
    { type: "workflow_node_entered", timestamp: new Date(START + 22_000).toISOString(), elapsedMs: 22_000, workflowNodeId: "capture" },
    {
      type: "call_completed",
      timestamp: new Date(START + 23_000).toISOString(),
      elapsedMs: 23_000,
      state: { state: "completed", activeNodeId: "capture", goalRelevant: true, barrier: "tracking_effort", followUpDepth: 0 },
      metrics: [
        { key: "goal", label: "Customer goal", value: "Lose weight" },
        { key: "barrier", label: "Primary barrier", value: "Habit broken" },
        { key: "outcome", label: "Outcome", value: "Likely reactivation" },
      ],
    },
  ];
}

export function startCall(customer: Customer, onEvent: CallEventListener): CallSession {
  const events = scriptedEvents(customer);
  const timers: number[] = [];
  let resolveFinished: (event: CallEvent) => void = () => undefined;
  const finished = new Promise<CallEvent>((resolve) => {
    resolveFinished = resolve;
  });

  for (const event of events) {
    const timer = window.setTimeout(() => {
      onEvent(event);
      if (event.type === "call_completed") resolveFinished(event);
    }, Math.max(0, event.elapsedMs * 0.42));
    timers.push(timer);
  }

  return {
    stop: () => timers.forEach((timer) => window.clearTimeout(timer)),
    finished,
  };
}

export const createDemoCall = startCall;

export function receiveCallEvent(event: CallEvent, listener: CallEventListener) {
  listener(event);
}

export function finishCall(session: CallSession) {
  return session.finished;
}
