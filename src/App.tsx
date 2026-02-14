import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import axios from "axios";
import { API_BASE_URL } from "./config";

type TelephonySide =
{
  queue: number;
  lost: number;
  answered: number;
  answerRate: number;
  maxWaitToday: string;
  avgWait: string;
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

type TrendWeek = {
  weekLabel: string;
  created: number;
  resolved: number;
  open: number;
};

type TrendDay = {
  dayLabel: string;
  created: number;
  resolved: number;
  open: number;
};

type TrendData = {
  weeks: TrendWeek[];
  currentWeek: TrendDay[];
};

type JiraSupportData = {
  openIssues: number;
  newToday: number;
  closedToday: number;
  criticalP1: number;
  topIssues: JiraIssue[];
  trendData: TrendData;
  timeToFirstResponse: string;
  slaCompliance?: number;        // HallMonitor only
  averageLifetime?: string;      // SwitchPay only
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

type VippsIncident = {
  id: string;
  title: string;
  content: string;
  updated: string;
  status: string;
};

type PayterComponent = {
  name: string;
  status: string;
  isOperational: boolean;
};

type ElavonIncident = {
  id: string;
  title: string;
  content: string;
  updated: string;
  status: string;
};

type StatusResponse = {
  vippsMobilePay: {
    status: string;
    hasOutage: boolean;
    incidents: VippsIncident[];
  };
  payter: {
    status: string;
    hasOutage: boolean;
    components: {
      myPayter?: PayterComponent;
      cloudPaymentService?: PayterComponent;
    };
  };
  elavon: {
    status: string;
    hasOutage: boolean;
    incidents: ElavonIncident[];
  };
  hasOutage: boolean;
  lastUpdated: string;
};

type CriticalIssue = {
  key: string;
  status: 'breached' | 'warning';
  timeRemainingMs: number;
};

type SlaStatus = {
  status: 'green' | 'yellow' | 'red' | 'unknown';
  count: number;
  breached: number;
  warning: number;
  criticalIssues: CriticalIssue[];
  error?: string;
};

type SlaResponse = {
  enhed: SlaStatus;
  backend: SlaStatus;
  lastUpdated: string;
};

export default function App()
{
  const [telephony, setTelephony] = useState<TelephonyResponse | null>(null);
  const [jiraSupport, setJiraSupport] = useState<JiraSupportResponse | null>(null);
  const [jiraOrders, setJiraOrders] = useState<JiraOrdersPipelineResponse | null>(null);
  const [economic, setEconomic] = useState<EconomicResponse | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [sla, setSla] = useState<SlaResponse | null>(null);
  const [showOutagePopup, setShowOutagePopup] = useState<boolean>(false);
  const [, setDismissedOutageKey] = useState<string | null>(() => {
    // Hent fra localStorage ved opstart
    const stored = localStorage.getItem('dismissedOutageKey');
    if (stored) {
      const parsed = JSON.parse(stored);
      // Tjek om den er udløbet (24 timer gammel)
      if (parsed.timestamp && Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
        return parsed.key;
      }
      localStorage.removeItem('dismissedOutageKey');
    }
    return null;
  });
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const formatTime = () => {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  const [currentTime, setCurrentTime] = useState<string>(formatTime());

  // Digitalt ur - opdateres hvert sekund
  useEffect(() => {
    const clockInterval = setInterval(() => {
      setCurrentTime(formatTime());
    }, 1000);
    return () => clearInterval(clockInterval);
  }, []);

  // Hent alle data fra backend
  useEffect(() => {
    const fetchAllData = async () => {
      try {
        const [telephonyRes, jiraSupportRes, jiraOrdersRes, economicRes, slaRes] = await Promise.all([
          axios.get<TelephonyResponse>(`${API_BASE_URL}/api/telephony/support`),
          axios.get<JiraSupportResponse>(`${API_BASE_URL}/api/jira/support`),
          axios.get<JiraOrdersPipelineResponse>(`${API_BASE_URL}/api/jira/orders-pipeline`),
          axios.get<EconomicResponse>(`${API_BASE_URL}/api/economic/open-posts`),
          axios.get<SlaResponse>(`${API_BASE_URL}/api/jira/sla`)
        ]);

        setTelephony(telephonyRes.data);
        setJiraSupport(jiraSupportRes.data);
        setJiraOrders(jiraOrdersRes.data);
        setEconomic(economicRes.data);
        setSla(slaRes.data);
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

  // Hent status data separat (oftere)
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const statusRes = await axios.get<StatusResponse>(`${API_BASE_URL}/api/status`);
        const newStatus = statusRes.data;

        // Generer en unik nøgle for den aktuelle outage baseret på incidents
        const generateOutageKey = (s: StatusResponse): string | null => {
          if (!s.hasOutage) return null;
          const keys: string[] = [];
          if (s.vippsMobilePay?.incidents) {
            keys.push(...s.vippsMobilePay.incidents.map(i => i.id));
          }
          if (s.elavon?.incidents) {
            keys.push(...s.elavon.incidents.map(i => i.id));
          }
          if (s.payter?.hasOutage) {
            keys.push('payter-outage');
          }
          return keys.length > 0 ? keys.sort().join('|') : 'unknown-outage';
        };

        const currentOutageKey = generateOutageKey(newStatus);

        // Læs dismissed key DIREKTE fra localStorage for at undgå React state timing issues
        let storedDismissedKey: string | null = null;
        const stored = localStorage.getItem('dismissedOutageKey');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed.timestamp && Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
              storedDismissedKey = parsed.key;
            }
          } catch {
            // Ignore parse errors
          }
        }

        // Vis popup kun hvis:
        // 1. Der er en outage
        // 2. Det er en NY outage (forskellig fra den vi allerede har vist/dismissed)
        // 3. Vi ikke allerede viser popup
        if (newStatus.hasOutage && currentOutageKey && currentOutageKey !== storedDismissedKey && !showOutagePopup) {
          setShowOutagePopup(true);
          // Skjul popup efter 5 minutter og marker som dismissed
          setTimeout(() => {
            setShowOutagePopup(false);
            // Gem i localStorage FØRST (synkront)
            localStorage.setItem('dismissedOutageKey', JSON.stringify({
              key: currentOutageKey,
              timestamp: Date.now()
            }));
            setDismissedOutageKey(currentOutageKey);
          }, 300000);
        }

        // Hvis outage er overstået, nulstil dismissed key så næste outage vises
        if (!newStatus.hasOutage && storedDismissedKey) {
          localStorage.removeItem('dismissedOutageKey');
          setDismissedOutageKey(null);
        }

        setStatus(newStatus);
      } catch (err) {
        console.error("Status API fejl:", err);
      }
    };

    fetchStatus();

    // Tjek status hvert 30. sekund
    const statusInterval = setInterval(fetchStatus, 30000);
    return () => clearInterval(statusInterval);
  }, [showOutagePopup]); // Kun showOutagePopup - vi læser localStorage direkte

  const hm = telephony?.hallmonitor;
  const sp = telephony?.switchpay;

  // små helpers
  const fmt = (v: string | number | undefined | null) =>
    v === undefined || v === null ? "–" : String(v);

  const getSlaColor = (compliance: number | null | undefined) => {
    if (compliance === null || compliance === undefined) return "text-slate-400";
    if (compliance >= 90) return "text-emerald-400";
    if (compliance >= 80) return "text-amber-300";
    return "text-red-400";
  };

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

      {/* Outage Alert Popup */}
      {showOutagePopup && status?.hasOutage && (
        <OutagePopup
          status={status}
          onClose={() => {
            // Beregn outage key
            const keys: string[] = [];
            if (status.vippsMobilePay?.incidents) {
              keys.push(...status.vippsMobilePay.incidents.map(i => i.id));
            }
            if (status.elavon?.incidents) {
              keys.push(...status.elavon.incidents.map(i => i.id));
            }
            if (status.payter?.hasOutage) {
              keys.push('payter-outage');
            }
            const outageKey = keys.length > 0 ? keys.sort().join('|') : 'unknown-outage';

            // GEM I LOCALSTORAGE FØRST (synkront, før React state updates)
            localStorage.setItem('dismissedOutageKey', JSON.stringify({
              key: outageKey,
              timestamp: Date.now()
            }));

            // Derefter opdater React state
            setDismissedOutageKey(outageKey);
            setShowOutagePopup(false);
          }}
        />
      )}

      <main className="h-full flex flex-col mx-auto max-w-[1920px] px-6 py-3">
        {/* Topbar */}
        <header className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              VestPol – Live Operations
            </h1>
            {error && (
              <p className="mt-1 text-xs text-red-400">
                {error} (viser fallback-tal indtil videre)
              </p>
            )}
          </div>
          <div className="text-2xl font-bold text-slate-100 tracking-wider" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {currentTime}
          </div>
        </header>

        {/* 2 kolonner – HallMonitor / SwitchPay */}
        <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
          {/* ==================== HALLMONITOR ==================== */}
          <section className="space-y-3 flex flex-col min-h-0">
            <BrandHeader name="HallMonitor" />
            {/* SLA Status Indicators */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-4">
                <SlaIndicator
                  label="Enhed (48 T)"
                  status={sla?.enhed?.status ?? 'unknown'}
                  isLoading={!sla}
                />
                <SlaIndicator
                  label="Backend (24 T)"
                  status={sla?.backend?.status ?? 'unknown'}
                  isLoading={!sla}
                />
              </div>
              <CriticalIssuesList
                enhedIssues={sla?.enhed?.criticalIssues ?? []}
                backendIssues={sla?.backend?.criticalIssues ?? []}
              />
            </div>

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
                  { label: "MISTET", value: fmt(hm?.lost ?? 0) },
                  { label: "BESVARET", value: fmt(hm?.answered ?? 0) },
                  {
                    label: "SVARPROCENT",
                    value: `${fmt(hm?.answerRate ?? 0)}%`,
                    highlight: true,
                  },
                  { label: "GNS VENT", value: fmt(hm?.avgWait ?? "00:00") },
                ]}
              />
            </Card>

            {/* Jira Support */}
            <Card title="Jira Support – Overblik">
              <div className="grid grid-cols-4 gap-2 mb-3">
                <Kpi label="Åbne sager" value={fmt(jiraSupport?.hallmonitor?.openIssues ?? 0)} />
                <Kpi label="Nye i dag" value={fmt(jiraSupport?.hallmonitor?.newToday ?? 0)} />
                <Kpi label="Lukket i dag" value={fmt(jiraSupport?.hallmonitor?.closedToday ?? 0)} />
                <Kpi label="Kritiske (P1)" value={fmt(jiraSupport?.hallmonitor?.criticalP1 ?? 0)} />
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <Kpi
                  label="Tid til første svar / lukket"
                  value={jiraSupport?.hallmonitor?.timeToFirstResponse ?? '–'}
                />
                <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-2 py-1.5">
                  <div className="text-[9px] font-medium uppercase tracking-wide text-slate-400">
                    SLA Compliance
                  </div>
                  <div className={`mt-0.5 text-xl font-semibold ${getSlaColor(jiraSupport?.hallmonitor?.slaCompliance)}`}>
                    {jiraSupport?.hallmonitor?.slaCompliance !== null && jiraSupport?.hallmonitor?.slaCompliance !== undefined
                      ? `${jiraSupport.hallmonitor.slaCompliance}%`
                      : '–'}
                  </div>
                </div>
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

            {/* Status Indicators - SwitchPay specifikke */}
            <div className="flex items-center justify-end gap-4 text-xs">
              <StatusIndicator
                label="VippsMobilePay"
                isOperational={!status?.vippsMobilePay?.hasOutage}
                isLoading={!status}
              />
              <StatusIndicator
                label="Payter"
                isOperational={!status?.payter?.hasOutage}
                isLoading={!status}
              />
              <StatusIndicator
                label="Elavon"
                isOperational={!status?.elavon?.hasOutage}
                isLoading={!status}
              />
            </div>

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
                  { label: "MISTET", value: fmt(sp?.lost ?? 0) },
                  { label: "BESVARET", value: fmt(sp?.answered ?? 0) },
                  {
                    label: "SVARPROCENT",
                    value: `${fmt(sp?.answerRate ?? 0)}%`,
                    highlight: true,
                  },
                  { label: "GNS VENT", value: fmt(sp?.avgWait ?? "00:00") },
                ]}
              />
            </Card>

            {/* Jira Support */}
            <Card title="Jira Support – Overblik">
              <div className="grid grid-cols-4 gap-2 mb-3">
                <Kpi label="Åbne sager" value={fmt(jiraSupport?.switchpay?.openIssues ?? 0)} />
                <Kpi label="Nye i dag" value={fmt(jiraSupport?.switchpay?.newToday ?? 0)} />
                <Kpi label="Lukket i dag" value={fmt(jiraSupport?.switchpay?.closedToday ?? 0)} />
                <Kpi label="Kritiske (P1)" value={fmt(jiraSupport?.switchpay?.criticalP1 ?? 0)} />
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <Kpi
                  label="Tid til første svar / lukket"
                  value={jiraSupport?.switchpay?.timeToFirstResponse ?? '–'}
                />
                <Kpi
                  label="Gennemsnitlig levetid"
                  value={jiraSupport?.switchpay?.averageLifetime ?? '–'}
                />
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
    ? `${import.meta.env.BASE_URL}Logo-HallMonitor.png`
    : `${import.meta.env.BASE_URL}SwitchPay-logo_250px.png`;

  return (
    <div className="flex items-center justify-center">
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
        <span className="text-[10px] text-white">{agentsText}</span>
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
            <div className="text-[0.6rem] uppercase tracking-wide text-white">
              {item.label}
            </div>
            <div className="text-sm font-semibold text-white">
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
              ? "bg-slate-100"
              : "bg-slate-950/70 border border-slate-800"
          }`}
        >
          <div
            className={`text-[0.6rem] uppercase tracking-wide ${
              item.highlight ? "text-slate-700" : "text-white"
            }`}
          >
            {item.label}
          </div>
          <div className={`text-sm font-semibold ${
            item.highlight ? "text-slate-900" : "text-white"
          }`}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

/* --- Jira / Økonomi komponenter --- */

function Kpi({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-2 py-1.5">
      <div className="text-[9px] font-medium uppercase tracking-wide text-white">
        {label}
      </div>
      <div className="mt-0.5 text-xl font-semibold text-white">{value}</div>
    </div>
  );
}

/* --- Jira Support – trend chart (8 uger) --- */

function TrendChart({
  data,
  label,
}: {
  data: TrendData;
  label: string;
}) {
  if (!data || (!data.weeks?.length && !data.currentWeek?.length)) {
    return <div className="text-xs text-slate-400 text-center py-4">Ingen data tilgængelig</div>;
  }

  // Kombiner dage og uger til én array for plotting (nyeste først)
  const allPoints = [
    // Indeværende uge (i omvendt rækkefølge - nyeste først)
    ...data.currentWeek.slice().reverse().map(d => ({
      label: d.dayLabel,
      created: d.created,
      resolved: d.resolved,
      open: d.open
    })),
    // Historiske uger (i omvendt rækkefølge - nyeste først)
    ...data.weeks.slice().reverse().map(w => ({
      label: w.weekLabel,
      created: w.created,
      resolved: w.resolved,
      open: w.open
    }))
  ];

  const maxValue = Math.max(
    ...allPoints.map(p => Math.max(p.created, p.resolved, p.open)),
    1
  );

  const chartHeight = 70;
  const padding = 2;
  const topPadding = 10;

  // Beregn punkter for SVG path - separat for dage og uger
  const createPath = (values: number[], startIndex: number) => {
    const points = values.map((val, i) => {
      const totalIndex = startIndex + i;
      const x = (totalIndex / (allPoints.length - 1)) * 100;
      const y = chartHeight - topPadding - (val / maxValue) * (chartHeight - topPadding - padding) - padding;
      return `${x},${y}`;
    });
    return `M ${points.join(" L ")}`;
  };

  // Split data i dage (nuværende uge) og uger (historisk)
  const daysCount = data.currentWeek.length;

  const createdValuesDays = allPoints.slice(0, daysCount).map(p => p.created);
  const resolvedValuesDays = allPoints.slice(0, daysCount).map(p => p.resolved);
  const createdValuesWeeks = allPoints.slice(daysCount).map(p => p.created);
  const resolvedValuesWeeks = allPoints.slice(daysCount).map(p => p.resolved);

  const createdPathDays = createPath(createdValuesDays, 0);
  const resolvedPathDays = createPath(resolvedValuesDays, 0);
  const createdPathWeeks = createPath(createdValuesWeeks, daysCount);
  const resolvedPathWeeks = createPath(resolvedValuesWeeks, daysCount);

  return (
    <div className="space-y-1">
      <div className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</div>

      {/* Wrapper for SVG and overlay */}
      <div className="relative">
        {/* Åbne sager tal - HTML overlay over SVG */}
        <div className="absolute inset-0 pointer-events-none">
          {allPoints.map((point, i) => {
            const x = (i / (allPoints.length - 1)) * 100;
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
          {allPoints.map((point, i) => {
            const x = (i / (allPoints.length - 1)) * 100;
            const barWidth = 100 / allPoints.length * 0.6;
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

          {/* Created line - Dage */}
          <path
            d={createdPathDays}
            fill="none"
            stroke="rgb(14 165 233)"
            strokeWidth="0.8"
            vectorEffect="non-scaling-stroke"
          />

          {/* Created line - Uger */}
          <path
            d={createdPathWeeks}
            fill="none"
            stroke="rgb(14 165 233)"
            strokeWidth="0.8"
            vectorEffect="non-scaling-stroke"
          />

          {/* Resolved line - Dage */}
          <path
            d={resolvedPathDays}
            fill="none"
            stroke="rgb(16 185 129)"
            strokeWidth="0.8"
            vectorEffect="non-scaling-stroke"
          />

          {/* Resolved line - Uger */}
          <path
            d={resolvedPathWeeks}
            fill="none"
            stroke="rgb(16 185 129)"
            strokeWidth="0.8"
            vectorEffect="non-scaling-stroke"
          />

          {/* Created dots - alle punkter */}
          {allPoints.map((point, i) => {
            const x = (i / (allPoints.length - 1)) * 100;
            const y = chartHeight - topPadding - (point.created / maxValue) * (chartHeight - topPadding - padding) - padding;
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

          {/* Resolved dots - alle punkter */}
          {allPoints.map((point, i) => {
            const x = (i / (allPoints.length - 1)) * 100;
            const y = chartHeight - topPadding - (point.resolved / maxValue) * (chartHeight - topPadding - padding) - padding;
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

      {/* Data labels fjernet - kun åbne sager vises i toppen af søjlerne */}

      {/* Created og Resolved tal */}
      <div className="relative w-full" style={{ minHeight: '16px' }}>
        {allPoints.map((point, i) => {
          const x = (i / (allPoints.length - 1)) * 100;
          return (
            <div
              key={`data-${i}`}
              className="absolute -translate-x-1/2 text-center"
              style={{ left: `${x}%`, top: 0 }}
            >
              <div className="text-[6px] font-medium" style={{ color: 'rgb(14 165 233)' }}>
                {point.created}
              </div>
              <div className="text-[6px] font-medium" style={{ color: 'rgb(16 185 129)' }}>
                {point.resolved}
              </div>
            </div>
          );
        })}
      </div>

      {/* Uge/Dag labels */}
      <div className="relative w-full" style={{ minHeight: '12px' }}>
        {allPoints.map((point, i) => {
          const x = (i / (allPoints.length - 1)) * 100;
          return (
            <div
              key={`label-${i}`}
              className="absolute text-[7px] -translate-x-1/2 text-center font-semibold text-white"
              style={{ left: `${x}%`, top: 0 }}
            >
              {point.label}
            </div>
          );
        })}
      </div>

      <div className="flex justify-between text-[9px] text-white mt-1">
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
              <div className="text-xs font-semibold text-white">
                {s.value}
              </div>
              <div className="text-[10px] text-white text-center">
                {s.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* --- Status Indicator --- */

function StatusIndicator({
  label,
  isOperational,
  isLoading,
}: {
  label: string;
  isOperational: boolean;
  isLoading: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex h-3 w-3 rounded-full ${
          isLoading
            ? "bg-slate-500 animate-pulse"
            : isOperational
            ? "bg-emerald-500"
            : "bg-red-500 animate-pulse"
        }`}
      />
      <span className={`text-slate-300 ${!isOperational && !isLoading ? "text-red-400 font-medium" : ""}`}>
        {label}
      </span>
    </div>
  );
}

