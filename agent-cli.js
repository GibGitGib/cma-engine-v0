#!/usr/bin/env node
// agent-cli — Single entry point for all AI Sales Agent roles
// Usage: agent-cli --role [cma|buyer|seller|monitor|referral] [options]

import { program } from 'commander';
import { runCMAAgent } from './lib/agents/cmaAgent.js';
import { runBuyerAgent } from './lib/agents/buyerAgent.js';
import { runSellerAgent } from './lib/agents/sellerAgent.js';
import { runMonitorAgent } from './lib/agents/monitorAgent.js';
import { runReferralAgent } from './lib/agents/referralAgent.js';

program
  .name('agent-cli')
  .description('AI Sales Agent — Real Estate CMA, Buyer, Seller, Monitor, Referral')
  .version('0.1.0');

program
  .option('-r, --role <role>', 'Agent role: cma | buyer | seller | monitor | referral')
  .option('-a, --address <address>', 'Property address (for CMA/Buyer/Seller)')
  .option('-l, --lead <leadId>', 'Lead ID (for Referral)')
  .option('-m, --match', 'Run referral matching (for Referral)')
  .option('-s, --split <percent>', 'Commission split % (for Referral)', '25')
  .option('--config <path>', 'YAML track config path')
  .option('--dry-run', 'Print actions without executing')
  .option('--verbose', 'Verbose output');

program.parse();

const options = program.opts();

if (!options.role) {
  console.error('❌  Role required: --role [cma|buyer|seller|monitor|referral]');
  program.help();
  process.exit(1);
}

async function main() {
  try {
    switch (options.role) {
      case 'cma':
        if (!options.address) {
          console.error('❌  CMA requires --address');
          process.exit(1);
        }
        await runCMAAgent({ address: options.address, dryRun: options.dryRun, verbose: options.verbose });
        break;
        
      case 'buyer':
        if (!options.address) {
          console.error('❌  Buyer agent requires --address');
          process.exit(1);
        }
        await runBuyerAgent({ address: options.address, dryRun: options.dryRun, verbose: options.verbose });
        break;
        
      case 'seller':
        if (!options.address) {
          console.error('❌  Seller agent requires --address');
          process.exit(1);
        }
        await runSellerAgent({ address: options.address, dryRun: options.dryRun, verbose: options.verbose });
        break;
        
      case 'monitor':
        await runMonitorAgent({ dryRun: options.dryRun, verbose: options.verbose });
        break;
        
      case 'referral':
        await runReferralAgent({ 
          lead: options.lead, 
          match: options.match, 
          split: parseInt(options.split),
          dryRun: options.dryRun,
          verbose: options.verbose 
        });
        break;
        
      default:
        console.error(`❌  Unknown role: ${options.role}`);
        console.error('   Valid roles: cma, buyer, seller, monitor, referral');
        process.exit(1);
    }
  } catch (err) {
    console.error('❌  Error:', err.message);
    if (options.verbose) console.error(err.stack);
    process.exit(1);
  }
}

main();