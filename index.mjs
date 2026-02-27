import { connect } from "puppeteer-real-browser";
import { readFileSync, writeFileSync } from "fs";

const WEBHOOK_URL = process.env.WEBHOOK_URL;
const GUILD_URL = "https://rubinot.com.br/guilds/TRILOKO";
const LEVELS_FILE = "./levels.json";
const INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

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

// ── Guild ─────────────────────────────────────────────────────────────────────

async function getGuildMembers(page) {
  await page.goto(GUILD_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(
    () => !document.title.includes("Just a moment"),
    { timeout: 20000 }
  );

  // Espera a tabela existir antes de ler
  await page.waitForSelector("table tr", { timeout: 15000 });

  return await page.evaluate(() => {
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
}

// ── Monitor ───────────────────────────────────────────────────────────────────

async function monitor() {
  console.log(`\n[${new Date().toISOString()}] Iniciando verificação...`);

  const levels = loadLevels();
  let browser, page;

  try {
    ({ browser, page } = await createBrowser());

    const current = await getGuildMembers(page);

    // Verifica level up e mortes
    for (const [name, currentLevel] of Object.entries(current)) {
      const old = levels[name] ?? null;

      console.log(`  ${name} → ${currentLevel}${old !== null ? ` (anterior: ${old})` : " (primeiro registro)"}`);

      if (old === null) {
        levels[name] = currentLevel;
      } else if (currentLevel > old) {
        await sendDiscordEmbed(
          "🎉 LEVEL UP!",
          `**${name}** evoluiu de **${old}** para **${currentLevel}**!`,
          5763719 // verde
        );
        levels[name] = currentLevel;
      } else if (currentLevel < old) {
        await sendDiscordEmbed(
          "💀 MORTE DETECTADA",
          `Que noob... **${name}** morreu e voltou para o level **${currentLevel}**!`,
          15548997 // vermelho
        );
        levels[name] = currentLevel;
      }
    }

    // Só remove se a guild retornou membros (evita falso positivo por erro)
    if (Object.keys(current).length > 0) {
      for (const name of Object.keys(levels)) {
        if (!(name in current)) {
          console.log(`  🚪 ${name} saiu da guild`);
          await sendDiscordEmbed(
            "🚪 Membro saiu da guild",
            `**${name}** não está mais no TRILOKO.`,
            10197915 // cinza
          );
          delete levels[name];
        }
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
  await monitor();
  setInterval(monitor, INTERVAL_MS);
}

run().catch(console.error);