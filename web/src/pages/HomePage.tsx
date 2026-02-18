import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-4xl font-semibold text-gray-900">TradingAgents Research</h1>
      <p className="mt-3 text-gray-600">Long-form multi-agent analysis workspace.</p>
      <div className="mt-8 flex gap-3">
        <Link className="rounded-xl bg-blue-600 px-4 py-2 text-white" to="/analyze/AAPL">
          Start Analysis
        </Link>
        <Link className="rounded-xl border border-gray-300 px-4 py-2" to="/history">
          View History
        </Link>
      </div>
    </main>
  );
}

