import { ArrowRight, Check, CircleCheck, Clock3 } from "lucide-react";
import { cn } from "../lib/cn";
import type { Intake, IntakeStatus, Priority } from "../types";

const priorityStyles: Record<Priority, { label: string; badge: string; border: string }> = {
  immediate: {
    label: "Immediate response",
    badge: "bg-red-100 text-red-800",
    border: "border-l-red-600",
  },
  prompt: {
    label: "Prompt support",
    badge: "bg-amber-100 text-amber-900",
    border: "border-l-amber-500",
  },
  routine: {
    label: "Routine request",
    badge: "bg-sky-100 text-sky-900",
    border: "border-l-sky-500",
  },
  answered: {
    label: "Answered by voice",
    badge: "bg-slate-100 text-slate-700",
    border: "border-l-slate-300",
  },
};

const categoryLabels: Record<string, string> = {
  facility_information: "Facility information",
  information: "Facility information",
  comfort_request: "Comfort",
  comfort: "Comfort",
  personal_care: "Personal care",
  clinical_concern: "Clinical concern",
  clinical: "Clinical concern",
  social: "Social request",
  unclear: "Needs clarification",
};

function ageLabel(createdAt: string) {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - Date.parse(createdAt)) / 1000));
  if (elapsedSeconds < 60) return `${elapsedSeconds}s`;
  return `${Math.floor(elapsedSeconds / 60)}m`;
}

function nextAction(status: IntakeStatus) {
  if (status === "new") return { status: "acknowledged" as const, label: "Acknowledge", icon: Check };
  if (status === "acknowledged") {
    return { status: "on_the_way" as const, label: "On my way", icon: ArrowRight };
  }
  if (status === "on_the_way") {
    return { status: "resolved" as const, label: "Resolve", icon: CircleCheck };
  }
  return null;
}

export function RequestCard({
  intake,
  busy,
  error,
  onStatusChange,
}: {
  intake: Intake;
  busy: boolean;
  error?: string;
  onStatusChange: (id: string, status: IntakeStatus) => void;
}) {
  const style = priorityStyles[intake.priority];
  const action = nextAction(intake.status);
  const ActionIcon = action?.icon;
  const errorId = `request-${intake.id}-error`;

  return (
    <article
      className={cn(
        "border-l-4 bg-white px-5 py-5 shadow-sm ring-1 ring-slate-200",
        style.border,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-balance text-lg font-semibold text-slate-950">
              Room {intake.room} · {intake.resident_name}
            </h3>
            <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", style.badge)}>
              {style.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {categoryLabels[intake.category] ?? intake.category} · {intake.confidence} confidence
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
          <Clock3 aria-hidden="true" className="size-4" />
          <span className="tabular-nums">{ageLabel(intake.created_at)}</span>
        </div>
      </div>

      <p className="mt-4 text-pretty text-base font-medium text-slate-900">{intake.summary}</p>
      <blockquote className="mt-3 border-l-2 border-slate-200 pl-3 text-pretty text-sm text-slate-600">
        “{intake.raw_request}”
      </blockquote>

      <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3">
        <div className="text-xs font-semibold uppercase text-slate-500">Routing rationale</div>
        <p className="mt-1 text-pretty text-sm text-slate-700">{intake.rationale}</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <div className="text-sm text-slate-500">
          Status: <span className="font-medium text-slate-800">{intake.status.replaceAll("_", " ")}</span>
        </div>
        {action && ActionIcon && (
          <button
            type="button"
            disabled={busy}
            aria-describedby={error ? errorId : undefined}
            onClick={() => onStatusChange(intake.id, action.status)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ActionIcon aria-hidden="true" className="size-4" />
            {busy ? "Saving…" : action.label}
          </button>
        )}
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-3 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </article>
  );
}
