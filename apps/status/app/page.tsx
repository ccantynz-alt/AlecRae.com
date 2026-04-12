/**
 * AlecRae Status Page
 *
 * Real-time system health dashboard for status.alecrae.com.
 * Fetches live health data from /v1/status/health and auto-refreshes
 * every 30 seconds. Falls back to static data when the API is unreachable.
 */

import { StatusDashboard } from "./components/status-dashboard";

export default function StatusPage(): React.JSX.Element {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-20" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-500 rounded-full mix-blend-screen filter blur-3xl opacity-20" />
      </div>
      <StatusDashboard />
    </main>
  );
}
