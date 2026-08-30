import { CheckCircle2, ChevronRight, Clock3, MessageSquareText, PhoneCall, Voicemail, X } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";

import type { CompletedCallRecord } from "../product/types";

export interface LiveCallRecord {
  name: string;
  status: "In progress" | "Completed" | "Failed";
  branch: string;
  outcome: string;
  duration: string;
  started: string;
}

const seededCalls = [
  ["Ammar Rahman", "Completed", "Habit / busy", "Restart plan sent", "4:12", "2 min ago"],
  ["Maya Chen", "Completed", "Product frustration", "Support issue created", "5:08", "18 min ago"],
  ["Jonas Keller", "Completed", "Price", "1 free month accepted", "3:46", "41 min ago"],
  ["Sofia Alvarez", "Voicemail", "—", "Retry tomorrow", "0:24", "1 hr ago"],
  ["Noah Williams", "Completed", "Alternative", "Competitive insight", "4:39", "2 hrs ago"],
  ["Leila Haddad", "Completed", "Low perceived value", "Re-onboarding sent", "5:17", "3 hrs ago"],
] as const;

function Initials({ name }: { name: string }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
      {name.split(" ").map((part) => part[0]).join("")}
    </span>
  );
}

function CallDetails({ call, onClose }: { call: CompletedCallRecord; onClose: () => void }) {
  return (
    <section aria-labelledby="call-recap-title" className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div>
          <p className="text-xs font-medium text-blue-700">Completed conversation</p>
          <h2 id="call-recap-title" className="mt-1 text-balance text-lg font-semibold text-slate-950">
            {call.name} · Call recap
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close call details"
          className="flex size-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </header>
      <div className="grid min-h-80 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="border-b border-slate-200 p-5 lg:border-b-0 lg:border-r">
          <p className="text-pretty text-sm leading-6 text-slate-700">{call.analysis.summary}</p>
          <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
            {[
              ["Customer goal", call.analysis.customerGoal],
              ["Primary reason", call.analysis.reasonLabel],
              ["Return intent", call.analysis.returnIntent],
              ["Outcome", call.analysis.outcome],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="mt-1 font-medium text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
          {call.analysis.competitor && (
            <p className="mt-4 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700">
              Alternative mentioned: <strong className="font-semibold text-slate-950">{call.analysis.competitor}</strong>
            </p>
          )}
          {call.analysis.keyQuote && (
            <blockquote className="mt-4 border-l-2 border-blue-600 pl-3 text-pretty text-sm italic leading-6 text-slate-600">
              “{call.analysis.keyQuote}”
            </blockquote>
          )}
        </div>
        <div className="min-h-0 p-5">
          <div className="flex items-center gap-2">
            <MessageSquareText aria-hidden="true" className="size-4 text-blue-700" />
            <h3 className="text-balance text-sm font-semibold text-slate-950">Transcript</h3>
          </div>
          <div className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-2">
            {call.transcript.length ? call.transcript.map((line) => (
              <div key={line.id} className={line.speaker === "agent" ? "pr-8" : "pl-8"}>
                <p className="mb-1 text-xs font-medium capitalize text-slate-400">{line.speaker}</p>
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-pretty text-sm leading-5 text-slate-700">{line.text}</p>
              </div>
            )) : (
              <p className="text-pretty text-sm text-slate-500">No transcript was captured for this call.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function CallsView({
  onStartCall,
  liveCalls,
  currentCall,
}: {
  onStartCall: () => void;
  liveCalls: readonly CompletedCallRecord[];
  currentCall?: LiveCallRecord;
}) {
  const [selectedCall, setSelectedCall] = useState<CompletedCallRecord | null>(null);
  const completedCount = liveCalls.filter((call) => call.status === "Completed").length;

  return (
    <motion.main initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16, ease: "easeOut" }} className="min-w-0 flex-1 overflow-y-auto bg-slate-50 p-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-blue-600">Conversation operations</p>
            <h1 className="mt-1 text-balance text-2xl font-semibold text-slate-950">Calls</h1>
            <p className="mt-2 text-pretty text-sm text-slate-500">Every live conversation includes its structured recap and full transcript.</p>
          </div>
          <button type="button" onClick={onStartCall} className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
            <PhoneCall aria-hidden="true" className="size-4" /> Call sample customer
          </button>
        </div>

        <div className="mt-7 grid grid-cols-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {[
            ["Calls today", String(38 + liveCalls.length + (currentCall ? 1 : 0))],
            ["Completed", String(29 + completedCount)],
            ["Average duration", "4:21"],
          ].map(([label, value], index) => (
            <div key={label} className={index ? "border-l border-slate-200 p-5" : "p-5"}>
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{value}</p>
            </div>
          ))}
        </div>

        {selectedCall && <CallDetails call={selectedCall} onClose={() => setSelectedCall(null)} />}

        <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="grid grid-cols-[minmax(0,1.4fr)_0.8fr_1fr_1.2fr_0.5fr_0.7fr] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-medium text-slate-500">
            <span>Customer</span><span>Status</span><span>Branch</span><span>Outcome</span><span>Duration</span><span>Started</span>
          </div>
          {currentCall && (
            <div className="grid grid-cols-[minmax(0,1.4fr)_0.8fr_1fr_1.2fr_0.5fr_0.7fr] items-center gap-4 border-b border-blue-100 bg-blue-50/60 px-5 py-4 text-sm">
              <div className="flex min-w-0 items-center gap-3"><Initials name={currentCall.name} /><span className="truncate font-medium text-slate-900">{currentCall.name}</span></div>
              <span className="font-medium text-blue-700">{currentCall.status}</span><span>{currentCall.branch}</span><span>{currentCall.outcome}</span><span className="tabular-nums">{currentCall.duration}</span><span>{currentCall.started}</span>
            </div>
          )}
          {liveCalls.map((call) => (
            <button key={call.id} type="button" onClick={() => setSelectedCall(call)} aria-label={`Open transcript and recap for ${call.name}`} className="grid w-full grid-cols-[minmax(0,1.4fr)_0.8fr_1fr_1.2fr_0.5fr_0.7fr] items-center gap-4 border-b border-slate-100 px-5 py-4 text-left text-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600">
              <div className="flex min-w-0 items-center gap-3"><Initials name={call.name} /><span className="truncate font-medium text-slate-900">{call.name}</span><ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-slate-400" /></div>
              <span className="flex items-center gap-1.5 text-slate-600"><CheckCircle2 aria-hidden="true" className="size-4 text-emerald-600" />{call.status}</span><span className="truncate">{call.branch}</span><span className="truncate">{call.outcome}</span><span className="flex items-center gap-1.5 tabular-nums"><Clock3 aria-hidden="true" className="size-3.5" />{call.duration}</span><span>{call.started}</span>
            </button>
          ))}
          {seededCalls.map(([name, status, branch, outcome, duration, started]) => (
            <article key={`${name}-${started}`} className="grid grid-cols-[minmax(0,1.4fr)_0.8fr_1fr_1.2fr_0.5fr_0.7fr] items-center gap-4 border-b border-slate-100 px-5 py-4 text-sm last:border-0">
              <div className="flex min-w-0 items-center gap-3"><Initials name={name} /><span className="truncate font-medium text-slate-900">{name}</span></div>
              <span className="flex items-center gap-1.5 text-slate-600">{status === "Completed" ? <CheckCircle2 aria-hidden="true" className="size-4 text-emerald-600" /> : <Voicemail aria-hidden="true" className="size-4 text-slate-400" />}{status}</span><span>{branch}</span><span>{outcome}</span><span className="flex items-center gap-1.5 tabular-nums"><Clock3 aria-hidden="true" className="size-3.5" />{duration}</span><span>{started}</span>
            </article>
          ))}
        </section>
      </div>
    </motion.main>
  );
}
