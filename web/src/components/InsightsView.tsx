import {
  ArrowUp,
  CheckCircle2,
  CircleDollarSign,
  MessageSquareQuote,
  Phone,
  RotateCcw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { FormEvent, useState } from "react";

import { cn } from "../lib/cn";
import { smartsetCustomers } from "../product/fixtures";
import type { CallAnalysisBarrier, CompletedCallRecord, Customer } from "../product/types";

interface InsightsViewProps {
  customers?: readonly Customer[];
  liveCalls: readonly CompletedCallRecord[];
}

const BASE_CONTACTED = 38;
const BASE_COMPLETED = 29;

const metrics = [
  { label: "Customers", value: "100", icon: Users },
  { label: "Contacted", value: "38", icon: Phone },
  { label: "Conversations completed", value: "29", icon: CheckCircle2 },
  { label: "Reactivated", value: "11", icon: RotateCcw },
  { label: "Subscriptions saved", value: "7", icon: ShieldCheck },
  { label: "ARR retained", value: "$1,258", icon: CircleDollarSign },
] as const;

const reasonDefinitions: readonly {
  id: CallAnalysisBarrier;
  label: string;
  baselineShare: number;
}[] = [
  { id: "habit", label: "Habit broken", baselineShare: 31 },
  { id: "product", label: "Product friction", baselineShare: 24 },
  { id: "price", label: "Price", baselineShare: 18 },
  { id: "value", label: "Low perceived value", baselineShare: 15 },
  { id: "alternative", label: "Alternative", baselineShare: 12 },
  { id: "goal_changed", label: "Goal changed", baselineShare: 0 },
  { id: "other", label: "Other", baselineShare: 0 },
];

const quotes = [
  "I liked the app—I just fell out of the habit when work got busy.",
  "The photo scanner was fast, but correcting mixed meals took too long.",
  "I’d come back if the plan matched how often I actually track.",
] as const;

const suggestedQuestions = [
  "What is the biggest churn driver?",
  "Is price the root cause?",
  "Who should we call next?",
] as const;

interface InsightAnswerResponse {
  answer: string;
}

function formatShare(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

export function InsightsView({ customers = smartsetCustomers, liveCalls }: InsightsViewProps) {
  const reduceMotion = useReducedMotion();
  const entrance = reduceMotion ? undefined : { opacity: 0, y: 6 };
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const successfulLiveCalls = liveCalls.filter((call) => call.status === "Completed");
  const completedCount = BASE_COMPLETED + successfulLiveCalls.length;
  const newestLiveCall = successfulLiveCalls.reduce<CompletedCallRecord | null>(
    (newest, call) => (!newest || call.startedAt > newest.startedAt ? call : newest),
    null,
  );
  const liveReasonCounts = successfulLiveCalls.reduce<Map<CallAnalysisBarrier, number>>(
    (counts, call) => {
      const barrier = call.analysis.primaryBarrier;
      counts.set(barrier, (counts.get(barrier) ?? 0) + 1);
      return counts;
    },
    new Map(),
  );
  const reasons = reasonDefinitions
    .map((reason, order) => {
      const liveCount = liveReasonCounts.get(reason.id) ?? 0;
      const latestMatchingCall = successfulLiveCalls.reduce<CompletedCallRecord | null>(
        (latest, call) =>
          call.analysis.primaryBarrier === reason.id && (!latest || call.startedAt > latest.startedAt)
            ? call
            : latest,
        null,
      );
      const baselineCount = (reason.baselineShare / 100) * BASE_COMPLETED;
      return {
        ...reason,
        order,
        label:
          reason.baselineShare === 0 && latestMatchingCall?.analysis.reasonLabel.trim()
            ? latestMatchingCall.analysis.reasonLabel.trim()
            : reason.label,
        value: ((baselineCount + liveCount) / completedCount) * 100,
      };
    })
    .filter((reason) => reason.baselineShare > 0 || (liveReasonCounts.get(reason.id) ?? 0) > 0)
    .sort((left, right) => right.value - left.value || left.order - right.order);
  const competitorMentions = successfulLiveCalls.reduce<
    Map<string, { label: string; count: number; latestAt: string }>
  >((mentions, call) => {
    const label = call.analysis.competitor?.trim();
    if (!label) return mentions;
    const key = label.toLocaleLowerCase();
    const current = mentions.get(key);
    mentions.set(key, {
      label,
      count: (current?.count ?? 0) + 1,
      latestAt: current && current.latestAt > call.startedAt ? current.latestAt : call.startedAt,
    });
    return mentions;
  }, new Map());
  const topLiveCompetitor = [...competitorMentions.values()].sort(
    (left, right) => right.count - left.count || right.latestAt.localeCompare(left.latestAt),
  )[0];
  const newestKeyQuote = newestLiveCall?.analysis.keyQuote?.trim();
  const visibleQuotes = newestKeyQuote
    ? [
        { text: newestKeyQuote, source: "Latest live conversation · anonymized" },
        ...quotes.slice(0, 2).map((text, index) => ({
          text,
          source: `Conversation ${String(index + 1).padStart(2, "0")} · anonymized`,
        })),
      ]
    : quotes.map((text, index) => ({
        text,
        source: `Conversation ${String(index + 1).padStart(2, "0")} · anonymized`,
      }));

  async function askQuestion(nextQuestion: string) {
    const trimmed = nextQuestion.trim();
    if (!trimmed || pending) return;

    setPending(true);
    setAnswer(null);
    setError(null);
    try {
      const response = await fetch("/api/retention/insights/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          analyses: successfulLiveCalls.map(({ id, name, analysis }) => ({
            callId: id,
            customer: name,
            ...analysis,
          })),
        }),
      });
      const payload = (await response.json()) as Partial<InsightAnswerResponse> & {
        detail?: string;
      };
      if (!response.ok) throw new Error(payload.detail || `Request failed (${response.status})`);
      if (!payload.answer?.trim()) throw new Error("The analysis returned no answer.");
      setAnswer(payload.answer.trim());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not analyze the calls.");
    } finally {
      setPending(false);
    }
  }

  function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void askQuestion(question);
  }

  return (
    <section aria-labelledby="insights-title" className="space-y-5">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-700">Voice of customer</p>
          <h2 id="insights-title" className="mt-1 text-balance text-2xl font-semibold text-slate-950">
            Customer Intelligence
          </h2>
          <p className="mt-1 text-pretty text-sm text-slate-500">
            Patterns from proactive Smartset conversations, grounded in completed calls.
          </p>
        </div>
        <p className="text-xs tabular-nums text-slate-500">
          Smartset: {customers.length} customers
        </p>
      </header>

      <section aria-labelledby="ask-insights-title" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
          <div className="min-w-0 lg:w-56">
            <h3 id="ask-insights-title" className="text-balance text-sm font-semibold text-slate-950">
              Ask your interviews
            </h3>
            <p className="mt-1 text-pretty text-xs leading-5 text-slate-500">
              Query the completed call findings.
            </p>
          </div>
          <div className="min-w-0 flex-1">
            <form onSubmit={ask} aria-busy={pending} className="flex gap-2">
              <label htmlFor="insight-question" className="sr-only">
                Ask a question about customer interviews
              </label>
              <input
                id="insight-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                disabled={pending}
                placeholder="Ask what drives churn..."
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500"
              />
              <button
                type="submit"
                aria-label={pending ? "Analyzing interviews" : "Ask insights"}
                disabled={!question.trim() || pending}
                className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:bg-slate-200 disabled:text-slate-400"
              >
                <ArrowUp aria-hidden="true" className="size-4" />
              </button>
            </form>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggestedQuestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setQuestion(item);
                    void askQuestion(item);
                  }}
                  className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-slate-300 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:bg-slate-50 disabled:text-slate-400"
                >
                  {item}
                </button>
              ))}
            </div>
            {pending && (
              <div role="status" className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5">
                <p className="text-pretty text-sm text-slate-500">Analyzing completed calls…</p>
              </div>
            )}
            {error && (
              <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                <p className="text-pretty text-sm text-red-700">{error}</p>
              </div>
            )}
            {answer && (
              <div aria-live="polite" className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5">
                <p className="text-pretty text-sm leading-6 text-slate-700">{answer}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          const value = metric.label === "Contacted"
            ? String(BASE_CONTACTED + successfulLiveCalls.length)
            : metric.label === "Conversations completed"
              ? String(completedCount)
              : metric.value;
          return (
            <motion.article
              key={metric.label}
              initial={entrance}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.18, delay: reduceMotion ? 0 : index * 0.02 }}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <Icon aria-hidden="true" className="size-4 text-blue-700" />
                <span className="text-xl font-semibold tabular-nums text-slate-950">{value}</span>
              </div>
              <p className="mt-3 text-pretty text-xs leading-5 text-slate-500">{metric.label}</p>
            </motion.article>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-balance text-base font-semibold text-slate-950">
                Why customers disengage
              </h3>
              <p className="mt-1 text-pretty text-sm text-slate-500">
                Primary reason across completed conversations
              </p>
            </div>
            <span className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium tabular-nums text-slate-600">
              n={completedCount}
            </span>
          </div>

          <ol className="mt-6 space-y-4">
            {reasons.map((reason, index) => (
              <li key={reason.label}>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="font-medium text-slate-800">{reason.label}</span>
                  <span className="font-semibold tabular-nums text-slate-950">{formatShare(reason.value)}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                  <div
                    className={cn("h-full rounded-full", index === 0 ? "bg-blue-600" : "bg-slate-400")}
                    style={{ width: `${reason.value}%` }}
                  />
                </div>
              </li>
            ))}
          </ol>
        </article>

        <div className="space-y-5">
          <article className="rounded-xl border border-blue-200 bg-blue-50 p-5">
            <p className="text-xs font-semibold text-blue-800">Emerging insight</p>
            <p className="mt-3 text-pretty text-base font-medium leading-7 text-slate-950">
              “{newestLiveCall?.analysis.emergingInsight.trim() || "Users frequently lose their tracking habit after 7–14 days of inactivity."}”
            </p>
            <p className="mt-4 text-pretty text-xs leading-5 text-blue-900/70">
              {newestLiveCall
                ? `Latest completed call · ${newestLiveCall.analysis.reasonLabel}`
                : "Trigger outreach before a temporary routine break becomes permanent churn."}
            </p>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Top mentioned alternative</p>
            <p className="mt-2 text-lg font-semibold text-slate-950">
              {topLiveCompetitor?.label ?? "MyFitnessPal"}
            </p>
            <p className="mt-1 text-pretty text-sm text-slate-500">
              {topLiveCompetitor
                ? `Mentioned in ${topLiveCompetitor.count} live ${topLiveCompetitor.count === 1 ? "conversation" : "conversations"}.`
                : "Most often cited for familiarity, not stronger product satisfaction."}
            </p>
          </article>
        </div>
      </div>

      <section aria-labelledby="quotes-title">
        <div className="flex items-center gap-2">
          <MessageSquareQuote aria-hidden="true" className="size-4 text-blue-700" />
          <h3 id="quotes-title" className="text-base font-semibold text-slate-950">
            What customers said
          </h3>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {visibleQuotes.map((quote) => (
            <blockquote key={`${quote.source}-${quote.text}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-pretty text-sm leading-6 text-slate-700">“{quote.text}”</p>
              <footer className="mt-4 text-xs font-medium text-slate-500">
                {quote.source}
              </footer>
            </blockquote>
          ))}
        </div>
      </section>
    </section>
  );
}
