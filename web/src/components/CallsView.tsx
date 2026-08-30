import { CheckCircle2, Clock3, PhoneCall, Voicemail } from "lucide-react";
import { motion } from "motion/react";

const calls = [
  ["Ammar Rahman", "Completed", "Habit / busy", "Restart plan sent", "4:12", "2 min ago"],
  ["Maya Chen", "Completed", "Product frustration", "Support issue created", "5:08", "18 min ago"],
  ["Jonas Keller", "Completed", "Price", "1 free month accepted", "3:46", "41 min ago"],
  ["Sofia Alvarez", "Voicemail", "—", "Retry tomorrow", "0:24", "1 hr ago"],
  ["Noah Williams", "Completed", "Alternative", "Competitive insight", "4:39", "2 hrs ago"],
  ["Leila Haddad", "Completed", "Low perceived value", "Re-onboarding sent", "5:17", "3 hrs ago"],
];

export interface LiveCallRecord {
  name: string;
  status: "In progress" | "Completed" | "Failed";
  branch: string;
  outcome: string;
  duration: string;
  started: string;
}

export function CallsView({
  onStartCall,
  latestCall,
}: {
  onStartCall: () => void;
  latestCall?: LiveCallRecord;
}) {
  const visibleCalls = latestCall
    ? [[latestCall.name, latestCall.status, latestCall.branch, latestCall.outcome, latestCall.duration, latestCall.started], ...calls]
    : calls;
  const callCount = latestCall ? 39 : 38;
  const completedCount = latestCall?.status === "Completed" ? 30 : 29;

  return (
    <motion.main
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      className="min-w-0 flex-1 overflow-y-auto bg-slate-50 p-8"
    >
      <div className="mx-auto max-w-6xl">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-blue-600">Conversation operations</p>
            <h1 className="mt-1 text-balance text-2xl font-semibold text-slate-950">Calls</h1>
            <p className="mt-2 text-pretty text-sm text-slate-500">
              Every conversation is mapped to a branch, outcome, and measurable set of checks.
            </p>
          </div>
          <button
            type="button"
            onClick={onStartCall}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            <PhoneCall aria-hidden="true" className="size-4" />
            Call sample customer
          </button>
        </div>

        <div className="mt-7 grid grid-cols-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {[
            ["Calls today", String(callCount)],
            ["Completed", String(completedCount)],
            ["Average duration", "4:21"],
          ].map(([label, value], index) => (
            <div key={label} className={index ? "border-l border-slate-200 p-5" : "p-5"}>
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{value}</p>
            </div>
          ))}
        </div>

        <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="grid grid-cols-[minmax(0,1.4fr)_0.8fr_1fr_1.2fr_0.5fr_0.7fr] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-medium text-slate-500">
            <span>Customer</span>
            <span>Status</span>
            <span>Branch</span>
            <span>Outcome</span>
            <span>Duration</span>
            <span>Started</span>
          </div>
          {visibleCalls.map(([name, status, branch, outcome, duration, started], index) => (
            <article
              key={`${name}-${started}-${index}`}
              className="grid grid-cols-[minmax(0,1.4fr)_0.8fr_1fr_1.2fr_0.5fr_0.7fr] items-center gap-4 border-b border-slate-100 px-5 py-4 text-sm last:border-0 hover:bg-slate-50"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                  {name
                    .split(" ")
                    .map((part) => part[0])
                    .join("")}
                </span>
                <span className="truncate font-medium text-slate-900">{name}</span>
              </div>
              <span className="flex items-center gap-1.5 text-slate-600">
                {status === "Completed" ? (
                  <CheckCircle2 aria-hidden="true" className="size-4 text-emerald-600" />
                ) : (
                  <Voicemail aria-hidden="true" className="size-4 text-slate-400" />
                )}
                {status}
              </span>
              <span className="truncate text-slate-600">{branch}</span>
              <span className="truncate text-slate-700">{outcome}</span>
              <span className="flex items-center gap-1.5 tabular-nums text-slate-500">
                <Clock3 aria-hidden="true" className="size-3.5" />
                {duration}
              </span>
              <span className="text-slate-500">{started}</span>
            </article>
          ))}
        </section>
      </div>
    </motion.main>
  );
}
