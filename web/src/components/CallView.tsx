import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Check,
  CircleStop,
  Mail,
  PhoneCall,
  RotateCcw,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { startCall } from "../lib/callAdapter";
import { cn } from "../lib/cn";
import { sendRetentionEmail } from "../lib/emailAdapter";
import type {
  CallAction,
  CallEvent,
  CallMetric,
  CallStateSnapshot,
  Customer,
  EmailAction,
  TranscriptLine,
} from "../product/types";
import { workflowById } from "../product/workflows";

interface CallViewProps {
  customer: Customer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEvent?: (event: CallEvent) => void;
}

const stateLabels = {
  agent_speaking: "Agent speaking",
  listening: "Listening",
  customer_speaking: "Customer speaking",
  thinking: "Reasoning",
  taking_action: "Taking action",
  completed: "Completed",
} as const;

const barrierLabels = {
  tracking_effort: "Tracking effort",
  accuracy: "Accuracy",
  price: "Price",
  missing_feature: "Missing feature",
  technical_issue: "Technical issue",
} as const;

const goalLabels: Record<Customer["goal"], string> = {
  lose_weight: "Lose weight",
  maintain_weight: "Maintain / eat healthier",
  eat_healthier: "Maintain / eat healthier",
  build_muscle: "Gain muscle / nutrition targets",
};

const PLAYBACK_SCALE = 0.42;

