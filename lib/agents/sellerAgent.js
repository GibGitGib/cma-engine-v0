// Seller Agent — Pricing strategy, listing optimization, seller counseling
// role: seller

import { addressToSubjectProperty } from '../../lib/geocode.js';
import { selectComps } from '../../lib/comps.js';
import { runOptimizer } from '../../lib/optimizer.js';
import { getAllMethods } from '../../lib/methods/index.js';
import { mockProvider } from '../../lib/mock.js';

export async function runSellerAgent({ address, dryRun = false, verbose = false }) {
  console.log(`🏠 Seller Agent: Analyzing ${address} for listing`);
  
  if (dryRun) {
    console.log('   [DRY RUN] Would run full seller analysis');
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
    
    // 2. Seller-specific analysis
    console.log('\n' + '='.repeat(60));
    console.log(`📍 ${subject.address}`);
    console.log(`💰 Market Value: $${optimizerResult.pointEstimate.toLocaleString()}`);
    console.log(`📊 Range: $${optimizerResult.range.low.toLocaleString()} – $${optimizerResult.range.high.toLocaleString()}`);
    console.log(`🎯 Confidence: ${Math.round(optimizerResult.confidence * 100)}%`);
    console.log('='.repeat(60));
    
    // 3. Listing price strategy
    const listPrice = Math.round(optimizerResult.pointEstimate * 1.02); // 2% above market
    const minAcceptable = Math.round(optimizerResult.range.low * 0.98);
    const priceReductionSchedule = [
      { week: 2, pct: 0.98 },
      { week: 4, pct: 0.96 },
      { week: 6, pct: 0.94 }
    ];
    
    console.log('\n📝 LISTING STRATEGY:');
    console.log(`   List Price: $${listPrice.toLocaleString()} (+${Math.round((listPrice / optimizerResult.pointEstimate - 1) * 100)}% above market)`);
    console.log(`   Minimum Acceptable: $${minAcceptable.toLocaleString()}`);
    console.log(`   Price Reduction Schedule:`);
    priceReductionSchedule.forEach(s => {
      console.log(`   Week ${s.week}: $${Math.round(listPrice * s.pct).toLocaleString()} (${Math.round((1 - s.pct) * 100)}% reduction)`);
    });
    
    // 4. Prep recommendations
    console.log('\n🛠️  PREP RECOMMENDATIONS:');
    if (subject.condition < 4) {
      console.log('   • Condition below 4/5 — consider pre-listing repairs/updates');
    }
    if (subject.yearBuilt < 1980 && subject.condition < 5) {
      console.log('   • Older home — pre-inspection recommended');
    }
    console.log('   • Professional photos + virtual tour');
    console.log('   • Declutter & stage key rooms');
    console.log('   • Compile improvement records & receipts');
    
    // 5. Market timing
    console.log('\n📅 MARKET TIMING:');
    if (marketData.monthsOfInventory < 3) {
      console.log('   • Seller\'s market — list now, expect multiple offers');
    } else if (marketData.monthsOfInventory > 5) {
      console.log('   • Buyer\'s market — price aggressively, offer buyer incentives');
    } else {
      console.log('   • Balanced market — fair pricing, standard terms');
    }
    
    return {
      subject: { address: subject.address, polygonId: subject.polygonId },
      marketValue: optimizerResult.pointEstimate,
      listingStrategy: { listPrice, minAcceptable, priceReductionSchedule },
      prepRecommendations: []
    };
    
  } catch (err) {
    console.error('❌ Seller analysis failed:', err.message);
    throw err;
  }
}