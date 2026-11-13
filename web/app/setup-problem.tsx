// Shown instead of a page when a setting is missing or wrong. It names the
// setting and what to do, never its value.

export function SetupProblem({ message }: { message: string }) {
  return (
    <main className="mx-auto w-full max-w-md flex-1 space-y-3 px-4 py-16">
      <h1 className="text-xl font-semibold">Setup problem</h1>
      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
        {message}
      </p>
      <p className="text-sm text-zinc-500">
        After changing a setting on Vercel, redeploy: settings only reach new deployments.
      </p>
    </main>
  );
}
