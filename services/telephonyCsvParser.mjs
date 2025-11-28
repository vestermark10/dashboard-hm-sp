import fs from 'fs';
import path from 'path';

/**
 * CSV Parser til Uni-tel kø-statistik
 *
 * Forventer CSV fil i formatet:
 * Queue,Calls In Queue,Answered,Lost,Answer Rate,Max Wait,Avg Wait,Agents Ready,Agents Busy,Agents Other,Total Agents
 * HallMonitor,0,6,3,67,01:30,00:31,2,0,4,6
 * SwitchPay,1,9,2,82,02:10,00:24,3,1,1,5
 */

class TelephonyCsvParser {
  constructor() {
    // Mappe hvor CSV filer placeres
    this.csvDir = path.join(process.cwd(), 'data', 'telephony');

    // Sørg for at mappen eksisterer
    if (!fs.existsSync(this.csvDir)) {
      fs.mkdirSync(this.csvDir, { recursive: true });
      console.log(`Oprettet telephony data mappe: ${this.csvDir}`);
    }
  }

  /**
   * Parser CSV fil og returnerer struktureret data
   */
  async parseLatestCsv() {
    try {
      // Find nyeste CSV fil
      const csvFile = this.getLatestCsvFile();

      if (!csvFile) {
        console.warn('Ingen CSV fil fundet i', this.csvDir);
        return null;
      }

      console.log(`Telefoni: Parser CSV fil: ${csvFile}`);

      // Læs fil
      const content = fs.readFileSync(csvFile, 'utf-8');
      const lines = content.trim().split('\n');

      if (lines.length < 2) {
        console.error('CSV fil er tom eller ugyldig');
        return null;
      }

      // Parse header
      const headers = this.parseCsvLine(lines[0]);

      // Parse data lines
      const data = {};
      for (let i = 1; i < lines.length; i++) {
        const values = this.parseCsvLine(lines[i]);
        const queueName = values[0]?.toLowerCase();

        if (queueName === 'hallmonitor' || queueName === 'switchpay') {
          data[queueName] = this.mapCsvRowToQueueData(headers, values);
        }
      }

      console.log(`Telefoni: CSV parsed - fundet data for ${Object.keys(data).length} køer`);
      return data;

    } catch (error) {
      console.error('Fejl ved parsing af CSV:', error.message);
      return null;
    }
  }

  /**
   * Parser en CSV linje og håndterer quoted values
   */
  parseCsvLine(line) {
    const values = [];
    let currentValue = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === ',' && !insideQuotes) {
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }

    // Tilføj sidste value
    values.push(currentValue.trim());

    return values;
  }

  /**
   * Mapper CSV række til vores queue data format
   */
  mapCsvRowToQueueData(headers, values) {
    // Opret mapping mellem headers og values
    const row = {};
    headers.forEach((header, index) => {
      row[header.toLowerCase().replace(/\s+/g, '_')] = values[index];
    });

    // Map til vores format
    return {
      queue: parseInt(row.calls_in_queue || row.queue || '0'),
      lost: parseInt(row.lost || row.abandoned || '0'),
      answered: parseInt(row.answered || '0'),
      answerRate: parseInt(row.answer_rate || row.answerrate || '0'),
      maxWaitToday: row.max_wait || row.max_wait_time || '00:00',
      avgWait: row.avg_wait || row.average_wait || row.avg_wait_time || '00:00',
      agents: {
        ready: parseInt(row.agents_ready || row.ready || '0'),
        busy: parseInt(row.agents_busy || row.busy || '0'),
        other: parseInt(row.agents_other || row.other || '0'),
        total: parseInt(row.total_agents || row.total || '0')
      }
    };
  }

  /**
   * Finder nyeste CSV fil i mappen
   */
  getLatestCsvFile() {
    const files = fs.readdirSync(this.csvDir)
      .filter(file => file.endsWith('.csv'))
      .map(file => ({
        name: file,
        path: path.join(this.csvDir, file),
        time: fs.statSync(path.join(this.csvDir, file)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);

    return files.length > 0 ? files[0].path : null;
  }

  /**
   * Validerer CSV data
   */
  validateData(data) {
    if (!data) return false;

    // Tjek at vi har data for begge køer
    if (!data.hallmonitor || !data.switchpay) {
      console.warn('CSV mangler data for en eller begge køer');
      return false;
    }

    return true;
  }

  /**
   * Genererer eksempel CSV fil til test
   */
  generateExampleCsv() {
    const exampleData = [
      'Queue,Calls In Queue,Answered,Lost,Answer Rate,Max Wait,Avg Wait,Agents Ready,Agents Busy,Agents Other,Total Agents',
      'HallMonitor,0,6,3,67,01:30,00:31,2,0,4,6',
      'SwitchPay,1,9,2,82,02:10,00:24,3,1,1,5'
    ].join('\n');

    const exampleFile = path.join(this.csvDir, 'example-telephony-stats.csv');
    fs.writeFileSync(exampleFile, exampleData, 'utf-8');

    console.log(`Genereret eksempel CSV: ${exampleFile}`);
    return exampleFile;
  }
}

export default new TelephonyCsvParser();
