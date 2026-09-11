// CMA Agent — Wraps the CMA Engine for --role cma
// Outputs: JSON report + human-readable summary

import { addressToSubjectProperty } from '../../lib/geocode.js';
import { selectComps } from '../../lib/comps.js';
import { runOptimizer } from '../../lib/optimizer.js';
import { getAllMethods } from '../../lib/methods/index.js';
import { CompRecord, MarketContext } from '../../lib/types.js';
import { mockProvider } from '../../lib/mock.js';

export async function runCMAAgent({ address, dryRun = false, verbose = false }) {
  console.log(`🏠 CMA Agent: Analyzing ${address}`);
  
  if (dryRun) {
    console.log('   [DRY RUN] Would run full CMA pipeline');
    return;
  }
  
  try {
    // 1. Geocode + resolve polygon
    console.log('   📍 Geocoding...');
    const subject = await addressToSubjectProperty(address, { geocoder: 'census' });
    if (verbose) console.log(`      Polygon: ${subject.polygonId}, Lat/Lon: ${subject.latitude}, ${subject.longitude}`);
    
    // 2. Get comps (mock for now)
    console.log('   🔍 Fetching comps...');
    const allComps = await mockProvider.getComps(address, { radius: 1, days: 180 });
    if (verbose) console.log(`      Found ${allComps.length} raw comps`);
    
    // 3. Select comps with min-5 rule
    console.log('   🎯 Selecting comps (min-5 rule)...');
    const compSelection = selectComps(subject, allComps, { minComps: 5, lookbackDays: 180 });
    if (verbose) console.log(`      Selected: ${compSelection.comps.length} comps`);
    if (verbose) console.log(`      Explanation: ${compSelection.explanation.toString()}`);
    
    // 4. Build market data
    console.log('   📊 Building market context...');
    const marketData = mockProvider.getMarketData(subject.polygonId);
    
    // 5. Run all methods
    console.log('   ⚙️  Running 10 valuation methods...');
    const methods = getAllMethods();
    const methodResults = {};
    
    for (const method of methods) {
      try {
        const result = method(subject, compSelection.comps, marketData);
        methodResults[method.name] = result;
        if (verbose && result.success) {
          console.log(`      ✅ ${method.name}: $${result.estimate.toLocaleString()} (${Math.round(result.confidence * 100)}%)`);
        } else if (verbose) {
          console.log(`      ❌ ${method.name}: ${result.error}`);
        }
      } catch (e) {
        methodResults[method.name] = { success: false, error: e.message, name: method.name };
        if (verbose) console.log(`      ❌ ${method.name}: ${e.message}`);
      }
    }
    
    // 6. Run optimizer
    console.log('   🧠 Optimizing ensemble...');
    const optimizerResult = runOptimizer(methodResults, subject, compSelection.comps, marketData);
    
    // 7. Output
    console.log('\n' + '='.repeat(60));
    console.log(`📍 ${subject.address}`);
    console.log(`   Micro-market: ${subject.polygonId}`);
    console.log(`   Property: ${subject.sqft} sqft, ${subject.beds}bd/${subject.baths}ba, built ${subject.yearBuilt}`);
    console.log('='.repeat(60));
    console.log(`\n💰 ESTIMATED VALUE: $${optimizerResult.pointEstimate.toLocaleString()}`);
    console.log(`   Range: $${optimizerResult.range.low.toLocaleString()} – $${optimizerResult.range.high.toLocaleString()}`);
    console.log(`   Confidence: ${Math.round(optimizerResult.confidence * 100)}%`);
    
    console.log('\n📊 Method Breakdown:');
    for (const [name, result] of Object.entries(methodResults)) {
      if (result.success) {
        const weight = optimizerResult.methodWeights[name] || 0;
        console.log(`   ${name.padEnd(20)} $${result.estimate.toLocaleString().padStart(10)}  ${Math.round(result.confidence * 100).toString().padStart(3)}%  Weight: ${Math.round(weight * 100)}%`);
      }
    }
    
    console.log(`\n🧠 Optimizer: ${optimizerResult.explanation}`);
    
    if (optimizerResult.ambiguity) {
      console.log(`⚠️  Ambiguity detected: ${Math.round(optimizerResult.ambiguity * 100)}% spread`);
      console.log(`   Outliers trimmed: ${optimizerResult.trimmedOutliers?.join(', ') || 'none'}`);
    }
    
    console.log(`\n📋 Comp Selection: ${compSelection.explanation.toString()}`);
    
    // Return full result for programmatic use
    return {
      subject: {
        address: subject.address,
        polygonId: subject.polygonId,
        coordinates: { lat: subject.latitude, lon: subject.longitude },
        property: { type: subject.propertyType, sqft: subject.sqft, beds: subject.beds, baths: subject.baths, yearBuilt: subject.yearBuilt, condition: subject.condition }
      },
      comps: compSelection.comps.map(c => ({
        address: c.address,
        salePrice: c.salePrice,
        saleDate: c.saleDate,
        sqft: c.sqft,
        beds: c.beds,
        baths: c.baths,
        distanceMiles: c.distanceMiles
      })),
      methods: methodResults,
      estimate: optimizerResult
    };
    
  } catch (err) {
    console.error('❌ CMA failed:', err.message);
    throw err;
  }
}