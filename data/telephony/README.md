# Uni-tel Telefoni CSV Import

Denne mappe bruges til CSV import fra Uni-tel selvbetjening.

## Sådan bruges det

1. **Download CSV fil fra Uni-tel selvbetjening**
   - Log ind på Uni-tel selvbetjening
   - Eksportér kø-statistik som CSV
   - Gem filen i denne mappe

2. **CSV format**
   CSV filen skal indeholde følgende kolonner:
   ```csv
   Queue,Calls In Queue,Answered,Lost,Answer Rate,Max Wait,Avg Wait,Agents Ready,Agents Busy,Agents Other,Total Agents
   HallMonitor,0,6,3,67,01:30,00:31,2,0,4,6
   SwitchPay,1,9,2,82,02:10,00:24,3,1,1,5
   ```

3. **Automatisk opdatering**
   - Data opdateres automatisk kl 08:00, 12:00 og 15:00
   - Den nyeste CSV fil i mappen bruges
   - Data caches mellem opdateringer (ligesom e-conomic)

4. **Filnavn**
   - Filnavnet er ligegyldigt - nyeste CSV fil bruges altid
   - Anbefalet navnekonvention: `telephony-stats-YYYY-MM-DD.csv`

## Kolonne mapping

Parser'en understøtter forskellige kolonnenavne:

| Dashboard felt | CSV kolonne alternativer |
|---------------|-------------------------|
| Queue | `calls_in_queue`, `queue` |
| Lost | `lost`, `abandoned` |
| Answered | `answered` |
| Answer Rate | `answer_rate`, `answerrate` |
| Max Wait | `max_wait`, `max_wait_time` |
| Avg Wait | `avg_wait`, `average_wait`, `avg_wait_time` |
| Agents Ready | `agents_ready`, `ready` |
| Agents Busy | `agents_busy`, `busy` |
| Agents Other | `agents_other`, `other` |
| Total Agents | `total_agents`, `total` |

## Eksempel CSV

Se `example-telephony-stats.csv` for et eksempel på korrekt format.

## Fejlhåndtering

Hvis CSV fil mangler eller er ugyldig:
1. Bruger cached data fra sidste succesfulde import
2. Fallback til mockdata hvis ingen cached data findes

## Manual test

Du kan generere en test CSV fil ved at køre:
```javascript
import telephonyCsvParser from './services/telephonyCsvParser.mjs';
telephonyCsvParser.generateExampleCsv();
```
