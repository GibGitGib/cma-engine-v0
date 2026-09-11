// Buyer Agent — Property search, offer strategy, negotiation support
// role: buyer

import { addressToSubjectProperty } from '../../lib/geocode.js';
import { selectComps } from '../../lib/comps.js';
import { runOptimizer } from '../../lib/optimizer.js';
import { getAllMethods } from '../../lib/methods/index.js';
import { mockProvider } from '../../lib/mock.js';

export async function runBuyerAgent({ address, dryRun = false, verbose = false }) {
  console.log(`🏠 Buyer Agent: Analyzing ${address} for purchase`);
  
  if (dryRun) {
    console.log('   [DRY RUN] Would run full buyer analysis');
    return;
  }
  
  try {
    // 1. Get CMA as baseline
    const subject = await addressToSubjectProperty(address, { geocoder: 'census' });
    const allComps = await mockProvider.getComps(address, { radius: 1, days: 180 });
    const compSelection = selectComps(subject, allComps, { minComps: 5, lookbackDays: 180 });
    const marketData = mockProvider.getMarketData(subject.polygonId);
    const methods = getAllMethods();
    const methodResults = {};
    
    for (const method of methods) {
      try {
        const result = method(subject, compSelection.comps, marketData);
        methodResults[method.name] = result;
      } catch (e) {
        methodResults[method.name] = { success: false, error: e.message, name: method.name };
      }
    }
    
    const optimizerResult = runOptimizer(methodResults, subject, compSelection.comps, marketData);
    
    // 2. Buyer-specific analysis
    console.log('\n' + '='.repeat(60));
    console.log(`📍 ${subject.address}`);
    console.log(`💰 Market Value: $${optimizerResult.pointEstimate.toLocaleString()}`);
    console.log(`📊 Range: $${optimizerResult.range.low.toLocaleString()} – $${optimizerResult.range.high.toLocaleString()}`);
    console.log(`🎯 Confidence: ${Math.round(optimizerResult.confidence * 100)}%`);
    console.log('='.repeat(60));
    
    // 3. Offer strategy
    const offerPrice = Math.round(optimizerResult.pointEstimate * 0.97); // Start 3% below
    const maxPrice = Math.round(optimizerResult.range.high);
    const earnestMoney = Math.round(offerPrice * 0.01);
    
    console.log('\n📝 OFFER STRATEGY:');
    console.log(`   Initial Offer: $${offerPrice.toLocaleString()} (${Math.round((1 - offerPrice/optimizerResult.pointEstimate)*100)}% below market)`);
    console.log(`   Max Walk-Away: $${maxPrice.toLocaleString()}`);
    console.log(`   Earnest Money: $${earnestMoney.toLocaleString()} (1%)`);
    console.log(`   Suggested Contingencies: Inspection, Appraisal, Financing`);
    
    // 4. Negotiation levers
    console.log('\n🎯 NEGOTIATION LEVERS:');
    if (compSelection.comps.length >= 5) {
      console.log('   • Strong comp support — anchor to median comp price');
    }
    if (marketData.monthsOfInventory > 4) {
      console.log('   • Buyer\'s market (high inventory) — push for repairs/credits');
    } else {
      console.log('   • Seller\'s market (low inventory) — clean offer, fast close');
    }
    if (optimizerResult.confidence < 0.3) {
      console.log('   • Low confidence — widen range, add inspection contingency');
    }
    
    return {
      subject: { address: subject.address, polygonId: subject.polygonId },
      marketValue: optimizerResult.pointEstimate,
      offerStrategy: { initial: offerPrice, max: maxPrice, earnest: earnestMoney },
      negotiationLevers: []
    };
    
  } catch (err) {
    console.error('❌ Buyer analysis failed:', err.message);
    throw err;
  }
}