import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="surface w-full max-w-md p-6 text-center shadow-card">
        <p className="text-5xl font-bold text-stone-300">404</p>
        <h1 className="mt-3 text-base font-semibold text-stone-800">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-stone-600">
          The page you&rsquo;re looking for doesn&rsquo;t exist or may have been
          moved.
        </p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link className="btn-primary" href="/dashboard">
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
