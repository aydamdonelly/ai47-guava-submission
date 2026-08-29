import { useEffect, useState } from "react";
import { CalendarDays, Phone, ShieldCheck, Utensils } from "lucide-react";
import { api } from "../api";
import { Logo } from "../components/Logo";
import type { PublicConfig } from "../types";

export function ResidentCallButton() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .config()
      .then(setConfig)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const phone = config?.agent_phone;

  return (
    <div className="min-h-dvh bg-white px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))] text-slate-950">
      <main className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-lg flex-col">
        <div className="flex items-center justify-between">
          <Logo compact />
          <div className="text-right">
            <div className="font-semibold">
              {loading ? "Connecting…" : config ? `Room ${config.room}` : "Unassigned room"}
            </div>
            <div className="text-sm text-slate-500">
              {loading ? "Checking device" : config?.resident_name ?? "Ask staff for help"}
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-center py-10 text-center">
          <p className="text-base font-medium text-teal-700">CareSignal room device</p>
          <h1 className="mx-auto mt-3 max-w-md text-balance text-4xl font-semibold leading-tight text-slate-950">
            What do you need?
          </h1>
          <p className="mx-auto mt-4 max-w-sm text-pretty text-lg leading-7 text-slate-600">
            Tap once, then tell us in your own words. A care team member will see requests that need help.
          </p>

          {loading ? (
            <div aria-busy="true" className="mx-auto mt-10 flex size-56 flex-col items-center justify-center rounded-full bg-slate-100 px-8 text-slate-500">
              <Phone aria-hidden="true" className="size-16" />
              <span className="mt-4 text-xl font-semibold" role="status">Connecting…</span>
            </div>
          ) : phone ? (
            <a
              href={`tel:${phone}`}
              aria-label="Call the care team and speak your request"
              className="mx-auto mt-10 flex size-56 flex-col items-center justify-center rounded-full bg-teal-700 px-8 text-white shadow-lg hover:bg-teal-800"
            >
              <Phone aria-hidden="true" className="size-16" strokeWidth={2.25} />
              <span className="mt-4 text-2xl font-semibold">Tap to speak</span>
            </a>
          ) : (
            <div className="mx-auto mt-10 flex size-56 flex-col items-center justify-center rounded-full bg-slate-200 px-8 text-slate-600">
              <Phone aria-hidden="true" className="size-16" />
              <span className="mt-4 text-xl font-semibold">Device needs setup</span>
            </div>
          )}

          {!loading && (error || !phone) && (
            <p role="status" className="mx-auto mt-5 max-w-sm text-pretty text-sm text-red-700">
              Please ask a staff member to connect this room device.
            </p>
          )}

          <div className="mt-10 grid gap-3 text-left sm:grid-cols-2">
            <div className="flex gap-3 border border-slate-200 p-4">
              <Utensils aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-teal-700" />
              <p className="text-pretty text-sm text-slate-600">Ask about meals and today’s menu.</p>
            </div>
            <div className="flex gap-3 border border-slate-200 p-4">
              <CalendarDays aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-teal-700" />
              <p className="text-pretty text-sm text-slate-600">Ask about today’s activities.</p>
            </div>
          </div>
        </div>

        <footer className="flex gap-3 border-t border-slate-200 pt-5 text-sm text-slate-500">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <p className="text-pretty">
            CareSignal does not replace the physical call button or emergency services. Press your usual emergency control if you cannot connect.
          </p>
        </footer>
      </main>
    </div>
  );
}
