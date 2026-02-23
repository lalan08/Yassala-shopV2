#!/usr/bin/env node
/**
 * YASSALA — Assistant de configuration Telegram
 * Usage : node scripts/setup-telegram.mjs
 */

import { createInterface } from 'readline';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..');
const ENV   = join(ROOT, '.env.local');

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(res => rl.question(q, res));

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m',  red: '\x1b[31m',
};
const ok  = (s) => console.log(`${C.green}✓${C.reset} ${s}`);
const err = (s) => console.log(`${C.red}✗${C.reset} ${s}`);
const tip = (s) => console.log(`${C.cyan}→${C.reset} ${s}`);

async function tgGet(token, method, params = {}) {
  const url = new URL(`https://api.telegram.org/bot${token}/${method}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url.toString());
  return r.json();
}

function upsertEnv(file, key, value) {
  let content = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const regex = new RegExp(`^${key}=.*$`, 'm');
  const line  = `${key}=${value}`;
  content = regex.test(content) ? content.replace(regex, line) : content + (content.endsWith('\n') ? '' : '\n') + line + '\n';
  writeFileSync(file, content);
}

console.log(`\n${C.bold}🤖  Configuration du bot Telegram pour YASSALA${C.reset}\n`);
console.log('────────────────────────────────────────────');
tip("Étape 1 : Ouvre Telegram → cherche @BotFather → tape /newbot");
tip("Étape 2 : Donne un nom (ex: Yassala Shop) et un username (ex: yassala_notif_bot)");
tip("Étape 3 : Copie le token qu'il te donne\n");

const token = (await ask(`${C.bold}Colle ton token ici :${C.reset} `)).trim();

if (!token || !token.includes(':')) {
  err('Token invalide (format attendu : 123456:ABCdef...)');
  process.exit(1);
}

// Validate token
process.stdout.write('Vérification du token… ');
const me = await tgGet(token, 'getMe');
if (!me.ok) {
  console.log('');
  err(`Token rejeté par Telegram : ${me.description}`);
  process.exit(1);
}
console.log(`${C.green}OK${C.reset}`);
ok(`Bot créé : @${me.result.username} (${me.result.first_name})\n`);

// Get chat ID
console.log('────────────────────────────────────────────');
tip(`Ouvre Telegram, cherche @${me.result.username} et envoie-lui n'importe quel message.`);
await ask(`\nAppuie sur ${C.bold}Entrée${C.reset} quand c'est fait… `);

process.stdout.write('Récupération de ton Chat ID… ');
const updates = await tgGet(token, 'getUpdates', { limit: 5, timeout: 10 });
if (!updates.ok || updates.result.length === 0) {
  console.log('');
  err("Aucun message reçu. Envoie d'abord un message à ton bot puis relance le script.");
  process.exit(1);
}

const lastMsg = updates.result[updates.result.length - 1].message;
const chatId  = String(lastMsg.chat.id);
const sender  = lastMsg.from.first_name;
console.log(`${C.green}OK${C.reset}`);
ok(`Chat ID détecté : ${chatId}  (message de ${sender})\n`);

// Save to .env.local
upsertEnv(ENV, 'TELEGRAM_BOT_TOKEN', token);
upsertEnv(ENV, 'TELEGRAM_CHAT_ID',   chatId);
ok(`.env.local mis à jour ✓`);

// Test — send a real message
process.stdout.write('Envoi d\'un message de test… ');
const test = await tgGet(token, 'sendMessage', {
  chat_id: chatId,
  text: '🔔 *YASSALA* — Bot connecté avec succès !\nTu recevras les commandes ici.',
  parse_mode: 'Markdown',
});
if (test.ok) {
  console.log(`${C.green}OK${C.reset}`);
  ok('Vérifie ton Telegram — tu dois avoir reçu le message de confirmation.\n');
} else {
  console.log('');
  err(`Échec du test : ${test.description}`);
}

// Vercel reminder
console.log('────────────────────────────────────────────');
console.log(`${C.yellow}⚠  Sur Vercel, ajoute ces 2 variables d'environnement :${C.reset}`);
console.log(`   TELEGRAM_BOT_TOKEN = ${token.slice(0, 10)}…`);
console.log(`   TELEGRAM_CHAT_ID   = ${chatId}`);
console.log('────────────────────────────────────────────\n');

rl.close();
