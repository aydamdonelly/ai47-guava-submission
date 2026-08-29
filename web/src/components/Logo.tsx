export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-9 items-center justify-center rounded-lg bg-teal-700 text-sm font-semibold text-white">
        CS
      </div>
      {!compact && (
        <div>
          <div className="font-semibold text-slate-950">CareSignal</div>
          <div className="text-xs text-slate-500">Know why they called</div>
        </div>
      )}
    </div>
  );
}
