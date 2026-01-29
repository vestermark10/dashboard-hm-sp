import puppeteer from 'puppeteer';

/**
 * One-Connect Dashboard Web Scraper
 *
 * Scraper kø-statistik data fra Uni-tel One-Connect dashboard
 * Kører automatisk kl 08:00, 12:00 og 15:00
 */

class OneConnectScraper {

    constructor() {
        this.loginUrl = 'https://login.one-connect.dk/Account/Login';
        this.dashboardUrl = 'https://dashboard.one-connect.dk/dashboard';

        this.credentials = {
            email: process.env.ONECONNECT_EMAIL,
            password: process.env.ONECONNECT_PASSWORD
        };

        this.browser = null;
        this.page = null;
    }

    /**
     * Initialiserer browser
     */
    async initBrowser() {
        if (this.browser) {
            return;
        }

        console.log('OneConnect: Starter browser...');

        this.browser = await puppeteer.launch({
            executablePath: '/usr/bin/chromium',
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu'
            ]
        });

        this.page = await this.browser.newPage();

        // Set viewport og user agent
        await this.page.setViewport({width: 1920, height: 1080});
        await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    }

    /**
     * Logger ind på One-Connect
     */
    async login() {
        try {
            console.log('OneConnect: Udfylder login credentials...');

            // Vent på login form (vi er allerede på login-siden)
            await this.page.waitForSelector('input[type="text"], input[type="email"]', {timeout: 10000});

            // Type credentials
            await this.page.type('input[type="text"], input[type="email"]', this.credentials.email);
            await this.page.type('input[type="password"]', this.credentials.password);

            // Find submit button
            const submitButton = await this.page.$('button[type="submit"], input[type="submit"]');
            if (!submitButton) {
                throw new Error('Kunne ikke finde login knap');
            }

            console.log('OneConnect: Klikker login knap...');
            await submitButton.click();

            console.log('OneConnect: Login form submitted');
            return true;

        } catch (error) {
            console.error('OneConnect: Login fejlede:', error.message);
            return false;
        }
    }

    /**
     * Scraper kø-statistik fra dashboard
     */
    async scrapeQueueStats() {
        try {
            // Luk gammel browser først hvis den findes
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
                this.page = null;
            }

            await this.initBrowser();

            // Start ved at gå direkte til dashboard - det vil redirecte til login hvis nødvendigt
            console.log('OneConnect: Navigerer til dashboard...');
            await this.page.goto(this.dashboardUrl, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // Tjek om vi blev redirected til login
            const currentUrl = this.page.url();
            if (currentUrl.includes('login.one-connect.dk')) {
                console.log('OneConnect: Dashboard redirected til login - logger ind...');
                const loginSuccess = await this.login();
                if (!loginSuccess) {
                    throw new Error('Login fejlede');
                }

                // Vent længere tid på at siden loader efter login
                console.log('OneConnect: Venter på dashboard load...');
                await new Promise(resolve => setTimeout(resolve, 8000));
            }

            console.log('OneConnect: Nuværende URL:', this.page.url());

            // Luk popup-dialog hvis den er der (Find "Fortsæt" knap)
            // Loop indtil ingen flere matching buttons findes
            try {
                console.log('OneConnect: Leder efter popup dialogen...');

                let foundButton = true;
                let clickCount = 0;
                const maxClicks = 4; // Sikkerhedsgrænse for at undgå uendelig loop

                while (foundButton && clickCount < maxClicks) {
                    foundButton = await this.page.evaluate(() => {
                        const buttons = Array.from(document.querySelectorAll('button'));
                        const button = buttons.find(btn =>
                            btn.textContent.includes('Fortsæt') ||
                            btn.textContent.includes('Luk') ||
                            btn.textContent.includes('Continue') ||
                            btn.textContent.includes('Finish')
                        );

                        if (button) {
                            button.click();
                            return true;
                        }
                        return false;
                    });

                    if (foundButton) {
                        clickCount++;
                        console.log(`OneConnect: Lukkede popup dialog (${clickCount})...`);
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }

                if (clickCount === 0) {
                    console.log('OneConnect: Ingen popup fundet.');
                } else if (clickCount >= maxClicks) {
                    console.log('OneConnect: Nåede max antal popup-klik.');
                } else {
                    console.log('OneConnect: Alle popups lukket.');
                }
            } catch (err) {
                console.log('OneConnect: Fejl ved popup håndtering: ' + err.message);
            }

            // Find og klik på første dashboard card
            console.log('OneConnect: Finder dashboard cards...');
            try {
                await this.page.waitForSelector('.q-card, [class*="card"]', { timeout: 5000 });

                // Klik på første dashboard card (Hallmonitor)
                await this.page.evaluate(() => {
                    const cards = document.querySelectorAll('.q-card, [class*="card"]');
                    if (cards.length > 0) {
                        cards[0].click();
                    }
                });

                console.log('OneConnect: Åbnede dashboard, venter på load...');
                await new Promise(resolve => setTimeout(resolve, 5000));
            } catch (err) {
                console.log('OneConnect: Kunne ikke finde dashboard cards');
            }

            // Vent på at dashboard er loaded - vent på widget-queue elementer
            await this.page.waitForSelector('.widget-queue', { timeout: 10000 });

            console.log('OneConnect: Scraper kø data...');

            // Først klik på "Svarprocent" tabs for at afsløre GNS VENT data
            console.log('OneConnect: Klikker på Svarprocent tabs for at afsløre GNS VENT...');
            try {
                await this.page.evaluate(() => {
                    const widgets = document.querySelectorAll('.widget-queue');
                    widgets.forEach(widget => {
                        const tabs = widget.querySelectorAll('.q-tab');
                        tabs.forEach(tab => {
                            const titleEl = tab.querySelector('.title');
                            if (titleEl) {
                                const title = titleEl.textContent.trim().toUpperCase();
                                if (title === 'SVARPROCENT' || title === 'ANSWER RATE') {
                                    tab.click();
                                }
                            }
                        });
                    });
                });
                // Vent på at tab content opdateres
                await new Promise(resolve => setTimeout(resolve, 1500));
            } catch (err) {
                console.log('OneConnect: Kunne ikke klikke på Svarprocent tabs:', err.message);
            }

            // Scrape data fra alle kø-bokse
            const queueData = await this.page.evaluate(() => {
                const queues = {};

                // Find alle kø-widgets
                const queueWidgets = document.querySelectorAll('.widget-queue');

                queueWidgets.forEach(widget => {
                    try {
                        // Ekstraher queue navn fra title
                        const titleElement = widget.querySelector('.title span');
                        if (!titleElement) return;

                        const queueName = titleElement.textContent.trim();
                        if (!queueName) return;

                        // Ekstraher statistik fra tabs
                        const stats = {};

                        // Find alle tabs
                        const tabs = widget.querySelectorAll('.q-tab');

                        tabs.forEach(tab => {
                            const titleEl = tab.querySelector('.title');
                            const sizeEl = tab.querySelector('.call-size span');

                            if (!titleEl || !sizeEl) return;

                            const title = titleEl.textContent.trim().toUpperCase();
                            const value = sizeEl.textContent.trim();

                            // Map tab titles til vores format
                            if (title === 'KØ' || title === 'QUEUE') {
                                stats.queue = parseInt(value) || 0;
                            } else if (title === 'MISTET' || title === 'MISSED') {
                                stats.lost = parseInt(value) || 0;
                            } else if (title === 'BESVARET' || title === 'ANSWERED') {
                                stats.answered = parseInt(value) || 0;
                            } else if (title === 'SVARPROCENT' || title === 'ANSWER RATE') {
                                stats.answerRate = parseInt(value.replace('%', '')) || 0;
                            } else if (title === 'GNS. VENT' || title === 'GNS VENT' || title === 'AVG WAIT' || title === 'AVG. WAIT') {
                                stats.avgWait = value || "00:00";
                            } else if (title === 'MAX VENT' || title === 'MAX WAIT' || title === 'LÆNGSTE VENT') {
                                stats.maxWaitToday = value || "00:00";
                            }
                        });

                        // Søg efter alle tidværdier (MM:SS format) i widget
                        // De to første tidsværdier der ikke er 00:00 er typisk avgWait og maxWait
                        const allText = widget.innerText;
                        const timeMatches = allText.match(/\d{1,2}:\d{2}/g) || [];

                        // Filtrer de tidsværdier vi allerede har fundet fra tabs
                        const remainingTimes = timeMatches.filter(t => t !== '00:00' || timeMatches.every(m => m === '00:00'));

                        // Tildel tidsværdier baseret på position
                        // Første tid efter de 4 standard tabs (kø, mistet, besvaret, svarprocent) er typisk maxWait
                        // Anden tid er typisk avgWait
                        if (remainingTimes.length >= 2) {
                            // Find unikke tider der ikke er queue/lost/answered/answerRate
                            const nonStatTimes = remainingTimes.slice(-2); // Sidste to tidsværdier
                            if (nonStatTimes.length >= 1 && !stats.maxWaitToday) {
                                stats.maxWaitToday = nonStatTimes[0];
                            }
                            if (nonStatTimes.length >= 2 && !stats.avgWait) {
                                stats.avgWait = nonStatTimes[1];
                            }
                        } else if (remainingTimes.length === 1) {
                            if (!stats.avgWait) {
                                stats.avgWait = remainingTimes[0];
                            }
                        }

                        // Ekstraher agent info fra "Tilmeldte (X/Y)" tekst
                        const topBarText = widget.querySelector('.top-bar .small-text');
                        if (topBarText) {
                            const match = topBarText.textContent.match(/(?:Tilmeldte|Registered) \((\d+)\/(\d+)\)/);
                            if (match) {
                                const active = parseInt(match[1]);
                                const total = parseInt(match[2]);

                                // Find agent status fra buttons
                                const buttons = widget.querySelectorAll('.members-tabs button');
                                let ready = 0;
                                let busy = 0;
                                let other = 0;

                                buttons.forEach(btn => {
                                    const title = btn.getAttribute('title');
                                    const content = btn.querySelector('.q-btn__content');
                                    if (!title || !content) return;

                                    const count = parseInt(content.textContent.trim()) || 0;

                                    if (title.includes('Ledige') || title.includes('Available')) {
                                        ready = count;
                                    } else if (title.includes('Optagede') || title.includes('Busy')) {
                                        busy = count;
                                    } else if (title.includes('Inaktive') || title.includes('Not active')) {
                                        other = count;
                                    }
                                });

                                stats.agents = {
                                    ready,
                                    busy,
                                    other,
                                    total
                                };
                            }
                        }

                        if (Object.keys(stats).length > 0) {
                            queues[queueName] = stats;
                        }
                    } catch (err) {
                        console.error('Fejl ved parsing af queue widget:', err);
                    }
                });

                return queues;
            });


            console.log('OneConnect: Scraped data:', JSON.stringify(queueData, null, 2));

            // Map til vores format
            const mappedData = this.mapScrapedData(queueData);
            console.log('OneConnect: Mapped data:', JSON.stringify(mappedData, null, 2));

            return mappedData;

        } catch (error) {
            console.error('OneConnect: Scraping fejlede:', error.message);
            throw error;
        }
    }

    /**
     * Mapper scraped data til vores standard format
     */
    mapScrapedData(queueData) {
        const result = {
            hallmonitor: {
                queue: 0,
                lost: 0,
                answered: 0,
                answerRate: 0,
                maxWaitToday: "00:00",
                avgWait: "00:00",
                agents: {ready: 0, busy: 0, other: 0, total: 0}
            },
            switchpay: {
                queue: 0,
                lost: 0,
                answered: 0,
                answerRate: 0,
                maxWaitToday: "00:00",
                avgWait: "00:00",
                agents: {ready: 0, busy: 0, other: 0, total: 0}
            }
        };

        // Find HallMonitor support queue
        const hallmonitorKeys = Object.keys(queueData).filter(key =>
            key.toLowerCase().includes('hallmonitor') &&
            (key.toLowerCase().includes('support') || key.toLowerCase().includes('service'))
        );

        if (hallmonitorKeys.length > 0) {
            const data = queueData[hallmonitorKeys[0]];
            result.hallmonitor = {
                ...result.hallmonitor,
                ...data
            };
        }

        // Find SwitchPay support queue
        // "Support" køen er SwitchPay's support
        const switchpayKeys = Object.keys(queueData).filter(key => {
            const lowerKey = key.toLowerCase();
            return lowerKey.includes('switchpay') ||
                (lowerKey === 'support') ||  // Exact match for "Support"
                (lowerKey.includes('support') && !lowerKey.includes('hallmonitor'));
        });

        if (switchpayKeys.length > 0) {
            const data = queueData[switchpayKeys[0]];
            result.switchpay = {
                ...result.switchpay,
                ...data
            };
        }

        return result;
    }

    /**
     * Lukker browser
     */
    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
            console.log('OneConnect: Browser lukket');
        }
    }
}

export default new OneConnectScraper();
