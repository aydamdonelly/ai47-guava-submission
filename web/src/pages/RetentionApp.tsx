import { useCallback, useMemo, useRef, useState } from "react";
import { Bot, CheckCircle2, GitBranch, PhoneCall, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { AgentChecksPanel, AgentStatePanel, ChatFencerPanel, NodeDetailsPanel } from "../components/AgentInspectors";
import type { AgentCheck, AgentState } from "../components/AgentInspectors";
import { CallsView } from "../components/CallsView";
import type { LiveCallRecord } from "../components/CallsView";
import { ChatWorkspace } from "../components/ChatWorkspace";
import type { WorkflowRunStage } from "../components/ChatWorkspace";
import { CustomerDrawer } from "../components/CustomerDrawer";
import { CustomerTable } from "../components/CustomerTable";
import { InsightsView } from "../components/InsightsView";
import { Sidebar } from "../components/Sidebar";
import type { AppView, WorkflowId } from "../components/Sidebar";
import { WorkflowCanvas } from "../components/WorkflowCanvas";
import { analyzeCall, startCall } from "../lib/callAdapter";
import { cn } from "../lib/cn";
import { ammarCustomer, smartsetCustomers } from "../product/fixtures";
import type {
  CallAnalysis,
  CallAnalysisBarrier,
  CallEvent,
  CallStateSnapshot,
  CompletedCallRecord,
  Customer,
  CustomerGoal,
  EngineBarrierCode,
  TranscriptLine,
  Workflow,
} from "../product/types";
import { workflowById } from "../product/workflows";

type InspectorTab = "state" | "checks" | "fencer" | "decision" | "node";

const fencerRules: readonly AgentCheck[] = [
  { label: "Never shame the customer", passed: true },
  { label: "Never pressure the customer to continue", passed: true },
  { label: "Do not provide medical advice or unsafe diet claims", passed: true },
  { label: "Do not invent product capabilities", passed: true },
  { label: "Only offer discounts allowed by this workflow", passed: true },
  { label: "Respect explicit opt-out immediately", passed: true },
  { label: "Stop retention after a clear rejection", passed: true },
  { label: "Route eating-disorder or unsafe-diet language to human review", passed: true },
];

const followUps = [
  "Run this on the highest-risk users",
  "Change the retention offer",
  "Review recent call insights",
];

const branchLabels: Record<CallAnalysisBarrier, string> = {
  habit: "Habit / busy",
  product: "Product frustration",
  price: "Price",
  value: "Low perceived value",
  alternative: "Alternative",
  goal_changed: "Goal changed",
  other: "Other",
};

const customerBarrierByAnalysis: Partial<
  Record<CallAnalysisBarrier, Customer["primaryBarrier"]>
> = {
  habit: "tracking_effort",
  product: "technical_issue",
  price: "price",
  value: "missing_feature",
};

function analysisBarrierFromEngine(barrier?: EngineBarrierCode): CallAnalysisBarrier {
  if (barrier === "tracking_effort") return "habit";
  if (barrier === "accuracy" || barrier === "technical_issue") return "product";
  if (barrier === "price") return "price";
  if (barrier === "missing_feature") return "value";
  if (barrier === "goal_changed") return "goal_changed";
  return "other";
}

function fallbackAnalysis(
  state: Partial<CallStateSnapshot>,
  transcript: readonly TranscriptLine[],
  outcome: string,
): CallAnalysis {
  const primaryBarrier = analysisBarrierFromEngine(state.barrier);
  const reasonLabel = branchLabels[primaryBarrier];
  const customerGoal = typeof state.customerGoal === "string" && state.customerGoal.trim()
    ? state.customerGoal.trim()
    : "Not captured";
  const customerLines = transcript.filter((line) => line.speaker === "customer" && line.text.length > 8);
  const keyQuote = customerLines.sort((a, b) => b.text.length - a.text.length)[0]?.text ?? null;
  return {
    summary: `The customer described ${reasonLabel.toLowerCase()} as the main barrier while working toward ${customerGoal}.`,
    customerGoal,
    goalRelevant: state.goalRelevant ?? null,
    primaryBarrier,
    reasonLabel,
    competitor: null,
    keyQuote,
    returnIntent: state.reengagementIntent ?? "unknown",
    outcome,
    emergingInsight: `${reasonLabel} is an additional churn signal worth tracking across future calls.`,
  };
}

function goalFromAnalysis(current: CustomerGoal, goal: string): CustomerGoal {
  const normalized = goal.toLowerCase();
  if (/muscle|protein|strength|bulk/.test(normalized)) return "build_muscle";
  if (/maintain|stay.*weight/.test(normalized)) return "maintain_weight";
  if (/health|better.*eat|nutrition/.test(normalized)) return "eat_healthier";
  if (/lose|weight|slim/.test(normalized)) return "lose_weight";
  return current;
}

function DecisionEnginePanel() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex size-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600">
          <Bot aria-hidden="true" className="size-4" />
        </span>
        <div>
          <h2 className="text-balance text-sm font-semibold text-slate-950">Agent Decision Engine</h2>
          <p className="mt-0.5 text-pretty text-xs text-slate-500">
            Continuous state inference, not a rigid survey.
          </p>
        </div>
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-700">
        {[
          "Updates customer state",
          "Finds information gaps",
          "Chooses highest-value action",
          "Avoids premature offers",
          "Can ask, solve, offer, pause",
          "Can escalate or exit",
        ].map((item) => (
          <li key={item} className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-blue-600" />
            <span className="text-pretty">{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RetentionApp() {
  const [view, setView] = useState<AppView>("analysis");
  const [workflowId, setWorkflowId] = useState<WorkflowId>("churn");
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>();
  const [activeNodeId, setActiveNodeId] = useState<string | undefined>();
  const [emphasizedNodeId, setEmphasizedNodeId] = useState<string | undefined>();
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("state");
  const [commandConfirmation, setCommandConfirmation] = useState<string>();
  const [workflowRule, setWorkflowRule] = useState<{
    summary: string;
    offerLabel: string | null;
    offerMonths: number;
    condition: string;
  }>();
  const [runStage, setRunStage] = useState<WorkflowRunStage>("idle");
  const [agentState, setAgentState] = useState<AgentState>({});
  const [customers, setCustomers] = useState<readonly Customer[]>(smartsetCustomers);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [latestCall, setLatestCall] = useState<LiveCallRecord>();
  const [liveCalls, setLiveCalls] = useState<readonly CompletedCallRecord[]>([]);
  const activeCallCustomerRef = useRef<Customer | null>(null);
  const callSessionRef = useRef<ReturnType<typeof startCall> | null>(null);
  const activeTranscriptRef = useRef<TranscriptLine[]>([]);
  const activeStateRef = useRef<Partial<CallStateSnapshot>>({});
  const activeOutcomeRef = useRef("Insight saved");
  const activeStartedAtRef = useRef("");

  const workflow = useMemo<Workflow>(() => {
    const base = workflowById[workflowId];
    if (!workflowRule || workflowId !== "churn") {
      return workflowId === "churn"
        ? {
            ...base,
            nodes: base.nodes.filter((node) => node.id !== "offer"),
            edges: base.edges.filter((edge) => edge.source !== "offer" && edge.target !== "offer"),
          }
        : base;
    }
    const offerNode = base.nodes.find((node) => node.id === "offer");
    const hasOffer = workflowRule.offerMonths === 1 && Boolean(workflowRule.offerLabel);
    return {
      ...base,
      nodes: base.nodes
        .map((node) =>
          node.id === "price_causal"
            ? {
                ...node,
                prompt: workflowRule.condition,
                subtitle: workflowRule.condition,
                details: ["Added by natural-language edit", workflowRule.summary],
              }
            : node.id === "offer" && offerNode
              ? {
                  ...node,
                  label: workflowRule.offerLabel ?? "Configured retention action",
                  title: workflowRule.offerLabel ?? "Configured retention action",
                  prompt: `${workflowRule.offerMonths} month offer · email after acceptance`,
                  subtitle: `${workflowRule.offerMonths} month offer · email after acceptance`,
                }
              : node,
        )
        .filter((node) => hasOffer || node.id !== "offer"),
      edges: hasOffer
        ? base.edges
        : base.edges.filter((edge) => edge.source !== "offer" && edge.target !== "offer"),
    };
  }, [workflowId, workflowRule]);

  const selectedNode = workflow.nodes.find((node) => node.id === selectedNodeId) ?? null;

  function chooseWorkflow(id: WorkflowId) {
    setWorkflowId(id);
    setView("analysis");
    setCommandConfirmation(undefined);
    setWorkflowRule(undefined);
    setRunStage("idle");
    setEmphasizedNodeId(undefined);
    setActiveNodeId(undefined);
    setSelectedNodeId(undefined);
    setAgentState({});
    setInspectorTab("decision");
  }

  async function runCommand(command: string) {
    setCommandConfirmation("Smartset AI is updating the workflow…");
    try {
      const response = await fetch("/api/retention/workflows/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: command }),
      });
      if (!response.ok) throw new Error("Workflow AI unavailable");
      const rule = (await response.json()) as {
        summary: string;
        offerLabel: string | null;
        offerMonths: number;
        condition: string;
      };
      setWorkflowId("churn");
      setWorkflowRule(rule);
      setCommandConfirmation(rule.summary);
      const changedNodeId = rule.offerMonths === 1 && rule.offerLabel ? "offer" : "price_causal";
      setEmphasizedNodeId(changedNodeId);
      setSelectedNodeId(changedNodeId);
      setInspectorTab("node");
    } catch {
      setCommandConfirmation("The workflow AI could not apply that change. Check the local API connection and try again.");
    }
  }

  function openCustomer(customer: Customer) {
    setSelectedCustomer(customer);
    setDrawerOpen(true);
  }

  function startCustomerCall(customer: Customer) {
    if (callSessionRef.current) return;
    activeCallCustomerRef.current = customer;
    activeTranscriptRef.current = [];
    activeStateRef.current = {};
    activeOutcomeRef.current = "Insight saved";
    activeStartedAtRef.current = new Date().toISOString();
    setDrawerOpen(false);
    setWorkflowId("churn");
    setView("analysis");
    setActiveNodeId("select_users");
    setRunStage("select_users");
    setAgentState({});
    setInspectorTab("state");

    const session = startCall(customer, onCallEvent, { workflowRule });
    callSessionRef.current = session;
    void session.finished.finally(() => {
      if (callSessionRef.current === session) callSessionRef.current = null;
    });
  }

  const onCallEvent = useCallback((event: CallEvent) => {
    if (event.type === "transcript_update") {
      activeTranscriptRef.current = [...activeTranscriptRef.current, event.transcript];
    }
    if (event.type === "workflow_node_entered") {
      setActiveNodeId(event.workflowNodeId);
      if (event.workflowNodeId === "select_users") setRunStage("select_users");
      if (event.workflowNodeId === "outbound_call") setRunStage("calling");
    }
    if (event.type === "call_started") {
      activeStartedAtRef.current = event.timestamp;
      activeStateRef.current = { ...activeStateRef.current, ...event.state };
      setActiveNodeId(event.state.activeNodeId);
      setRunStage("calling");
      setLatestCall({
        name: activeCallCustomerRef.current?.name ?? "Sample customer",
        status: "In progress",
        branch: "Listening",
        outcome: "Live conversation",
        duration: "00:00",
        started: "just now",
      });
    }
    if (event.type === "state_updated" || event.type === "call_completed") {
      const snapshot = event.state;
      activeStateRef.current = { ...activeStateRef.current, ...snapshot };
      const failed = event.type === "call_completed" && event.metrics.some((metric) => metric.value === "Failed");
      if (failed) {
        setActiveNodeId(undefined);
        setRunStage("idle");
      } else {
        setActiveNodeId(snapshot.activeNodeId);
        setAgentState((current) => ({
          ...current,
          ...(snapshot.customerGoal !== undefined ? { customerGoal: snapshot.customerGoal } : {}),
          ...(snapshot.satisfaction !== undefined ? { satisfaction: snapshot.satisfaction } : {}),
          ...(snapshot.goalRelevance !== undefined
            ? { goalRelevance: snapshot.goalRelevance }
            : snapshot.goalRelevant !== undefined
              ? { goalRelevance: snapshot.goalRelevant ? "Relevant" : "Not relevant" }
              : {}),
          ...(snapshot.primaryBarrier !== undefined
            ? { primaryBarrier: snapshot.primaryBarrier }
            : snapshot.barrier !== undefined
              ? { primaryBarrier: snapshot.barrier }
              : {}),
          ...(snapshot.reengagementIntent !== undefined
            ? { reengagementIntent: snapshot.reengagementIntent }
            : {}),
          ...(snapshot.priceSensitivity !== undefined
            ? { priceSensitivity: snapshot.priceSensitivity }
            : snapshot.priceIsRootCause !== undefined
              ? { priceSensitivity: snapshot.priceIsRootCause ? "root_cause" : "symptom" }
              : {}),
          ...(snapshot.productIssue !== undefined ? { productIssue: snapshot.productIssue } : {}),
          ...(snapshot.confidence !== undefined ? { confidence: snapshot.confidence } : {}),
        }));
      }
      if (snapshot.barrier) {
        const branchByBarrier = {
          tracking_effort: "Habit / busy",
          accuracy: "Product frustration",
          price: "Price",
          missing_feature: "Low perceived value",
          technical_issue: "Product frustration",
          privacy: "Privacy",
          goal_changed: "Goal changed",
          other: "Other",
          unknown: "Discovering",
        } as const;
        setLatestCall((current) => current ? { ...current, branch: branchByBarrier[snapshot.barrier!] } : current);
      }
    }
    if (event.type === "action_taken") {
      activeOutcomeRef.current = event.action.label;
      setLatestCall((current) => current ? { ...current, outcome: event.action.label } : current);
    }
    const callCustomer = activeCallCustomerRef.current;
    if (event.type === "call_completed" && callCustomer) {
      const failed = event.metrics.some((metric) => metric.value === "Failed");
      const callId = callSessionRef.current?.callId ?? `local-${Date.now()}`;
      const transcript = [...activeTranscriptRef.current];
      const finalState = { ...activeStateRef.current };
      const startedAt = activeStartedAtRef.current || event.timestamp;
      const outcome = failed ? "Call could not connect" : activeOutcomeRef.current;
      const duration = `${String(Math.floor(event.elapsedMs / 60_000)).padStart(2, "0")}:${String(Math.floor(event.elapsedMs / 1_000) % 60).padStart(2, "0")}`;
      setRunStage("idle");
      setLatestCall((current) => current ? {
        ...current,
        status: failed ? "Failed" : "Completed",
        outcome,
        duration,
      } : current);

      void (async () => {
        let analysis = fallbackAnalysis(finalState, transcript, outcome);
        if (!failed && !callId.startsWith("local-")) {
          try {
            analysis = await analyzeCall(callId);
          } catch {
            // The live event data still produces a truthful recap if analysis is unavailable.
          }
        }
        const record: CompletedCallRecord = {
          id: callId,
          customerId: callCustomer.id,
          name: callCustomer.name,
          status: failed ? "Failed" : "Completed",
          branch: branchLabels[analysis.primaryBarrier],
          outcome: analysis.outcome || outcome,
          duration,
          started: "just now",
          startedAt,
          transcript,
          analysis,
        };
        setLiveCalls((current) => [record, ...current.filter((item) => item.id !== record.id)]);
        setLatestCall(undefined);

        const customerBarrier = customerBarrierByAnalysis[analysis.primaryBarrier];
        setCustomers((current) =>
          current.map((customer) =>
            customer.id === callCustomer.id
              ? {
                  ...customer,
                  goal: goalFromAnalysis(customer.goal, analysis.customerGoal),
                  ...(customerBarrier ? { primaryBarrier: customerBarrier } : {}),
                  interactions: [
                    {
                      id: `${customer.id}-${record.id}`,
                      type: "call",
                      at: event.timestamp,
                      summary: analysis.summary,
                      outcome: analysis.outcome || outcome,
                    },
                    ...customer.interactions,
                  ],
                }
              : customer,
          ),
        );
      })();
    }
  }, []);

  const inspectorTabs: Array<{ id: InspectorTab; label: string; icon: typeof Bot }> = [
    { id: "state", label: "Agent state", icon: SlidersHorizontal },
    { id: "decision", label: "Decision engine", icon: GitBranch },
    { id: "checks", label: "Checks", icon: ShieldCheck },
    { id: "fencer", label: "Chat Fencer", icon: Bot },
  ];

  return (
    <div className="flex h-dvh overflow-hidden bg-white text-slate-950">
      <Sidebar
        view={view}
        workflowId={workflowId}
        onViewChange={setView}
        onWorkflowChange={chooseWorkflow}
        onAddWorkflow={() => {
          setView("analysis");
          setRunStage("idle");
          setCommandConfirmation("New workflow ready. Describe the cohort and desired outcome below.");
          setActiveNodeId(undefined);
          setSelectedNodeId(undefined);
          setAgentState({});
        }}
      />

      {view === "analysis" && (
        <main className="flex min-w-0 flex-1 overflow-hidden">
          <div className="flex min-w-0 basis-[43%] border-r border-slate-200">
            <ChatWorkspace
              workflowId={workflowId}
              request={workflow.founderRequest}
              response={workflow.assistantResponse}
              followUps={followUps}
              commandConfirmation={commandConfirmation}
              onWorkflowSelect={chooseWorkflow}
              onCommand={runCommand}
              stage={runStage}
              selectedTestCustomer={ammarCustomer}
              onCall={startCustomerCall}
              onFollowUp={(index) => {
                if (index === 0) setView("customers");
                if (index === 1) runCommand("Only offer a free month if price is the actual problem");
                if (index === 2) setView("insights");
              }}
            />
          </div>

          <aside className="flex min-w-0 flex-1 flex-col bg-slate-50/60">
            <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-slate-950 text-white">
                  <GitBranch aria-hidden="true" className="size-3.5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-950">Agent workflow</p>
                  <p className="text-[11px] text-slate-500">Continuous state → next best action</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => startCustomerCall(ammarCustomer)}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800"
              >
                <PhoneCall aria-hidden="true" className="size-3.5" />
                Call Ammar
              </button>
            </header>

            <div className="min-h-0 flex-1 p-3">
              <WorkflowCanvas
                workflow={workflow}
                activeNodeId={activeNodeId}
                emphasizedNodeId={emphasizedNodeId}
                selectedNodeId={selectedNodeId}
                onNodeSelect={(id) => {
                  setSelectedNodeId(id);
                  setInspectorTab("node");
                }}
              />
            </div>

            <div className="h-64 shrink-0 border-t border-slate-200 bg-white">
              <div className="flex h-11 items-center gap-1 border-b border-slate-200 px-3">
                {inspectorTabs.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setInspectorTab(id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium",
                      inspectorTab === id
                        ? "bg-slate-100 text-slate-950"
                        : "text-slate-500 hover:text-slate-900",
                    )}
                  >
                    <Icon aria-hidden="true" className="size-3.5" />
                    {label}
                  </button>
                ))}
                {selectedNode && (
                  <button
                    type="button"
                    onClick={() => setInspectorTab("node")}
                    className={cn(
                      "ml-auto max-w-44 truncate rounded-md px-2.5 py-1.5 text-xs font-medium",
                      inspectorTab === "node"
                        ? "bg-blue-50 text-blue-700"
                        : "text-slate-500 hover:text-slate-900",
                    )}
                  >
                    {selectedNode.label}
                  </button>
                )}
              </div>
              <div className="h-[calc(100%-2.75rem)] overflow-y-auto p-3">
                {inspectorTab === "state" && <AgentStatePanel state={agentState} />}
                {inspectorTab === "decision" && <DecisionEnginePanel />}
                {inspectorTab === "checks" && <AgentChecksPanel checks={[]} />}
                {inspectorTab === "fencer" && <ChatFencerPanel checks={fencerRules} />}
                {inspectorTab === "node" && <NodeDetailsPanel node={selectedNode} />}
              </div>
            </div>
          </aside>
        </main>
      )}

      {view === "customers" && (
        <main className="min-w-0 flex-1 overflow-y-auto bg-slate-50 p-7">
          <div className="mx-auto max-w-7xl">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-blue-600">Customer intelligence</p>
                <h1 className="mt-1 text-balance text-2xl font-semibold">Customers</h1>
                <p className="mt-2 text-pretty text-sm text-slate-500">
                  Subscription, behavior, and voice context in one place.
                </p>
              </div>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
                100 customer profiles
              </span>
            </div>
            <CustomerTable customers={customers} onSelect={openCustomer} onCall={startCustomerCall} />
          </div>
        </main>
      )}

      {view === "calls" && (
        <CallsView
          onStartCall={() => startCustomerCall(ammarCustomer)}
          liveCalls={liveCalls}
          currentCall={latestCall}
        />
      )}

      {view === "insights" && (
        <main className="min-w-0 flex-1 overflow-y-auto bg-slate-50 p-7">
          <div className="mx-auto max-w-7xl">
            <InsightsView customers={customers} liveCalls={liveCalls} />
          </div>
        </main>
      )}

      <CustomerDrawer
        customer={selectedCustomer}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onCall={startCustomerCall}
      />

    </div>
  );
}
