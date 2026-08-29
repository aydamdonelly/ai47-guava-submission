import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BookOpenCheck, Check, CircleCheck, Radio, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ApiError, api } from "../api";
import { Logo } from "../components/Logo";
import { RequestCard } from "../components/RequestCard";
import { cn } from "../lib/cn";
import type { DashboardData, IntakeStatus, NoteStatus } from "../types";

const emptyDashboard: DashboardData = {
  requests: [],
  notes: [],
  stats: { waiting: 0, immediate: 0, acknowledged: 0, answered_today: 0 },
};

type SummaryItem = [label: string, value: number, icon: LucideIcon];
type ConnectionState = "checking" | "live" | "offline" | "locked";
type ActionError = { targetId: string; message: string };

const connectionPresentation: Record<ConnectionState, { label: string; className: string }> = {
  checking: { label: "Checking", className: "bg-slate-100 text-slate-700" },
  live: { label: "Live", className: "bg-teal-50 text-teal-800" },
  offline: { label: "Offline", className: "bg-red-50 text-red-800" },
  locked: { label: "Access required", className: "bg-amber-50 text-amber-900" },
};

export function Dashboard() {
  const [data, setData] = useState<DashboardData>(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [hasLoadedData, setHasLoadedData] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ActionError | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [urgentAnnouncement, setUrgentAnnouncement] = useState("");
  const knownRequestIds = useRef<Set<string> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await api.dashboard();
      const previousIds = knownRequestIds.current;
      const newImmediate = previousIds
        ? next.requests.find(
            (request) =>
              request.priority === "immediate" &&
              request.status === "new" &&
              !previousIds.has(request.id),
          )
        : undefined;
      if (newImmediate) {
        setUrgentAnnouncement(
          `Immediate response requested in room ${newImmediate.room}: ${newImmediate.summary}`,
        );
      }
      knownRequestIds.current = new Set(next.requests.map((request) => request.id));
      setData(next);
      setHasLoadedData(true);
      setConnection("live");
      setConnectionMessage(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setConnection("locked");
        setConnectionMessage(
          "Access is required. Open the secured dashboard link printed by the demo command.",
        );
      } else {
        setConnection("offline");
        setConnectionMessage(
          "Live updates are paused because the local CareSignal service is unavailable.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1_250);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const queue = useMemo(
    () => data.requests.filter((request) => request.priority !== "answered" && request.status !== "resolved"),
    [data.requests],
  );

  const answered = useMemo(
    () => data.requests.filter((request) => request.priority === "answered").slice(0, 3),
    [data.requests],
  );

  const summaryItems: SummaryItem[] = [
    ["Waiting", data.stats.waiting, UsersRound],
    ["Immediate", data.stats.immediate, AlertTriangle],
    ["Acknowledged", data.stats.acknowledged, Check],
    ["Answered by voice", data.stats.answered_today, CircleCheck],
  ];

  async function changeStatus(id: string, status: IntakeStatus) {
    setBusyId(id);
    setActionError(null);
    try {
      setData(await api.updateIntake(id, status));
    } catch {
      setActionError({
        targetId: `request:${id}`,
        message: "The request status could not be saved. Please try again.",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function reviewNote(id: string, status: NoteStatus) {
    setBusyId(id);
    setActionError(null);
    try {
      setData(await api.updateNote(id, status));
    } catch {
      setActionError({
        targetId: `note:${id}`,
        message: "The logbook suggestion could not be saved. Please try again.",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function seedDemo() {
    setBusyId("seed");
    setActionError(null);
    try {
      setData(await api.seedDemo());
    } catch {
      setActionError({
        targetId: "seed",
        message: "Demo data could not be loaded. Please try again.",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <Logo />
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium text-slate-800">Northstar Senior Living</div>
              <div className="text-xs text-slate-500">Evening shift · West wing</div>
            </div>
            <div
              role="status"
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold",
                connectionPresentation[connection].className,
              )}
            >
              <Radio aria-hidden="true" className="size-4" />
              {connectionPresentation[connection].label}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-6 lg:px-8 lg:py-8">
        <p className="sr-only" role="alert">{urgentAnnouncement}</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-teal-700">Care team workspace</p>
            <h1 className="mt-1 text-balance text-3xl font-semibold text-slate-950">Resident requests</h1>
            <p className="mt-2 max-w-2xl text-pretty text-sm text-slate-600">
              Voice requests are structured for routing. Staff remain responsible for every care decision.
            </p>
          </div>
          <a
            href="/resident"
            className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            Open room device
          </a>
        </div>

        {connectionMessage && (
          <div
            role="alert"
            className="mt-5 flex flex-wrap items-center justify-between gap-3 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          >
            <span>{connectionMessage}</span>
            {connection === "offline" && (
              <button
                type="button"
                onClick={() => void refresh()}
                className="font-semibold underline underline-offset-4"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {!hasLoadedData ? (
          <section
            aria-busy={loading}
            aria-live="polite"
            className="mt-6 border border-slate-200 bg-white px-6 py-12 text-center shadow-sm"
          >
            <Radio aria-hidden="true" className="mx-auto size-8 text-slate-500" />
            <h2 className="mt-3 text-lg font-semibold">
              {loading
                ? "Connecting to request queue"
                : connection === "locked"
                  ? "Dashboard access required"
                  : "Request queue unavailable"}
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-pretty text-sm text-slate-600">
              {loading
                ? "Waiting for the first confirmed response from the local CareSignal service."
                : "No request counts or empty-state claims are shown until live data is confirmed."}
            </p>
          </section>
        ) : (
          <>
        <section aria-label="Shift summary" className="mt-6 grid gap-px overflow-hidden border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">
          {summaryItems.map(([label, value, Icon]) => (
            <div key={label} className="bg-white px-5 py-4">
              <div className="flex items-center justify-between text-sm text-slate-500">
                <span>{label}</span>
                <Icon aria-hidden="true" className="size-4" />
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">{value}</div>
            </div>
          ))}
        </section>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section aria-labelledby="queue-heading">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="queue-heading" className="text-balance text-lg font-semibold">Active queue</h2>
              <span className="text-sm tabular-nums text-slate-500">{queue.length} open</span>
              <span className="sr-only" aria-live="polite">{queue.length} active requests</span>
            </div>

            {loading ? (
              <div aria-busy="true" className="space-y-3">
                <span className="sr-only" role="status">Loading requests</span>
                {[0, 1].map((item) => (
                  <div key={item} className="h-52 bg-white ring-1 ring-slate-200" />
                ))}
              </div>
            ) : queue.length ? (
              <div className="space-y-3">
                {queue.map((request) => (
                  <RequestCard
                    key={request.id}
                    intake={request}
                    busy={busyId === request.id}
                    error={
                      actionError?.targetId === `request:${request.id}`
                        ? actionError.message
                        : undefined
                    }
                    onStatusChange={(id, status) => void changeStatus(id, status)}
                  />
                ))}
              </div>
            ) : (
              <div className="border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
                <CircleCheck aria-hidden="true" className="mx-auto size-8 text-teal-700" />
                <h3 className="mt-3 font-semibold">No active requests</h3>
                <p className="mx-auto mt-1 max-w-sm text-pretty text-sm text-slate-500">
                  Place a call from the room device or load synthetic cases for the demo.
                </p>
                <button
                  type="button"
                  disabled={busyId === "seed"}
                  aria-describedby={actionError?.targetId === "seed" ? "seed-error" : undefined}
                  onClick={() => void seedDemo()}
                  className="mt-4 min-h-11 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                >
                  {busyId === "seed" ? "Loading…" : "Load demo cases"}
                </button>
                {actionError?.targetId === "seed" && (
                  <p id="seed-error" role="alert" className="mt-3 text-sm font-medium text-red-700">
                    {actionError.message}
                  </p>
                )}
              </div>
            )}
          </section>

          <aside className="space-y-6">
            <section aria-labelledby="logbook-heading" className="border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <BookOpenCheck aria-hidden="true" className="size-5 text-teal-700" />
                <h2 id="logbook-heading" className="text-balance font-semibold">Logbook review</h2>
              </div>
              <p className="mt-2 text-pretty text-sm text-slate-500">
                Voice-derived notes are suggestions until a staff member approves them.
              </p>
              <div className="mt-4 space-y-4">
                {data.notes.filter((note) => note.status === "pending").length ? (
                  data.notes
                    .filter((note) => note.status === "pending")
                    .map((note) => (
                      <article key={note.id} className="border-t border-slate-100 pt-4 first:border-0 first:pt-0">
                        <p className="text-sm font-medium text-slate-900">{note.content}</p>
                        <p className="mt-1 text-xs text-slate-500">Room {note.room} · source: “{note.source_quote}”</p>
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            disabled={busyId === note.id}
                            aria-describedby={
                              actionError?.targetId === `note:${note.id}`
                                ? `note-${note.id}-error`
                                : undefined
                            }
                            onClick={() => void reviewNote(note.id, "approved")}
                            className="min-h-10 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={busyId === note.id}
                            aria-describedby={
                              actionError?.targetId === `note:${note.id}`
                                ? `note-${note.id}-error`
                                : undefined
                            }
                            onClick={() => void reviewNote(note.id, "rejected")}
                            className="min-h-10 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          >
                            Dismiss
                          </button>
                        </div>
                        {actionError?.targetId === `note:${note.id}` && (
                          <p
                            id={`note-${note.id}-error`}
                            role="alert"
                            className="mt-2 text-xs font-medium text-red-700"
                          >
                            {actionError.message}
                          </p>
                        )}
                      </article>
                    ))
                ) : (
                  <p className="text-sm text-slate-500">No suggestions need review.</p>
                )}
              </div>
            </section>

            <section aria-labelledby="answered-heading" className="border border-slate-200 bg-white p-5 shadow-sm">
              <h2 id="answered-heading" className="text-balance font-semibold">Handled without a trip</h2>
              <div className="mt-4 space-y-4">
                {answered.length ? (
                  answered.map((request) => (
                    <article key={request.id} className="border-t border-slate-100 pt-4 first:border-0 first:pt-0">
                      <p className="text-sm font-medium text-slate-900">Room {request.room} · {request.summary}</p>
                      <p className="mt-1 text-pretty text-xs text-slate-500">{request.answer_given}</p>
                    </article>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">No facility questions answered yet.</p>
                )}
              </div>
            </section>
          </aside>
        </div>
          </>
        )}
      </main>
    </div>
  );
}
