import telephonyCsvParser from './telephonyCsvParser.mjs';
import oneConnectScraper from './oneConnectScraper.mjs';

/**
 * Telefonsystem API Service - Uni-tel One-Connect
 *
 * Bruger web scraping af One-Connect dashboard.
 * Data opdateres automatisk hver 30. minut fra kl 08:00 til 16:00.
 *
 * Fallback til CSV import hvis scraping fejler.
 * CSV fil placering: data/telephony/*.csv
 *
 * Fremtidig implementation kan bruge CSTA API:
 * https://uni-tel.github.io/api-documentation/
 */

class TelephonyService {
  constructor() {
    // Cache til telefoni data
    this.cache = {
      data: null,
      lastFetch: null
    };

    // Opdateringstider: hver 30. minut fra 08:00 til 16:00
    this.updateTimes = [
      { hour: 8, minute: 0 },
      { hour: 8, minute: 30 },
      { hour: 9, minute: 0 },
      { hour: 9, minute: 30 },
      { hour: 10, minute: 0 },
      { hour: 10, minute: 30 },
      { hour: 11, minute: 0 },
      { hour: 11, minute: 30 },
      { hour: 12, minute: 0 },
      { hour: 12, minute: 30 },
      { hour: 13, minute: 0 },
      { hour: 13, minute: 30 },
      { hour: 14, minute: 0 },
      { hour: 14, minute: 30 },
      { hour: 15, minute: 0 },
      { hour: 15, minute: 30 },
      { hour: 16, minute: 0 }
    ];

    // Mockdata hvis CSV ikke er tilgængelig
    this.mockData = {
      hallmonitor: {
        queue: 0,
        lost: 0,
        answered: 0,
        answerRate: 0,
        maxWaitToday: "00:00",
        avgWait: "00:00",
        agents: { ready: 2, busy: 0, other: 3, total: 5 }
      },
      switchpay: {
        queue: 0,
        lost: 1,
        answered: 6,
        answerRate: 86,
        maxWaitToday: "00:00",
        avgWait: "00:00",
        agents: { ready: 2, busy: 0, other: 4, total: 6 }
      }
    };
  }

  /**
   * Tjekker om vi skal hente frisk data
   * Data hentes hver 30. minut fra kl 08:00 til 16:00
   */
  shouldFetchFreshData() {
    if (!this.cache.lastFetch) {
      return true; // Første gang
    }

    const now = new Date();
    const lastFetch = new Date(this.cache.lastFetch);

    // Hvis sidste fetch var en anden dag, hent frisk data
    if (now.toDateString() !== lastFetch.toDateString()) {
      return true;
    }

    // Nuværende tid i minutter siden midnat
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const lastFetchMinutes = lastFetch.getHours() * 60 + lastFetch.getMinutes();

    // Tjek om vi er passeret et opdateringstidspunkt siden sidste fetch
    for (const time of this.updateTimes) {
      const updateMinutes = time.hour * 60 + time.minute;
      if (nowMinutes >= updateMinutes && lastFetchMinutes < updateMinutes) {
        return true;
      }
    }

    return false;
  }

  /**
   * Returnerer næste opdateringstidspunkt som string
   */
  getNextUpdateTime() {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    for (const time of this.updateTimes) {
      const updateMinutes = time.hour * 60 + time.minute;
      if (nowMinutes < updateMinutes) {
        const minuteStr = time.minute.toString().padStart(2, '0');
        return `${time.hour}:${minuteStr}`;
      }
    }

    // Hvis vi er forbi alle opdateringstider i dag, returner første tidspunkt i morgen
    const firstTime = this.updateTimes[0];
    const minuteStr = firstTime.minute.toString().padStart(2, '0');
    return `${firstTime.hour}:${minuteStr} (i morgen)`;
  }

  /**
   * Henter support kø statistikker for HallMonitor og SwitchPay
   *
   * Bruger CSV import fra Uni-tel selvbetjening.
   * Placér CSV fil i: data/telephony/*.csv
   */
  async getSupportQueueStats() {
    try {
      // Tjek om vi skal hente frisk data
      if (this.shouldFetchFreshData()) {
        console.log('Telefoni: Henter frisk data...');

        // Strategi 1: Web scraping af One-Connect dashboard
        try {
          console.log('Telefoni: Forsøger web scraping...');
          const scrapedData = await oneConnectScraper.scrapeQueueStats();

          if (scrapedData) {
            // Gem i cache
            this.cache.data = scrapedData;
            this.cache.lastFetch = new Date().toISOString();

            console.log(`Telefoni: Scraping succesfuldt. Næste opdatering kl ${this.getNextUpdateTime()}`);
            return this.cache.data;
          }
        } catch (scrapeError) {
          console.warn('Telefoni: Web scraping fejlede:', scrapeError.message);
        }

        // Strategi 2: Brug cached data hvis tilgængelig
        if (this.cache.data) {
          console.log('Telefoni: Bruger cached data (scraping fejlede)');
          return this.cache.data;
        }

        // Strategi 3: Fallback til mockdata
        console.log('Telefoni: Bruger mockdata (ingen cached data tilgængelig)');
        return this.mockData;
      } else {
        console.log(`Telefoni: Bruger cached data fra ${new Date(this.cache.lastFetch).toLocaleTimeString('da-DK')}. Næste opdatering kl ${this.getNextUpdateTime()}`);
        console.log('Telefoni: Cache data:', this.cache.data ? 'findes' : 'findes IKKE');
        if (!this.cache.data) {
          console.log('Telefoni: ADVARSEL - Cache er tom, bruger mockdata');
        }
        return this.cache.data || this.mockData;
      }

    } catch (error) {
      console.error('Fejl ved hentning af telefoni data:', error.message);

      // Returner cached data hvis tilgængelig
      if (this.cache.data) {
        console.log('Telefoni: Returner cached data pga. fejl');
        return this.cache.data;
      }

      // Fallback til mockdata
      console.log('Telefoni: Fallback til mockdata pga. fejl');
      return this.mockData;
    }
  }

  /**
   * Mapper rå API data til vores format
   * Tilpas denne baseret på dit telefonsystems response struktur
   */
  mapQueueData(rawData, queueName) {
    // Eksempel mapping - tilpas til dit system
    return {
      queue: rawData.callsInQueue || 0,
      lost: rawData.abandonedCalls || 0,
      answered: rawData.answeredCalls || 0,
      answerRate: rawData.answerRate || 0,
      maxWaitToday: rawData.maxWaitTime || "00:00",
      avgWait: rawData.avgWaitTime || "00:00",
      agents: {
        ready: rawData.agentsReady || 0,
        busy: rawData.agentsBusy || 0,
        other: rawData.agentsOther || 0,
        total: rawData.totalAgents || 0
      }
    };
  }
}

export default new TelephonyService();
