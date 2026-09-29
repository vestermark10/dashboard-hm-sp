import express from "express";
import cors from "cors";
import 'dotenv/config';
import telephonyService from './services/telephonyService.mjs';
import jiraService from './services/jiraService.mjs';
import economicService from './services/economicService.mjs';
import statusService from './services/statusService.mjs';
import celebrationService from './services/celebrationService.mjs';
import oneConnectScraper from './services/oneConnectScraper.mjs';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Health-check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Backend kører 🚀",
    timestamp: new Date().toISOString()
  });
});

// Telefoni – henter rigtig data via service
app.get("/api/telephony/support", async (req, res) => {
  try {
    const data = await telephonyService.getSupportQueueStats();
    res.json(data);
  } catch (error) {
    console.error('API fejl - Telefoni:', error);
    res.status(500).json({
      error: 'Kunne ikke hente telefoni data',
      message: error.message
    });
  }
});

// Jira Support – henter rigtig data via service
app.get("/api/jira/support", async (req, res) => {
  try {
    const data = await jiraService.getSupportIssues();
    res.json(data);
  } catch (error) {
    console.error('API fejl - Jira Support:', error);
    res.status(500).json({
      error: 'Kunne ikke hente Jira support data',
      message: error.message
    });
  }
});

// Jira Orders – pipeline – henter rigtig data via service
app.get("/api/jira/orders-pipeline", async (req, res) => {
  try {
    const data = await jiraService.getOrdersPipeline();
    res.json(data);
  } catch (error) {
    console.error('API fejl - Jira Orders:', error);
    res.status(500).json({
      error: 'Kunne ikke hente Jira orders data',
      message: error.message
    });
  }
});

// e-conomic – åbne poster – henter rigtig data via service
app.get("/api/economic/open-posts", async (req, res) => {
  try {
    const data = await economicService.getOpenPosts();
    res.json(data);
  } catch (error) {
    console.error('API fejl - e-conomic:', error);
    res.status(500).json({
      error: 'Kunne ikke hente e-conomic data',
      message: error.message
    });
  }
});

// Status – VippsMobilePay og Payter status
app.get("/api/status", async (req, res) => {
  try {
    const data = await statusService.getStatus();
    res.json(data);
  } catch (error) {
    console.error('API fejl - Status:', error);
    res.status(500).json({
      error: 'Kunne ikke hente status data',
      message: error.message
    });
  }
});

// Jira SLA – HallMonitor SLA trafiklysindikatorer
app.get("/api/jira/sla", async (req, res) => {
  try {
    const data = await jiraService.getSlaSummary();
    res.json(data);
  } catch (error) {
    console.error('API fejl - Jira SLA:', error);
    res.status(500).json({
      error: 'Kunne ikke hente SLA data',
      message: error.message
    });
  }
});

// Fødselsdage og jubilæer
app.get("/api/celebrations", (req, res) => {
  try {
    const data = celebrationService.getUpcomingCelebrations();
    res.json(data);
  } catch (error) {
    console.error('API fejl - Celebrations:', error);
    res.status(500).json({
      error: 'Kunne ikke hente celebrations data',
      message: error.message
    });
  }
});

const server = app.listen(PORT, async () => {
  console.log(`Backend kører på http://localhost:${PORT}`);

  // Preload telefoni data ved opstart
  console.log('Preloader telefoni data...');
  try {
    await telephonyService.getSupportQueueStats();
    console.log('Telefoni data preloaded ✓');
  } catch (error) {
    console.error('Fejl ved preload af telefoni data:', error.message);
  }
});

// Enhver SIGTERM-listener slår Nodes standard-exit fra, så denne skal selv kalde
// process.exit - ellers holder den åbne server processen i live til systemd's
// stop-timeout (90 s) udløber.
async function shutdown(signal) {
  console.log(`${signal} modtaget - lukker ned...`);
  setTimeout(() => {
    console.error('Nedlukning tog for lang tid - tvinger exit');
    process.exit(1);
  }, 10000).unref();

  server.close();
  try {
    await oneConnectScraper.close();
  } catch (error) {
    console.error('Fejl ved lukning af OneConnect browser:', error.message);
  }
  process.exit(0);
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
