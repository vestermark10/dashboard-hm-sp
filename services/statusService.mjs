import axios from 'axios';
import { parseStringPromise } from 'xml2js';

/**
 * Status Service - Overvåger VippsMobilePay, Payter og Elavon status
 *
 * VippsMobilePay: Atom feed for incidents
 * Payter: JSON API for component status (MyPayter + Cloud Payment Service)
 * Elavon: Atom feed for incidents (indløserbank for SwitchPay)
 */

class StatusService {
  constructor() {
    this.vippsAtomUrl = 'https://status.vippsmobilepay.com/history.atom';
    this.payterJsonUrl = 'https://status.payter.com/index.json';
    this.elavonAtomUrl = 'https://status.elavon.com/state_feed/feed.atom';

    // SIMULERING: Sæt til true for at teste outage popup
    this.simulateOutage = false;

    // Cache
    this.cache = {
      data: null,
      lastFetch: null
    };

    // Cache i 60 sekunder
    this.cacheTtlMs = 60 * 1000;
  }

  /**
   * Henter samlet status for begge services
   */
  async getStatus() {
    // SIMULERING: Returner mock outage data
    if (this.simulateOutage) {
      console.log('StatusService: SIMULERER OUTAGE');
      return {
        vippsMobilePay: {
          status: 'outage',
          hasOutage: true,
          incidents: [
            {
              id: 'sim-001',
              title: 'Betalingsproblemer i Danmark',
              content: 'Vi oplever problemer med betalinger for brugere i Danmark. Vores team arbejder på at løse problemet. Betalinger kan fejle eller være forsinkede.',
              updated: new Date().toISOString(),
              status: 'investigating'
            }
          ]
        },
        payter: {
          status: 'operational',
          hasOutage: false,
          components: {
            myPayter: { name: 'MyPayter', status: 'operational', isOperational: true },
            cloudPaymentService: { name: 'Cloud Payment Service', status: 'operational', isOperational: true }
          }
        },
        hasOutage: true,
        lastUpdated: new Date().toISOString()
      };
    }

    // Tjek cache
    if (this.cache.data && this.cache.lastFetch) {
      const age = Date.now() - new Date(this.cache.lastFetch).getTime();
      if (age < this.cacheTtlMs) {
        return this.cache.data;
      }
    }

    try {
      const [vippsStatus, payterStatus, elavonStatus] = await Promise.all([
        this.getVippsStatus(),
        this.getPayterStatus(),
        this.getElavonStatus()
      ]);

      const result = {
        vippsMobilePay: vippsStatus,
        payter: payterStatus,
        elavon: elavonStatus,
        hasOutage: vippsStatus.hasOutage || payterStatus.hasOutage || elavonStatus.hasOutage,
        lastUpdated: new Date().toISOString()
      };

      // Gem i cache
      this.cache.data = result;
      this.cache.lastFetch = new Date().toISOString();

      return result;
    } catch (error) {
      console.error('StatusService: Fejl ved hentning af status:', error.message);

      // Returner cached data hvis tilgængelig
      if (this.cache.data) {
        return this.cache.data;
      }

      // Fallback - antag alt er OK
      return {
        vippsMobilePay: { status: 'operational', hasOutage: false, incidents: [] },
        payter: { status: 'operational', hasOutage: false, components: {} },
        elavon: { status: 'operational', hasOutage: false, incidents: [] },
        hasOutage: false,
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Henter VippsMobilePay status fra Atom feed
   * Leder efter aktive/uløste incidents
   */
  async getVippsStatus() {
    try {
      const response = await axios.get(this.vippsAtomUrl, {
        timeout: 10000,
        headers: {
          'Accept': 'application/atom+xml'
        }
      });

      const parsed = await parseStringPromise(response.data);
      const entries = parsed.feed?.entry || [];

      // Find aktive incidents (ikke resolved)
      const activeIncidents = [];

      for (const entry of entries.slice(0, 10)) { // Tjek de 10 seneste
        const title = entry.title?.[0]?._ || entry.title?.[0] || '';
        const content = entry.content?.[0]?._ || entry.content?.[0] || '';
        const updated = entry.updated?.[0] || '';
        const id = entry.id?.[0] || '';

        // Tjek om incident er resolved
        const contentLower = content.toLowerCase();
        const isResolved = contentLower.includes('resolved') ||
                          contentLower.includes('this incident has been resolved');

        // Tjek om det er en aktiv incident (inden for de sidste 24 timer og ikke resolved)
        const updatedDate = new Date(updated);
        const hoursSinceUpdate = (Date.now() - updatedDate.getTime()) / (1000 * 60 * 60);

        if (!isResolved && hoursSinceUpdate < 24) {
          activeIncidents.push({
            id,
            title,
            content: this.stripHtml(content).substring(0, 500),
            updated,
            status: this.extractStatus(content)
          });
        }
      }

      const hasOutage = activeIncidents.length > 0;

      return {
        status: hasOutage ? 'outage' : 'operational',
        hasOutage,
        incidents: activeIncidents
      };
    } catch (error) {
      console.error('VippsMobilePay status fejl:', error.message);
      return { status: 'unknown', hasOutage: false, incidents: [], error: error.message };
    }
  }

  /**
   * Henter Payter status fra JSON API
   * Tjekker MyPayter (Production) og Cloud Payment Service
   */
  async getPayterStatus() {
    try {
      const response = await axios.get(this.payterJsonUrl, {
        timeout: 10000,
        headers: {
          'Accept': 'application/json'
        }
      });

      const data = response.data;
      const included = data.included || [];

      // Find MyPayter Production og Cloud Payment Service
      const components = {};
      let hasOutage = false;

      for (const item of included) {
        // Type er "status_page_resource", ikke "resource"
        if (item.type === 'status_page_resource') {
          const name = item.attributes?.public_name || '';
          const status = item.attributes?.status || 'operational';
          const sectionId = item.attributes?.status_page_section_id;

          // MyPayter Production (section 149861)
          if (name === 'MyPayter' && sectionId === 149861) {
            components.myPayter = {
              name: 'MyPayter',
              status,
              isOperational: status === 'operational'
            };
            console.log('Payter: Fundet MyPayter Production, status:', status);
            if (status !== 'operational') {
              hasOutage = true;
            }
          }

          // Cloud Payment Service (Production - section 149861)
          if (name === 'Cloud Payment Service' && sectionId === 149861) {
            components.cloudPaymentService = {
              name: 'Cloud Payment Service',
              status,
              isOperational: status === 'operational'
            };
            console.log('Payter: Fundet Cloud Payment Service, status:', status);
            if (status !== 'operational') {
              hasOutage = true;
            }
          }
        }
      }

      return {
        status: hasOutage ? 'outage' : 'operational',
        hasOutage,
        components
      };
    } catch (error) {
      console.error('Payter status fejl:', error.message);
      return { status: 'unknown', hasOutage: false, components: {}, error: error.message };
    }
  }

  /**
   * Henter Elavon status fra Atom feed
   * Leder efter aktive/uløste incidents
   */
  async getElavonStatus() {
    try {
      const response = await axios.get(this.elavonAtomUrl, {
        timeout: 10000,
        headers: {
          'Accept': 'application/atom+xml'
        }
      });

      const parsed = await parseStringPromise(response.data);
      const entries = parsed.feed?.entry || [];

      // Find aktive incidents (ikke resolved/ended)
      const activeIncidents = [];

      for (const entry of entries.slice(0, 10)) { // Tjek de 10 seneste
        const title = entry.title?.[0]?._ || entry.title?.[0] || '';
        const content = entry.content?.[0]?._ || entry.content?.[0] || '';
        const updated = entry.updated?.[0] || '';
        const id = entry.id?.[0] || '';

        // Tjek om incident er resolved/ended/pending
        // "Pending" = planlagt vedligeholdelse der ikke påvirker servicen endnu
        const titleLower = title.toLowerCase();
        const contentLower = content.toLowerCase();
        const isResolved = titleLower.includes('[resolved]') ||
                          titleLower.includes('[ended]') ||
                          contentLower.includes('resolved') ||
                          contentLower.includes('this incident has been resolved');
        const isPending = titleLower.includes('pending:') ||
                          titleLower.includes('[pending]');

        // Tjek om det er en aktiv incident (inden for de sidste 24 timer og ikke resolved)
        const updatedDate = new Date(updated);
        const hoursSinceUpdate = (Date.now() - updatedDate.getTime()) / (1000 * 60 * 60);

        // Kun aktive incidents: ikke resolved, ikke pending, inden for 24 timer
        if (!isResolved && !isPending && hoursSinceUpdate < 24) {
          activeIncidents.push({
            id,
            title: this.stripHtml(title),
            content: this.stripHtml(content).substring(0, 500),
            updated,
            status: this.extractStatus(content)
          });
        }
      }

      const hasOutage = activeIncidents.length > 0;

      return {
        status: hasOutage ? 'outage' : 'operational',
        hasOutage,
        incidents: activeIncidents
      };
    } catch (error) {
      console.error('Elavon status fejl:', error.message);
      return { status: 'unknown', hasOutage: false, incidents: [], error: error.message };
    }
  }

  /**
   * Fjerner HTML tags fra string
   */
  stripHtml(html) {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Ekstraherer status fra incident content
   */
  extractStatus(content) {
    const contentLower = content.toLowerCase();
    if (contentLower.includes('investigating')) return 'investigating';
    if (contentLower.includes('identified')) return 'identified';
    if (contentLower.includes('monitoring')) return 'monitoring';
    if (contentLower.includes('resolved')) return 'resolved';
    return 'unknown';
  }
}

export default new StatusService();
