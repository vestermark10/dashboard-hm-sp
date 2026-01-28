import axios from 'axios';

/**
 * Jira API Service - Dual Instance Support
 * Dokumentation: https://developer.atlassian.com/cloud/jira/platform/rest/v3/
 *
 * Håndterer to separate Jira instances:
 * - HallMonitor: https://vestpol.atlassian.net (VestPol Business)
 * - SwitchPay: https://switchpaydev.atlassian.net
 */

class JiraService {
  constructor() {
    // HallMonitor Jira configuration
    this.hmConfig = {
      baseUrl: process.env.JIRA_HM_URL,
      email: process.env.JIRA_HM_EMAIL,
      apiToken: process.env.JIRA_HM_API_TOKEN,
      supportProjectKey: process.env.JIRA_HM_SUPPORT_PROJECT_KEY || 'HS',
      ordersProjectKey: process.env.JIRA_HM_ORDERS_PROJECT_KEY || 'HO'
    };

    // SwitchPay Jira configuration
    this.spConfig = {
      baseUrl: process.env.JIRA_SP_URL,
      email: process.env.JIRA_SP_EMAIL,
      apiToken: process.env.JIRA_SP_API_TOKEN,
      supportProjectKey: process.env.JIRA_SP_SUPPORT_PROJECT_KEY || 'SUP',
      ordersProjectKey: process.env.JIRA_SP_ORDERS_PROJECT_KEY || 'ORDERS'
    };

    // Cache for trend data (opdateres 1 gang per dag)
    this.trendCache = {
      data: {},
      lastUpdated: null
    };
  }

