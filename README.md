# VestPol Support Dashboard

Live operations dashboard for HallMonitor & SwitchPay support teams.

## Features

- **Telefoni Support**: Real-time queue statistics, agents status, answer rates
- **Jira Support**: Open issues, critical P1 tickets, top issues overview
- **Jira Orders**: Pipeline visualization with order stages
- **e-conomic**: Open orders and draft invoices tracking
- **Auto-refresh**: Data updates every 60 seconds

## Project Structure

```
sandbox/
├── src/
│   ├── App.tsx           # Frontend React application
│   └── main.tsx
├── services/
│   ├── telephonyService.mjs   # Telefonsystem API integration
│   ├── jiraService.mjs        # Jira API integration
│   └── economicService.mjs    # e-conomic API integration
├── server.mjs            # Express backend server
├── .env.example          # Environment variables template
└── package.json
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Kopier `.env.example` til `.env`:

```bash
cp .env.example .env
```

Udfyld `.env` med dine API credentials:

```env
# Telefonsystem API (f.eks. One-Connect eller Mitel)
TELEPHONY_API_URL=https://your-telephony-api.com
TELEPHONY_API_KEY=your_api_key_here
TELEPHONY_USERNAME=your_username
TELEPHONY_PASSWORD=your_password

# Jira API
JIRA_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@domain.com
JIRA_API_TOKEN=your_jira_api_token
JIRA_SUPPORT_PROJECT_KEY=SUPPORT
JIRA_ORDERS_PROJECT_KEY=ORDERS

# e-conomic API
ECONOMIC_APP_SECRET_TOKEN=your_app_secret_token
ECONOMIC_AGREEMENT_GRANT_TOKEN=your_agreement_grant_token
```

### 3. Start Backend Server

```bash
npm run server
```

Backend kører på `http://localhost:3001`

### 4. Start Frontend Development Server

I et nyt terminal vindue:

```bash
npm run dev
```

Frontend kører på `http://localhost:5173`

## API Endpoints

### Backend Endpoints

- `GET /api/health` - Health check
- `GET /api/telephony/support` - Telefoni queue stats for HallMonitor & SwitchPay
- `GET /api/jira/support` - Jira support issues overview
- `GET /api/jira/orders-pipeline` - Jira orders pipeline stages
- `GET /api/economic/open-posts` - e-conomic open orders and draft invoices

## API Integration Setup

### Telefonsystem Integration

Service filen `services/telephonyService.mjs` skal tilpasses dit specifikke telefonsystem:

1. Opdater API endpoint URLs i `getSupportQueueStats()` metoden
2. Implementer authentication baseret på dit systems krav
3. Tilpas data mapping i `mapQueueData()` til dit systems response format

**Eksempel implementering:**

```javascript
async getSupportQueueStats() {
  const response = await axios.get(`${this.apiUrl}/api/queues/stats`, {
    headers: {
      'Authorization': `Bearer ${this.apiKey}`
    }
  });

  // Map response til vores format
  return {
    hallmonitor: this.mapQueueData(response.data.queues.hallmonitor),
    switchpay: this.mapQueueData(response.data.queues.switchpay)
  };
}
```

### Jira Integration

Service filen `services/jiraService.mjs` bruger Jira REST API v3:

1. Opret API token i Jira: https://id.atlassian.com/manage-profile/security/api-tokens
2. Aktivér API kaldene ved at fjerne kommentarerne i service filen
3. Tilpas JQL queries efter dine projekt keys og labels

**JQL Query Eksempel:**

```javascript
const jql = `project = SUPPORT AND labels = "HallMonitor" AND status != Closed`;
```

### e-conomic Integration

Service filen `services/economicService.mjs` bruger e-conomic REST API:

1. Opret integration i e-conomic: https://secure.e-conomic.com/secure/api/requestaccess.aspx
2. Få App Secret Token og Agreement Grant Token
3. Aktivér API kaldene ved at fjerne kommentarerne
4. Tilpas filtrering baseret på dine produktlinjer

**API Dokumentation:**
- Jira: https://developer.atlassian.com/cloud/jira/platform/rest/v3/
- e-conomic: https://restdocs.e-conomic.com/

## Development

### Running in Development Mode

Kør både backend og frontend samtidigt:

Terminal 1:
```bash
npm run server
```

Terminal 2:
```bash
npm run dev
```

### Testing API Integration

Test backend endpoints direkte:

```bash
# Health check
curl http://localhost:3001/api/health

# Telefoni data
curl http://localhost:3001/api/telephony/support

# Jira support data
curl http://localhost:3001/api/jira/support

# Jira orders pipeline
curl http://localhost:3001/api/jira/orders-pipeline

# e-conomic data
curl http://localhost:3001/api/economic/open-posts
```

## Building for Production

```bash
npm run build
```

Bygget genereres i `dist/` mappen.

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Vite
- **Backend**: Node.js, Express, Axios
- **APIs**: Jira REST API v3, e-conomic REST API, Custom Telefonsystem API

## Notes

- Data opdateres automatisk hvert 60. sekund
- Alle service filer kører i øjeblikket med mockdata - aktiver rigtige API kald ved at fjerne kommentarerne og tilføje dine credentials
- Fejlhåndtering er implementeret med graceful fallbacks
- Dashboard er optimeret til store skærme (1920px+)

## Next Steps

1. Tilføj dine API credentials til `.env`
2. Test backend endpoints med curl
3. Aktiver rigtige API kald i service filerne
4. Tilpas data mapping efter dine API response formater
5. Test dashboard med live data

