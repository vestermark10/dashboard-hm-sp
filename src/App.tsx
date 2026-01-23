import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import axios from "axios";

type TelephonySide =
{
  queue: number;
  lost: number;
  answered: number;
  answerRate: number;
  agents: {
    ready: number;
    busy: number;
    other: number;
    total: number;
  };
};

type TelephonyResponse = {
  hallmonitor: TelephonySide;
  switchpay: TelephonySide;
};

type JiraIssue = {
  key: string;
  title: string;
  status: string;
  age: string;
};

type JiraSupportData = {
  openIssues: number;
  newToday: number;
  closedToday: number;
  criticalP1: number;
  topIssues: JiraIssue[];
  trendData: { date: string; created: number; resolved: number }[];
};

type JiraSupportResponse = {
  hallmonitor: JiraSupportData;
  switchpay: JiraSupportData;
};

type PipelineStage = {
  label: string;
  value: number;
};

type JiraOrdersPipelineResponse = {
  hallmonitor: { stages: PipelineStage[] };
  switchpay: { stages: PipelineStage[] };
};

type EconomicData = {
  openOrders: number;
  openDraftInvoices: number;
};

type EconomicResponse = {
  hallmonitor: EconomicData;
  switchpay: EconomicData;
};

export default function App()
{
  const [telephony, setTelephony] = useState<TelephonyResponse | null>(null);
  const [jiraSupport, setJiraSupport] = useState<JiraSupportResponse | null>(null);
  const [jiraOrders, setJiraOrders] = useState<JiraOrdersPipelineResponse | null>(null);
  const [economic, setEconomic] = useState<EconomicResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>("");

  // Hent alle data fra backend
  useEffect(() => {
    const fetchAllData = async () => {
      try {
        const [telephonyRes, jiraSupportRes, jiraOrdersRes, economicRes] = await Promise.all([
          axios.get<TelephonyResponse>("http://192.168.1.130:3001/api/telephony/support"),
          axios.get<JiraSupportResponse>("http://192.168.1.130:3001/api/jira/support"),
          axios.get<JiraOrdersPipelineResponse>("http://192.168.1.130:3001/api/jira/orders-pipeline"),
          axios.get<EconomicResponse>("http://192.168.1.130:3001/api/economic/open-posts")
        ]);

        setTelephony(telephonyRes.data);
        setJiraSupport(jiraSupportRes.data);
        setJiraOrders(jiraOrdersRes.data);
        setEconomic(economicRes.data);
        setLastUpdate(new Date().toLocaleTimeString("da-DK"));
        setError(null);
      } catch (err) {
        console.error("API fejl:", err);
        setError("Kunne ikke hente data fra backend");
      }
    };

    fetchAllData();

    // Auto-refresh hvert 5. minut
    const interval = setInterval(fetchAllData, 300000);
    return () => clearInterval(interval);
  }, []);

  const hm = telephony?.hallmonitor;
  const sp = telephony?.switchpay;

  // små helpers
  const fmt = (v: string | number | undefined | null) =>
    v === undefined || v === null ? "–" : String(v);

  const hmTotalAgents =
    hm?.agents.ready && hm?.agents.busy !== undefined && hm?.agents.other !== undefined
      ? hm.agents.ready + hm.agents.busy + hm.agents.other
      : undefined;

  const spTotalAgents =
    sp?.agents.ready && sp?.agents.busy !== undefined && sp?.agents.other !== undefined
      ? sp.agents.ready + sp.agents.busy + sp.agents.other
      : undefined;

  return (
    <div className="h-screen overflow-hidden bg-slate-950 text-slate-50">
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-slate-900/60 via-slate-950 to-black -z-10" />

      <main className="h-full flex flex-col mx-auto max-w-[1920px] px-6 py-3">
        {/* Topbar */}
        <header className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              VestPol – Live Operations
            </h1>
            <p className="mt-0.5 text-xs text-slate-400">
              HallMonitor &amp; SwitchPay · Telefoni · Jira Support · Jira Orders ·
              e-conomic
            </p>
            {error && (
              <p className="mt-1 text-xs text-red-400">
                {error} (viser fallback-tal indtil videre)
              </p>
            )}
          </div>
          <div className="flex flex-col items-end text-xs text-slate-400">
            <span>Periode: Sidste 24 timer</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              <span>Auto-refresh: 5 min.</span>
            </div>
          </div>
        </header>

        {/* 2 kolonner – HallMonitor / SwitchPay */}
        <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
          {/* ==================== HALLMONITOR ==================== */}
          <section className="space-y-3 flex flex-col min-h-0">
            <BrandHeader name="HallMonitor" />

            {/* Telefoni – ala One-Connect */}
            <Card>
              <QueueHeader
                title="Telefon"
                agentsText={
                  hm
                    ? `Tilmeldte (${hmTotalAgents}/${hm.agents.total})`
                    : "Tilmeldte (–/–)"
                }
                counts={{
                  green: hm?.agents.ready ?? 0,
                  red: hm?.agents.busy ?? 0,
                  gray: hm?.agents.other ?? 0,
                }}
              />
              <QueueStatsRow
                items={[
                  { label: "KØ", value: fmt(hm?.queue ?? 0) },
                  { label: "MISTET", value: fmt(hm?.lost ?? 0) },
                  { label: "BESVARET", value: fmt(hm?.answered ?? 0) },
                  {
                    label: "SVARPROCENT",
                    value: `${fmt(hm?.answerRate ?? 0)}%`,
                    highlight: true,
                  },
                ]}
              />
            </Card>

            {/* Jira Support */}
            <Card title="Jira Support – Overblik">
              <div className="grid grid-cols-4 gap-2 mb-3">
                <Kpi label="Åbne sager" value={fmt(jiraSupport?.hallmonitor?.openIssues ?? 0)} />
                <Kpi label="Nye i dag" value={fmt(jiraSupport?.hallmonitor?.newToday ?? 0)} />
                <Kpi label="Lukket i dag" value={fmt(jiraSupport?.hallmonitor?.closedToday ?? 0)} tone="good" />
                <Kpi label="Kritiske (P1)" value={fmt(jiraSupport?.hallmonitor?.criticalP1 ?? 0)} tone="bad" />
              </div>
              <TrendChart
                data={jiraSupport?.hallmonitor?.trendData ?? []}
                label="30 dages trend"
              />
            </Card>

            {/* Jira Orders – søjler */}
            <Card title="Jira Orders – Pipeline">
              <PipelineColumns
                stages={jiraOrders?.hallmonitor?.stages ?? []}
              />
            </Card>

            {/* e-conomic – kun counts */}
            <Card title="e-conomic – Åbne poster">
              <div className="grid grid-cols-2 gap-4">
                <Kpi label="Åbne ordrer" value={fmt(economic?.hallmonitor?.openOrders ?? 0)} />
                <Kpi label="Åbne fakturakladder" value={fmt(economic?.hallmonitor?.openDraftInvoices ?? 0)} />
              </div>
            </Card>
          </section>

          {/* ==================== SWITCHPAY ==================== */}
          <section className="space-y-3 flex flex-col min-h-0">
            <BrandHeader name="SwitchPay" />

            {/* Telefoni */}
            <Card>
              <QueueHeader
                title="Telefon"
                agentsText={
                  sp
                    ? `Tilmeldte (${spTotalAgents}/${sp.agents.total})`
                    : "Tilmeldte (–/–)"
                }
                counts={{
                  green: sp?.agents.ready ?? 0,
                  red: sp?.agents.busy ?? 0,
                  gray: sp?.agents.other ?? 0,
                }}
              />
              <QueueStatsRow
                items={[
                  { label: "KØ", value: fmt(sp?.queue ?? 0) },
                  { label: "MISTET", value: fmt(sp?.lost ?? 0) },
                  { label: "BESVARET", value: fmt(sp?.answered ?? 0) },
                  {
                    label: "SVARPROCENT",
                    value: `${fmt(sp?.answerRate ?? 0)}%`,
                    highlight: true,
                  },
                ]}
              />
            </Card>

            {/* Jira Support */}
            <Card title="Jira Support – Overblik">
              <div className="grid grid-cols-4 gap-2 mb-3">
                <Kpi label="Åbne sager" value={fmt(jiraSupport?.switchpay?.openIssues ?? 0)} />
                <Kpi label="Nye i dag" value={fmt(jiraSupport?.switchpay?.newToday ?? 0)} />
                <Kpi label="Lukket i dag" value={fmt(jiraSupport?.switchpay?.closedToday ?? 0)} tone="good" />
                <Kpi label="Kritiske (P1)" value={fmt(jiraSupport?.switchpay?.criticalP1 ?? 0)} tone="warn" />
              </div>
              <TrendChart
                data={jiraSupport?.switchpay?.trendData ?? []}
                label="30 dages trend"
              />
            </Card>

            {/* Jira Orders – søjler */}
            <Card title="Jira Orders – Pipeline">
              <PipelineColumns
                stages={jiraOrders?.switchpay?.stages ?? []}
              />
            </Card>

            {/* e-conomic – kun counts */}
            <Card title="e-conomic – Åbne poster">
              <div className="grid grid-cols-2 gap-4">
                <Kpi label="Åbne ordrer" value={fmt(economic?.switchpay?.openOrders ?? 0)} />
                <Kpi label="Åbne fakturakladder" value={fmt(economic?.switchpay?.openDraftInvoices ?? 0)} />
              </div>
            </Card>
          </section>
        </div>

        <footer className="flex justify-between text-[10px] text-slate-500 mt-2 py-1">
          <span>Senest opdateret: {lastUpdate || "Loading..."}</span>
          <span>Datakilder: Telefonsystem · Jira · e-conomic</span>
        </footer>
      </main>
    </div>
  );
}

