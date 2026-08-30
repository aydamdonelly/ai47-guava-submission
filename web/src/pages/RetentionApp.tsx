import { useCallback, useMemo, useState } from "react";
import { Bot, CheckCircle2, GitBranch, PhoneCall, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { AgentChecksPanel, AgentStatePanel, ChatFencerPanel, NodeDetailsPanel } from "../components/AgentInspectors";
import type { AgentCheck, AgentState } from "../components/AgentInspectors";
import { CallsView } from "../components/CallsView";
import { CallView } from "../components/CallView";
import { ChatWorkspace } from "../components/ChatWorkspace";
import { CustomerDrawer } from "../components/CustomerDrawer";
import { CustomerTable } from "../components/CustomerTable";
import { InsightsView } from "../components/InsightsView";
import { Sidebar } from "../components/Sidebar";
import type { AppView, WorkflowId } from "../components/Sidebar";
import { WorkflowCanvas } from "../components/WorkflowCanvas";
import { cn } from "../lib/cn";
import { ammarCustomer, smartsetCustomers } from "../product/fixtures";
import type { CallEvent, Customer, Workflow } from "../product/types";
import { workflowById } from "../product/workflows";

type InspectorTab = "state" | "checks" | "fencer" | "decision" | "node";

const initialState: AgentState = {
  customerGoal: "Lose weight",
  satisfaction: "7 / 10",
  goalRelevance: "High",
  primaryBarrier: "Habit broken",
  reengagementIntent: "Medium",
  priceSensitivity: "Low",
  productIssue: "None detected",
  confidence: 0.86,
};

const completedChecks: readonly AgentCheck[] = [
  { label: "Original goal identified", passed: true },
  { label: "Root cause identified", passed: true },
  { label: "No premature incentive offered", passed: true },
  { label: "Customer intent understood", passed: true },
  { label: "Correct branch selected", passed: true },
  { label: "Next action completed", passed: true },
  { label: "Opt-out respected", passed: true },
  { label: "Structured outcome saved", passed: true },
];

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
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>("identify_barrier");
  const [activeNodeId, setActiveNodeId] = useState<string | undefined>("habit");
  const [emphasizedNodeId, setEmphasizedNodeId] = useState<string | undefined>();
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("state");
  const [commandConfirmation, setCommandConfirmation] = useState<string>();
  const [agentState, setAgentState] = useState<AgentState>(initialState);
  const [customers, setCustomers] = useState<readonly Customer[]>(smartsetCustomers);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [callCustomer, setCallCustomer] = useState<Customer | null>(null);
  const [callOpen, setCallOpen] = useState(false);

  const workflow = useMemo<Workflow>(() => {
    const base = workflowById[workflowId];
    if (!commandConfirmation || workflowId !== "churn") return base;
    return {
      ...base,
      nodes: base.nodes.map((node) =>
        node.id === "price_causal"
          ? {
              ...node,
              prompt: "Only offer 1 free month when price is confirmed as the root cause",
              subtitle: "Only offer 1 free month when price is confirmed as the root cause",
              details: [
                ...(node.details ?? []),
                "Natural-language rule added just now",
                "Approved code: SMARTSET30",
              ],
            }
          : node,
      ),
    };
  }, [commandConfirmation, workflowId]);

  const selectedNode = workflow.nodes.find((node) => node.id === selectedNodeId) ?? null;

  function chooseWorkflow(id: WorkflowId) {
    setWorkflowId(id);
    setView("analysis");
    setCommandConfirmation(undefined);
    setEmphasizedNodeId(undefined);
    setActiveNodeId(undefined);
    setSelectedNodeId(workflowById[id].nodes[0]?.id);
    setInspectorTab("decision");
  }

  function runCommand(command: string) {
    const normalized = command.toLowerCase();
    if (normalized.includes("free month") || normalized.includes("price")) {
      setWorkflowId("churn");
      setCommandConfirmation(
        "Updated the Price branch: a free month is offered only after the agent confirms that price is the actual blocker. The approved code is emailed after verbal acceptance.",
      );
      setEmphasizedNodeId("price_causal");
      setSelectedNodeId("price_causal");
      setInspectorTab("node");
      return;
    }
    setCommandConfirmation(
      `Applied “${command}” to the active workflow. The decision engine will use it on the next call.`,
    );
    setEmphasizedNodeId(workflow.nodes[0]?.id);
  }

  function openCustomer(customer: Customer) {
    setSelectedCustomer(customer);
    setDrawerOpen(true);
  }

  function startCustomerCall(customer: Customer) {
    setCallCustomer(customer);
    setCallOpen(true);
    setWorkflowId("churn");
    setView("analysis");
    setActiveNodeId("outbound_call");
    setInspectorTab("state");
  }

  const onCallEvent = useCallback((event: CallEvent) => {
    if (event.type === "workflow_node_entered") setActiveNodeId(event.workflowNodeId);
    if (event.type === "call_started") setActiveNodeId(event.state.activeNodeId);
    if (event.type === "state_updated" || event.type === "call_completed") {
      const snapshot = event.state;
      setActiveNodeId(snapshot.activeNodeId);
      setAgentState((current) => ({
        ...current,
        customerGoal: snapshot.goalRelevant ? "Lose weight" : current.customerGoal,
        goalRelevance: snapshot.goalRelevant === false ? "Low" : "High",
        primaryBarrier: snapshot.barrier === "tracking_effort" ? "Habit broken" : current.primaryBarrier,
        satisfaction: snapshot.barrier === "tracking_effort" ? "8 / 10" : current.satisfaction,
        reengagementIntent: snapshot.state === "completed" ? "High" : current.reengagementIntent,
        priceSensitivity: snapshot.barrier === "tracking_effort" ? "Low" : current.priceSensitivity,
        confidence: snapshot.state === "completed" ? 0.94 : 0.88,
      }));
    }
    if (event.type === "call_completed" && callCustomer) {
      setCustomers((current) =>
        current.map((customer) =>
          customer.id !== callCustomer.id ||
          customer.interactions.some((interaction) => interaction.id === `${customer.id}-demo-call`)
            ? customer
            : {
                ...customer,
                interactions: [
                  {
                    id: `${customer.id}-demo-call`,
                    type: "call",
                    at: event.timestamp,
                    summary: "AI retention research call completed.",
                    outcome: "Restart plan sent",
                  },
                  ...customer.interactions,
                ],
              },
        ),
      );
    }
  }, [callCustomer]);

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
                {inspectorTab === "checks" && <AgentChecksPanel checks={completedChecks} />}
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
                100 deterministic profiles
              </span>
            </div>
            <CustomerTable customers={customers} onSelect={openCustomer} onCall={startCustomerCall} />
          </div>
        </main>
      )}

      {view === "calls" && <CallsView onReplay={() => startCustomerCall(ammarCustomer)} />}

      {view === "insights" && (
        <main className="min-w-0 flex-1 overflow-y-auto bg-slate-50 p-7">
          <div className="mx-auto max-w-7xl">
            <InsightsView customers={customers} />
          </div>
        </main>
      )}

      <CustomerDrawer
        customer={selectedCustomer}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onCall={startCustomerCall}
      />

      <CallView
        customer={callCustomer}
        open={callOpen}
        onOpenChange={setCallOpen}
        onEvent={onCallEvent}
      />
    </div>
  );
}