  getAuthHeaders(config) {
    const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
    return {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
  }

  /**
   * Henter support sager for HallMonitor og SwitchPay
   */
  async getSupportIssues() {
    try {
      const [hallmonitor, switchpay] = await Promise.all([
        this.getProductSupportData('HallMonitor', this.hmConfig),
        this.getProductSupportData('SwitchPay', this.spConfig)
      ]);

      return { hallmonitor, switchpay };
    } catch (error) {
      console.error('Fejl ved hentning af Jira support data:', error.message);

      // Fallback til mockdata hvis API fejler
      return this.getMockSupportData();
    }
  }

  async getProductSupportData(productName, config) {
    try {
      // Check hvis credentials mangler
      if (!config.baseUrl || !config.email || !config.apiToken) {
        console.warn(`${productName}: Jira credentials mangler - bruger mockdata`);
        return this.getSingleProductMockData(productName);
      }

      // JQL query til at finde åbne sager (bruger statusCategory for at ekskludere alle lukkede)
      const jql = `project = ${config.supportProjectKey} AND statusCategory != Done ORDER BY created DESC`;

      // Hent total count (separat query)
      const countResponse = await axios.post(
        `${config.baseUrl}/rest/api/3/search/jql`,
        {
          jql: `project = ${config.supportProjectKey} AND statusCategory != Done`,
          maxResults: 1
        },
        {
          headers: this.getAuthHeaders(config),
          timeout: 10000
        }
      );

      // Hent actual issues
      const response = await axios.post(
        `${config.baseUrl}/rest/api/3/search/jql`,
        {
          jql,
          fields: ['summary', 'status', 'priority', 'created', 'updated'],
          maxResults: 100
        },
        {
          headers: this.getAuthHeaders(config),
          timeout: 10000
        }
      );

      const issues = response.data.issues;

      // Tæl total open issues ved at fjerne duplicates
      const issueKeys = new Set(issues.map(i => i.key).filter(Boolean));
      let nextPageToken = countResponse.data.nextPageToken;

      while (nextPageToken) {
        const pageResponse = await axios.post(
          `${config.baseUrl}/rest/api/3/search/jql`,
          {
            jql: `project = ${config.supportProjectKey} AND statusCategory != Done`,
            fields: ['key'],
            maxResults: 100,
            nextPageToken
          },
          {
            headers: this.getAuthHeaders(config),
            timeout: 10000
          }
        );
        pageResponse.data.issues.forEach(issue => {
          if (issue.key) issueKeys.add(issue.key);
        });
        nextPageToken = pageResponse.data.nextPageToken;
      }

      const totalOpenIssues = issueKeys.size;

      // Hent issues lukket i dag for at tælle closedToday (brug lokal dansk tid CET = UTC+1)
      const now = new Date();

      // Beregn dagens dato i CET (UTC+1)
      const cetNow = new Date(now.getTime() + 60 * 60 * 1000); // Tilføj 1 time for CET
      const cetYear = cetNow.getUTCFullYear();
      const cetMonth = String(cetNow.getUTCMonth() + 1).padStart(2, '0');
      const cetDay = String(cetNow.getUTCDate()).padStart(2, '0');

      const todayStr = `${cetYear}-${cetMonth}-${cetDay}`;

      // Beregn igår for resolutiondate query (samme logik som created)
      const cetYesterdayRes = new Date(cetNow.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayYearRes = cetYesterdayRes.getUTCFullYear();
      const yesterdayMonthRes = String(cetYesterdayRes.getUTCMonth() + 1).padStart(2, '0');
      const yesterdayDayRes = String(cetYesterdayRes.getUTCDate()).padStart(2, '0');
      const yesterdayStrRes = `${yesterdayYearRes}-${yesterdayMonthRes}-${yesterdayDayRes}`;

      // VIGTIGT: Jira JQL bruger UTC tid, men vi vil have CET tid (UTC+1)
      // Så vi skal query for "igår 23:00 UTC til i dag 23:00 UTC" for at få "i dag 00:00 CET til i morgen 00:00 CET"
      const closedTodayJql = `project = ${config.supportProjectKey} AND statusCategory = Done AND resolutiondate >= "${yesterdayStrRes} 23:00" AND resolutiondate < "${todayStr} 23:00"`;
      const closedTodayResponse = await axios.post(
        `${config.baseUrl}/rest/api/3/search/jql`,
        {
          jql: closedTodayJql,
          fields: ['key', 'resolutiondate'],
          maxResults: 100
        },
        {
          headers: this.getAuthHeaders(config),
          timeout: 10000
        }
      );

      // Tæl unique closed issues fra i dag
      const closedTodayKeys = new Set(closedTodayResponse.data.issues.map(i => i.key).filter(Boolean));
      let closedNextToken = closedTodayResponse.data.nextPageToken;

      while (closedNextToken) {
        const pageResp = await axios.post(
          `${config.baseUrl}/rest/api/3/search/jql`,
          {
            jql: closedTodayJql,
            fields: ['key'],
            maxResults: 100,
            nextPageToken: closedNextToken
          },
          {
            headers: this.getAuthHeaders(config),
            timeout: 10000
          }
        );
        pageResp.data.issues.forEach(i => { if (i.key) closedTodayKeys.add(i.key); });
        closedNextToken = pageResp.data.nextPageToken;
      }

      const closedToday = closedTodayKeys.size;

      // DEBUG: Vis hvilke issues der blev lukket i dag
      console.log(`${productName} - DEBUG JQL: ${closedTodayJql}`);
      if (closedToday > 0 && closedToday < 20) {
        const closedKeys = Array.from(closedTodayKeys).slice(0, 10).join(', ');
        console.log(`${productName} - Closed today: ${closedToday} (${closedKeys}${closedToday > 10 ? '...' : ''})`);
        // Vis første issue's resolutiondate
        if (closedTodayResponse.data.issues.length > 0 && closedTodayResponse.data.issues[0].fields.resolutiondate) {
          console.log(`${productName} - Første issue resolutiondate: ${closedTodayResponse.data.issues[0].fields.resolutiondate}`);
        }
      } else {
        console.log(`${productName} - Closed today: ${closedToday}`);
      }

      // Hent issues oprettet i dag for at tælle newToday (inkluderer både åbne og lukkede)
      // VIGTIGT: Jira JQL bruger UTC tid, men vi vil have CET tid (UTC+1)
      // Så vi skal query for "igår 23:00 UTC til i dag 23:00 UTC" for at få "i dag 00:00 CET til i morgen 00:00 CET"
      const cetYesterday = new Date(cetNow.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayYear = cetYesterday.getUTCFullYear();
      const yesterdayMonth = String(cetYesterday.getUTCMonth() + 1).padStart(2, '0');
      const yesterdayDay = String(cetYesterday.getUTCDate()).padStart(2, '0');
      const yesterdayStr = `${yesterdayYear}-${yesterdayMonth}-${yesterdayDay}`;

      const createdTodayJql = `project = ${config.supportProjectKey} AND created >= "${yesterdayStr} 23:00" AND created < "${todayStr} 23:00"`;
      const createdTodayResponse = await axios.post(
        `${config.baseUrl}/rest/api/3/search/jql`,
        { jql: createdTodayJql, fields: ['key', 'created'], maxResults: 100 },
        { headers: this.getAuthHeaders(config), timeout: 10000 }
      );

      // Tæl unique created issues fra i dag med pagination
      const createdTodayKeys = new Set(createdTodayResponse.data.issues.map(i => i.key).filter(Boolean));
      let createdNextToken = createdTodayResponse.data.nextPageToken;

      while (createdNextToken) {
        const pageResp = await axios.post(
          `${config.baseUrl}/rest/api/3/search/jql`,
          { jql: createdTodayJql, fields: ['key'], maxResults: 100, nextPageToken: createdNextToken },
          { headers: this.getAuthHeaders(config), timeout: 10000 }
        );
        pageResp.data.issues.forEach(i => { if (i.key) createdTodayKeys.add(i.key); });
        createdNextToken = pageResp.data.nextPageToken;
      }

      const newToday = createdTodayKeys.size;

      // DEBUG: Vis hvilke issues der blev oprettet i dag
      console.log(`${productName} - DEBUG created today JQL: ${createdTodayJql}`);
      if (newToday > 0 && newToday < 20) {
        const createdKeys = Array.from(createdTodayKeys).slice(0, 10).join(', ');
        console.log(`${productName} - New today: ${newToday} (${createdKeys}${newToday > 10 ? '...' : ''})`);
        // Vis første issue's created date
        if (createdTodayResponse.data.issues.length > 0 && createdTodayResponse.data.issues[0].fields.created) {
          console.log(`${productName} - Første issue created: ${createdTodayResponse.data.issues[0].fields.created}`);
        }
      } else {
        console.log(`${productName} - New today: ${newToday}`);
      }

      // Beregn metrics
      const metrics = this.calculateMetrics(issues, totalOpenIssues, closedToday, newToday);

      // Hent trend data med cache
      const trendData = await this.getCachedTrendData(productName, config);

      return {
        ...metrics,
        trendData
      };

    } catch (error) {
      console.error(`Fejl ved hentning af ${productName} support data:`, error.message);
      console.error(`URL: ${config.baseUrl}/rest/api/3/search`);
      console.error(`Project Key: ${config.supportProjectKey}`);
      if (error.response) {
        console.error(`Response status: ${error.response.status}`);
        console.error(`Response data:`, JSON.stringify(error.response.data, null, 2));
      }
      return this.getSingleProductMockData(productName);
    }
  }

  calculateMetrics(issues, totalOpenIssues, closedToday, newToday) {
    const openIssues = totalOpenIssues;

    const criticalP1 = issues.filter(i =>
      i.fields.priority?.name === 'Highest'
    ).length;

    const topIssues = issues
      .filter(i => i.fields.status.name !== 'Closed')
      .slice(0, 4)
      .map(issue => ({
        key: issue.key,
        title: issue.fields.summary,
        status: issue.fields.status.name,
        age: this.calculateAge(issue.fields.created)
      }));

    return {
      openIssues,
      newToday,
      closedToday,
      criticalP1,
      topIssues
    };
  }

  /**
   * Henter historiske data for trend chart (sidste 30 dage)
   */
  async get30DaysTrendData(config) {
    try {
      const trendData = [];
      const today = new Date();

      // Hent data for de sidste 30 dage
      for (let i = 29; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);
        const nextDateStr = nextDate.toISOString().split('T')[0];

        // JQL for oprettede issues på denne dag
        const createdJql = `project = ${config.supportProjectKey} AND created >= "${dateStr}" AND created < "${nextDateStr}"`;

        // JQL for lukkede issues på denne dag (bruger statusCategory)
        const resolvedJql = `project = ${config.supportProjectKey} AND statusCategory = Done AND resolved >= "${dateStr}" AND resolved < "${nextDateStr}"`;

        // JQL for åbne issues ved dagens slutning (23:59)
        const openJql = `project = ${config.supportProjectKey} AND created <= "${nextDateStr}" AND (statusCategory != Done OR resolved >= "${nextDateStr}")`;

        const [createdResponse, resolvedResponse, openResponse] = await Promise.all([
          axios.post(
            `${config.baseUrl}/rest/api/3/search/jql`,
            { jql: createdJql, maxResults: 100, fields: ['key'] },
            {
              headers: this.getAuthHeaders(config),
              timeout: 10000
            }
          ),
          axios.post(
            `${config.baseUrl}/rest/api/3/search/jql`,
            { jql: resolvedJql, maxResults: 100, fields: ['key'] },
            {
              headers: this.getAuthHeaders(config),
              timeout: 10000
            }
          ),
          axios.post(
            `${config.baseUrl}/rest/api/3/search/jql`,
            { jql: openJql, maxResults: 100, fields: ['key'] },
            {
              headers: this.getAuthHeaders(config),
              timeout: 10000
            }
          )
        ]);

        // Count unique issues (tæl med pagination)
        const createdKeys = new Set(createdResponse.data.issues.map(i => i.key).filter(Boolean));
        const resolvedKeys = new Set(resolvedResponse.data.issues.map(i => i.key).filter(Boolean));
        const openKeys = new Set(openResponse.data.issues.map(i => i.key).filter(Boolean));

        // Håndter pagination hvis der er mere end 100 issues på en dag
        let createdNextToken = createdResponse.data.nextPageToken;
        let resolvedNextToken = resolvedResponse.data.nextPageToken;
        let openNextToken = openResponse.data.nextPageToken;

        while (createdNextToken || resolvedNextToken || openNextToken) {
          const promises = [];
          const tokenMap = [];

          if (createdNextToken) {
            tokenMap.push('created');
            promises.push(
              axios.post(
                `${config.baseUrl}/rest/api/3/search/jql`,
                { jql: createdJql, maxResults: 100, fields: ['key'], nextPageToken: createdNextToken },
                { headers: this.getAuthHeaders(config), timeout: 10000 }
              )
            );
          }

          if (resolvedNextToken) {
            tokenMap.push('resolved');
            promises.push(
              axios.post(
                `${config.baseUrl}/rest/api/3/search/jql`,
                { jql: resolvedJql, maxResults: 100, fields: ['key'], nextPageToken: resolvedNextToken },
                { headers: this.getAuthHeaders(config), timeout: 10000 }
              )
            );
          }

          if (openNextToken) {
            tokenMap.push('open');
            promises.push(
              axios.post(
                `${config.baseUrl}/rest/api/3/search/jql`,
                { jql: openJql, maxResults: 100, fields: ['key'], nextPageToken: openNextToken },
                { headers: this.getAuthHeaders(config), timeout: 10000 }
              )
            );
          }

          const responses = await Promise.all(promises);

          responses.forEach((resp, idx) => {
            const type = tokenMap[idx];
            resp.data.issues.forEach(i => {
              if (!i.key) return;
              if (type === 'created') createdKeys.add(i.key);
              else if (type === 'resolved') resolvedKeys.add(i.key);
              else if (type === 'open') openKeys.add(i.key);
            });

            if (type === 'created') createdNextToken = resp.data.nextPageToken;
            else if (type === 'resolved') resolvedNextToken = resp.data.nextPageToken;
            else if (type === 'open') openNextToken = resp.data.nextPageToken;
          });
        }

        trendData.push({
          date: dateStr,
          created: createdKeys.size,
          resolved: resolvedKeys.size,
          open: openKeys.size
        });
      }

      return trendData;

    } catch (error) {
      console.error('Fejl ved hentning af trend data, bruger mock:', error.message);
      // Fallback til mock trend data
      return this.generateMockTrendData(config.supportProjectKey === this.hmConfig.supportProjectKey);
    }
  }

  /**
   * Henter trend data med cache - opdaterer kun 1 gang per dag
   */
  async getCachedTrendData(productName, config) {
    const cacheKey = productName;
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Tjek om cache er valid (opdateret i dag)
    if (this.trendCache.lastUpdated === today && this.trendCache.data[cacheKey]) {
      console.log(`${productName} - Bruger cached trend data fra ${today}`);
      return this.trendCache.data[cacheKey];
    }

    // Cache er forældet eller ikke-eksisterende - hent ny data
    console.log(`${productName} - Henter ny trend data (kan tage ~30 sekunder)...`);
    const trendData = await this.get30DaysTrendData(config);

    // Gem i cache
    this.trendCache.data[cacheKey] = trendData;
    this.trendCache.lastUpdated = today;

    return trendData;
  }

  calculateAge(createdDate) {
    const now = new Date();
    const created = new Date(createdDate);
    const diffMs = now - created;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d`;
    return `${diffHours}t`;
  }

  /**
   * Henter Jira Orders pipeline data
   */
  async getOrdersPipeline() {
    try {
      const [hallmonitor, switchpay] = await Promise.all([
        this.getProductOrdersData('HallMonitor', this.hmConfig, [
          'Jobliste',
          'I gang',
          'Klar til fakturering',
          'Færdig'
        ]),
        this.getProductOrdersData('SwitchPay', this.spConfig, [
          'Modtaget',
          'I process',
          'Leveret',
          'I gang',
          'Færdig'
        ])
      ]);

      return { hallmonitor, switchpay };
    } catch (error) {
      console.error('Fejl ved hentning af Jira orders pipeline:', error.message);

      // Fallback til mockdata
      return this.getMockOrdersData();
    }
  }

  async getProductOrdersData(productName, config, stages) {
    try {
      // Check hvis credentials mangler
      if (!config.baseUrl || !config.email || !config.apiToken) {
        console.warn(`${productName}: Jira credentials mangler - bruger mockdata`);
        return this.getSingleProductMockOrdersData(productName);
      }

      // Hent ALLE issues én gang og filtrer derefter i JavaScript
      // Dette undgår rate limiting ved at reducere antal API kald
      console.log(`${productName} - Henter alle issues fra projekt ${config.ordersProjectKey}...`);
      const allIssuesJql = `project = ${config.ordersProjectKey}`;

      const response = await axios.post(
        `${config.baseUrl}/rest/api/3/search/jql`,
        {
          jql: allIssuesJql,
          fields: ['key', 'status', 'resolutiondate', 'updated'],
          maxResults: 100
        },
        {
          headers: this.getAuthHeaders(config),
          timeout: 10000
        }
      );

      let allIssues = [...response.data.issues];
      let nextPageToken = response.data.nextPageToken;

      // Hent alle pages
      while (nextPageToken) {
        const pageResponse = await axios.post(
          `${config.baseUrl}/rest/api/3/search/jql`,
          {
            jql: allIssuesJql,
            fields: ['key', 'status', 'resolutiondate', 'updated'],
            maxResults: 100,
            nextPageToken
          },
          {
            headers: this.getAuthHeaders(config),
            timeout: 10000
          }
        );
        allIssues = allIssues.concat(pageResponse.data.issues);
        nextPageToken = pageResponse.data.nextPageToken;
      }

      console.log(`${productName} - Hentet ${allIssues.length} issues total. Filtrer nu for hver status...`);

      // Beregn datoen for 7 dage siden
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Nu filtrer alle issues for hver status
      const stageCounts = [];
      for (const stage of stages) {
        let matchingIssues = allIssues.filter(i => i.fields.status.name === stage);

        // For "Færdig" status, vis kun issues fra de sidste 7 dage
        if (stage === 'Færdig') {
          matchingIssues = matchingIssues.filter(i => {
            const resolved = i.fields.resolutiondate || i.fields.updated;
            if (!resolved) return false;
            const resolvedDate = new Date(resolved);
            return resolvedDate >= sevenDaysAgo;
          });
        }

        const count = new Set(matchingIssues.map(i => i.key).filter(Boolean)).size;

        console.log(`${productName} - Status "${stage}": ${count}${stage === 'Færdig' ? ' (sidste 7 dage)' : ''}`);

        stageCounts.push({
          label: stage,
          value: count
        });
      }

      return { stages: stageCounts };

    } catch (error) {
      console.error(`Fejl ved hentning af ${productName} orders data:`, error.message);
      console.error(`URL: ${config.baseUrl}/rest/api/3/search`);
      console.error(`Project Key: ${config.ordersProjectKey}`);
      if (error.response) {
        console.error(`Response status: ${error.response.status}`);
        console.error(`Response data:`, JSON.stringify(error.response.data, null, 2));
      }
      return this.getSingleProductMockOrdersData(productName);
    }
  }

  /**
   * Mock data functions (fallback)
   */
  getMockSupportData() {
    return {
      hallmonitor: this.getSingleProductMockData('HallMonitor'),
      switchpay: this.getSingleProductMockData('SwitchPay')
    };
  }

  getSingleProductMockData(productName) {
    const isMockHallmonitor = productName === 'HallMonitor';
    return {
      openIssues: isMockHallmonitor ? 42 : 18,
      newToday: isMockHallmonitor ? 6 : 3,
      closedToday: isMockHallmonitor ? 11 : 7,
      criticalP1: isMockHallmonitor ? 3 : 1,
      topIssues: isMockHallmonitor ? [
        { key: "HS-1234", title: "Camera offline", status: "In Progress", age: "2t" },
        { key: "HS-1220", title: "No detections", status: "To Do", age: "5t" },
        { key: "HS-1210", title: "Billing issue", status: "Waiting", age: "1d" },
        { key: "HS-1201", title: "False alarms", status: "In Progress", age: "3d" }
      ] : [
        { key: "SUP-998", title: "Terminal down", status: "In Progress", age: "1t" },
        { key: "SUP-977", title: "Batch error", status: "To Do", age: "4t" },
        { key: "SUP-960", title: "Settlement delayed", status: "Waiting", age: "12t" },
        { key: "SUP-951", title: "Config request", status: "To Do", age: "1d" }
      ],
      trendData: this.generateMockTrendData(isMockHallmonitor)
    };
  }

  getMockOrdersData() {
    return {
      hallmonitor: this.getSingleProductMockOrdersData('HallMonitor'),
      switchpay: this.getSingleProductMockOrdersData('SwitchPay')
    };
  }

  getSingleProductMockOrdersData(productName) {
    if (productName === 'HallMonitor') {
      return {
        stages: [
          { label: "jobliste", value: 12 },
          { label: "I gang", value: 7 },
          { label: "klar til fakturering", value: 4 },
          { label: "Færdig", value: 25 }
        ]
      };
    } else {
      return {
        stages: [
          { label: "modtaget", value: 8 },
          { label: "i process", value: 5 },
          { label: "Leveret", value: 3 },
          { label: "Hardware faktureret", value: 2 },
          { label: "færdig", value: 11 }
        ]
      };
    }
  }

  generateMockTrendData(isHallMonitor) {
    const data = [];
    const today = new Date();
    let cumulativeOpen = isHallMonitor ? 15 : 40; // Start værdi

    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);

      const baseCreated = isHallMonitor ? 8 : 5;
      const baseResolved = isHallMonitor ? 7 : 4;

      const created = baseCreated + Math.floor(Math.random() * 6) - 2;
      const resolved = baseResolved + Math.floor(Math.random() * 6) - 2;

      cumulativeOpen = cumulativeOpen + Math.max(0, created) - Math.max(0, resolved);
      cumulativeOpen = Math.max(0, cumulativeOpen); // Kan ikke være negativ

      data.push({
        date: date.toISOString().split('T')[0],
        created: Math.max(0, created),
        resolved: Math.max(0, resolved),
        open: cumulativeOpen
      });
    }

    return data;
  }
}

export default new JiraService();