/* ====== små komponenter ====== */

function BrandHeader({ name }: { name: string }) {
  const logoSrc = name === "HallMonitor"
    ? "/Logo-HallMonitor.png"
    : "/SwitchPay-logo_250px.png";

  return (
    <div className="flex items-center">
      <img
        src={logoSrc}
        alt={name}
        className="h-8 object-contain"
      />
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/80 p-3 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
      {title && (
        <h3 className="mb-2 text-base font-semibold tracking-tight">{title}</h3>
      )}
      {children}
    </div>
  );
}

/* --- Telefoni ala One-Connect --- */

type QueueCounts = { green: number; red: number; gray: number };

function QueueHeader({
  title,
  agentsText,
  counts,
}: {
  title: string;
  agentsText: string;
  counts: QueueCounts;
}) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-slate-800 pb-1.5 mb-1.5">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[10px]">
            👥
          </span>
          <span className="font-medium">{title}</span>
        </div>
        <span className="text-[10px] text-slate-400">{agentsText}</span>
      </div>
      <div className="flex items-center justify-end gap-1 text-xs">
        <Badge color="bg-emerald-500" value={counts.green} />
        <Badge color="bg-red-500" value={counts.red} />
        <Badge color="bg-slate-500" value={counts.gray} />
      </div>
    </div>
  );
}

