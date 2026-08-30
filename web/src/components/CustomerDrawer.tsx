import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Mail,
  MessageSquare,
  Phone,
  PhoneCall,
  Smartphone,
  Target,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn } from "../lib/cn";
import type {
  Customer,
  CustomerGoal,
  CustomerInteraction,
  CustomerSignal,
} from "../product/types";

interface CustomerDrawerProps {
  customer: Customer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCall: (customer: Customer) => void;
}

const goalLabels: Record<CustomerGoal, string> = {
  lose_weight: "Lose weight",
  build_muscle: "Build muscle",
  eat_healthier: "Eat healthier",
  maintain_weight: "Maintain weight",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function Avatar({ customer }: { customer: Customer }) {
  const [failed, setFailed] = useState(false);
  const avatarUrl = `https://i.pravatar.cc/160?u=${encodeURIComponent(customer.id)}`;

  return (
    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
      {failed ? (
        customer.initials
      ) : (
        <img
          src={avatarUrl}
          alt=""
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

function SignalIcon({ signal }: { signal: CustomerSignal }) {
  if (signal.severity === "positive") {
    return <CheckCircle2 aria-hidden="true" className="size-4 text-emerald-600" />;
  }
  return (
    <AlertTriangle
      aria-hidden="true"
      className={cn(
        "size-4",
        signal.severity === "critical" ? "text-rose-600" : "text-amber-600",
      )}
    />
  );
}

function InteractionIcon({ interaction }: { interaction: CustomerInteraction }) {
  const className = "size-4 text-slate-500";
  if (interaction.type === "call") return <Phone aria-hidden="true" className={className} />;
  if (interaction.type === "email") return <Mail aria-hidden="true" className={className} />;
  return <MessageSquare aria-hidden="true" className={className} />;
}

function UsageTrend({ values, name }: { values: readonly number[]; name: string }) {
  const max = Math.max(...values, 1);

  return (
    <div
      className="flex h-24 items-end gap-1.5"
      role="img"
      aria-label={`${name}'s recent weekly activity trend: ${values.join(", ")}`}
    >
      {values.map((value, index) => (
        <span
          key={`${index}-${value}`}
          className={cn(
            "min-h-1 flex-1 rounded-t-sm",
            index === values.length - 1 ? "bg-blue-600" : "bg-slate-200",
          )}
          style={{ height: `${Math.max(6, (value / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

export function CustomerDrawer({
  customer,
  open,
  onOpenChange,
  onCall,
}: CustomerDrawerProps) {
  const reduceMotion = useReducedMotion();
  const duration = reduceMotion ? 0 : 0.18;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && customer ? (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-slate-950/35"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration }}
              />
            </Dialog.Overlay>

            <Dialog.Content asChild forceMount>
              <motion.aside
                className="fixed inset-y-0 right-0 z-50 flex h-dvh w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-xl outline-none"
                initial={{ opacity: 0, x: reduceMotion ? 0 : 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: reduceMotion ? 0 : 24 }}
                transition={{ duration, ease: "easeOut" }}
              >
                <header className="border-b border-slate-200 px-6 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar customer={customer} />
                      <div className="min-w-0">
                        <Dialog.Title className="truncate text-balance text-lg font-semibold text-slate-950">
                          {customer.name}
                        </Dialog.Title>
                        <Dialog.Description className="truncate text-pretty text-sm text-slate-500">
                          {customer.email}
                        </Dialog.Description>
                      </div>
                    </div>
                    <Dialog.Close asChild>
                      <button
                        type="button"
                        className="size-9 shrink-0 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                        aria-label="Close customer profile"
                      >
                        <X aria-hidden="true" className="mx-auto size-4" />
                      </button>
                    </Dialog.Close>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700">
                      {customer.plan} · {customer.billingCycle}
                    </span>
                    <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-700">
                      {customer.churnRisk}% churn risk
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 capitalize text-slate-600">
                      {customer.platform} · {customer.country}
                    </span>
                  </div>
                </header>

                <div className="flex-1 overflow-y-auto px-6 py-5">
                  <section
                    aria-labelledby="why-calling-title"
                    className="mb-7 rounded-lg border border-blue-200 bg-blue-50 p-4"
                  >
                    <h3 id="why-calling-title" className="text-sm font-semibold text-blue-950">
                      Why we're calling
                    </h3>
                    <p className="mt-1 text-pretty text-sm leading-6 text-blue-950/75">
                      Weekly activity fell from {customer.weeklyEvents.baseline} to{" "}
                      {customer.weeklyEvents.recent} events, and {customer.name.split(" ")[0]} has
                      been inactive for {customer.daysInactive} days. The call will learn what
                      changed before choosing any next action.
                    </p>
                  </section>

                  <section aria-labelledby="customer-context-title">
                    <div className="flex items-center justify-between">
                      <h3 id="customer-context-title" className="text-sm font-semibold text-slate-950">
                        Customer context
                      </h3>
                      <span className="text-xs tabular-nums text-slate-500">
                        LTV {currencyFormatter.format(customer.lifetimeValue)}
                      </span>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-slate-200 p-3">
                        <dt className="flex items-center gap-2 text-xs text-slate-500">
                          <Target aria-hidden="true" className="size-3.5" /> Goal
                        </dt>
                        <dd className="mt-2 text-sm font-medium text-slate-900">
                          {goalLabels[customer.goal]}
                        </dd>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-3">
                        <dt className="flex items-center gap-2 text-xs text-slate-500">
                          <CalendarClock aria-hidden="true" className="size-3.5" /> Renewal
                        </dt>
                        <dd className="mt-2 text-sm font-medium text-slate-900">
                          {customer.renewalAt
                            ? dateFormatter.format(new Date(customer.renewalAt))
                            : "No renewal scheduled"}
                        </dd>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-3">
                        <dt className="flex items-center gap-2 text-xs text-slate-500">
                          <Activity aria-hidden="true" className="size-3.5" /> Weekly activity
                        </dt>
                        <dd className="mt-2 text-sm font-medium tabular-nums text-slate-900">
                          {customer.weeklyEvents.baseline} → {customer.weeklyEvents.recent}
                        </dd>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-3">
                        <dt className="flex items-center gap-2 text-xs text-slate-500">
                          <Smartphone aria-hidden="true" className="size-3.5" /> Inactive
                        </dt>
                        <dd className="mt-2 text-sm font-medium tabular-nums text-slate-900">
                          {customer.daysInactive} days
                        </dd>
                      </div>
                    </dl>
                  </section>

                  <section className="mt-7" aria-labelledby="usage-trend-title">
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <h3 id="usage-trend-title" className="text-sm font-semibold text-slate-950">
                          Usage trend
                        </h3>
                        <p className="mt-1 text-xs text-slate-500">Weekly tracked meals</p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-rose-700">
                        {customer.usageChangePercent}%
                      </span>
                    </div>
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <UsageTrend values={customer.usageTrend} name={customer.name} />
                    </div>
                  </section>

                  <section className="mt-7" aria-labelledby="signals-title">
                    <h3 id="signals-title" className="text-sm font-semibold text-slate-950">
                      Signals
                    </h3>
                    <ul className="mt-3 space-y-2">
                      {customer.signals.map((signal) => (
                        <li key={signal.id} className="flex gap-3 rounded-lg border border-slate-200 p-3">
                          <span className="mt-0.5"><SignalIcon signal={signal} /></span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-slate-900">{signal.label}</span>
                            <span className="mt-0.5 block text-pretty text-xs leading-5 text-slate-500">
                              {signal.detail}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section className="mt-7" aria-labelledby="interactions-title">
                    <h3 id="interactions-title" className="text-sm font-semibold text-slate-950">
                      Recent interactions
                    </h3>
                    {customer.interactions.length ? (
                      <ol className="mt-3 space-y-3">
                        {customer.interactions.map((interaction) => (
                          <li key={interaction.id} className="flex gap-3">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white">
                              <InteractionIcon interaction={interaction} />
                            </span>
                            <span className="min-w-0 pt-0.5">
                              <span className="block text-pretty text-sm text-slate-800">
                                {interaction.summary}
                              </span>
                              <span className="mt-1 block text-xs text-slate-500">
                                {dateFormatter.format(new Date(interaction.at))}
                                {interaction.outcome ? ` · ${interaction.outcome}` : ""}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="mt-3 text-pretty text-sm text-slate-500">
                        No previous outreach. Start with a short research call.
                      </p>
                    )}
                  </section>
                </div>

                <footer
                  className="border-t border-slate-200 bg-white px-6 pt-4"
                  style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
                >
                  <motion.button
                    type="button"
                    whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                    transition={{ duration: 0.12 }}
                    onClick={() => {
                      onOpenChange(false);
                      onCall(customer);
                    }}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  >
                    <PhoneCall aria-hidden="true" className="size-4" />
                    Call {customer.name.split(" ")[0]}
                  </motion.button>
                </footer>
              </motion.aside>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}
