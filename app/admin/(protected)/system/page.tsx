import { Metadata } from "next";
import { cookies } from "next/headers";
import { Server, Database, Cpu, Layers } from "lucide-react";
import HealthStatusBadge from "@/components/admin/HealthStatusBadge";

export const metadata: Metadata = { title: "System Health" };

type HealthStatus = "healthy" | "degraded" | "down" | "unknown";

interface HealthData {
  status: HealthStatus;
  uptimeSeconds: number;
  timestamp: string;
  services: {
    database: { latencyMs: number; status: HealthStatus };
    vectorStore: { status: HealthStatus; count?: number };
    nodeRuntime: {
      status: HealthStatus;
      version: string;
      memory: { heapUsedMb: number; heapTotalMb: number; rssМb: number };
    };
  };
}

async function getHealthData(): Promise<HealthData | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("admin_session")?.value;
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  try {
    const res = await fetch(`${baseUrl}/api/admin/health`, {
      headers: { Cookie: `admin_session=${sessionCookie}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

function LatencyBar({ ms }: { ms: number }) {
  const pct = Math.min(100, (ms / 1000) * 100);
  const color = ms < 100 ? "bg-success" : ms < 500 ? "bg-warning" : "bg-danger";
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-ink w-14 text-right">
        {ms < 0 ? "N/A" : `${ms} ms`}
      </span>
    </div>
  );
}

export default async function SystemPage() {
  const data = await getHealthData();

  if (!data) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-slate text-sm font-medium">Failed to load health data.</p>
      </div>
    );
  }

  const { services, uptimeSeconds, timestamp } = data;

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink tracking-tight">System Health</h1>
          <p className="text-sm text-slate font-medium mt-1">
            Last checked {new Date(timestamp).toLocaleTimeString()}
          </p>
        </div>
        <HealthStatusBadge status={data.status} size="md" />
      </div>

      {/* Uptime */}
      <div className="bg-white border border-border rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 bg-success/10 rounded-lg flex items-center justify-center">
            <Server className="w-4 h-4 text-success" />
          </div>
          <p className="text-sm font-bold text-ink">Process Uptime</p>
        </div>
        <p className="text-3xl font-extrabold text-ink tracking-tight mt-2">
          {formatUptime(uptimeSeconds)}
        </p>
        <p className="text-xs text-muted font-medium mt-1">
          {uptimeSeconds.toLocaleString()} seconds
        </p>
      </div>

      {/* Services grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Database */}
        <div className="bg-white border border-border rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-blue" />
              <p className="text-sm font-bold text-ink">Database</p>
            </div>
            <HealthStatusBadge status={services.database.status} size="sm" />
          </div>
          <div>
            <p className="text-xs text-muted font-medium">PostgreSQL · Latency</p>
            <LatencyBar ms={services.database.latencyMs} />
          </div>
        </div>

        {/* Vector Store */}
        <div className="bg-white border border-border rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue" />
              <p className="text-sm font-bold text-ink">Vector Store</p>
            </div>
            <HealthStatusBadge status={services.vectorStore.status} size="sm" />
          </div>
          {services.vectorStore.count !== undefined && (
            <p className="text-xs text-muted font-medium">
              {services.vectorStore.count.toLocaleString()} embeddings
            </p>
          )}
        </div>

        {/* Node Runtime */}
        <div className="bg-white border border-border rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue" />
              <p className="text-sm font-bold text-ink">Node Runtime</p>
            </div>
            <HealthStatusBadge status={services.nodeRuntime.status} size="sm" />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted font-medium">
              {services.nodeRuntime.version}
            </p>
            <p className="text-xs text-muted font-medium">
              Heap: {services.nodeRuntime.memory.heapUsedMb} /{" "}
              {services.nodeRuntime.memory.heapTotalMb} MB
            </p>
            <p className="text-xs text-muted font-medium">
              RSS: {services.nodeRuntime.memory.rssМb} MB
            </p>
          </div>
        </div>
      </div>

      {/* Memory bar */}
      <div className="bg-white border border-border rounded-2xl p-5 shadow-sm">
        <p className="text-sm font-bold text-ink mb-3">Heap Memory Usage</p>
        <div className="space-y-1">
          <div className="flex justify-between text-xs font-medium text-muted mb-1">
            <span>Used: {services.nodeRuntime.memory.heapUsedMb} MB</span>
            <span>Total: {services.nodeRuntime.memory.heapTotalMb} MB</span>
          </div>
          <div className="h-3 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-blue rounded-full transition-all"
              style={{
                width: `${Math.min(
                  100,
                  (services.nodeRuntime.memory.heapUsedMb /
                    Math.max(1, services.nodeRuntime.memory.heapTotalMb)) *
                    100
                ).toFixed(1)}%`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
