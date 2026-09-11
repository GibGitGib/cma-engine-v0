// Monitor Agent — Accuracy tracking, weight updates, performance reporting
// role: monitor

import { mockProvider } from '../../lib/mock.js';
import fs from 'fs';
import path from 'path';

const LEDGER_PATH = path.join(process.cwd(), 'data', 'accuracy-ledger.jsonl');

export async function runMonitorAgent({ dryRun = false, verbose = false }) {
  console.log(`📊 Monitor Agent: Accuracy tracking & weight updates`);
  
  if (dryRun) {
    console.log('   [DRY RUN] Would run monitoring loop');
    return;
  }
  
  // Ensure ledger exists
  if (!fs.existsSync(LEDGER_PATH)) {
    console.log('   📝 No accuracy ledger found — creating empty');
    fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
    fs.writeFileSync(LEDGER_PATH, '');
    return;
  }
  
  const lines = fs.readFileSync(LEDGER_PATH, 'utf-8').trim().split('\n').filter(Boolean);
  if (lines.length === 0) {
    console.log('   📝 Ledger empty — no predictions to score yet');
    return;
  }
  
  const records = lines.map(l => JSON.parse(l));
  console.log(`   📊 Loaded ${records.length} predictions from ledger`);
  
  // Group by method
  const byMethod = {};
  for (const r of records) {
    if (!r.actualPrice) continue; // Skip unscored
    for (const [method, pred] of Object.entries(r.predictions || {})) {
      if (!pred || !pred.estimate) continue;
      if (!byMethod[method]) byMethod[method] = [];
      const error = Math.abs(pred.estimate - r.actualPrice) / r.actualPrice;
      byMethod[method].push({ error, actual: r.actualPrice, predicted: pred.estimate });
    }
  }
  
  // Compute metrics per method
  console.log('\n📈 METHOD ACCURACY:');
  const weights = {};
  for (const [method, data] of Object.entries(byMethod)) {
    if (data.length < 3) {
      console.log(`   ${method}: ${data.length} samples (need ≥3)`);
      continue;
    }
    
    const errors = data.map(d => d.error);
    const mae = errors.reduce((a, b) => a + b, 0) / errors.length;
    const sorted = [...errors].sort((a, b) => a - b);
    const medae = sorted[Math.floor(sorted.length / 2)];
    const p10 = sorted[Math.floor(sorted.length * 0.1)];
    const p25 = sorted[Math.floor(sorted.length * 0.25)];
    
    // Weight = inverse MAE (normalized)
    weights[method] = 1 / (mae + 0.01);
    
    console.log(`   ${method}: n=${data.length}  MAE=${(mae*100).toFixed(1)}%  MedAE=${(medae*100).toFixed(1)}%  P10=${(p10*100).toFixed(1)}%  P25=${(p25*100).toFixed(1)}%`);
  }
  
  // Normalize weights
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  for (const m of Object.keys(weights)) {
    weights[m] = weights[m] / totalWeight;
  }
  
  // Save updated weights
  const weightPath = path.join(process.cwd(), 'data', 'method-weights.json');
  fs.writeFileSync(weightPath, JSON.stringify(weights, null, 2));
  console.log(`\n💾 Updated weights saved to ${weightPath}`);
  for (const [m, w] of Object.entries(weights)) {
    console.log(`   ${m}: ${(w*100).toFixed(1)}%`);
  }
  
  // Alert on degradation
  for (const [method, data] of Object.entries(byMethod)) {
    if (data.length >= 10) {
      const recent = data.slice(-10);
      const recentMAE = recent.reduce((a, b) => a + b.error, 0) / recent.length;
      const overallMAE = data.reduce((a, b) => a + b.error, 0) / data.length;
      if (recentMAE > overallMAE * 1.5) {
        console.log(`\n⚠️  ALERT: ${method} recent MAE (${(recentMAE*100).toFixed(1)}%) > 1.5x overall (${(overallMAE*100).toFixed(1)}%)`);
      }
    }
  }
  
  return { weights, records: records.length };
}