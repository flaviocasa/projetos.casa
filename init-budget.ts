import {existsSync,mkdirSync} from 'node:fs';import {resolve,dirname}from'node:path';import {fileURLToPath}from'node:url';import {BudgetGate}from'./core.ts';
// Explicit local initialization only. Never resets an existing ledger.
const root=dirname(fileURLToPath(import.meta.url)),state=resolve(process.env.STATE_DIR||resolve(root,'state')),file=resolve(state,'budget.sqlite');
if(existsSync(file))throw Error('Ledger already exists. Refusing to recreate or reset it.');
mkdirSync(state,{recursive:true});new BudgetGate(file,true).close();console.log('Budget ledger initialized. AI remains disabled unless separately approved and configured.');