/* --- SLA Indicator (trafiklysstatus) --- */

function SlaIndicator({
  label,
  status,
  isLoading,
}: {
  label: string;
  status: 'green' | 'yellow' | 'red' | 'unknown';
  isLoading: boolean;
}) {
  const getStatusColor = () => {
    if (isLoading) return "bg-slate-500 animate-pulse";
    switch (status) {
      case 'green':
        return "bg-emerald-500";
      case 'yellow':
        return "bg-amber-400 animate-pulse";
      case 'red':
        return "bg-red-500 animate-pulse";
      default:
        return "bg-slate-500";
    }
  };

  const getTextColor = () => {
    if (isLoading) return "text-slate-300";
    switch (status) {
      case 'green':
        return "text-slate-300";
      case 'yellow':
        return "text-amber-400 font-medium";
      case 'red':
        return "text-red-400 font-medium";
      default:
        return "text-slate-400";
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className={`inline-flex h-3 w-3 rounded-full ${getStatusColor()}`} />
      <span className={getTextColor()}>{label}</span>
    </div>
  );
}

/* --- Critical Issues List --- */

function CriticalIssuesList({
  enhedIssues,
  backendIssues,
}: {
  enhedIssues: CriticalIssue[];
  backendIssues: CriticalIssue[];
}) {
  // Kombiner alle kritiske sager
  const allIssues = [...enhedIssues, ...backendIssues];

  // Sorter: breached først, derefter efter tid (mest kritisk først)
  allIssues.sort((a, b) => {
    if (a.status === 'breached' && b.status === 'warning') return -1;
    if (a.status === 'warning' && b.status === 'breached') return 1;
    return a.timeRemainingMs - b.timeRemainingMs;
  });

  if (allIssues.length === 0) {
    return null;
  }

  const formatTimeRemaining = (ms: number): string => {
    if (ms < 0) {
      return 'OVERSKREDET';
    }
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

    if (hours >= 1) {
      return `${hours}t`;
    }
    return `${minutes}m`;
  };

  return (
    <div className="flex items-center gap-1">
      {allIssues.map((issue, index) => (
        <span key={issue.key}>
          {index > 0 && <span className="text-slate-500 mx-1">·</span>}
          <span
            className={
              issue.status === 'breached'
                ? 'text-red-500 font-medium'
                : 'text-amber-500 font-medium'
            }
          >
            {issue.key}: {formatTimeRemaining(issue.timeRemainingMs)}
          </span>
        </span>
      ))}
    </div>
  );
}

/* --- Outage Alert Popup --- */

function OutagePopup({
  status,
  onClose,
}: {
  status: StatusResponse;
  onClose: () => void;
}) {
  const vippsOutage = status.vippsMobilePay?.hasOutage;
  const payterOutage = status.payter?.hasOutage;
  const elavonOutage = status.elavon?.hasOutage;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="w-[33vw] h-[33vh] min-w-[400px] min-h-[300px] rounded-2xl border-2 border-red-500 bg-red-950/95 p-6 shadow-2xl shadow-red-900/50 overflow-auto flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-4 w-4 animate-pulse rounded-full bg-red-500" />
            <h2 className="text-2xl font-bold text-white">DRIFTSFORSTYRRELSE</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-white/70 transition-colors text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* VippsMobilePay */}
        {vippsOutage && (
          <div className="mb-4 p-4 rounded-lg bg-red-900/50 border border-red-700">
            <h3 className="text-lg font-semibold text-white mb-2">VippsMobilePay</h3>
            {status.vippsMobilePay.incidents.map((incident) => (
              <div key={incident.id} className="mb-2">
                <p className="text-white font-medium">{incident.title}</p>
                <p className="text-white text-sm mt-1">{incident.content}</p>
                <p className="text-white/80 text-xs mt-1">
                  Status: {incident.status} · Opdateret: {new Date(incident.updated).toLocaleString('da-DK')}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Payter */}
        {payterOutage && (
          <div className="mb-4 p-4 rounded-lg bg-red-900/50 border border-red-700">
            <h3 className="text-lg font-semibold text-white mb-2">Payter</h3>
            {status.payter.components.myPayter && !status.payter.components.myPayter.isOperational && (
              <p className="text-white">
                <span className="font-medium">MyPayter:</span>{" "}
                <span className="capitalize">{status.payter.components.myPayter.status}</span>
              </p>
            )}
            {status.payter.components.cloudPaymentService && !status.payter.components.cloudPaymentService.isOperational && (
              <p className="text-white">
                <span className="font-medium">Cloud Payment Service:</span>{" "}
                <span className="capitalize">{status.payter.components.cloudPaymentService.status}</span>
              </p>
            )}
          </div>
        )}

        {/* Elavon */}
        {elavonOutage && (
          <div className="mb-4 p-4 rounded-lg bg-red-900/50 border border-red-700">
            <h3 className="text-lg font-semibold text-white mb-2">Elavon</h3>
            {status.elavon.incidents.map((incident) => (
              <div key={incident.id} className="mb-2">
                <p className="text-white font-medium">{incident.title}</p>
                <p className="text-white text-sm mt-1">{incident.content}</p>
                <p className="text-white/80 text-xs mt-1">
                  Status: {incident.status} · Opdateret: {new Date(incident.updated).toLocaleString('da-DK')}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-white/80">
          Popup lukkes automatisk efter 5 minutter
        </div>
      </div>
    </div>
  );
}
