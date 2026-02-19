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
  timeToFirstResponseChange?: number | null;
  slaCompliance?: number;        // HallMonitor only
  averageLifetime?: string;      // SwitchPay only
  averageLifetimeChange?: number | null;
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
  rackbeatDrafts: number;
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

type CelebrationEvent = {
  name: string;
  type: 'birthday' | 'anniversary';
  date: string;
  daysUntil: number;
  detail: string | null;
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
  const [celebrations, setCelebrations] = useState<CelebrationEvent[]>([]);
  const [showOutagePopup, setShowOutagePopup] = useState<boolean>(false);

  // Ryd udløbne outage-dismissals fra localStorage ved opstart
  useEffect(() => {
    const stored = localStorage.getItem('dismissedOutageKey');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (!parsed.timestamp || Date.now() - parsed.timestamp >= 24 * 60 * 60 * 1000) {
          localStorage.removeItem('dismissedOutageKey');
        }
      } catch { localStorage.removeItem('dismissedOutageKey'); }
    }
  }, []);
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

  // Hent fødselsdage/jubilæer én gang dagligt
  useEffect(() => {
    const fetchCelebrations = async () => {
      try {
        const res = await axios.get<CelebrationEvent[]>(`${API_BASE_URL}/api/celebrations`);
        setCelebrations(res.data);
      } catch (err) {
        console.error("Celebrations API fejl:", err);
      }
    };

    fetchCelebrations();

    // Refresh én gang i døgnet (24 timer)
    const interval = setInterval(fetchCelebrations, 24 * 60 * 60 * 1000);
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
          }, 300000);
        }

        // Hvis outage er overstået, nulstil dismissed key så næste outage vises
        if (!newStatus.hasOutage && storedDismissedKey) {
          localStorage.removeItem('dismissedOutageKey');
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

  // End-of-day celebration: grøn glow på individuelle KPI-bokse
  const isAfter15 = new Date().getHours() >= 15;
  const hmClosedWins = isAfter15 && (jiraSupport?.hallmonitor?.closedToday ?? 0) > (jiraSupport?.hallmonitor?.newToday ?? 0);
  const hmResponseWins = isAfter15 && (jiraSupport?.hallmonitor?.timeToFirstResponseChange ?? 0) < 0;
  const spClosedWins = isAfter15 && (jiraSupport?.switchpay?.closedToday ?? 0) > (jiraSupport?.switchpay?.newToday ?? 0);
  const spResponseWins = isAfter15 && (jiraSupport?.switchpay?.timeToFirstResponseChange ?? 0) < 0;
  const hmAnswerRateWins = isAfter15 && (hm?.answerRate ?? 0) > 85;
  const spAnswerRateWins = isAfter15 && (sp?.answerRate ?? 0) > 85;

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

      {/* Celebration animations */}
      {celebrations.some(e => e.daysUntil === 0 && e.type === 'birthday') && <FallingFlags />}
      {celebrations.some(e => e.daysUntil === 0 && e.type === 'anniversary') && <RisingRockets />}

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
                    celebrating: hmAnswerRateWins,
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
                <Kpi label="Lukket i dag" value={fmt(jiraSupport?.hallmonitor?.closedToday ?? 0)} celebrating={hmClosedWins} />
                <Kpi label="Kritiske (P1)" value={fmt(jiraSupport?.hallmonitor?.criticalP1 ?? 0)} />
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <Kpi
                  label="Tid til første svar / lukket"
                  value={jiraSupport?.hallmonitor?.timeToFirstResponse ?? '–'}
                  changePercent={jiraSupport?.hallmonitor?.timeToFirstResponseChange}
                  lowerIsBetter
                  celebrating={hmResponseWins}
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
                data={jiraSupport?.hallmonitor?.trendData ?? { weeks: [], currentWeek: [] }}
                label="8 ugers trend"
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
                <DraftInvoiceKpi
                  total={economic?.hallmonitor?.openDraftInvoices ?? 0}
                  rackbeat={economic?.hallmonitor?.rackbeatDrafts ?? 0}
                />
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
                    celebrating: spAnswerRateWins,
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
                <Kpi label="Lukket i dag" value={fmt(jiraSupport?.switchpay?.closedToday ?? 0)} celebrating={spClosedWins} />
                <Kpi label="Kritiske (P1)" value={fmt(jiraSupport?.switchpay?.criticalP1 ?? 0)} />
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <Kpi
                  label="Tid til første svar / lukket"
                  value={jiraSupport?.switchpay?.timeToFirstResponse ?? '–'}
                  changePercent={jiraSupport?.switchpay?.timeToFirstResponseChange}
                  lowerIsBetter
                  celebrating={spResponseWins}
                />
                <Kpi
                  label="Gennemsnitlig levetid"
                  value={jiraSupport?.switchpay?.averageLifetime ?? '–'}
                  changePercent={jiraSupport?.switchpay?.averageLifetimeChange}
                  lowerIsBetter
                />
              </div>
              <TrendChart
                data={jiraSupport?.switchpay?.trendData ?? { weeks: [], currentWeek: [] }}
                label="8 ugers trend"
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
                <DraftInvoiceKpi
                  total={economic?.switchpay?.openDraftInvoices ?? 0}
                  rackbeat={economic?.switchpay?.rackbeatDrafts ?? 0}
                />
              </div>
            </Card>
          </section>
        </div>

        {/* Fødselsdage og jubilæer */}
        {celebrations.length > 0 && (
          <div className="flex items-center justify-center gap-8 py-1.5">
            {celebrations.map((event, i) => (
              <div key={i} className="flex items-center gap-2 text-base font-semibold tracking-tight text-white">
                {event.type === 'birthday' ? <DannebroFlag /> : <RocketIcon />}
                <span>{event.name}</span>
                <span>
                  {event.date} – {event.type === 'birthday' ? 'Fødselsdag' : 'Jubilæum'}
                  {event.detail ? ` (${event.detail})` : ''}
                </span>
              </div>
            ))}
          </div>
        )}

        <footer className="flex justify-between text-[10px] text-slate-500 mt-2 py-1">
          <span>Senest opdateret: {lastUpdate || "Loading..."}</span>
          <span>Datakilder: Telefonsystem · Jira · e-conomic</span>
        </footer>
      </main>

      <style>{`
        @keyframes celebration-glow {
          0%, 100% { box-shadow: 0 0 8px 2px rgba(52, 211, 153, 0.2); }
          50% { box-shadow: 0 0 20px 4px rgba(52, 211, 153, 0.5); }
        }
        .animate-celebration-glow {
          animation: celebration-glow 2.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

/* ====== små komponenter ====== */

function BrandHeader({ name }: { name: string }) {
  const logoSrc = name === "HallMonitor"
    ? `${import.meta.env.BASE_URL}Logo-HallMonitor-white.png`
    : `${import.meta.env.BASE_URL}SwitchPay-logo-white.png`;

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
  celebrating?: boolean;
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
          className={`rounded-lg px-2 py-2 bg-slate-950/70 ${
            item.celebrating
              ? "border border-emerald-400 animate-celebration-glow"
              : "border border-slate-800"
          }`}
        >
          <div className="text-[0.6rem] uppercase tracking-wide text-white flex items-center justify-center gap-1">
            {item.label}
            {item.celebrating && <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />}
          </div>
          <div className="text-sm font-semibold text-white">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

/* --- Jira / Økonomi komponenter --- */

function Kpi({
  label,
  value,
  changePercent,
  lowerIsBetter,
  celebrating,
}: {
  label: string;
  value: string;
  changePercent?: number | null;
  lowerIsBetter?: boolean;
  celebrating?: boolean;
}) {
  // For tid-metrics: lavere = bedre (grøn), højere = dårligere (rød)
  const showChange = changePercent !== undefined && changePercent !== null;
  const isImprovement = lowerIsBetter ? changePercent! < 0 : changePercent! > 0;
  const arrow = changePercent! > 0 ? '\u2191' : '\u2193'; // ↑ eller ↓
  const changeColor = isImprovement ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className={`rounded-xl px-2 py-1.5 ${
      celebrating
        ? "border border-emerald-400 bg-slate-950/80 animate-celebration-glow"
        : "border border-slate-800 bg-slate-950/80"
    }`}>
      <div className="text-[9px] font-medium uppercase tracking-wide text-white flex items-center gap-1">
        {label}
        {celebrating && <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="text-xl font-semibold text-white">{value}</span>
        {showChange && (
          <span className={`text-[9px] font-medium ${changeColor}`}>
            {arrow}{Math.abs(changePercent!)}%
          </span>
        )}
      </div>
    </div>
  );
}

function DraftInvoiceKpi({ total, rackbeat }: { total: number; rackbeat: number }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-2 py-1.5 flex items-stretch gap-0">
      <div className="flex-1">
        <div className="text-[9px] font-medium uppercase tracking-wide text-white">
          Åbne fakturakladder
        </div>
        <div className="mt-0.5 text-xl font-semibold text-white">{total}</div>
      </div>
      <div className="mx-2 w-px bg-slate-700 self-stretch" />
      <div className="flex-1 text-right">
        <div className="text-[9px] font-medium uppercase tracking-wide text-white">
          Heraf fra Rackbeat
        </div>
        <div className="mt-0.5 text-xl font-semibold text-white">{rackbeat}</div>
      </div>
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
      <div className="text-[10px] text-white uppercase tracking-wide">{label}</div>

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

// Farver mappet til stage-koncept så HM og SP matcher visuelt
const STAGE_COLOR_MAP: Record<string, string> = {
  // Indgang (nye/modtagne)
  'jobliste':             'bg-cyan-500',
  'modtaget':             'bg-cyan-500',
  // I arbejde
  'i gang':               'bg-emerald-400',
  'i process':            'bg-emerald-400',
  // Klar / leveret
  'klar til fakturering': 'bg-amber-400',
  // Specielle
  'skal onboardes':       'bg-violet-500',
  // Afsluttet
  'færdig':               'bg-sky-400',
};
const FALLBACK_COLORS = ['bg-cyan-500', 'bg-emerald-400', 'bg-amber-400', 'bg-violet-500', 'bg-rose-400'];

function PipelineColumns({
  stages,
}: {
  stages: { label: string; value: number }[];
}) {
  const max = stages.reduce((m, s) => (s.value > m ? s.value : m), 1);
  const maxHeight = 100;

  return (
    <div className="space-y-2">
      <div className="flex h-32 items-end justify-evenly">
        {stages.map((s, i) => {
          const ratio = s.value / max || 0;
          const barHeight = 20 + ratio * (maxHeight - 20);
          const colorClass = STAGE_COLOR_MAP[s.label.toLowerCase()] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length];

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
        className="w-[60vw] max-h-[85vh] min-w-[400px] rounded-2xl border-2 border-red-500 bg-red-950/95 p-6 shadow-2xl shadow-red-900/50 flex flex-col"
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
          <div className="mb-3 p-4 rounded-lg bg-red-900/50 border border-red-700">
            <h3 className="text-lg font-semibold text-white mb-2">VippsMobilePay</h3>
            {status.vippsMobilePay.incidents.map((incident) => (
              <div key={incident.id} className="mb-2">
                <p className="text-white font-medium">{incident.title}</p>
                <p className="text-white text-sm mt-1 line-clamp-3">{incident.content}</p>
                <p className="text-white/80 text-xs mt-1">
                  Status: {incident.status} · Opdateret: {new Date(incident.updated).toLocaleString('da-DK')}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Payter */}
        {payterOutage && (
          <div className="mb-3 p-4 rounded-lg bg-red-900/50 border border-red-700">
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
          <div className="mb-3 p-4 rounded-lg bg-red-900/50 border border-red-700">
            <h3 className="text-lg font-semibold text-white mb-2">Elavon</h3>
            {status.elavon.incidents.map((incident) => (
              <div key={incident.id} className="mb-2">
                <p className="text-white font-medium">{incident.title}</p>
                <p className="text-white text-sm mt-1 line-clamp-3">{incident.content}</p>
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

/* --- Dannebrog flag (SVG, da flag-emojis ikke virker på Windows/Linux) --- */

function DannebroFlag({ size = 20 }: { size?: number }) {
  const h = size * 0.7;
  return (
    <svg width={size} height={h} viewBox="0 0 20 14" className="inline-block">
      <rect width="20" height="14" fill="#c8102e" />
      <rect x="6" y="0" width="2.5" height="14" fill="#fff" />
      <rect x="0" y="5.5" width="20" height="2.5" fill="#fff" />
    </svg>
  );
}

/* --- Raket (SVG, da emojis ikke virker på Windows/Linux) --- */

function RocketIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="inline-block">
      <path d="M12 2C12 2 7 7 7 13c0 2.5 1 4 2.5 5l.5 3h4l.5-3c1.5-1 2.5-2.5 2.5-5 0-6-5-11-5-11z" fill="#e74c3c" />
      <path d="M12 2C12 2 9 7 9 13c0 2 .7 3.3 1.8 4.2L11 21h2l.2-3.8c1.1-.9 1.8-2.2 1.8-4.2 0-6-3-11-3-11z" fill="#f39c12" />
      <ellipse cx="12" cy="10" rx="1.5" ry="2" fill="#3498db" />
      <path d="M7 13c-2 0-3.5 1.5-3.5 1.5L5 17l2-1v-3z" fill="#e74c3c" />
      <path d="M17 13c2 0 3.5 1.5 3.5 1.5L19 17l-2-1v-3z" fill="#e74c3c" />
      <path d="M10 21l-.5 2h5l-.5-2h-4z" fill="#f39c12" />
    </svg>
  );
}

/* --- Fødselsdagsanimation: Flag falder ned fra toppen --- */

function FallingFlags() {
  const [flags, setFlags] = useState<{ id: number; left: number; delay: number; duration: number }[]>([]);

  useEffect(() => {
    let id = 0;
    const spawn = () => {
      setFlags(prev => {
        // Hold maks 6 flag på skærmen ad gangen
        const active = prev.filter(f => Date.now() - f.id < f.duration * 1000);
        return [...active, {
          id: Date.now() + id++,
          left: 5 + Math.random() * 90,
          delay: 0,
          duration: 12 + Math.random() * 8,
        }];
      });
    };

    spawn();
    // Nyt flag hvert 8-15 sekund
    const interval = setInterval(spawn, 8000 + Math.random() * 7000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {flags.map(flag => (
        <div
          key={flag.id}
          className="absolute animate-flag-fall"
          style={{
            left: `${flag.left}%`,
            animationDuration: `${flag.duration}s`,
            animationDelay: `${flag.delay}s`,
          }}
        >
          <DannebroFlag size={28} />
        </div>
      ))}
      <style>{`
        @keyframes flag-fall {
          0% { top: -40px; opacity: 0.8; transform: rotate(0deg) translateX(0px); }
          25% { transform: rotate(15deg) translateX(20px); }
          50% { transform: rotate(-10deg) translateX(-15px); }
          75% { transform: rotate(8deg) translateX(10px); }
          100% { top: 105%; opacity: 0.3; transform: rotate(-5deg) translateX(-5px); }
        }
        .animate-flag-fall {
          animation-name: flag-fall;
          animation-timing-function: linear;
          animation-fill-mode: forwards;
        }
      `}</style>
    </div>
  );
}

/* --- Jubilæumsanimation: Raketter stiger op fra bunden --- */

function RisingRockets() {
  const [rockets, setRockets] = useState<{ id: number; left: number; delay: number; duration: number }[]>([]);

  useEffect(() => {
    let id = 0;
    const spawn = () => {
      setRockets(prev => {
        const active = prev.filter(r => Date.now() - r.id < r.duration * 1000);
        return [...active, {
          id: Date.now() + id++,
          left: 10 + Math.random() * 80,
          delay: 0,
          duration: 6 + Math.random() * 4,
        }];
      });
    };

    spawn();
    // Ny raket hvert 10-18 sekund
    const interval = setInterval(spawn, 10000 + Math.random() * 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {rockets.map(rocket => (
        <div
          key={rocket.id}
          className="absolute text-2xl animate-rocket-rise"
          style={{
            left: `${rocket.left}%`,
            animationDuration: `${rocket.duration}s`,
            animationDelay: `${rocket.delay}s`,
          }}
        >
          <RocketIcon size={28} />
        </div>
      ))}
      <style>{`
        @keyframes rocket-rise {
          0% { bottom: -40px; opacity: 0.7; transform: translateX(0px); }
          30% { transform: translateX(10px); }
          60% { transform: translateX(-8px); }
          100% { bottom: 105%; opacity: 0.2; transform: translateX(3px); }
        }
        .animate-rocket-rise {
          animation-name: rocket-rise;
          animation-timing-function: ease-out;
          animation-fill-mode: forwards;
        }
      `}</style>
    </div>
  );
}
