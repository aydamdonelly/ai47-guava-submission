import { ArrowRight, ArrowUp, Check, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { FormEvent, useState } from "react";
import type { WorkflowId } from "./Sidebar";

const analyses: Array<{ id: WorkflowId; label: string }> = [
  { id: "churn", label: "Why are customers churning?" },
  { id: "love", label: "Why do customers love Smartset?" },
  { id: "reactivate", label: "Bring inactive users back" },
];

export function ChatWorkspace({
  workflowId,
  request,
  response,
  followUps,
  commandConfirmation,
  onWorkflowSelect,
  onCommand,
  onFollowUp,
}: {
  workflowId: WorkflowId;
  request: string;
  response: string;
  followUps: string[];
  commandConfirmation?: string;
  onWorkflowSelect: (id: WorkflowId) => void;
  onCommand: (command: string) => void;
  onFollowUp: (index: number) => void;
}) {
  const [input, setInput] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const command = input.trim();
    if (!command) return;
    onCommand(command);
    setInput("");
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-white">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-6">
        <div>
          <h1 className="text-balance text-sm font-semibold text-slate-950">
            {analyses.find((item) => item.id === workflowId)?.label}
          </h1>
          <p className="text-xs text-slate-500">Updated just now · 24 customers in cohort</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
          Agent ready
        </div>
      </header>

      <div className="border-b border-slate-100 px-6 py-3">
        <p className="mb-2 text-[11px] font-medium text-slate-400">Suggested analyses</p>
        <div className="flex flex-wrap gap-2">
          {analyses.map((analysis) => (
            <button
              key={analysis.id}
              type="button"
              onClick={() => onWorkflowSelect(analysis.id)}
              className={
                analysis.id === workflowId
                  ? "rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700"
                  : "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-950"
              }
            >
              {analysis.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={workflowId}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="mx-auto max-w-2xl"
          >
            <div className="ml-auto max-w-xl rounded-2xl bg-slate-100 px-5 py-4 text-pretty text-[15px] leading-6 text-slate-900">
              {request}
            </div>

            <div className="mt-9 flex gap-3">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white">
                <Sparkles aria-hidden="true" className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-pretty text-[15px] leading-7 text-slate-800">{response}</p>
                <p className="mt-7 text-sm font-medium text-slate-500">Suggested follow-ups</p>
                <div className="mt-2 divide-y divide-slate-100 border-y border-slate-100">
                  {followUps.map((followUp, index) => (
                    <button
                      key={followUp}
                      type="button"
                      onClick={() => onFollowUp(index)}
                      className="group flex w-full items-center gap-4 py-3 text-left text-sm text-slate-700 hover:text-slate-950"
                    >
                      <span className="w-4 tabular-nums text-slate-400">{index + 1}</span>
                      <span className="flex-1">{followUp}</span>
                      <ArrowRight
                        aria-hidden="true"
                        className="size-4 text-slate-400 transition-transform duration-150 group-hover:translate-x-0.5"
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <AnimatePresence>
              {commandConfirmation && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                  className="mt-7 ml-10 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-950"
                >
                  <span className="mt-0.5 flex size-5 items-center justify-center rounded-full bg-blue-600 text-white">
                    <Check aria-hidden="true" className="size-3" />
                  </span>
                  <span className="text-pretty">{commandConfirmation}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="shrink-0 px-7 pb-6 pt-3">
        <form
          onSubmit={submit}
          className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-2 shadow-sm focus-within:border-slate-300"
        >
          <label htmlFor="smartset-command" className="sr-only">
            Ask Smartset Agent
          </label>
          <textarea
            id="smartset-command"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
            placeholder="Ask Smartset Agent..."
            className="block w-full resize-none border-0 bg-transparent px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <div className="flex items-center justify-between px-1 pb-1">
            <span className="inline-flex items-center gap-1.5 px-2 text-[11px] font-medium text-slate-400">
              <Check aria-hidden="true" className="size-3.5" />
              Customer context loaded
            </span>
            <button
              type="submit"
              aria-label="Send command"
              disabled={!input.trim()}
              className="flex size-8 items-center justify-center rounded-full bg-slate-950 text-white hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400"
            >
              <ArrowUp aria-hidden="true" className="size-4" />
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
