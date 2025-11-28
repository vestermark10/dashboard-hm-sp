# Telefonsystem API Krav - VestPol Support Dashboard

## Baggrund

Vi bygger et support dashboard der skal vise real-time statistik for vores to support køer:
- HallMonitor Support
- SwitchPay Support

## API Dokumentation Modtaget

Vi har modtaget dokumentation for **CSTA API** (Computer Supported Telecommunications Applications), men denne API dækker **KUN** call control funktionalitet:

### Hvad CSTA API Kan (men vi ikke behøver):
- MakeCall - lave udgående opkald
- AnswerCall - besvare indgående opkald
- Transfer - viderestille opkald
- Conference - konference opkald
- MonitorStart - overvåge enkelte extensions
- SnapShotDevice - få status på enkelte apparater

### Hvad CSTA API IKKE Kan (men vi behøver):
- ❌ Kø statistik (antal ventende opkald)
- ❌ Mistet opkald tæller
- ❌ Besvarede opkald tæller
- ❌ Svarprocent beregning
- ❌ Ventetider (max, gennemsnit)
- ❌ Agent gruppe status (antal klar/optaget)
- ❌ Historiske metrics
- ❌ Aggregerede ACD data

## Data Krav for Dashboard

### Real-time Kø Statistik (per kø: HallMonitor & SwitchPay)

#### 1. Køstatistik
```json
{
  "callsWaiting": 3,           // Antal opkald i kø lige nu
  "longestWaitTime": "2m 34s", // Længste ventetid i kø
  "avgWaitTime": "1m 12s"      // Gennemsnitlig ventetid
}
```

#### 2. Agent Status
```json
{
  "agentsReady": 4,    // Antal agenter klar til at tage opkald
  "agentsBusy": 2,     // Antal agenter i opkald
  "agentsOther": 1     // Antal agenter i pause/møde/andet
}
```

#### 3. Dagens Statistik (opdateres real-time)
```json
{
  "answeredToday": 127,     // Antal besvarede opkald i dag
  "lostToday": 8,           // Antal tabte/ubesvarede opkald i dag
  "answerRate": 94.1        // Svarprocent i dag (%)
}
```

### Opdateringsfrekvens
- Data skal kunne hentes via REST API eller webhook
- Ønsket opdateringsfrekvens: hvert 60. sekund
- Real-time data er kritisk for agent dispatching

## Spørgsmål til Uni-tel Support

Vi bedes få svar på følgende:

### 1. Korrekt API til Kø Statistik
Har Uni-tel One-Connect et API til at hente kø statistik og ACD metrics? Vi leder efter:
- **Wallboard API** (til real-time dashboard data)
- **Reporting API** (til statistik og analytics)
- **ACD Statistics API** (til Automatic Call Distribution metrics)

### 2. Kø Identifikation
Hvordan identificerer vi specifikke køer i API'et?
- Kø nummer?
- Kø navn?
- Extension nummer?

Vores to køer:
- HallMonitor Support
- SwitchPay Support

### 3. Authentication
Hvis der findes et relevant API:
- Hvilken authentication metode bruges?
- API key, username/password, eller session-based?
- Skal vi whiteliste vores IP adresse?

### 4. API Dokumentation
Kan vi få:
- OpenAPI/Swagger specifikation
- REST API endpoint liste
- Response format eksempler
- Rate limiting information

### 5. Historiske Data
Kan API'et levere:
- Timebaseret statistik?
- Daglig aggregeret data?
- Hvor langt tilbage er data tilgængelig?

## Alternative Løsninger

Hvis Uni-tel ikke har et passende API, undersøg:

1. **Database direkte adgang**
   - Kan vi få read-only adgang til One-Connect database?
   - Hvilke tabeller indeholder kø statistik?

2. **CDR (Call Detail Records)**
   - Kan CDR eksporteres real-time?
   - Format: CSV, JSON, SQL?

3. **Third-party Integration**
   - Har Uni-tel partnere med pre-built dashboard løsninger?
   - Kan data pushes til vores system via webhook?

## Teknisk Setup

Vores dashboard bruger:
- Node.js backend (Express)
- React frontend
- 60 sekunders auto-refresh interval
- Kører på Windows Server

Vi kan håndtere:
- REST API (foretrukket)
- SOAP API
- WebSocket streams
- Polling fra database
- File-based export (CSV/JSON)

## Kontakt Information

Ved spørgsmål eller yderligere information:
- Projekt: VestPol Support Dashboard
- Integration: Uni-tel One-Connect telefonsystem
