import type {
  Workflow,
  WorkflowEdge,
  WorkflowFollowUp,
  WorkflowId,
  WorkflowMetric,
  WorkflowNode,
} from "./types";

const p = { x: 0, y: 0 };

function node(
  id: string,
  kind: WorkflowNode["kind"],
  label: string,
  prompt: string,
  details: readonly string[] = [],
): WorkflowNode {
  return { id, kind, label, title: label, prompt, subtitle: prompt, details, position: p };
}

function edge(source: string, target: string, label?: string): WorkflowEdge {
  return { id: `${source}-${target}`, source, target, label, condition: label };
}

const baseMetrics: readonly WorkflowMetric[] = [
  { key: "root_cause", label: "Root cause captured", target: "> 85%" },
  { key: "resolution", label: "Next action completed", target: "> 70%" },
  { key: "opt_out", label: "Opt-out respected", target: "100%" },
];

const churnFollowUps: readonly WorkflowFollowUp[] = [
  {
    id: "validate-price",
    when: "Price is mentioned but causal confidence is below 80%",
    prompt: "Would you keep using Smartset if the price were lower?",
    targetNodeId: "price_causal",
    maxRepeats: 1,
  },
  {
    id: "clarify-product",
    when: "Product frustration is broad or ambiguous",
    prompt: "What happened the last time Smartset got in your way?",
    targetNodeId: "product_followup",
    maxRepeats: 1,
  },
];

export const churnWorkflow: Workflow = {
  id: "churn",
  title: "Why customers churn",
  eyebrow: "Retention research",
  description: "Find the real reason at-risk customers disengage and intervene only when useful.",
  cohort: "Inactive 14+ days · churn risk above 70%",
  audience: "Inactive 14+ days · churn risk above 70%",
  objective: "Understand root cause, preserve trust, and choose the highest-value next action.",
  prompt: "Find out why inactive Smartset users are churning and try to save them when possible.",
  founderRequest: "Find out why inactive Smartset users are churning and try to save them when possible.",
  sampleResponse: "I'll call recently disengaged users, understand their original goal and underlying reason for leaving, then choose the best next action.",
  assistantResponse: "I'll call recently disengaged users, understand their original goal and underlying reason for leaving, then choose the best next action.",
  followUps: churnFollowUps,
  metrics: baseMetrics,
  nodes: [
    node("start", "opening", "Start", "Usage or cancellation signal received", ["Runs continuously", "Deduplicates recent outreach"]),
    node("select_users", "question", "Select users", "Inactive 14+ days / churn risk", ["24 customers", "$4,318 ARR at risk"]),
    node("load_context", "question", "Load customer context", "Plan, usage, renewal, prior calls", ["Subscription age", "Meals logged", "Usage decline", "Current renewal status"]),
    node("outbound_call", "action", "AI outbound call", "Speak immediately after answer · no pre-call SMS", ["Guava voice runtime", "AI disclosure", "Permission gate"]),
    node("infer_goal", "question", "Infer original goal", "Lose weight · Maintain health · Gain muscle", ["Inferred naturally", "Never forced into a rigid survey"]),
    node("goal_relevant", "branch", "Is the goal still relevant?", "Continuously update confidence", ["No aggressive retention when the goal changed"]),
    node("goal_changed", "action", "Goal no longer relevant", "Understand change · offer pause · exit respectfully", ["Capture insight", "No repeated recovery attempt"]),
    node("identify_barrier", "branch", "Identify primary barrier", "Find the actual constraint before acting", ["Agent Decision Engine", "Fills information gaps"]),
    node("habit", "branch", "Habit / busy", "High satisfaction · goal still relevant", ["Restart plan", "Deep-link", "Optional reminder"]),
    node("product", "branch", "Product frustration", "Ask what failed before offering anything", ["Check known solution", "Resolve or escalate"]),
    node("price", "branch", "Price", "Validate that price is actually causal", ["Avoid premature discounts", "One approved offer maximum"]),
    node("value", "branch", "Low perceived value", "Locate the missing activation moment", ["Understand intended outcome", "Personalized re-onboarding"]),
    node("alternative", "branch", "Switched to alternative", "Capture what the competitor does better", ["Name competitor", "Recover only with credible advantage"]),
    node("product_followup", "question", "Diagnose exact issue", "Known fix, support case, or product insight", ["No discount on a broken product"]),
    node("price_causal", "branch", "Would lower price change intent?", "Validate whether price is truly causal", ["No incentive configured", "Return to discovery when price is a symptom"]),
    node("deeper_discovery", "question", "Deeper root-cause discovery", "Price was a symptom, not the reason", ["Recursive branch", "Ask one focused follow-up"]),
    node("restart", "action", "Create restart plan", "Send Smartset deep-link and reminder", ["Personalized to original goal"]),
    node("support", "action", "Solve or escalate", "Explain known fix or create support issue", ["Structured issue attached to call"]),
    node("offer", "action", "Offer 1 free month", "Code SMARTSET30 · email after verbal acceptance", ["Allowed offer", "Expires in 7 days", "Never negotiate"]),
    node("reonboard", "action", "Personalized re-onboarding", "Guide customer to the fastest aha moment", ["Goal-specific restart"]),
    node("competitive", "action", "Capture competitive insight", "Record missing capability and recovery fit", ["Competitor: MyFitnessPal"]),
    node("send_email", "action", "Send follow-up email", "Offer, restart plan, or support confirmation", ["Delivery adapter ready", "No key exposed in browser"]),
    node("capture", "closing", "Save structured outcome", "State, branch, action, checks, and quote", ["Analytics-ready", "PII-aware"]),
  ],
  edges: [
    edge("start", "select_users"), edge("select_users", "load_context"), edge("load_context", "outbound_call"), edge("outbound_call", "infer_goal"), edge("infer_goal", "goal_relevant"),
    edge("goal_relevant", "goal_changed", "No"), edge("goal_relevant", "identify_barrier", "Yes"),
    edge("identify_barrier", "habit", "Habit"), edge("identify_barrier", "product", "Product"), edge("identify_barrier", "price", "Price"), edge("identify_barrier", "value", "Value"), edge("identify_barrier", "alternative", "Alternative"),
    edge("habit", "restart"), edge("product", "product_followup"), edge("product_followup", "support"), edge("price", "price_causal"), edge("price_causal", "offer", "Yes"), edge("price_causal", "deeper_discovery", "No"), edge("deeper_discovery", "identify_barrier", "Re-evaluate"), edge("value", "reonboard"), edge("alternative", "competitive"),
    edge("restart", "send_email"), edge("support", "capture"), edge("offer", "send_email"), edge("reonboard", "send_email"), edge("competitive", "capture"), edge("send_email", "capture"), edge("goal_changed", "capture"),
  ],
};

