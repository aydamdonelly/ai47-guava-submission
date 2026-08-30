import {
  CheckCircle2,
  CircleDollarSign,
  MessageSquareQuote,
  Phone,
  RotateCcw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "../lib/cn";
import { smartsetCustomers } from "../product/fixtures";
import type { Customer } from "../product/types";

interface InsightsViewProps {
  customers?: readonly Customer[];
}

const metrics = [
  { label: "Customers", value: "100", icon: Users },
  { label: "Contacted", value: "38", icon: Phone },
  { label: "Conversations completed", value: "29", icon: CheckCircle2 },
  { label: "Reactivated", value: "11", icon: RotateCcw },
  { label: "Subscriptions saved", value: "7", icon: ShieldCheck },
  { label: "ARR retained", value: "$1,258", icon: CircleDollarSign },
] as const;

const reasons = [
  { label: "Habit broken", value: 31 },
  { label: "Product friction", value: 24 },
  { label: "Price", value: 18 },
  { label: "Low perceived value", value: 15 },
  { label: "Alternative", value: 12 },
] as const;

const quotes = [
  "I liked the app—I just fell out of the habit when work got busy.",
  "The photo scanner was fast, but correcting mixed meals took too long.",
  "I’d come back if the plan matched how often I actually track.",
] as const;

export function InsightsView({ customers = smartsetCustomers }: InsightsViewProps) {
  const reduceMotion = useReducedMotion();
  const entrance = reduceMotion ? undefined : { opacity: 0, y: 6 };

  return (
    <section aria-labelledby="insights-title" className="space-y-5">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-700">Voice of customer</p>
          <h2 id="insights-title" className="mt-1 text-balance text-2xl font-semibold text-slate-950">
            Customer Intelligence
          </h2>
          <p className="mt-1 text-pretty text-sm text-slate-500">
            Patterns from proactive Smartset conversations, grounded in a synthetic demo cohort.
          </p>
        </div>
        <p className="text-xs tabular-nums text-slate-500">
          Smartset: {customers.length} customers
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
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
                <span className="text-xl font-semibold tabular-nums text-slate-950">{metric.value}</span>
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
              n=29
            </span>
          </div>

          <ol className="mt-6 space-y-4">
            {reasons.map((reason, index) => (
              <li key={reason.label}>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="font-medium text-slate-800">{reason.label}</span>
                  <span className="font-semibold tabular-nums text-slate-950">{reason.value}%</span>
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
              “Users frequently lose their tracking habit after 7–14 days of inactivity.”
            </p>
            <p className="mt-4 text-pretty text-xs leading-5 text-blue-900/70">
              Trigger outreach before a temporary routine break becomes permanent churn.
            </p>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Top mentioned alternative</p>
            <p className="mt-2 text-lg font-semibold text-slate-950">MyFitnessPal</p>
            <p className="mt-1 text-pretty text-sm text-slate-500">
              Most often cited for familiarity, not stronger product satisfaction.
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
          {quotes.map((quote, index) => (
            <blockquote key={quote} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-pretty text-sm leading-6 text-slate-700">“{quote}”</p>
              <footer className="mt-4 text-xs font-medium text-slate-500">
                Conversation {String(index + 1).padStart(2, "0")} · anonymized
              </footer>
            </blockquote>
          ))}
        </div>
      </section>
    </section>
  );
}
