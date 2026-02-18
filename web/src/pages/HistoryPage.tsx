import { Link } from "react-router-dom";

export function HistoryPage() {
  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-3xl font-semibold text-gray-900">History</h1>
      <p className="mt-2 text-gray-600">History list can be wired to backend archives next.</p>
      <Link className="mt-6 inline-block rounded-xl border border-gray-300 px-4 py-2" to="/analyze/AAPL">
        Back to Analyze
      </Link>
    </main>
  );
}

