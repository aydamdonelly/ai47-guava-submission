import { useMemo, useState } from "react";
import { ArrowUpRight, PhoneCall, Search, Users } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "../lib/cn";
import type {
  Customer,
  CustomerGoal,
  CustomerSegment,
} from "../product/types";

type SegmentFilter = "all" | CustomerSegment;

interface CustomerTableProps {
  customers: readonly Customer[];
  onSelect: (customer: Customer) => void;
  onCall: (customer: Customer) => void;
}

type DisplayStatus = "Active" | "Inactive" | "At Risk" | "Trial" | "Cancelled";

const statusStyles: Record<DisplayStatus, string> = {
  Active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Trial: "border-blue-200 bg-blue-50 text-blue-700",
  "At Risk": "border-amber-200 bg-amber-50 text-amber-800",
  Inactive: "border-slate-200 bg-slate-100 text-slate-700",
  Cancelled: "border-rose-200 bg-rose-50 text-rose-700",
};

function displayStatus(customer: Customer): DisplayStatus {
  if (customer.status === "trialing") return "Trial";
  if (customer.status === "cancelled" || customer.status === "expired") return "Cancelled";
  if (customer.segment === "churn") return "At Risk";
  if (customer.segment === "reactivate") return "Inactive";
  return "Active";
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
  const avatarUrl = `https://i.pravatar.cc/96?u=${encodeURIComponent(customer.id)}`;

  return (
    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
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

function RiskValue({ value }: { value: number }) {
  const tone =
    value >= 75 ? "text-rose-700" : value >= 50 ? "text-amber-700" : "text-emerald-700";

  return (
    <div className="min-w-24">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className={cn("font-semibold tabular-nums", tone)}>{value}%</span>
        <span className="text-slate-500">risk</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        <div
          className={cn(
            "h-full rounded-full",
            value >= 75 ? "bg-rose-500" : value >= 50 ? "bg-amber-500" : "bg-emerald-500",
          )}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}

export function CustomerTable({ customers, onSelect, onCall }: CustomerTableProps) {
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<SegmentFilter>("all");
  const reduceMotion = useReducedMotion();

  const filteredCustomers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return customers.filter((customer) => {
      const matchesSegment = segment === "all" || customer.segment === segment;
      const matchesQuery =
        !normalizedQuery ||
        [
          customer.name,
          customer.email,
          customer.plan,
          customer.country,
          displayStatus(customer),
          goalLabels[customer.goal],
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      return matchesSegment && matchesQuery;
    });
  }, [customers, query, segment]);

  const tap = reduceMotion ? undefined : { scale: 0.97 };

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-balance text-base font-semibold text-slate-950">Smartset customers</h2>
          <p className="mt-1 text-pretty text-sm text-slate-500">
            {filteredCustomers.length} of {customers.length} customers
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative block">
            <span className="sr-only">Search customers</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search customers"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 sm:w-64"
            />
          </label>

          <label>
            <span className="sr-only">Filter by segment</span>
            <select
              value={segment}
              onChange={(event) => setSegment(event.target.value as SegmentFilter)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 sm:w-40"
            >
              <option value="all">All segments</option>
              <option value="churn">At risk</option>
              <option value="love">Champions</option>
              <option value="reactivate">Reactivate</option>
            </select>
          </label>
        </div>
      </div>

      {filteredCustomers.length === 0 ? (
        <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
          <Users aria-hidden="true" className="size-8 text-slate-300" />
          <h3 className="mt-3 text-balance text-sm font-semibold text-slate-900">
            No customers match this view
          </h3>
          <p className="mt-1 max-w-sm text-pretty text-sm text-slate-500">
            Clear the current filters to return to the complete Smartset.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setSegment("all");
            }}
            className="mt-4 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse text-left">
            <caption className="sr-only">Smartset customer retention cohort</caption>
            <thead>
              <tr className="bg-slate-50 text-xs font-medium text-slate-500">
                <th scope="col" className="px-5 py-3">Customer</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Goal</th>
                <th scope="col" className="px-4 py-3">Last active</th>
                <th scope="col" className="px-4 py-3">Usage</th>
                <th scope="col" className="px-4 py-3">Churn risk</th>
                <th scope="col" className="px-4 py-3">ARR at risk</th>
                <th scope="col" className="px-4 py-3">Last call</th>
                <th scope="col" className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCustomers.map((customer) => {
                const lastCall = customer.interactions.find(
                  (interaction) => interaction.type === "call",
                );
                const arrAtRisk = customer.subscriptionValue * 12;
                const status = displayStatus(customer);

                return (
                <tr key={customer.id} className="text-sm text-slate-700 hover:bg-slate-50/80">
                  <td className="px-5 py-3.5">
                    <button
                      type="button"
                      onClick={() => onSelect(customer)}
                      className="group flex max-w-64 items-center gap-3 rounded-md text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
                      aria-label={`Open ${customer.name}'s customer profile`}
                    >
                      <Avatar customer={customer} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1 font-medium text-slate-950 group-hover:text-blue-700">
                          <span className="truncate">{customer.name}</span>
                          <ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0" />
                        </span>
                        <span className="block truncate text-xs text-slate-500">{customer.email}</span>
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2 py-1 text-xs font-medium",
                        statusStyles[status],
                      )}
                    >
                      {status}
                    </span>
                    <div className="mt-1 text-xs text-slate-500">{customer.plan}</div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="font-medium text-slate-900">{goalLabels[customer.goal]}</div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="text-slate-900">
                      {dateFormatter.format(new Date(customer.lastActiveAt))}
                    </div>
                    <div className="text-xs tabular-nums text-slate-500">
                      {customer.daysInactive === 0
                        ? "Active today"
                        : `${customer.daysInactive} days ago`}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="font-medium tabular-nums text-slate-900">
                      {customer.weeklyEvents.recent}
                      <span className="font-normal text-slate-400"> / {customer.weeklyEvents.baseline}</span>
                    </div>
                    <div
                      className={cn(
                        "text-xs font-medium tabular-nums",
                        customer.usageChangePercent < 0 ? "text-rose-600" : "text-emerald-600",
                      )}
                    >
                      {customer.usageChangePercent > 0 ? "+" : ""}
                      {customer.usageChangePercent}%
                    </div>
                  </td>
                  <td className="px-4 py-3.5"><RiskValue value={customer.churnRisk} /></td>
                  <td className="px-4 py-3.5">
                    <div className="font-medium tabular-nums text-slate-900">
                      {currencyFormatter.format(arrAtRisk)}
                    </div>
                    <div className="text-xs text-slate-500">annualized</div>
                  </td>
                  <td className="px-4 py-3.5">
                    {lastCall ? (
                      <>
                        <div className="text-slate-900">
                          {dateFormatter.format(new Date(lastCall.at))}
                        </div>
                        <div className="max-w-28 truncate text-xs text-slate-500">
                          {lastCall.outcome ?? "Completed"}
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">Not called</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end gap-2">
                      <motion.button
                        type="button"
                        whileTap={tap}
                        transition={{ duration: 0.12 }}
                        onClick={() => onCall(customer)}
                        className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                        aria-label={`Call ${customer.name}`}
                      >
                        <PhoneCall aria-hidden="true" className="size-3.5" />
                        Call
                      </motion.button>
                      <motion.button
                        type="button"
                        whileTap={tap}
                        transition={{ duration: 0.12 }}
                        onClick={() => onSelect(customer)}
                        className="size-9 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                        aria-label={`View ${customer.name}`}
                      >
                        <ArrowUpRight aria-hidden="true" className="mx-auto size-4" />
                      </motion.button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
