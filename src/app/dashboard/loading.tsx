/** Skeleton for the case list, so the dashboard never flashes blank. */
export default function DashboardLoading() {
  return (
    <div className="min-h-screen">
      <div className="h-14 border-b border-cream-300 bg-cream-50" />

      <main className="mx-auto max-w-5xl px-4 py-8" aria-busy="true" aria-label="Loading cases">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="h-6 w-24 animate-pulse rounded bg-cream-300" />
            <div className="mt-2 h-4 w-32 animate-pulse rounded bg-cream-200" />
          </div>
          <div className="h-9 w-28 animate-pulse rounded bg-cream-200" />
        </div>

        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <li key={i} className="surface p-4">
              <div className="flex items-start gap-3">
                <div className="h-11 w-11 shrink-0 animate-pulse rounded-md bg-cream-200" />
                <div className="flex-1">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-cream-300" />
                  <div className="mt-2 h-3 w-full animate-pulse rounded bg-cream-200" />
                </div>
              </div>
              <div className="mt-4 h-3 w-2/3 animate-pulse rounded bg-cream-200" />
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
