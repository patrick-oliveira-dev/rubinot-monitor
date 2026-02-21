import { connect } from "puppeteer-real-browser";
import { readFileSync, writeFileSync } from "fs";

const WEBHOOK_URL = process.env.WEBHOOK_URL;

const CHARACTERS = [
  "Sleepdeep",
  "Pcesar Golis",
  "Ture Krio",
  "Elder Bruno",
  "Taskador",
  "Odemox",
  "Jim Wilson",
  "Triloko Master",
  "Sapexzin",
];

const LEVELS_FILE = "./levels.json";
const INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

// ── Persistência ────────────────────────────────────────────────────────────

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

// ── Discord ──────────────────────────────────────────────────────────────────

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

// ── Scraping ─────────────────────────────────────────────────────────────────

async function getLevel(page, name) {
  const url = `https://rubinot.com.br/?subtopic=characters&name=${encodeURIComponent(name)}`;
  await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

  await page.waitForFunction(
    () => !document.title.includes("Just a moment"),
    { timeout: 20000 }
  );

  const level = await page.evaluate(() => {
    const cells = document.querySelectorAll("td");
    for (const cell of cells) {
      if (cell.textContent.trim() === "Level:") {
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

async function monitor() {
  console.log(`\n[${new Date().toISOString()}] Iniciando verificação...`);

  const levels = loadLevels();

  let browser, page;
  try {
    ({ browser, page } = await connect({
      headless: false,   // Railway roda Linux com xvfb, funciona invisível
      turnstile: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      customConfig: {},
      connectOption: {},
      disableXvfb: false,
      ignoreAllFlags: false,
    }));

    for (const character of CHARACTERS) {
      try {
        const current = await getLevel(page, character);
        const old = levels[character] ?? null;

        console.log(`  ${character} → ${current}${old !== null ? ` (anterior: ${old})` : " (primeiro registro)"}`);

        if (old === null) {
          levels[character] = current;
        } else if (current > old) {
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
  await monitor();
  setInterval(monitor, INTERVAL_MS);
}

run().catch(console.error);
