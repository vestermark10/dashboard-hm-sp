import express from "express";
import cors from "cors";
import 'dotenv/config';
import telephonyService from './services/telephonyService.mjs';
import jiraService from './services/jiraService.mjs';
import economicService from './services/economicService.mjs';

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

app.listen(PORT, async () => {
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
