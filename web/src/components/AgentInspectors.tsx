import {
  Bot,
  Check,
  CircleDashed,
  GitBranch,
  MessageSquareWarning,
  ShieldCheck,
  X,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import type { WorkflowNode } from "../product/types";

type AgentStateKey =
  | "customerGoal"
  | "satisfaction"
  | "goalRelevance"
  | "primaryBarrier"
  | "reengagementIntent"
  | "priceSensitivity"
  | "productIssue"
  | "confidence";

export type AgentState = Partial<Record<AgentStateKey, string | number | boolean | null>>;

type PanelProps = {
  className?: string;
  title: string;
  description?: string;
  icon: ReactNode;
  children: ReactNode;
  action?: ReactNode;
};

function Panel({ className, title, description, icon, children, action }: PanelProps) {
  return (
    <section className={cn("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-600">
            {icon}
          </span>
          <div className="min-w-0">
            <h2 className="text-balance text-sm font-semibold text-slate-950">{title}</h2>
            {description && (
              <p className="mt-0.5 text-pretty text-xs leading-5 text-slate-500">{description}</p>
            )}
          </div>
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

const stateFields: ReadonlyArray<{ key: AgentStateKey; label: string }> = [
  { key: "customerGoal", label: "Customer goal" },
  { key: "satisfaction", label: "Satisfaction" },
  { key: "goalRelevance", label: "Goal relevance" },
  { key: "primaryBarrier", label: "Primary barrier" },
  { key: "reengagementIntent", label: "Re-engagement intent" },
  { key: "priceSensitivity", label: "Price sensitivity" },
  { key: "productIssue", label: "Product issue" },
  { key: "confidence", label: "Confidence" },
];

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "Not captured";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (value >= 0 && value <= 1) return `${Math.round(value * 100)}%`;
    return String(value);
  }
  return String(value).replaceAll("_", " ");
}

export function AgentStatePanel({
  state,
  className,
}: {
  state?: Partial<AgentState> | null;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <Panel
      className={className}
      title="Agent state"
      description="Structured understanding updated during the call."
      icon={<Bot aria-hidden="true" className="size-4" />}
    >
      <dl className="space-y-1">
        {stateFields.map((field) => {
          const value = state?.[field.key];
          const pending = value === null || value === undefined || value === "";
          return (
            <motion.div
              key={field.key}
              initial={reduceMotion ? false : { opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.16 }}
              className="grid grid-cols-2 gap-3 border-b border-slate-100 py-2.5 last:border-0"
            >
              <dt className="text-xs font-medium text-slate-500">{field.label}</dt>
              <dd
                className={cn(
                  "text-pretty text-right text-xs font-medium capitalize text-slate-800",
                  field.key === "confidence" && "tabular-nums",
                  pending && "font-normal text-slate-400",
                )}
              >
                {displayValue(value)}
              </dd>
            </motion.div>
          );
        })}
      </dl>
    </Panel>
  );
}

export type AgentCheck = {
  label: string;
  passed: boolean;
  detail?: string;
};

export function AgentChecksPanel({
  checks = [],
  className,
}: {
  checks?: readonly AgentCheck[];
  className?: string;
}) {
  const passedCount = checks.filter((check) => check.passed).length;

  return (
    <Panel
      className={className}
      title="Agent checks"
      description="Deterministic gates evaluated before the workflow advances."
      icon={<ShieldCheck aria-hidden="true" className="size-4" />}
      action={
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 tabular-nums">
          {passedCount}/{checks.length}
        </span>
      }
    >
      {checks.length ? (
        <ul className="space-y-2">
          {checks.map((check) => (
            <li key={check.label} className="flex items-start gap-2.5 rounded-lg bg-slate-50 p-3">
              <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                  check.passed
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-slate-300 bg-white text-slate-500",
                )}
              >
                {check.passed ? (
                  <Check aria-hidden="true" className="size-3" strokeWidth={2.5} />
                ) : (
                  <CircleDashed aria-hidden="true" className="size-3" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-800">{check.label}</span>
                {check.detail && (
                  <span className="mt-0.5 block text-pretty text-xs leading-5 text-slate-500">
                    {check.detail}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-pretty text-sm text-slate-500">Checks will appear when the call starts.</p>
      )}
    </Panel>
  );
}

const defaultFenceChecks: readonly AgentCheck[] = [
  { label: "Permission before research", passed: true },
  { label: "No medical or nutrition advice", passed: true },
  { label: "No persuasion or account changes", passed: true },
];

export function ChatFencerPanel({
  checks = defaultFenceChecks,
  blockedMessage,
  className,
}: {
  checks?: readonly AgentCheck[];
  blockedMessage?: string;
  className?: string;
}) {
  return (
    <Panel
      className={className}
      title="Chat Fencer"
      description="Hard boundaries remain outside the model's discretion."
      icon={<MessageSquareWarning aria-hidden="true" className="size-4" />}
    >
      <ul className="space-y-2">
        {checks.map((check) => (
          <li key={check.label} className="flex items-start gap-2 text-sm text-slate-700">
            {check.passed ? (
              <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-blue-700" />
            ) : (
              <X aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-red-600" />
            )}
            <span className="text-pretty">{check.label}</span>
          </li>
        ))}
      </ul>
      {blockedMessage && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-xs font-medium text-slate-500">Latest intercepted request</p>
          <blockquote className="mt-2 border-l-2 border-slate-300 pl-3 text-pretty text-sm text-slate-700">
            “{blockedMessage}”
          </blockquote>
        </div>
      )}
    </Panel>
  );
}

export function NodeDetailsPanel({
  node,
  className,
  onClose,
}: {
  node?: WorkflowNode | null;
  className?: string;
  onClose?: () => void;
}) {
  return (
    <Panel
      className={className}
      title={node?.label ?? "Node details"}
      description={node?.prompt ?? "Select a workflow node to inspect its behavior."}
      icon={<GitBranch aria-hidden="true" className="size-4" />}
      action={
        onClose ? (
          <button
            type="button"
            aria-label="Close node details"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : undefined
      }
    >
      {node ? (
        node.actions?.length ? (
          <ul className="space-y-2">
            {node.actions.map((action) => (
              <li key={action.id} className="flex items-start gap-2 text-sm text-slate-700">
                <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-slate-400" />
                <span className="text-pretty">{action.label}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-pretty text-sm text-slate-500">No additional details for this node.</p>
        )
      ) : (
        <p className="text-pretty text-sm text-slate-500">Choose a node on the canvas to continue.</p>
      )}
    </Panel>
  );
}
