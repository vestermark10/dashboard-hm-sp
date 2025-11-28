import 'dotenv/config';
import puppeteer from 'puppeteer';

async function testLogin() {
  console.log('Starting browser in headful mode...');

  const browser = await puppeteer.launch({
    headless: false, // Run in visible mode
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  try {
    // Go to dashboard - should redirect to login
    console.log('Going to dashboard...');
    await page.goto('https://dashboard.one-connect.dk/dashboard', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    console.log('Current URL:', page.url());

    // Check if we're on login page
    if (page.url().includes('login.one-connect.dk')) {
      console.log('On login page - filling credentials...');

      // Wait for login form
      await page.waitForSelector('input[type="text"], input[type="email"]', { timeout: 10000 });

      // Type credentials
      await page.type('input[type="text"], input[type="email"]', process.env.ONECONNECT_EMAIL);
      await page.type('input[type="password"]', process.env.ONECONNECT_PASSWORD);

      console.log('Credentials entered. Click login button...');

      // Find and click submit button
      const submitButton = await page.$('button[type="submit"], input[type="submit"]');
      if (submitButton) {
        await submitButton.click();
        console.log('Login button clicked!');

        // Wait and watch what happens
        console.log('Waiting 10 seconds to see what happens...');
        await new Promise(resolve => setTimeout(resolve, 10000));

        console.log('Final URL:', page.url());

        // Take screenshot of result
        await page.screenshot({ path: 'login-result.png', fullPage: true });
        console.log('Screenshot saved: login-result.png');
      } else {
        console.log('Could not find submit button!');
      }
    }

    console.log('\nBrowser will stay open for 30 seconds for manual inspection...');
    await new Promise(resolve => setTimeout(resolve, 30000));

  } catch (error) {
    console.error('Error:', error.message);
    await page.screenshot({ path: 'error-screenshot.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

testLogin();
