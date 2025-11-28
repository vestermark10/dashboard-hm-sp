import 'dotenv/config';
import puppeteer from 'puppeteer';
import fs from 'fs';

async function debugDashboard() {
  const loginUrl = 'https://login.one-connect.dk/Account/Login';
  const dashboardUrl = 'https://dashboard.one-connect.dk/dashboard';

  console.log('Starting browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    // Login
    console.log('Logging in...');
    await page.goto(loginUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await page.waitForSelector('input[type="text"], input[type="email"]', { timeout: 10000 });
    await page.type('input[type="text"], input[type="email"]', process.env.ONECONNECT_EMAIL);
    await page.type('input[type="password"]', process.env.ONECONNECT_PASSWORD);

    const submitButton = await page.$('button[type="submit"], input[type="submit"]');
    if (!submitButton) {
      throw new Error('Cannot find login button');
    }

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
      submitButton.click()
    ]);

    console.log('Login successful!');

    // Check where we are after login
    console.log('Current URL after login:', page.url());

    // Navigate to dashboard
    console.log('Going to dashboard...');
    await page.goto(dashboardUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    console.log('Dashboard URL:', page.url());

    // Wait a bit for any dynamic content to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Take screenshot
    console.log('Taking screenshot...');
    await page.screenshot({ path: 'dashboard-debug.png', fullPage: true });
    console.log('Screenshot saved: dashboard-debug.png');

    // Get HTML
    console.log('Extracting HTML...');
    const html = await page.content();
    fs.writeFileSync('dashboard-debug.html', html, 'utf-8');
    console.log('HTML saved: dashboard-debug.html');

    // Get all visible text
    const bodyText = await page.evaluate(() => document.body.innerText);
    fs.writeFileSync('dashboard-debug.txt', bodyText, 'utf-8');
    console.log('Text content saved: dashboard-debug.txt');

    console.log('\n✅ Debug data captured successfully!');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

debugDashboard();
