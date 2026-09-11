#!/usr/bin/env node
/**
 * AI Sales Agent CLI — Single binary, multiple roles
 * Usage: agent-cli --role cma [options]
 *        agent-cli --role buyer [options]
 *        agent-cli --role seller [options]
 *        agent-cli --role monitor [options]
 *        agent-cli --role referral [options]
 */

import { program } from 'commander';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { runCMAAgent } from './lib/agents/cma-agent.js';
import { runBuyerAgent } from './lib/agents/buyer-agent.js';
import { runSellerAgent } from './lib/agents/seller-agent.js';
import { runMonitorAgent } from './lib/agents/monitor-agent.js';
import { runReferralAgent } from './lib/agents/referral-agent.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

program
  .name('agent-cli')
  .description('AI Sales Agent — Multi-role real estate intelligence')
  .version('0.1.0');

program
  .command('cma')
  .description('Run CMA Agent — Comparative Market Analysis')
  .option('-a, --address <address>', 'Property address')
  .option('-o, --output <format>', 'Output format: json|text|markdown', 'text')
  .option('--geocoder <type>', 'Geocoder: census|google', 'census')
  .option('--provider <name>', 'Data provider: mock|rentcast|attom|mlspin', 'mock')
  .option('--save', 'Save result to file')
  .action(async (opts) => {
    await runCMAAgent(opts);
  });

program
  .command('buyer')
  .description('Run Buyer Agent — Property search & offer assistance')
  .option('-q, --query <string>', 'Search query (neighborhood, price, beds, etc.)')
  .option('-b, --budget <range>', 'Budget range (e.g., "800k-1.2m")')
  .option('--beds <number>', 'Minimum bedrooms')
  .option('--property-type <type>', 'Property type: single|condo|multi')
  .action(async (opts) => {
    await runBuyerAgent(opts);
  });

program
  .command('seller')
  .description('Run Seller Agent — Pricing strategy & listing optimization')
  .option('-a, --address <address>', 'Property address')
  .option('--strategy <type>', 'Pricing strategy: aggressive|market|conservative', 'market')
  .option('--timeline <days>', 'Target days on market', '30')
  .action(async (opts) => {
    await runSellerAgent(opts);
  });

program
  .command('monitor')
  .description('Run Monitor Agent — Accuracy tracking & weight updates')
  .option('--backtest', 'Run historical backtest')
  .option('--update-weights', 'Update method weights from ledger')
  .option('--report', 'Generate accuracy report')
  .action(async (opts) => {
    await runMonitorAgent(opts);
  });

program
  .command('referral')
  .description('Run Referral Agent — Lead matching & commission splits')
  .option('--lead <id>', 'Process specific lead')
  .option('--match', 'Run matching algorithm')
  .option('--split <percent>', 'Commission split percentage')
  .action(async (opts) => {
    await runReferralAgent(opts);
  });

// Default: show help if no command
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

program.parse();