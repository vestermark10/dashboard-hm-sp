# Trend Data Debugging Session - 14. Februar 2026

## ✅ LØST!

8-ugers trend data virker nu korrekt!

## Problem (Løst)
8-ugers trend data viste forkerte åbne sager counts:
- **Oprindeligt**: Viste 110-114 (mock data)
- **Derefter**: Viste 0 (alle values)
- **Nu**: Viser korrekte værdier (~11-12 for HallMonitor, ~42 for SwitchPay)

## Hvad vi har gjort

### 1. Fundet og rettet JQL fejl
**Problem**: `resolved` er ikke et valid Jira field
**Fix**: Ændret til `resolutiondate` i alle queries
- Linje 330, 359 i `services/jiraService.mjs`

### 2. Rettet date format fejl
**Problem**: Dates manglede klokkeslæt (f.eks. `"2026-02-13"`)
**Fix**: Tilføjet klokkeslæt (f.eks. `"2026-02-13 00:00"`)
- Alle trend data queries bruger nu `${dateStr} 00:00` format

### 3. Fundet og rettet maxResults fejl
**Problem**: Brugte `maxResults: 0` som ikke er valid i Jira
**Fejlbesked**: `"Parameteren for maksimale resultater skal være mellem 1 og 5.000."`
**Fix**: Ændret til `maxResults: 1` (vi bruger kun `total` count alligevel)

### 4. Implementeret running balance beregning
**Logik**: Start med nuværende åbne sager, arbejd baglæns i tid
```javascript
let runningOpen = currentOpenCount; // f.eks. 11
// For hver dag/uge baglæns:
runningOpen = runningOpen - created + resolved
```

## Nuværende Problem

### Symptomer
Debug output viser:
```
DEBUG: Current open count = 0
DEBUG: Current week days = 6, weeks = 8
DEBUG: Set Lør open to 0
DEBUG: Lør: 0 - 0 + 0 = 0 => Fre
DEBUG: Fre: 0 - 0 + 0 = 0 => Tor
...alle counts er 0...
```

### Root Cause
**ALLE counts er 0:**
1. `currentOpenRes.data.total` = 0 (skulle være 11)
2. `createdRes.data.total` = 0 for alle dage
3. `resolvedRes.data.total` = 0 for alle dage

**Hypotese**: Jira API response struktur er anderledes end forventet.
- Måske returnerer `/rest/api/3/search/jql` ikke et `total` field
- Måske hedder det noget andet (f.eks. `totalCount`, `count`, etc.)

## Debug Kode Tilføjet

I `services/jiraService.mjs` omkring linje 387:
```javascript
console.log(`DEBUG: Current open response keys:`, Object.keys(currentOpenRes.data));
console.log(`DEBUG: Current open response:`, JSON.stringify(currentOpenRes.data, null, 2));
```

Omkring linje 340:
```javascript
if (day === 0) {
  console.log(`DEBUG: First day response keys:`, Object.keys(createdRes.data));
  console.log(`DEBUG: Created response:`, JSON.stringify(createdRes.data, null, 2).substring(0, 500));
}
```

## Endelig Løsning

### Root Cause
Jira Cloud 2026 har fjernet ALLE count endpoints:
- `/rest/api/3/search` - Deprecated og fjernet (410 Gone)
- `/rest/api/3/search/approximate-count` - Deprecated og fjernet (410 Gone)

Det **ENESTE** endpoint der virker er `/rest/api/3/search/jql`, men det returnerer **IKKE** et `total` field.

### Løsning: Pagination-baseret Counting
Implementeret `getCountWithPagination()` helper funktion som:
1. Henter første page med `maxResults: 100`
2. Samler alle issue keys i et Set
3. Looper gennem alle pages med `nextPageToken`
4. Returnerer `Set.size` som count

