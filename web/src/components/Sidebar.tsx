import {
  BarChart3,
  ChevronDown,
  Heart,
  MessageSquarePlus,
  PhoneCall,
  RotateCcw,
  Search,
  Users,
} from "lucide-react";
import { cn } from "../lib/cn";

export type AppView = "analysis" | "customers" | "calls" | "insights";
export type WorkflowId = "churn" | "love" | "reactivate";

const navItems = [
  { id: "analysis" as const, label: "New analysis", icon: MessageSquarePlus },
  { id: "customers" as const, label: "Customers", icon: Users },
  { id: "calls" as const, label: "Calls", icon: PhoneCall },
  { id: "insights" as const, label: "Insights", icon: BarChart3 },
];

const workflowItems = [
  { id: "churn" as const, label: "Why customers churn", icon: Search },
  { id: "love" as const, label: "Why customers love Smartset", icon: Heart },
  { id: "reactivate" as const, label: "Bring inactive users back", icon: RotateCcw },
];

export function Sidebar({
  view,
  workflowId,
  onViewChange,
  onWorkflowChange,
}: {
  view: AppView;
  workflowId: WorkflowId;
  onViewChange: (view: AppView) => void;
  onWorkflowChange: (workflow: WorkflowId) => void;
}) {
  return (
    <aside className="flex h-dvh w-60 shrink-0 flex-col border-r border-slate-200 bg-[#fafafa] px-3 py-3">
      <div className="flex h-12 items-center justify-between px-2">
        <button
          type="button"
          onClick={() => onViewChange("analysis")}
          className="flex items-center gap-2 rounded-lg px-1 py-1 text-left"
        >
          <span className="flex size-7 items-center justify-center rounded-lg bg-slate-950 text-[11px] font-semibold text-white">
            S
          </span>
          <span className="text-sm font-semibold text-slate-950">Smartset</span>
          <ChevronDown aria-hidden="true" className="size-4 text-slate-400" />
        </button>
        <button
          type="button"
          onClick={() => onViewChange("customers")}
          aria-label="Search Smartset"
          className="flex size-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        >
          <Search aria-hidden="true" className="size-4" />
        </button>
      </div>

      <nav aria-label="Main navigation" className="mt-4 space-y-1">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onViewChange(id)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
              view === id
                ? "bg-slate-200/70 text-slate-950"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
            )}
          >
            <Icon aria-hidden="true" className="size-4" />
            {label}
          </button>
        ))}
      </nav>

      <div className="mt-7 flex items-center justify-between px-3">
        <p className="text-xs font-medium text-slate-400">Workflows</p>
        <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
          3 live
        </span>
      </div>
      <nav aria-label="Workflows" className="mt-2 space-y-1">
        {workflowItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onWorkflowChange(id)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm",
              view === "analysis" && workflowId === id
                ? "bg-white font-medium text-slate-950 shadow-sm ring-1 ring-slate-200"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
            )}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            <span className="line-clamp-1">{label}</span>
          </button>
        ))}
      </nav>

      <div className="mt-auto border-t border-slate-200 pt-3">
        <div className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left">
          <span className="flex size-8 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
            AS
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-900">Smartset workspace</span>
            <span className="block truncate text-xs text-slate-500">Ammar Rahman</span>
          </span>
          <ChevronDown aria-hidden="true" className="size-4 text-slate-400" />
        </div>
      </div>
    </aside>
  );
}
