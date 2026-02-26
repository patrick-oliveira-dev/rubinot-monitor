import { connect } from "puppeteer-real-browser";
import { readFileSync, writeFileSync } from "fs";

const WEBHOOK_URL = process.env.WEBHOOK_URL;
const GUILD_URL = "https://rubinot.com.br/guilds/TRILOKO";
const LEVELS_FILE = "./levels.json";
const INTERVAL_MS = 5 * 60 * 1000;        // 5 minutos
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 horas

// ── Persistência ─────────────────────────────────────────────────────────────

function loadLevels() {
  try {
    return JSON.parse(readFileSync(LEVELS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveLevels(levels) {
  writeFileSync(LEVELS_FILE, JSON.stringify(levels, null, 2));
}

// ── Discord ───────────────────────────────────────────────────────────────────

async function sendDiscordEmbed(title, description, color) {
  await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [
        {
          title,
          description,
          color,
          footer: { text: "RubinOT • Trilokos" },
          timestamp: new Date().toISOString(),
        },
      ],
    }),
  });
}

// ── Browser ───────────────────────────────────────────────────────────────────

async function createBrowser() {
  return await connect({
    headless: false,
    turnstile: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    customConfig: {},
    connectOption: {},
    disableXvfb: false,
    ignoreAllFlags: false,
  });
}

// ── Guild sync ────────────────────────────────────────────────────────────────

async function syncGuildMembers(page, levels) {
  console.log(`  Sincronizando membros da guild...`);

  await page.goto(GUILD_URL, { waitUntil: "networkidle2", timeout: 30000 });
  await page.waitForFunction(
    () => !document.title.includes("Just a moment"),
    { timeout: 20000 }
  );

  const membersFromGuild = await page.evaluate(() => {
    const rows = document.querySelectorAll("table tr");
    const members = {};
    for (const row of rows) {
      const cells = row.querySelectorAll("td");
      if (cells.length >= 4) {
        const name = cells[1]?.textContent?.trim();
        const level = parseInt(cells[3]?.textContent?.trim());
        if (name && !isNaN(level)) {
          members[name] = level;
        }
      }
    }
    return members;
  });

  const currentNames = Object.keys(levels);
  const guildNames = Object.keys(membersFromGuild);

  // Adiciona novos membros
  const added = [];
  for (const name of guildNames) {
    if (!(name in levels)) {
      levels[name] = membersFromGuild[name];
      added.push(name);
    }
  }

  // Remove quem saiu da guild
  const removed = [];
  for (const name of currentNames) {
    if (!guildNames.includes(name)) {
      delete levels[name];
      removed.push(name);
    }
  }

  if (added.length > 0) {
    console.log(`  ✅ Novos membros: ${added.join(", ")}`);
    await sendDiscordEmbed(
      "👋 Novo(s) membro(s) na guild!",
      added.map((n) => `**${n}** (level ${membersFromGuild[n]})`).join("\n"),
      3447003 // azul
    );
  }

  if (removed.length > 0) {
    console.log(`  🚪 Removidos: ${removed.join(", ")}`);
    await sendDiscordEmbed(
      "🚪 Membro(s) saíram da guild",
      removed.map((n) => `**${n}**`).join("\n"),
      10197915 // cinza
    );
  }

  if (added.length === 0 && removed.length === 0) {
    console.log(`  Lista de membros sem alterações.`);
  }

  return levels;
}

// ── Scraping de level ─────────────────────────────────────────────────────────

async function getLevel(page, name) {
  const url = `https://rubinot.com.br/characters?name=${encodeURIComponent(name)}`;
  await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
  await page.waitForFunction(
    () => !document.title.includes("Just a moment"),
    { timeout: 20000 }
  );

  const level = await page.evaluate(() => {
    const cells = document.querySelectorAll("td");
    for (const cell of cells) {
      if (cell.textContent.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === "Nivel:") {
        const next = cell.nextElementSibling;
        if (next) return parseInt(next.textContent.trim());
      }
    }
    return null;
  });

  if (level === null) throw new Error(`Level não encontrado para ${name}`);
  return level;
}

// ── Monitor ───────────────────────────────────────────────────────────────────

async function monitor(isSync) {
  console.log(`\n[${new Date().toISOString()}] Iniciando verificação...`);

  let levels = loadLevels();
  let browser, page;

  try {
    ({ browser, page } = await createBrowser());

    // Sincroniza membros 1x por dia (ou na primeira execução se levels vazio)
    if (isSync || Object.keys(levels).length === 0) {
      levels = await syncGuildMembers(page, levels);
      saveLevels(levels);
    }

    // Verifica level de cada membro
    for (const character of Object.keys(levels)) {
      try {
        const current = await getLevel(page, character);
        const old = levels[character];

        console.log(`  ${character} → ${current} (anterior: ${old})`);

        if (current > old) {
          await sendDiscordEmbed(
            "🎉 LEVEL UP!",
            `**${character}** evoluiu de **${old}** para **${current}**!`,
            5763719 // verde
          );
          levels[character] = current;
        } else if (current < old) {
          await sendDiscordEmbed(
            "💀 MORTE DETECTADA",
            `Que noob... **${character}** morreu e voltou para o level **${current}**!`,
            15548997 // vermelho
          );
          levels[character] = current;
        }
      } catch (err) {
        console.error(`  ❌ Erro em ${character}: ${err.message}`);
      }
    }
  } finally {
    if (browser) await browser.close();
  }

  saveLevels(levels);
  console.log(`[${new Date().toISOString()}] Verificação concluída.`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

if (!WEBHOOK_URL) {
  console.error("❌ WEBHOOK_URL não definida. Configure a variável de ambiente.");
  process.exit(1);
}

async function run() {
  // Primeira execução sempre faz sync
  await monitor(true);

  // A cada 5 min verifica levels, sem sync
  setInterval(() => monitor(false), INTERVAL_MS);

  // A cada 24h faz sync da guild
  setInterval(() => monitor(true), SYNC_INTERVAL_MS);
}

run().catch(console.error);