export const loveWorkflow: Workflow = {
  id: "love",
  title: "Why customers love Smartset",
  eyebrow: "Customer research",
  description: "Understand the moments and capabilities that create durable product love.",
  cohort: "Top 10% engaged · active 6+ days this week",
  audience: "Top 10% engaged · active 6+ days this week",
  objective: "Capture value drivers, aha moments, and potential advocates.",
  prompt: "Call our most engaged users and find out what makes Smartset indispensable.",
  founderRequest: "Call our most engaged users and find out what makes Smartset indispensable.",
  sampleResponse: "I'll identify their original goal, aha moment, strongest value driver, and why Smartset wins over their previous solution.",
  assistantResponse: "I'll identify their original goal, aha moment, strongest value driver, and why Smartset wins over their previous solution.",
  followUps: [],
  metrics: baseMetrics,
  nodes: [
    node("love_start", "opening", "Select highly engaged users", "Top 10% usage and active streak"),
    node("love_call", "action", "AI outbound call", "Short qualitative interview"),
    node("love_goal", "question", "Infer original goal", "Lose weight · Maintain health · Gain muscle"),
    node("aha", "question", "Identify aha moment", "When did Smartset first feel valuable?"),
    node("driver", "branch", "Strongest value driver", "Fast logging · AI recognition · progress · simplicity · habit"),
    node("comparison", "question", "Why better than before?", "Emotional and functional benefit"),
    node("advocate", "action", "Flag advocate candidate", "Optional testimonial follow-up"),
    node("love_capture", "closing", "Save structured insight", "Value driver, quote, outcome"),
  ],
  edges: [edge("love_start", "love_call"), edge("love_call", "love_goal"), edge("love_goal", "aha"), edge("aha", "driver"), edge("driver", "comparison"), edge("comparison", "advocate"), edge("advocate", "love_capture")],
};

export const reactivateWorkflow: Workflow = {
  id: "reactivate",
  title: "Bring inactive users back",
  eyebrow: "Reactivation",
  description: "Find the blocking friction and autonomously choose a credible return path.",
  cohort: "Inactive 14–45 days · goal previously active",
  audience: "Inactive 14–45 days · goal previously active",
  objective: "Restore momentum with the smallest useful intervention.",
  prompt: "Understand what blocks inactive users and bring them back without pressuring them.",
  founderRequest: "Understand what blocks inactive users and bring them back without pressuring them.",
  sampleResponse: "I'll verify that their goal still matters, identify the blocker, and choose a restart, fix, offer, pause, or respectful exit.",
  assistantResponse: "I'll verify that their goal still matters, identify the blocker, and choose a restart, fix, offer, pause, or respectful exit.",
  followUps: churnFollowUps,
  metrics: baseMetrics,
  nodes: [
    node("reactivate_start", "opening", "Select inactive customers", "14–45 days inactive"),
    node("reactivate_context", "question", "Load customer context", "Goal, usage decline, plan, renewal"),
    node("reactivate_call", "action", "AI outbound call", "Speak immediately · ask permission"),
    node("reactivate_goal", "question", "Infer original goal", "Understand the job Smartset was hired for"),
    node("reactivate_relevant", "branch", "Is the goal still relevant?", "No: pause or respectful exit"),
    node("reactivate_blocker", "branch", "Identify blocking friction", "Habit · product · value · price · alternative"),
    node("choose_action", "branch", "Choose next best action", "Restart · deep-link · reminder · fix · offer · escalate"),
    node("return_intent", "question", "Confirm willingness to return", "No repeated retention after rejection"),
    node("reactivate_email", "action", "Send action by email", "Deep-link, plan, offer, or support confirmation"),
    node("reactivate_capture", "closing", "Track reactivation outcome", "Measure after 24h and 7d"),
  ],
  edges: [edge("reactivate_start", "reactivate_context"), edge("reactivate_context", "reactivate_call"), edge("reactivate_call", "reactivate_goal"), edge("reactivate_goal", "reactivate_relevant"), edge("reactivate_relevant", "reactivate_capture", "No"), edge("reactivate_relevant", "reactivate_blocker", "Yes"), edge("reactivate_blocker", "choose_action"), edge("choose_action", "return_intent"), edge("return_intent", "reactivate_email", "Yes / maybe"), edge("return_intent", "reactivate_capture", "No"), edge("reactivate_email", "reactivate_capture")],
};

export const workflows = [churnWorkflow, loveWorkflow, reactivateWorkflow] as const;

export const workflowById: Record<WorkflowId, Workflow> = {
  churn: churnWorkflow,
  love: loveWorkflow,
  reactivate: reactivateWorkflow,
};
