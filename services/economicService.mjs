import axios from 'axios';

/**
 * e-conomic API Service
 * Dokumentation: https://restdocs.e-conomic.com/
 */

class EconomicService {
  constructor() {
    this.baseUrl = 'https://restapi.e-conomic.com';

    // HallMonitor credentials
    this.hmConfig = {
      appSecretToken: process.env.ECONOMIC_HM_APP_SECRET_TOKEN,
      agreementGrantToken: process.env.ECONOMIC_HM_AGREEMENT_GRANT_TOKEN
    };

    // SwitchPay credentials
    this.spConfig = {
      appSecretToken: process.env.ECONOMIC_SP_APP_SECRET_TOKEN,
      agreementGrantToken: process.env.ECONOMIC_SP_AGREEMENT_GRANT_TOKEN
    };

    // Cache til e-conomic data
    this.cache = {
      data: null,
      lastFetch: null
    };

    // Opdateringstider: 08:00, 12:00, 15:00
    this.updateHours = [8, 12, 15];
  }

  getAuthHeaders(config) {
    return {
      'X-AppSecretToken': config.appSecretToken,
      'X-AgreementGrantToken': config.agreementGrantToken,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Tjekker om vi skal hente frisk data fra e-conomic API
   * Data hentes kun kl 08:00, 12:00 og 15:00
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

    // Find næste opdateringstidspunkt
    const currentHour = now.getHours();
    const lastFetchHour = lastFetch.getHours();

    // Tjek om vi er passeret et opdateringstidspunkt siden sidste fetch
    for (const hour of this.updateHours) {
      if (currentHour >= hour && lastFetchHour < hour) {
        return true;
      }
    }

    return false;
  }

  /**
   * Henter åbne poster for HallMonitor og SwitchPay
   */
  async getOpenPosts() {
    try {
      // Tjek om vi skal hente frisk data
      if (this.shouldFetchFreshData()) {
        console.log('e-conomic: Henter frisk data fra API...');

        // Hent data for begge produkter
        const [hallmonitor, switchpay] = await Promise.all([
          this.getProductOpenPosts('HallMonitor'),
          this.getProductOpenPosts('SwitchPay')
        ]);

        // Gem i cache
        this.cache.data = { hallmonitor, switchpay };
        this.cache.lastFetch = new Date().toISOString();

        console.log(`e-conomic: Data cachet. Næste opdatering kl ${this.getNextUpdateTime()}`);

        return this.cache.data;
      } else {
        console.log(`e-conomic: Bruger cached data fra ${new Date(this.cache.lastFetch).toLocaleTimeString('da-DK')}. Næste opdatering kl ${this.getNextUpdateTime()}`);
        return this.cache.data;
      }
    } catch (error) {
      console.error('Fejl ved hentning af e-conomic data:', error.message);

      // Returner cached data hvis tilgængelig
      if (this.cache.data) {
        console.log('e-conomic: Returner cached data pga. fejl');
        return this.cache.data;
      }

      throw error;
    }
  }

  /**
   * Returnerer næste opdateringstidspunkt som string
   */
  getNextUpdateTime() {
    const now = new Date();
    const currentHour = now.getHours();

    for (const hour of this.updateHours) {
      if (currentHour < hour) {
        return `${hour}:00`;
      }
    }

    // Hvis vi er forbi alle opdateringstider i dag, returner første tidspunkt i morgen
    return `${this.updateHours[0]}:00 (i morgen)`;
  }

  async getProductOpenPosts(productName) {
    try {
      const config = productName === 'HallMonitor' ? this.hmConfig : this.spConfig;

      if (!config.appSecretToken || !config.agreementGrantToken) {
        console.warn(`${productName}: e-conomic credentials mangler - bruger mockdata`);
        const isMockHallmonitor = productName === 'HallMonitor';
        return {
          openOrders: isMockHallmonitor ? 14 : 9,
          openDraftInvoices: isMockHallmonitor ? 5 : 3,
          rackbeatDrafts: isMockHallmonitor ? 2 : 1
        };
      }

      // Hent draft ordrer (ikke sendte)
      const draftOrdersResponse = await axios.get(
        `${this.baseUrl}/orders`,
        {
          headers: this.getAuthHeaders(config),
          timeout: 10000
        }
      );

      // Hent sendte ordrer (sent orders) med pagination
      const allSentOrders = [];
      let sentUrl = `${this.baseUrl}/orders/sent`;

      while (sentUrl) {
        const sentResponse = await axios.get(
          sentUrl,
          {
            headers: this.getAuthHeaders(config),
            timeout: 10000
          }
        );

        if (sentResponse.data.collection) {
          allSentOrders.push(...sentResponse.data.collection);
        }

        // Check if there's a next page
        sentUrl = sentResponse.data.pagination?.nextPage || null;
      }

      // Hent åbne fakturakladder
      const draftsResponse = await axios.get(
        `${this.baseUrl}/invoices/drafts`,
        {
          headers: this.getAuthHeaders(config),
          timeout: 10000
        }
      );

      const draftOrderCount = draftOrdersResponse.data.collection?.length || 0;
      const sentOrderCount = allSentOrders.length;
      const totalOrderCount = draftOrderCount + sentOrderCount;
      const draftInvoices = draftsResponse.data.collection || [];
      const draftInvoiceCount = draftInvoices.length;
      const rackbeatDraftCount = draftInvoices.filter(d => d.externalId).length;

      console.log(`${productName} - e-conomic: ${draftOrderCount} draft ordrer + ${sentOrderCount} sent ordrer = ${totalOrderCount} total, ${draftInvoiceCount} fakturakladder (${rackbeatDraftCount} fra Rackbeat)`);

      // Debug: Vis ordre numre hvis der er nogen
      if (draftOrderCount > 0) {
        const draftNumbers = draftOrdersResponse.data.collection.map(o => o.orderNumber).join(', ');
        console.log(`${productName} - Draft ordre numre: ${draftNumbers}`);
      }
      if (sentOrderCount > 0) {
        const sentNumbers = allSentOrders.slice(0, 10).map(o => o.orderNumber).join(', ');
        console.log(`${productName} - Sent ordre numre (første 10): ${sentNumbers}`);
        console.log(`${productName} - Total sent ordrer: ${sentOrderCount}`);
      }

      return {
        openOrders: totalOrderCount,
        openDraftInvoices: draftInvoiceCount,
        rackbeatDrafts: rackbeatDraftCount
      };
    } catch (error) {
      console.error(`Fejl ved hentning af ${productName} e-conomic data:`, error.message);
      if (error.response) {
        console.error(`Response status: ${error.response.status}`);
        console.error(`Response data:`, error.response.data);
      }
      // Returner mockdata ved fejl
      const isMockHallmonitor = productName === 'HallMonitor';
      return {
        openOrders: isMockHallmonitor ? 14 : 9,
        openDraftInvoices: isMockHallmonitor ? 5 : 3,
        rackbeatDrafts: isMockHallmonitor ? 2 : 1
      };
    }
  }

  /**
   * Henter detaljeret ordre information
   */
  async getOrderDetails(orderId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/orders/${orderId}`,
        { headers: this.getAuthHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error(`Fejl ved hentning af ordre ${orderId}:`, error.message);
      throw error;
    }
  }

  /**
   * Henter fakturakladde detaljer
   */
  async getDraftInvoiceDetails(invoiceId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/invoices/drafts/${invoiceId}`,
        { headers: this.getAuthHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error(`Fejl ved hentning af fakturakladde ${invoiceId}:`, error.message);
      throw error;
    }
  }
}

export default new EconomicService();
