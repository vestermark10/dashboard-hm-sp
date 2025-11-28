import 'dotenv/config';
import puppeteer from 'puppeteer';

async function testLogin() {
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

      console.log('Credentials entered.');

      // Take screenshot BEFORE clicking
      await page.screenshot({ path: 'before-login-click.png', fullPage: true });
      console.log('Screenshot saved: before-login-click.png');

      // Get form values to verify
      const emailValue = await page.$eval('input[type="text"], input[type="email"]', el => el.value);
      const passValue = await page.$eval('input[type="password"]', el => el.value);
      console.log('Email field value:', emailValue);
      console.log('Password field has value:', passValue ? 'YES' : 'NO');

      // Find submit button
      const submitButton = await page.$('button[type="submit"], input[type="submit"]');
      if (submitButton) {
        console.log('Submit button found. Clicking...');
        await submitButton.click();

        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 5000));

        console.log('Final URL:', page.url());

        // Take screenshot of result
        await page.screenshot({ path: 'after-login-click.png', fullPage: true });
        console.log('Screenshot saved: after-login-click.png');
      } else {
        console.log('Could not find submit button!');
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
    await page.screenshot({ path: 'error-screenshot.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

testLogin();
