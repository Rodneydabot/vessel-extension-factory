#!/usr/bin/env node
require('dotenv').config();
const { Command } = require('commander');
const inquirer = require('inquirer');
const { runResearch, runBuildWorkflow, packageExtension } = require('./factory-core.js');

const program = new Command();

program
  .name('extension-factory')
  .description('Headless Chrome Extension Factory')
  .version('1.0.0');

// Configuration helper
async function getProviderCfg() {
  let provider = process.env.LLM_PROVIDER;
  let key = process.env.LLM_API_KEY;
  let model = process.env.LLM_MODEL;
  let endpoint = process.env.LLM_ENDPOINT;

  if (!provider || provider.trim() === '') {
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'provider',
        message: 'Select LLM Provider:',
        choices: ['gemini', 'openai', 'anthropic', 'chutes', 'local']
      },
      {
        type: 'password',
        name: 'key',
        message: 'Enter API Key:',
        when: (ans) => ans.provider !== 'local'
      },
      {
        type: 'input',
        name: 'model',
        message: 'Enter Model Name (leave blank for default):'
      },
      {
        type: 'input',
        name: 'endpoint',
        message: 'Enter Custom Endpoint (leave blank for default):',
        when: (ans) => ['local', 'chutes'].includes(ans.provider)
      }
    ]);
    provider = answers.provider;
    key = answers.key;
    model = answers.model;
    endpoint = answers.endpoint;
  }

  return { provider, model, key, endpoint };
}

program
  .command('research')
  .description('Find extension opportunities for a topic')
  .argument('<topic>', 'The topic to research')
  .action(async (topic) => {
    try {
      console.log(`\n🔍 Researching signals for: ${topic}...\n`);
      const cfg = await getProviderCfg();
      const opportunities = await runResearch(cfg, topic);
      
      console.table(opportunities.map(o => ({
        Name: o.name,
        Score: o.score,
        Users: o.users,
        Niche: o.niche
      })));
      
      console.log('\nUse "node cli.js build <topic>" to build one of these.');
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

program
  .command('build')
  .description('Research and build an extension from a topic')
  .argument('[topic]', 'The topic to build (interactive if omitted)')
  .action(async (topic) => {
    try {
      const cfg = await getProviderCfg();
      let selectedOpp;

      if (!topic) {
        const answers = await inquirer.prompt([{
          type: 'input',
          name: 'searchTopic',
          message: 'What topic do you want to research and build?'
        }]);
        topic = answers.searchTopic;
      }

      console.log(`\n🚀 Starting build process for: ${topic}`);
      console.log(`📡 Using Provider: ${cfg.provider}\n`);

      process.stdout.write('1. Researching opportunities...');
      const opportunities = await runResearch(cfg, topic);
      process.stdout.write(' Done.\n');

      const { choice } = await inquirer.prompt([{
        type: 'list',
        name: 'choice',
        message: 'Choose an opportunity to build:',
        choices: opportunities.map(o => ({
          name: `${o.name} (Score: ${o.score}) - ${o.signal.slice(0, 60)}...`,
          value: o
        }))
      }]);
      
      selectedOpp = choice;

      console.log(`\n🛠️  Building Extension: ${selectedOpp.name}`);
      const outputs = await runBuildWorkflow(cfg, selectedOpp, (msg) => {
        console.log(`   - ${msg}`);
      });

      console.log('\n📦 Packaging into ZIP...');
      const zipPath = packageExtension(outputs, selectedOpp.name);
      
      console.log(`\n✅ Success! Extension ready at: ${zipPath}\n`);

    } catch (e) {
      console.error('\n❌ Error:', e.message);
    }
  });

program.parse();
