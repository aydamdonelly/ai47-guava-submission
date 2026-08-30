import type {
  BarrierId,
  Customer,
  CustomerGoal,
  CustomerSegment,
  CustomerSignal,
  FeaturedQuote,
  Plan,
  SmartsetSummary,
} from "./types";

const FIXED_NOW = Date.UTC(2026, 7, 29, 12);
const DAY_MS = 86_400_000;
const FIRST_NAMES = [
  "Noah",
  "Mia",
  "Liam",
  "Sofia",
  "Ethan",
  "Emma",
  "Lucas",
  "Ava",
  "Mateo",
  "Olivia",
  "Leo",
  "Nora",
  "Kai",
  "Lina",
  "Theo",
  "Maya",
  "Owen",
  "Zoe",
  "Milo",
  "Ella",
] as const;
const LAST_NAMES = ["Brooks", "Chen", "Garcia", "Kim", "Patel"] as const;
const BARRIERS: readonly BarrierId[] = [
  "tracking_effort",
  "accuracy",
  "price",
  "missing_feature",
  "technical_issue",
];

const isoDay = (offset: number) => new Date(FIXED_NOW + offset * DAY_MS).toISOString();
const roundMoney = (value: number) => Math.round(value * 100) / 100;

function segmentFor(index: number): CustomerSegment {
  if (index < 25) return "churn";
  if (index < 55) return "love";
  return "reactivate";
}

function goalFor(index: number): CustomerGoal {
  const slot = index % 10;
  if (slot < 5) return "lose_weight";
  if (slot < 7) return "build_muscle";
  if (slot < 9) return "eat_healthier";
  return "maintain_weight";
}

function countryFor(index: number): string {
  if (index < 58) return "United States";
  if (index < 70) return "Canada";
  if (index < 80) return "United Kingdom";
  if (index < 88) return "Germany";
  if (index < 94) return "Australia";
  return index % 2 ? "Netherlands" : "Ireland";
}

function signalsFor(
  id: string,
  segment: CustomerSegment,
  daysInactive: number,
  usageChangePercent: number,
  renewalInDays: number | null,
): readonly CustomerSignal[] {
  if (segment === "love") {
    return [
      {
        id: `${id}-signal-engagement`,
        kind: "high_engagement",
        label: "Power-user momentum",
        detail: `Usage is up ${usageChangePercent}% over baseline.`,
        severity: "positive",
        detectedAt: isoDay(-1),
      },
      {
        id: `${id}-signal-streak`,
        kind: "goal_streak",
        label: "Goal streak",
        detail: "Logged meals on at least six of the last seven days.",
        severity: "positive",
        detectedAt: isoDay(-2),
      },
    ];
  }
  const signals: CustomerSignal[] = [
    {
      id: `${id}-signal-usage`,
      kind: "usage_drop",
      label: "Usage decline",
      detail: `Weekly activity changed ${usageChangePercent}%.`,
      severity: usageChangePercent <= -70 ? "critical" : "warning",
      detectedAt: isoDay(-1),
    },
    {
      id: `${id}-signal-inactive`,
      kind: "inactive",
      label: "Inactive customer",
      detail: `No activity for ${daysInactive} days.`,
      severity: daysInactive >= 21 ? "critical" : "warning",
      detectedAt: isoDay(0),
    },
  ];
  if (renewalInDays !== null && renewalInDays <= 14) {
    signals.push({
      id: `${id}-signal-renewal`,
      kind: "renewal_soon",
      label: "Renewal approaching",
      detail: `Renews in ${renewalInDays} days.`,
      severity: "warning",
      detectedAt: isoDay(0),
    });
  }
  return signals;
}