```javascript
async getCountWithPagination(config, jql) {
  const response = await axios.post(
    `${config.baseUrl}/rest/api/3/search/jql`,
    { jql, fields: ['key'], maxResults: 100 },
    { headers: this.getAuthHeaders(config), timeout: 10000 }
  );

  const keys = new Set(response.data.issues.map(i => i.key).filter(Boolean));
  let nextToken = response.data.nextPageToken;

  while (nextToken) {
    const pageResp = await axios.post(
      `${config.baseUrl}/rest/api/3/search/jql`,
      { jql, fields: ['key'], maxResults: 100, nextPageToken: nextToken },
      { headers: this.getAuthHeaders(config), timeout: 10000 }
    );
    pageResp.data.issues.forEach(i => { if (i.key) keys.add(i.key); });
    nextToken = pageResp.data.nextPageToken;
  }

  return keys.size;
}
```

### Performance
- Første fetch: ~30-60 sekunder (mange API calls)
- Efterfølgende: Instant (cached til næste dag)

### Kilder
- [Run JQL search query using Jira Cloud REST API](https://confluence.atlassian.com/jirakb/run-jql-search-query-using-jira-cloud-rest-api-1289424308.html)
- [Atlassian REST API Search Endpoints Deprecation](https://docs.adaptavist.com/sr4jc/latest/release-notes/breaking-changes/atlassian-rest-api-search-endpoints-deprecation)

---

## ARKIVERET - Tidligere Debug Steps

### 1. Se response struktur (AFSLUTTET)
Genstart serveren og kig på debug output for at se:
- Hvilke keys findes i `currentOpenRes.data`?
- Hvor er count/total value gemt?

### 2. Ret field navn
Når vi ved det rigtige field navn, ret:
- Linje 387: `currentOpenRes.data.total` → `currentOpenRes.data.[RIGTIGT_NAVN]`
- Linje 341-342: `createdRes.data.total` og `resolvedRes.data.total` → samme

### 3. Fjern debug logging
Når det virker, fjern/kommenter debug console.log statements

### 4. Re-enable cache
Fjern `-debug` fra cache key (linje 606):
```javascript
const today = now.toISOString().split('T')[0] + '-debug'; // FJERN -debug
```

## Relevante Filer

### `services/jiraService.mjs`
- Linje 303-413: `get8WeeksTrendData()` funktion
- Linje 380-410: Running balance beregning (MED PROBLEM)
- Linje 603-616: Cache logik

### `src/App.tsx`
- Linje 645-843: TrendChart component (frontend visning)
- Viser data korrekt, men modtager forkerte værdier fra backend

## Working Queries (til reference)

Disse queries VIRKER og returnerer korrekte counts:
```javascript
// Fra linje 153 - closed today
const closedTodayJql = `project = ${config.supportProjectKey} AND statusCategory = Done AND resolutiondate >= "${yesterdayStrRes} 23:00" AND resolutiondate < "${todayStr} 23:00"`;

// Fra linje 206 - created today
const createdTodayJql = `project = ${config.supportProjectKey} AND created >= "${yesterdayStrRes} 23:00" AND created < "${todayStr} 23:00"`;
```

Forskellen på working vs. broken queries:
- Working: Returnerer `issues` array og vi tæller `issues.length`
- Broken: Forventer `total` field fra response

## API Endpoint Details

**Endpoint**: `POST ${config.baseUrl}/rest/api/3/search/jql`

**Request Body**:
```json
{
  "jql": "project = HS AND statusCategory != Done",
  "maxResults": 1
}
```

**Forventet Response** (behøver verifikation):
```json
{
  "total": 11,
  "issues": [...]
}
```

## Test Kommandoer

Start serveren med debug output:
```bash
cd c:\Users\KlausVestermark\GitHub\dashboard-hm-sp
taskkill /F /IM node.exe
npm run server
```

Test API direkte:
```bash
curl -s http://localhost:3001/api/jira/support > output.json
```

## Vigtige Noter

- Dashboard viser korrekt: "ÅBNE SAGER: 11" (HallMonitor) og "ÅBNE SAGER: 42" (SwitchPay)
- Kun trend data er forkert
- Cache er busted med `-debug` suffix for at tvinge fresh data
- Queries fejler IKKE mere (ingen 400 errors) - de returnerer bare 0