function Badge({ color, value }: { color: string; value: number }) {
  return (
    <div
      className={`min-w-[1.8rem] rounded-md px-1.5 py-0.5 text-center text-[11px] font-semibold text-white ${color}`}
    >
      {value}
    </div>
  );
}

type QueueStatItem = {
  label: string;
  value: string;
  highlight?: boolean;
};

function QueueStatsRow({
  items,
  compact,
}: {
  items: QueueStatItem[];
  compact?: boolean;
}) {
  if (compact) {
    // NEDERSTE RÆKKE – 2 store bokse der fylder hele bredden
    return (
      <div className="mt-2 grid grid-cols-2 gap-2 text-center text-xs">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-slate-800 bg-slate-950/70
                       px-3 py-2 h-12 flex flex-col items-center justify-center"
          >
            <div className="text-[0.6rem] uppercase tracking-wide text-slate-400">
              {item.label}
            </div>
            <div className="text-sm font-semibold text-slate-100">
              {item.value}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ØVERSTE RÆKKE – 4 normale bokse
  return (
    <div className="mt-1 grid grid-cols-4 gap-1.5 text-center text-xs">
      {items.map((item) => (
        <div
          key={item.label}
          className={`rounded-lg px-2 py-2 ${
            item.highlight
              ? "bg-slate-100 text-slate-900"
              : "bg-slate-950/70 border border-slate-800 text-slate-100"
          }`}
        >
          <div
            className={`text-[0.6rem] uppercase tracking-wide ${
              item.highlight ? "text-slate-600" : "text-slate-400"
            }`}
          >
            {item.label}
          </div>
          <div className="text-sm font-semibold">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

/* --- Jira / Økonomi komponenter --- */

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "warn";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-400"
      : tone === "bad"
      ? "text-red-400"
      : tone === "warn"
      ? "text-amber-300"
      : "text-sky-300";

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-2 py-1.5">
      <div className="text-[9px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className={`mt-0.5 text-xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

/* --- Jira Support – trend chart --- */

function TrendChart({
  data,
  label,
}: {
  data: { date: string; created: number; resolved: number; open?: number }[];
  label: string;
}) {
  if (!data || data.length === 0) {
    return <div className="text-xs text-slate-400 text-center py-4">Ingen data tilgængelig</div>;
  }

  const maxValue = Math.max(
    ...data.map((d) => Math.max(d.created, d.resolved, d.open || 0)),
    1
  );
  const chartHeight = 70; // px - lidt højere for plads til tal over søjler
  const padding = 2; // px - reduceret bottom padding
  const topPadding = 10; // px - ekstra plads til tal over søjler

  // Beregn punkter for SVG path
  const createPath = (values: number[]) => {
    const points = values.map((val, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = chartHeight - topPadding - (val / maxValue) * (chartHeight - topPadding - padding) - padding;
      return `${x},${y}`;
    });
    return `M ${points.join(" L ")}`;
  };

  const createdValues = data.map(d => d.created);
  const resolvedValues = data.map(d => d.resolved);

  const createdPath = createPath(createdValues);
  const resolvedPath = createPath(resolvedValues);

  return (
    <div className="space-y-1">
      <div className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</div>

      {/* Wrapper for SVG and overlay */}
      <div className="relative">
        {/* Åbne sager tal - HTML overlay over SVG */}
        <div className="absolute inset-0 pointer-events-none">
          {data.map((point, i) => {
            if (!point.open) return null;
            const x = (i / (data.length - 1)) * 100;
            const barHeight = (point.open / maxValue) * (chartHeight - topPadding - padding);
            const y = topPadding + (chartHeight - topPadding - barHeight - padding);

            return (
              <div
                key={`open-label-${i}`}
                className="absolute text-[6px] -translate-x-1/2"
                style={{
                  left: `${x}%`,
                  top: `${y - 8}px`
                }}
              >
                <span className="text-slate-300 font-medium">{point.open}</span>
              </div>
            );
          })}
        </div>

        <svg
          viewBox={`0 0 100 ${chartHeight}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height: `${chartHeight}px` }}
        >
        {/* Åbne sager - tynde søjler ALLERFØRST så alt andet ligger oven på */}
        {data.map((point, i) => {
          if (!point.open) return null;
          const x = (i / (data.length - 1)) * 100;
          const barWidth = 100 / data.length * 0.6; // 60% af tilgængelig plads
          const barHeight = (point.open / maxValue) * (chartHeight - topPadding - padding);
          const y = chartHeight - topPadding - barHeight - padding;

          return (
            <rect
              key={`bar-${i}`}
              x={x - barWidth / 2}
              y={y}
              width={barWidth}
              height={barHeight}
              fill="rgb(51 65 85)"
              opacity="0.3"
            />
          );
        })}

        {/* Grid lines */}
        <line x1="0" y1={chartHeight / 2} x2="100" y2={chartHeight / 2}
          stroke="rgb(51 65 85)" strokeWidth="0.2" strokeDasharray="1,1" />

        {/* Created line */}
        <path
          d={createdPath}
          fill="none"
          stroke="rgb(14 165 233)"
          strokeWidth="0.8"
          vectorEffect="non-scaling-stroke"
        />

        {/* Resolved line */}
        <path
          d={resolvedPath}
          fill="none"
          stroke="rgb(16 185 129)"
          strokeWidth="0.8"
          vectorEffect="non-scaling-stroke"
        />

        {/* Created dots */}
        {createdValues.map((val, i) => {
          const x = (i / (createdValues.length - 1)) * 100;
          const y = chartHeight - topPadding - (val / maxValue) * (chartHeight - topPadding - padding) - padding;
          return (
            <circle
              key={`c-${i}`}
              cx={x}
              cy={y}
              r="0.6"
              fill="rgb(14 165 233)"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

        {/* Resolved dots */}
        {resolvedValues.map((val, i) => {
          const x = (i / (resolvedValues.length - 1)) * 100;
          const y = chartHeight - topPadding - (val / maxValue) * (chartHeight - topPadding - padding) - padding;
          return (
            <circle
              key={`r-${i}`}
              cx={x}
              cy={y}
              r="0.6"
              fill="rgb(16 185 129)"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

        </svg>
      </div>

      {/* Data labels - hver dag */}
      <div className="relative w-full" style={{ minHeight: '18px' }}>
        {data.map((point, i) => {
          const x = (i / (data.length - 1)) * 100;
          return (
            <div
              key={`data-${i}`}
              className="absolute text-[6px] -translate-x-1/2 flex flex-col items-center leading-tight"
              style={{ left: `${x}%`, top: 0 }}
            >
              <span className="text-sky-400 font-medium">{point.created}</span>
              <span className="text-emerald-400 font-medium">{point.resolved}</span>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between text-[9px] text-slate-400">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-sky-500 rounded-full" />
            <span>Created</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-emerald-500 rounded-full" />
            <span>Resolved</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-1.5 bg-slate-600 opacity-30" />
          <span>Åbne</span>
        </div>
      </div>
    </div>
  );
}

/* --- Jira Orders – søjlediagram --- */

function PipelineColumns({
  stages,
}: {
  stages: { label: string; value: number }[];
}) {
  const max = stages.reduce((m, s) => (s.value > m ? s.value : m), 1);
  const maxHeight = 100; // px - reduceret fra 150px

  return (
    <div className="space-y-2">
      {/* Søjler */}
      <div className="flex h-32 items-end justify-evenly">
        {stages.map((s, i) => {
          const ratio = s.value / max || 0;
          const barHeight = 20 + ratio * (maxHeight - 20); // min 20px, max 100px

          let colorClass = "bg-cyan-500";
          if (i === 1) colorClass = "bg-emerald-400";
          if (i === 2) colorClass = "bg-amber-400";
          if (i === 3) colorClass = "bg-violet-500";

          return (
            <div key={s.label} className="flex flex-col items-center gap-1">
              <div
                className={`w-5 rounded-t-lg shadow-lg shadow-black/40 ${colorClass}`}
                style={{ height: `${barHeight}px` }}
              />
              <div className="text-xs font-semibold text-slate-100">
                {s.value}
              </div>
              <div className="text-[10px] text-slate-400 text-center">
                {s.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
