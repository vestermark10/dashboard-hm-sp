import 'dotenv/config';
import telephonyService from './services/telephonyService.mjs';

console.log('Testing telephony service...\n');

try {
  const data = await telephonyService.getSupportQueueStats();

  console.log('\n=== Telephony Data ===');
  console.log(JSON.stringify(data, null, 2));

  process.exit(0);
} catch (error) {
  console.error('Error:', error);
  process.exit(1);
}
