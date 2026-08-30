export type Plan = "Free" | "Plus" | "Pro";
export type BillingCycle = "free" | "monthly" | "annual";
export type CustomerStatus = "active" | "trialing" | "cancelled" | "expired";
export type CustomerSegment = "churn" | "love" | "reactivate";
export type CustomerGoal =
  | "lose_weight"
  | "build_muscle"
  | "eat_healthier"
  | "maintain_weight";
export type Platform = "iOS" | "Android";

export interface WeeklyEvents {
  baseline: number;
  recent: number;
  changePercent: number;
}

export interface CustomerSignal {
  id: string;
  kind: "usage_drop" | "renewal_soon" | "inactive" | "high_engagement" | "goal_streak";
  label: string;
  detail: string;
  severity: "positive" | "neutral" | "warning" | "critical";
  detectedAt: string;
}

export interface CustomerInteraction {
  id: string;
  type: "call" | "email" | "in_app";
  at: string;
  summary: string;
  outcome?: string;
}

export interface Customer {
  id: string;
  name: string;
  initials: string;
  email: string;
  phone: string;
  country: string;
  platform: Platform;
  plan: Plan;
  billingCycle: BillingCycle;
  status: CustomerStatus;
  segment: CustomerSegment;
  subscriptionValue: number;
  currency: "USD";
  lifetimeValue: number;
  joinedAt: string;
  renewalAt: string | null;
  renewalInDays: number | null;
  lastActiveAt: string;
  daysInactive: number;
  goal: CustomerGoal;
  weeklyEvents: WeeklyEvents;
  usageChangePercent: number;
  usageTrend: readonly number[];
  churnRisk: number;
  satisfaction?: number;
  primaryBarrier?: BarrierId;
  signals: readonly CustomerSignal[];
  interactions: readonly CustomerInteraction[];
}

export type WorkflowId = "churn" | "love" | "reactivate";
export type WorkflowNodeKind = "opening" | "question" | "branch" | "action" | "closing";
export type BarrierId =
  | "tracking_effort"
  | "accuracy"
  | "price"
  | "missing_feature"
  | "technical_issue";
export type ResponseKind = "boolean" | "free_text" | "rating" | "single_select" | "permission";

export interface ResponseOption {
  id: string;
  label: string;
}

export interface WorkflowResponse {
  key: string;
  kind: ResponseKind;
  options?: readonly ResponseOption[];
  required: boolean;
}

export interface OfferMetadata {
  code: string;
  label: string;
  discountPercent: number;
  durationDays: number;
  expiresAt: string;
}

export interface EmailMetadata {
  to: string;
  subject: string;
  templateId: string;
  offer: OfferMetadata;
  campaign: string;
}

export type CallActionType =
  | "save_feedback"
  | "apply_offer"
  | "send_email"
  | "schedule_callback"
  | "pause_subscription";

export interface CallAction {
  id: string;
  type: CallActionType;
  label: string;
  status: "planned" | "completed";
  email?: EmailMetadata;
  offer?: OfferMetadata;
  metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface WorkflowNodeDefinition {
  id: string;
  title: string;
  subtitle?: string;
  details?: readonly string[];
  type?: WorkflowNodeKind;
  icon?: string;
  branchLabel?: string;
  position: { x: number; y: number };
}

export interface WorkflowNode extends WorkflowNodeDefinition {
  id: string;
  kind: WorkflowNodeKind;
  label: string;
  prompt: string;
  response?: WorkflowResponse;
  actions?: readonly CallAction[];
  metricKeys?: readonly string[];
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  condition?: string;
  label?: string;
}

export interface WorkflowFollowUp {
  id: string;
  when: string;
  prompt: string;
  targetNodeId: string;
  maxRepeats?: number;
}

export interface WorkflowMetric {
  key: string;
  label: string;
  target: string;
}

export interface WorkflowDefinition {
  id: WorkflowId;
  title: string;
  cohort: string;
  nodes: readonly WorkflowNodeDefinition[];
  edges: readonly WorkflowEdge[];
  founderRequest: string;
  assistantResponse: string;
  followUps: readonly WorkflowFollowUp[];
  metrics: readonly WorkflowMetric[];
}

export interface Workflow extends WorkflowDefinition {
  eyebrow: string;
  description: string;
  audience: string;
  objective: string;
  prompt: string;
  sampleResponse: string;
  nodes: readonly WorkflowNode[];
  edges: readonly WorkflowEdge[];
  followUps: readonly WorkflowFollowUp[];
  metrics: readonly WorkflowMetric[];
}

export type TranscriptSpeaker = "agent" | "customer";

export interface AgentState {
  customerGoal: CustomerGoal | null;
  satisfaction: number | null;
  goalRelevance: "relevant" | "not_relevant" | "unknown";
  primaryBarrier: BarrierId | null;
  reengagementIntent: "yes" | "maybe" | "no" | "unknown";
  priceSensitivity: "root_cause" | "symptom" | "not_mentioned" | "unknown";
  productIssue: string | null;
  confidence: number;
}

export interface TranscriptLine {
  id: string;
  speaker: TranscriptSpeaker;
  text: string;
  elapsedMs: number;
}

export type CallState =
  | "agent_speaking"
  | "listening"
  | "customer_speaking"
  | "thinking"
  | "taking_action"
  | "completed";

export interface CallStateSnapshot {
  state: CallState;
  activeNodeId: string;
  goalRelevant?: boolean;
  barrier?: BarrierId;
  priceIsRootCause?: boolean;
  followUpDepth: number;
}

export interface CallMetric {
  key: string;
  label: string;
  value: string | number | boolean;
}

interface CallEventBase {
  timestamp: string;
  elapsedMs: number;
  message?: string;
}

export type CallEvent =
  | (CallEventBase & {
      type: "call_started";
      customerId: string;
      workflowId: WorkflowId;
      state: CallStateSnapshot;
    })
  | (CallEventBase & {
      type: "transcript_update";
      transcript: TranscriptLine;
    })
  | (CallEventBase & {
      type: "state_updated";
      state: CallStateSnapshot;
    })
  | (CallEventBase & {
      type: "workflow_node_entered";
      workflowNodeId: string;
    })
  | (CallEventBase & {
      type: "action_taken";
      action: CallAction;
    })
  | (CallEventBase & {
      type: "call_completed";
      state: CallStateSnapshot;
      metrics: readonly CallMetric[];
    });

export type CallEventType = CallEvent["type"];

export interface EmailAction {
  customerId: string;
  to: string;
  subject: string;
  templateId: string;
  offer: OfferMetadata;
  metadata: Readonly<Record<string, string>>;
}

export interface FeaturedQuote {
  id: string;
  customerId: string;
  quote: string;
  theme: BarrierId;
  sentiment: "constructive" | "positive";
  source: WorkflowId;
}

export interface SmartsetSummary {
  total: number;
  segments: Readonly<Record<CustomerSegment, number>>;
  highRisk: number;
  averageRisk: number;
  averageUsageChange: number;
  monthlyRevenue: number;
  featuredQuote: FeaturedQuote;
}