function formatTimer(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function CallView({ customer, open, onOpenChange, onEvent }: CallViewProps) {
  const reduceMotion = useReducedMotion();
  const [runId, setRunId] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [state, setState] = useState<CallStateSnapshot | null>(null);
  const [path, setPath] = useState<string[]>([]);
  const [actions, setActions] = useState<CallAction[]>([]);
  const [metrics, setMetrics] = useState<readonly CallMetric[]>([]);
  const [feedback, setFeedback] = useState<string>("");
  const [emailPending, setEmailPending] = useState(false);
  const simulationRef = useRef<ReturnType<typeof startCall> | null>(null);
  const timerRef = useRef<number | null>(null);

  const workflow = customer ? workflowById[customer.segment] : null;
  const nodeLabels = useMemo(
    () => new Map(workflow?.nodes.map((node) => [node.id, node.label]) ?? []),
    [workflow],
  );

  useEffect(() => {
    if (!open || !customer || !workflow) return;

    let disposed = false;
    const startedAt = Date.now();
    setElapsedMs(0);
    setTranscript([]);
    setState(null);
    setPath([]);
    setActions([]);
    setMetrics([]);
    setFeedback("");

    const timer = window.setInterval(() => {
      if (!disposed) setElapsedMs((Date.now() - startedAt) / PLAYBACK_SCALE);
    }, 250);
    timerRef.current = timer;

    const simulation = startCall(customer, (event) => {
      if (disposed) return;
      onEvent?.(event);
      setElapsedMs(event.elapsedMs);

      if (event.type === "transcript_update") {
        setTranscript((current) => [...current, event.transcript]);
      } else if (event.type === "call_started" || event.type === "state_updated") {
        setState(event.state);
        setPath((current) =>
          current.includes(event.state.activeNodeId)
            ? current
            : [...current, event.state.activeNodeId],
        );
      } else if (event.type === "workflow_node_entered") {
        setPath((current) =>
          current.includes(event.workflowNodeId)
            ? current
            : [...current, event.workflowNodeId],
        );
      } else if (event.type === "action_taken") {
        setActions((current) => [...current, event.action]);
        setFeedback(`${event.action.label} completed.`);
      } else if (event.type === "call_completed") {
        setState(event.state);
        setMetrics(event.metrics);
        setFeedback("Call completed and insight saved.");
      }
    });

    simulationRef.current = simulation;
    void simulation.finished.finally(() => {
      window.clearInterval(timer);
      timerRef.current = null;
    });

    return () => {
      disposed = true;
      window.clearInterval(timer);
      timerRef.current = null;
      simulation.stop();
      simulationRef.current = null;
    };
  }, [customer, onEvent, open, runId, workflow]);

  const emailAction = [...actions]
    .reverse()
    .find((action) => action.type === "send_email" && action.offer);

  async function handleEmail() {
    if (!customer || !emailAction?.offer || emailPending) return;
    const input: EmailAction = {
      customerId: customer.id,
      to: customer.email,
      subject: "Your Smartset restart plan",
      templateId: "smartset-restart-plan",
      offer: emailAction.offer,
      metadata: { campaign: "retention-restart", source: "call-view" },
    };
    setEmailPending(true);
    setFeedback("Sending follow-up email…");
    try {
      await sendRetentionEmail(input);
      setFeedback(`Follow-up email queued for ${customer.email}.`);
    } catch {
      setFeedback("Email could not be queued. Try again.");
    } finally {
      setEmailPending(false);
    }
  }

  function handleStop() {
    simulationRef.current?.stop();
    simulationRef.current = null;
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    setFeedback("Simulation ended. No external call was placed.");
  }

  const duration = reduceMotion ? 0 : 0.18;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && customer && workflow ? (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-slate-950/45"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount>
              <motion.section
                className="fixed inset-2 z-50 mx-auto flex max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-xl outline-none sm:inset-4"
                initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.99 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.99 }}
                transition={{ duration, ease: "easeOut" }}
              >
                <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="relative flex size-2" aria-hidden="true">
                        <span className="absolute inline-flex size-full rounded-full bg-emerald-400 opacity-60" />
                        <span className="relative inline-flex size-2 rounded-full bg-emerald-600" />
                      </span>
                      <Dialog.Title className="truncate text-balance text-sm font-semibold text-slate-950">
                        Live agent · {customer.name}
                      </Dialog.Title>
                    </div>
                    <Dialog.Description className="mt-0.5 truncate text-pretty text-xs text-slate-500">
                      Simulated playback of {workflow.title}
                    </Dialog.Description>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-sm font-semibold tabular-nums text-slate-800">
                      {formatTimer(elapsedMs)}
                    </span>
                    <Dialog.Close asChild>
                      <button
                        type="button"
                        className="size-9 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                        aria-label="Close call view"
                      >
                        <X aria-hidden="true" className="mx-auto size-4" />
                      </button>
                    </Dialog.Close>
                  </div>
                </header>

                <div className="border-b border-slate-200 bg-white px-5 py-3">
                  <p className="text-xs font-medium text-slate-500">Current workflow path</p>
                  <ol className="mt-2 flex gap-2 overflow-x-auto pb-1">
                    {path.length ? (
                      path.map((nodeId, index) => (
                        <li key={nodeId} className="flex shrink-0 items-center gap-2">
                          {index > 0 ? <span aria-hidden="true" className="text-slate-300">→</span> : null}
                          <span
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-xs font-medium",
                              index === path.length - 1
                                ? "border-blue-200 bg-blue-50 text-blue-800"
                                : "border-slate-200 bg-white text-slate-600",
                            )}
                          >
                            {nodeLabels.get(nodeId) ?? nodeId}
                          </span>
                        </li>
                      ))
                    ) : (
                      <li className="text-xs text-slate-400">Preparing call context…</li>
                    )}
                  </ol>
                </div>

                <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_340px]">
                  <section className="flex min-h-0 flex-col border-b border-slate-200 bg-white lg:border-b-0 lg:border-r" aria-labelledby="transcript-title">
                    <div className="border-b border-slate-100 px-5 py-3">
                      <h3 id="transcript-title" className="text-sm font-semibold text-slate-950">Transcript</h3>
                    </div>
                    <div className="flex-1 space-y-4 overflow-y-auto p-5" aria-live="polite" aria-relevant="additions">
                      {transcript.length ? (
                        transcript.map((line) => (
                          <motion.div
                            key={line.id}
                            initial={reduceMotion ? undefined : { opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: reduceMotion ? 0 : 0.15, ease: "easeOut" }}
                            className={cn("flex", line.speaker === "agent" ? "justify-start" : "justify-end")}
                          >
                            <div
                              className={cn(
                                "max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-6",
                                line.speaker === "agent"
                                  ? "bg-slate-100 text-slate-800"
                                  : "bg-blue-700 text-white",
                              )}
                            >
                              <p className="text-pretty">
                                {line.text.replaceAll("Ammar", customer.name.split(" ")[0])}
                              </p>
                              <p className={cn("mt-1 text-[11px] tabular-nums", line.speaker === "agent" ? "text-slate-400" : "text-blue-100")}>
                                {line.speaker === "agent" ? "AI agent" : customer.name.split(" ")[0]} · {formatTimer(line.elapsedMs)}
                              </p>
                            </div>
                          </motion.div>
                        ))
                      ) : (
                        <div className="flex min-h-48 flex-col items-center justify-center text-center">
                          <PhoneCall aria-hidden="true" className="size-7 text-slate-300" />
                          <p className="mt-3 text-pretty text-sm text-slate-500">Connecting the simulated call…</p>
                        </div>
                      )}
                    </div>
                  </section>

                  <aside className="min-h-0 overflow-y-auto p-4" aria-labelledby="agent-state-title">
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <h3 id="agent-state-title" className="text-sm font-semibold text-slate-950">Agent state</h3>
                        <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-800" role="status">
                          {state ? stateLabels[state.state] : "Starting"}
                        </span>
                      </div>
                      <dl className="mt-4 space-y-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-slate-500">Customer goal</dt>
                          <dd className="font-medium text-slate-900">
                            {state?.goalRelevant == null ? "Inferring" : goalLabels[customer.goal]}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-slate-500">Satisfaction</dt>
                          <dd className="font-medium tabular-nums text-slate-900">
                            {state?.barrier === "tracking_effort" ? "8 / 10" : "Unknown"}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-slate-500">Goal relevant</dt>
                          <dd className="font-medium text-slate-900">{state?.goalRelevant == null ? "Unknown" : state.goalRelevant ? "Yes" : "No"}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-slate-500">Primary barrier</dt>
                          <dd className="font-medium text-slate-900">{state?.barrier ? barrierLabels[state.barrier] : "Discovering"}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-slate-500">Re-engagement intent</dt>
                          <dd className="font-medium text-slate-900">
                            {state?.state === "completed" ? "High" : state?.barrier ? "Medium" : "Unknown"}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-slate-500">Confidence</dt>
                          <dd className="font-medium tabular-nums text-slate-900">
                            {state?.state === "completed" ? "94%" : state?.barrier ? "86%" : state ? "52%" : "—"}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <h3 className="text-sm font-semibold text-slate-950">Actions</h3>
                      {actions.length ? (
                        <ul className="mt-3 space-y-2">
                          {actions.map((action) => (
                            <li key={action.id} className="flex items-start gap-2 rounded-lg bg-slate-50 p-2.5 text-sm text-slate-700">
                              <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                              <span className="text-pretty">{action.label}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-pretty text-xs leading-5 text-slate-500">No action chosen yet. The agent is still gathering context.</p>
                      )}
                    </div>

                    {metrics.length ? (
                      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <h3 className="text-sm font-semibold text-slate-950">Outcome</h3>
                        <dl className="mt-3 space-y-2">
                          {metrics.map((metric) => (
                            <div key={metric.key} className="flex items-center justify-between gap-3 text-xs">
                              <dt className="text-slate-500">{metric.label}</dt>
                              <dd className="font-semibold tabular-nums text-slate-900">{String(metric.value)}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ) : null}
                  </aside>
                </div>

                <footer className="flex flex-col gap-3 border-t border-slate-200 bg-white px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="min-h-5 text-pretty text-xs text-slate-600" aria-live="polite">
                    {feedback || "Simulation only — no external phone call is placed."}
                  </p>
                  <div className="flex shrink-0 gap-2">
                    {emailAction ? (
                      <motion.button
                        type="button"
                        whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                        transition={{ duration: 0.12 }}
                        onClick={handleEmail}
                        disabled={emailPending}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                      >
                        <Mail aria-hidden="true" className="size-3.5" />
                        {emailPending ? "Sending…" : "Send follow-up"}
                      </motion.button>
                    ) : null}
                    <motion.button
                      type="button"
                      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                      transition={{ duration: 0.12 }}
                      onClick={() => setRunId((value) => value + 1)}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    >
                      <RotateCcw aria-hidden="true" className="size-3.5" /> Replay
                    </motion.button>
                    <motion.button
                      type="button"
                      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                      transition={{ duration: 0.12 }}
                      onClick={handleStop}
                      className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    >
                      <CircleStop aria-hidden="true" className="size-3.5" /> End simulation
                    </motion.button>
                  </div>
                </footer>
              </motion.section>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}
