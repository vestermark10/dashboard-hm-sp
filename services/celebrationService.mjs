import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '..', 'data', 'Foedselsdage og jubi.xlsx');

class CelebrationService {
  constructor() {
    this.employees = null;
  }

  /**
   * Parse Excel-filen og returner en liste af medarbejdere med datoer.
   * Caches resultatet så filen kun læses én gang.
   */
  loadEmployees() {
    if (this.employees) return this.employees;

    const workbook = XLSX.readFile(DATA_FILE, { cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    // Sektionsnavne der skal skippes
    const sectionHeaders = new Set(['DATAPILOTS', 'SWITCHPAY', 'HALLMONITOR', 'VESTPOL BUSINESS']);

    this.employees = [];

    for (const row of rows) {
      const name = (row['DATAPILOTS'] || row['__EMPTY'] || '').toString().trim();
      if (!name || sectionHeaders.has(name.toUpperCase())) continue;

      const birthday = row['Fødselsdag'] instanceof Date ? row['Fødselsdag'] : null;
      const anniversary = row['Jubilæum'] instanceof Date ? row['Jubilæum'] : null;

      if (birthday || anniversary) {
        this.employees.push({ name, birthday, anniversary });
      }
    }

    return this.employees;
  }

  /**
   * Returner kommende begivenheder inden for de næste 7 dage.
   */
  getUpcomingCelebrations() {
    const employees = this.loadEmployees();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const events = [];

    for (const emp of employees) {
      // Tjek fødselsdag
      if (emp.birthday) {
        const daysUntil = this.daysUntilAnniversaryDate(today, emp.birthday);
        if (daysUntil >= 0 && daysUntil <= 7) {
          const age = today.getFullYear() - emp.birthday.getFullYear();
          const isRound = age % 10 === 0;
          events.push({
            name: this.formatName(emp.name),
            type: 'birthday',
            date: this.formatDate(emp.birthday, today),
            daysUntil,
            detail: isRound ? `${age} år` : null,
          });
        }
      }

      // Tjek jubilæum
      if (emp.anniversary) {
        const daysUntil = this.daysUntilAnniversaryDate(today, emp.anniversary);
        if (daysUntil >= 0 && daysUntil <= 7) {
          const years = today.getFullYear() - emp.anniversary.getFullYear();
          if (years > 0) {
            events.push({
              name: this.formatName(emp.name),
              type: 'anniversary',
              date: this.formatDate(emp.anniversary, today),
              daysUntil,
              detail: `${years} år`,
            });
          }
        }
      }
    }

    // Sorter efter daysUntil (i dag først)
    events.sort((a, b) => a.daysUntil - b.daysUntil);

    return events;
  }

  /**
   * Beregn antal dage til næste forekomst af en dato (dag+måned) fra i dag.
   * Returnerer 0 hvis det er i dag.
   */
  daysUntilAnniversaryDate(today, date) {
    const thisYear = new Date(today.getFullYear(), date.getMonth(), date.getDate());
    const diffMs = thisYear.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  /**
   * Formater dato som "d. MMM" (f.eks. "28. mar")
   */
  formatDate(date, today) {
    const thisYear = new Date(today.getFullYear(), date.getMonth(), date.getDate());
    return thisYear.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
  }

  /**
   * Formater navn fra "KLAUS VESTERMARK" til "Klaus Vestermark"
   */
  formatName(name) {
    return name
      .split(' ')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }
}

export default new CelebrationService();