function makeCustomer(index: number): Customer {
  const ordinal = index + 1;
  const special = index === 0;
  const segment = segmentFor(index);
  const firstName = special ? "Ammar" : FIRST_NAMES[(index - 1) % FIRST_NAMES.length];
  const lastName = special ? "Rahman" : LAST_NAMES[Math.floor((index - 1) / 20) % 5];
  const name = `${firstName} ${lastName}`;
  const id = `smart-${String(ordinal).padStart(3, "0")}`;
  const plan: Plan = special || index % 10 < 6 ? "Pro" : index % 10 < 9 ? "Plus" : "Free";
  const billingCycle = plan === "Free" ? "free" : index % 3 === 0 ? "monthly" : "annual";
  const subscriptionValue = plan === "Pro" ? 14.99 : plan === "Plus" ? 7.99 : 0;
  const daysInactive = special
    ? 16
    : segment === "churn"
      ? 7 + ((index * 7) % 20)
      : segment === "love"
        ? index % 4
        : 21 + ((index * 11) % 40);
  const usageChangePercent = special
    ? -72
    : segment === "churn"
      ? -(35 + ((index * 9) % 51))
      : segment === "love"
        ? 8 + ((index * 7) % 48)
        : -(60 + ((index * 5) % 36));
  const baseline = special ? 25 : 14 + ((index * 5) % 18);
  const recent = special ? 7 : Math.max(0, Math.round(baseline * (1 + usageChangePercent / 100)));
  const renewalInDays = special ? 11 : segment === "reactivate" ? null : 2 + ((index * 5) % 29);
  const churnRisk = special
    ? 87
    : segment === "churn"
      ? 68 + ((index * 7) % 29)
      : segment === "love"
        ? 7 + ((index * 5) % 28)
        : 54 + ((index * 7) % 35);
  const status = index >= 90 ? "trialing" : index >= 80 ? "cancelled" : "active";
  const barrier = BARRIERS[index % BARRIERS.length];

  return {
    id,
    name,
    initials: `${firstName[0]}${lastName[0]}`,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${ordinal}@example.com`,
    phone: `+1202555${String(100 + index).padStart(4, "0")}`,
    country: countryFor(index),
    platform: index % 2 ? "Android" : "iOS",
    plan,
    billingCycle,
    status,
    segment,
    subscriptionValue,
    currency: "USD",
    lifetimeValue: roundMoney(subscriptionValue * (4 + ((index * 7) % 30))),
    joinedAt: isoDay(-(80 + ((index * 13) % 650))),
    renewalAt: renewalInDays === null ? null : isoDay(renewalInDays),
    renewalInDays,
    lastActiveAt: isoDay(-daysInactive),
    daysInactive,
    goal: special ? "lose_weight" : goalFor(index),
    weeklyEvents: { baseline, recent, changePercent: usageChangePercent },
    usageChangePercent,
    usageTrend: [
      baseline + 2,
      baseline,
      Math.max(0, Math.round((baseline + recent) / 2)),
      recent,
    ],
    churnRisk,
    satisfaction: segment === "love" ? 4 + (index % 2) : segment === "churn" ? 2 + (index % 3) : 2,
    ...(segment === "love" ? {} : { primaryBarrier: barrier }),
    signals: signalsFor(id, segment, daysInactive, usageChangePercent, renewalInDays),
    interactions: [
      {
        id: `${id}-interaction-1`,
        type: segment === "reactivate" ? "email" : "in_app",
        at: isoDay(-Math.max(1, daysInactive)),
        summary: segment === "love" ? "Completed weekly goal review." : "Lifecycle signal captured.",
      },
    ],
  };
}

export const smartsetCustomers: readonly Customer[] = Array.from({ length: 100 }, (_, index) =>
  makeCustomer(index),
);

export const ammarCustomer = smartsetCustomers[0];

export const featuredQuote: FeaturedQuote = {
  id: "quote-ammar-001",
  customerId: ammarCustomer.id,
  quote: "The price was not really the issue. Logging every meal stopped fitting into my day.",
  theme: "tracking_effort",
  sentiment: "constructive",
  source: "churn",
};

const segments = {
  churn: smartsetCustomers.filter((customer) => customer.segment === "churn").length,
  love: smartsetCustomers.filter((customer) => customer.segment === "love").length,
  reactivate: smartsetCustomers.filter((customer) => customer.segment === "reactivate").length,
};

export const smartsetSummary: SmartsetSummary = {
  total: smartsetCustomers.length,
  segments,
  highRisk: smartsetCustomers.filter((customer) => customer.churnRisk >= 75).length,
  averageRisk: Math.round(
    smartsetCustomers.reduce((total, customer) => total + customer.churnRisk, 0) /
      smartsetCustomers.length,
  ),
  averageUsageChange: Math.round(
    smartsetCustomers.reduce((total, customer) => total + customer.usageChangePercent, 0) /
      smartsetCustomers.length,
  ),
  monthlyRevenue: roundMoney(
    smartsetCustomers.reduce(
      (total, customer) =>
        total + (customer.status === "active" || customer.status === "trialing" ? customer.subscriptionValue : 0),
      0,
    ),
  ),
  featuredQuote,
};
