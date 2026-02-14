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

      // Beregn metrics
      const metrics = this.calculateMetrics(issues, totalOpenIssues, closedToday, newToday);

      // Beregn nye metrics (i parallel for performance)
      const [timeToFirstResponse, slaComplianceOrLifetime] = await Promise.all([
        this.calculateTimeToFirstResponse(config),
        productName === 'HallMonitor'
          ? this.calculateSlaCompliance(config)
          : this.calculateAverageLifetime(config)
      ]);

      // Hent trend data med cache
      const trendData = await this.getCachedTrendData(productName, config);

      return {
        ...metrics,
        trendData,
        timeToFirstResponse: timeToFirstResponse || '–',
        slaCompliance: productName === 'HallMonitor' ? slaComplianceOrLifetime : null,
        averageLifetime: productName === 'SwitchPay' ? (slaComplianceOrLifetime || '–') : null
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
   * Formaterer tid i millisekunder til menneskeligt læsbart format (f.eks. "2t 34m", "1d 6t")
   */
  formatDuration(milliseconds) {
    const hours = Math.floor(milliseconds / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    const days = Math.floor(hours / 6);  // 1 arbejdsdag = 6 timer (9-15)
    const remainingHours = hours % 6;

    if (days > 0) {
      return remainingHours > 0 ? `${days}d ${remainingHours}t` : `${days}d`;
    }
    if (hours > 0) {
      return minutes > 0 ? `${hours}t ${minutes}m` : `${hours}t`;
    }
    return `${minutes}m`;
  }

  /**
   * Beregner arbejdstid mellem to datoer (kun hverdage 9-15)
   * @param {Date} startDate - Start dato
   * @param {Date} endDate - Slut dato
   * @returns {number} - Arbejdstid i millisekunder
   */
  calculateBusinessHours(startDate, endDate) {
    const WORK_START_HOUR = 9;  // 09:00
    const WORK_END_HOUR = 15;   // 15:00

    let current = new Date(startDate);
    const end = new Date(endDate);
    let businessMilliseconds = 0;

    // Loop through each day
    while (current < end) {
      const dayOfWeek = current.getDay(); // 0 = søndag, 6 = lørdag

      // Skip weekends
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        // Define work hours for this day
        const workStart = new Date(current);
        workStart.setHours(WORK_START_HOUR, 0, 0, 0);

        const workEnd = new Date(current);
        workEnd.setHours(WORK_END_HOUR, 0, 0, 0);

        // Calculate overlap between [current, end] and [workStart, workEnd]
        const overlapStart = current > workStart ? current : workStart;
        const overlapEnd = end < workEnd ? end : workEnd;

        if (overlapStart < overlapEnd) {
          businessMilliseconds += overlapEnd - overlapStart;
        }
      }

      // Move to next day at midnight
      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);

      // If we've passed the end date, stop
      if (current >= end) {
        break;
      }
    }

    return businessMilliseconds;
  }

  /**
   * Beregner gennemsnitlig tid til første svar (ekskl. reporter kommentarer)
   * Baseret på løste sager fra de sidste 30 dage
   */
  async calculateTimeToFirstResponse(config) {
    try {
      // Get resolved issues from last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const dateStr = thirtyDaysAgo.toISOString().split('T')[0];

      const jql = `project = ${config.supportProjectKey} AND statusCategory = Done AND resolutiondate >= "${dateStr} 00:00"`;

      const response = await axios.post(
        `${config.baseUrl}/rest/api/3/search/jql`,
        {
          jql,
          fields: ['key', 'created', 'reporter', 'resolutiondate'],
          maxResults: 100
        },
        {
          headers: this.getAuthHeaders(config),
          timeout: 15000
        }
      );

      let allIssues = [...response.data.issues];
      let nextToken = response.data.nextPageToken;

      // Pagination
      while (nextToken) {
        const pageResp = await axios.post(
          `${config.baseUrl}/rest/api/3/search/jql`,
          { jql, fields: ['key', 'created', 'reporter', 'resolutiondate'], maxResults: 100, nextPageToken: nextToken },
          { headers: this.getAuthHeaders(config), timeout: 15000 }
        );
        allIssues.push(...pageResp.data.issues);
        nextToken = pageResp.data.nextPageToken;
      }

      // Calculate first response time for each issue
      const responseTimes = [];

      for (const issue of allIssues.slice(0, 50)) { // Limit to 50 issues to avoid rate limits
        try {
          // Fetch comments for this issue
          const commentsResp = await axios.get(
            `${config.baseUrl}/rest/api/3/issue/${issue.key}/comment`,
            {
              headers: this.getAuthHeaders(config),
              timeout: 10000
            }
          );

          const comments = commentsResp.data.comments || [];
          const reporterEmail = issue.fields.reporter?.emailAddress || issue.fields.reporter?.name;

          // Find first non-reporter comment
          const firstAgentComment = comments.find(
            comment => comment.author?.emailAddress !== reporterEmail && comment.author?.name !== reporterEmail
          );

          const created = new Date(issue.fields.created);

          if (firstAgentComment) {
            // Use first agent comment time
            const firstResponse = new Date(firstAgentComment.created);
            const responseTime = this.calculateBusinessHours(created, firstResponse);

            if (responseTime > 0) {
              responseTimes.push(responseTime);
            }
          } else if (issue.fields.resolutiondate) {
            // No comment - use resolution time as response
            const resolved = new Date(issue.fields.resolutiondate);
            const responseTime = this.calculateBusinessHours(created, resolved);

            if (responseTime > 0) {
              responseTimes.push(responseTime);
            }
          }
        } catch (err) {
          // Skip issues with comment fetch errors
          console.error(`Error fetching comments for ${issue.key}:`, err.message);
        }
      }

      if (responseTimes.length === 0) {
        return null;
      }

      // Calculate average
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      return this.formatDuration(avgResponseTime);

    } catch (error) {
      console.error('Error calculating time to first response:', error.message);
      return null;
    }
  }

  /**
   * Beregner SLA compliance % for løste sager fra de sidste 30 dage
   * Sammenligner resolutiondate med SLA Due (Business) field
   */
  async calculateSlaCompliance(config) {
    try {
      // Get resolved issues from last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const dateStr = thirtyDaysAgo.toISOString().split('T')[0];

      const jql = `project = ${config.supportProjectKey} AND statusCategory = Done AND resolutiondate >= "${dateStr} 00:00"`;

      const response = await axios.post(
        `${config.baseUrl}/rest/api/3/search/jql`,
        {
          jql,
          fields: ['key', 'resolutiondate', 'customfield_*'],
          maxResults: 100
        },
        {
          headers: this.getAuthHeaders(config),
          timeout: 15000
        }
      );

      let allIssues = [...response.data.issues];
      let nextToken = response.data.nextPageToken;

      // Pagination
      while (nextToken) {
        const pageResp = await axios.post(
          `${config.baseUrl}/rest/api/3/search/jql`,
          { jql, fields: ['key', 'resolutiondate', 'customfield_*'], maxResults: 100, nextPageToken: nextToken },
          { headers: this.getAuthHeaders(config), timeout: 15000 }
        );
        allIssues.push(...pageResp.data.issues);
        nextToken = pageResp.data.nextPageToken;
      }

      if (allIssues.length === 0) {
        return null;
      }

      let withinSla = 0;
      let totalWithSla = 0;

      for (const issue of allIssues) {
        // Find SLA Due field (reuse existing findCustomFieldValue pattern)
        const slaDue = this.findCustomFieldValue(issue.fields, [
          'SLA Due (Business)',
          'SLA Due',
          'Due Date'
        ]);

        if (slaDue && issue.fields.resolutiondate) {
          totalWithSla++;
          const dueDate = new Date(slaDue);
          const resolvedDate = new Date(issue.fields.resolutiondate);

          if (resolvedDate <= dueDate) {
            withinSla++;
          }
        }
      }

      if (totalWithSla === 0) {
        return null;
      }

      return Math.round((withinSla / totalWithSla) * 100);

    } catch (error) {
      console.error('Error calculating SLA compliance:', error.message);
      return null;
    }
  }

  /**
   * Beregner gennemsnitlig levetid for løste sager fra de sidste 30 dage
   * Fra created til resolutiondate
   */
  async calculateAverageLifetime(config) {
    try {
      // Get resolved issues from last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const dateStr = thirtyDaysAgo.toISOString().split('T')[0];

      const jql = `project = ${config.supportProjectKey} AND statusCategory = Done AND resolutiondate >= "${dateStr} 00:00"`;

      const response = await axios.post(
        `${config.baseUrl}/rest/api/3/search/jql`,
        {
          jql,
          fields: ['key', 'created', 'resolutiondate'],
          maxResults: 100
        },
        {
          headers: this.getAuthHeaders(config),
          timeout: 15000
        }
      );

      let allIssues = [...response.data.issues];
      let nextToken = response.data.nextPageToken;

      // Pagination
      while (nextToken) {
        const pageResp = await axios.post(
          `${config.baseUrl}/rest/api/3/search/jql`,
          { jql, fields: ['key', 'created', 'resolutiondate'], maxResults: 100, nextPageToken: nextToken },
          { headers: this.getAuthHeaders(config), timeout: 15000 }
        );
        allIssues.push(...pageResp.data.issues);
        nextToken = pageResp.data.nextPageToken;
      }

      if (allIssues.length === 0) {
        return null;
      }

      const lifetimes = [];

      for (const issue of allIssues) {
        if (issue.fields.created && issue.fields.resolutiondate) {
          const created = new Date(issue.fields.created);
          const resolved = new Date(issue.fields.resolutiondate);
          const lifetime = this.calculateBusinessHours(created, resolved);

          if (lifetime > 0) {
            lifetimes.push(lifetime);
          }
        }
      }

      if (lifetimes.length === 0) {
        return null;
      }

      const avgLifetime = lifetimes.reduce((a, b) => a + b, 0) / lifetimes.length;
      return this.formatDuration(avgLifetime);

    } catch (error) {
      console.error('Error calculating average lifetime:', error.message);
      return null;
    }
  }

  /**
   * Henter issue count via pagination (da /search/approximate-count ikke findes)
   */
  async getCountWithPagination(config, jql) {
    try {
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
    } catch (error) {
      console.error('Pagination count error:', error.message);
      return 0;
    }
  }

  /**
   * Henter historiske data for trend chart (9 uger)
   * - 8 hele uger (akkumuleret)
   * - 1 indeværende uge (dag-for-dag)
   */
  async get8WeeksTrendData(config) {
    try {
      const today = new Date();
      const weeks = [];
      const currentWeek = [];

      // Find mandag i denne uge (ISO uge starter mandag)
      const currentMonday = new Date(today);
      const dayOfWeek = currentMonday.getDay(); // 0 = søndag, 1 = mandag, ...
      const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Hvis søndag, gå 6 dage tilbage
      currentMonday.setDate(currentMonday.getDate() + daysToMonday);
      currentMonday.setHours(0, 0, 0, 0);

      // Hent data for indeværende uge (dag-for-dag)
      for (let day = 0; day < 7; day++) {
        const date = new Date(currentMonday);
        date.setDate(date.getDate() + day);

        // Stop hvis vi er i fremtiden
        if (date > today) break;

        const dateStr = date.toISOString().split('T')[0];
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);
        const nextDateStr = nextDate.toISOString().split('T')[0];

        const createdJql = `project = ${config.supportProjectKey} AND created >= "${dateStr} 00:00" AND created < "${nextDateStr} 00:00"`;
        const resolvedJql = `project = ${config.supportProjectKey} AND statusCategory = Done AND resolutiondate >= "${dateStr} 00:00" AND resolutiondate < "${nextDateStr} 00:00"`;

        // Hent counts med pagination (da approximate-count ikke findes)
        const createdCount = await this.getCountWithPagination(config, createdJql);
        const resolvedCount = await this.getCountWithPagination(config, resolvedJql);

        const dayNames = ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'];

        currentWeek.push({
          date: dateStr,
          dayLabel: dayNames[date.getDay()],
          created: createdCount,
          resolved: resolvedCount,
          open: 0 // Beregnes senere
        });
      }

      // Hent data for de sidste 8 hele uger (før indeværende uge)
      for (let weekOffset = 1; weekOffset <= 8; weekOffset++) {
        const weekStart = new Date(currentMonday);
        weekStart.setDate(weekStart.getDate() - (weekOffset * 7));

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        const weekStartStr = weekStart.toISOString().split('T')[0];
        const weekEndStr = weekEnd.toISOString().split('T')[0];

        const createdJql = `project = ${config.supportProjectKey} AND created >= "${weekStartStr} 00:00" AND created < "${weekEndStr} 00:00"`;
        const resolvedJql = `project = ${config.supportProjectKey} AND statusCategory = Done AND resolutiondate >= "${weekStartStr} 00:00" AND resolutiondate < "${weekEndStr} 00:00"`;

        // Hent counts med pagination
        const createdCount = await this.getCountWithPagination(config, createdJql);
        const resolvedCount = await this.getCountWithPagination(config, resolvedJql);

        // Beregn uge nummer
        const weekNumber = this.getISOWeekNumber(weekStart);

        weeks.unshift({ // unshift for at vende rækkefølgen (ældste først)
          weekLabel: `Uge ${weekNumber}`,
          weekStart: weekStartStr,
          created: createdCount,
          resolved: resolvedCount,
          open: 0 // Beregnes senere
        });
      }

      // Beregn åbne sager som løbende balance
      // Start med nuværende antal åbne sager (lige nu)
      const currentOpenJql = `project = ${config.supportProjectKey} AND statusCategory != Done`;
      let runningOpen = await this.getCountWithPagination(config, currentOpenJql);

      // Sæt dagens nuværende tal (seneste dag)
      if (currentWeek.length > 0) {
        currentWeek[currentWeek.length - 1].open = runningOpen;
      }

      // Gå baglæns gennem dagene og beregn åbne sager
      for (let i = currentWeek.length - 1; i > 0; i--) {
        runningOpen = runningOpen - currentWeek[i].created + currentWeek[i].resolved;
        currentWeek[i - 1].open = runningOpen;
      }

      // Fortsæt baglæns gennem ugerne fra sidste dags start
      for (let i = weeks.length - 1; i >= 0; i--) {
        runningOpen = runningOpen - weeks[i].created + weeks[i].resolved;
        weeks[i].open = runningOpen;
      }

      return { weeks, currentWeek };

    } catch (error) {
      console.error('Fejl ved hentning af 8-ugers trend data:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data));
      }
      return this.getMock8WeeksTrendData();
    }
  }

  /**
   * Beregner ISO uge nummer
   */
  getISOWeekNumber(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
  }

  /**
   * Mock data for 8 ugers trend
   */
  getMock8WeeksTrendData() {
    const weeks = [];
    const currentWeek = [];

    // 8 uger (mock) - uge 51, 52 (2025) + uge 1-6 (2026)
    const weekNumbers = [51, 52, 1, 2, 3, 4, 5, 6];
    for (let i = 0; i < 8; i++) {
      weeks.push({
        weekLabel: `Uge ${weekNumbers[i]}`,
        created: Math.floor(Math.random() * 50) + 20,
        resolved: Math.floor(Math.random() * 45) + 18,
        open: Math.floor(Math.random() * 30) + 100
      });
    }

    // Indeværende uge (mock)
    const dayNames = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
    for (let i = 0; i < 5; i++) { // Kun 5 dage (man-fre)
      currentWeek.push({
        dayLabel: dayNames[i],
        created: Math.floor(Math.random() * 10) + 3,
        resolved: Math.floor(Math.random() * 8) + 2,
        open: Math.floor(Math.random() * 5) + 110
      });
    }

    return { weeks, currentWeek };
  }

  /**
   * GAMMEL METODE - Henter historiske data for trend chart (sidste 30 dage)
   * DEPRECATED - bruges ikke længere
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
      return this.trendCache.data[cacheKey];
    }

    // Cache er forældet eller ikke-eksisterende - hent ny data
    const trendData = await this.get8WeeksTrendData(config);

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
      trendData: this.generateMockTrendData(isMockHallmonitor),
      timeToFirstResponse: isMockHallmonitor ? '2t 15m' : '1t 45m',
      ...(isMockHallmonitor
        ? { slaCompliance: 94 }
        : { averageLifetime: '1d 3t' })
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
    // DEPRECATED - brug getMock8WeeksTrendData() i stedet
    return this.getMock8WeeksTrendData();
  }

  /**
   * Henter SLA status for HallMonitor
   * Returnerer trafiklysstatus for Enhed (48 timer) og Backend (24 timer)
   */
  async getSlaSummary() {
    try {
      const config = this.hmConfig;

      // Check hvis credentials mangler
      if (!config.baseUrl || !config.email || !config.apiToken) {
        console.warn('HallMonitor SLA: Jira credentials mangler - bruger mockdata');
        return this.getMockSlaSummary();
      }

      // Hent alle åbne sager med SLA felter
      // Custom field IDs skal matches med jeres Jira setup
      const [enhedResult, backendResult] = await Promise.all([
        this.getSlaStatusForType(config, 'Enhed (48 timer)', 48),
        this.getSlaStatusForType(config, 'Backend (24 timer)', 24)
      ]);

      return {
        enhed: enhedResult,
        backend: backendResult,
        lastUpdated: new Date().toISOString()
      };

    } catch (error) {
      console.error('Fejl ved hentning af SLA summary:', error.message);
      return this.getMockSlaSummary();
    }
  }

  /**
   * Henter SLA status for en specifik SLA type
   * @param {Object} config - Jira config
   * @param {string} slaType - SLA Type værdi (f.eks. "Enhed (48 timer)")
   * @param {number} slaHours - SLA timer (f.eks. 48)
   */
  async getSlaStatusForType(config, slaType, slaHours) {
    try {
      // JQL: Hent åbne sager med denne SLA type
      // Bemærk: "SLA Type" og andre custom fields skal bruge deres felt-ID
      // Du kan finde felt-ID'er via: GET /rest/api/3/field
      const jql = `project = ${config.supportProjectKey} AND "SLA Type" = "${slaType}" AND status NOT IN ("Løst", "Annulleret")`;

      const response = await axios.post(
        `${config.baseUrl}/rest/api/3/search/jql`,
        {
          jql,
          fields: ['key', 'summary', 'status', 'customfield_*'], // Hent alle custom fields
          maxResults: 100
        },
        {
          headers: this.getAuthHeaders(config),
          timeout: 15000
        }
      );

      const issues = response.data.issues || [];

      if (issues.length === 0) {
        return { status: 'green', count: 0, breached: 0, warning: 0, criticalIssues: [] };
      }

      // Analyser hver sag for SLA status
      const now = new Date();
      let breachedCount = 0;  // SLA overskredet
      let warningCount = 0;   // Under 20% tid tilbage
      let activeCount = 0;    // Aktive (ikke pausede) sager
      const criticalIssues = []; // Liste over kritiske sager (gul/rød)

      // 20% af SLA tid i millisekunder
      const warningThresholdMs = slaHours * 0.2 * 60 * 60 * 1000;

      for (const issue of issues) {
        const fields = issue.fields;

        // Find SLA Pauset felt (tjek om sagen er pauset)
        // Custom field navne varierer - vi prøver forskellige muligheder
        const slaPaused = this.findCustomFieldValue(fields, ['SLA Pauset', 'SLA Pause', 'Paused']);
        const isPaused = slaPaused && (slaPaused === 'Pauset' || slaPaused === 'Pause' || slaPaused === true);

        if (isPaused) {
          continue;
        }

        activeCount++;

        // Find SLA Due (Business) felt
        const slaDue = this.findCustomFieldValue(fields, ['SLA Due (Business)', 'SLA Due', 'Due Date']);

        if (!slaDue) {
          continue;
        }

        const dueDate = new Date(slaDue);
        const timeRemaining = dueDate.getTime() - now.getTime();

        if (timeRemaining < 0) {
          // SLA overskredet
          breachedCount++;
          criticalIssues.push({
            key: issue.key,
            status: 'breached',
            timeRemainingMs: timeRemaining // Negativ værdi
          });
        } else if (timeRemaining < warningThresholdMs) {
          // Under 20% tid tilbage
          warningCount++;
          criticalIssues.push({
            key: issue.key,
            status: 'warning',
            timeRemainingMs: timeRemaining
          });
        }
      }

      // Sorter kritiske sager: rød før gul, derefter efter tid (mest kritisk først)
      criticalIssues.sort((a, b) => {
        // Først sorter efter status (breached før warning)
        if (a.status === 'breached' && b.status === 'warning') return -1;
        if (a.status === 'warning' && b.status === 'breached') return 1;
        // Derefter sorter efter tid (laveste/mest negativ først)
        return a.timeRemainingMs - b.timeRemainingMs;
      });

      // Bestem samlet status
      let status;
      if (breachedCount > 0) {
        status = 'red';
      } else if (warningCount > 0) {
        status = 'yellow';
      } else {
        status = 'green';
      }

      return {
        status,
        count: activeCount,
        breached: breachedCount,
        warning: warningCount,
        criticalIssues
      };

    } catch (error) {
      console.error(`Fejl ved SLA check for ${slaType}:`, error.message);
      if (error.response) {
        console.error(`Response status: ${error.response.status}`);
        console.error(`Response data:`, JSON.stringify(error.response.data, null, 2));
      }
      return { status: 'unknown', count: 0, breached: 0, warning: 0, criticalIssues: [], error: error.message };
    }
  }

  /**
   * Finder værdi for et custom field baseret på mulige navne
   */
  findCustomFieldValue(fields, possibleNames) {
    // Først: Tjek om det er et kendt field navn
    for (const name of possibleNames) {
      if (fields[name] !== undefined) {
        const val = fields[name];
        // Hvis det er et objekt med 'value', returnér value
        if (val && typeof val === 'object' && val.value) {
          return val.value;
        }
        return val;
      }
    }

    // Dernæst: Søg i alle customfield_XXXXX felter
    for (const [key, value] of Object.entries(fields)) {
      if (key.startsWith('customfield_') && value) {
        // Tjek om dette felt matcher et af de søgte navne
        // Custom fields kan have navnet i value.name eller som string value
        if (typeof value === 'object') {
          if (value.value) return value.value;
          if (value.name && possibleNames.some(n => value.name.includes(n))) {
            return value.value || value.name;
          }
        }
      }
    }

    return null;
  }

  getMockSlaSummary() {
    return {
      enhed: { status: 'green', count: 5, breached: 0, warning: 0, criticalIssues: [] },
      backend: { status: 'green', count: 3, breached: 0, warning: 0, criticalIssues: [] },
      lastUpdated: new Date().toISOString()
    };
  }
}

export default new JiraService();
