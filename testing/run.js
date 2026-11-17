import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const testingDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(testingDir, '..');
const envPath = resolve(testingDir, '.env');

if (!existsSync(envPath)) {
  console.error('File testing/.env belum ada. Salin testing/.env.example menjadi testing/.env, lalu atur BASE_URL.');
  process.exit(1);
}

dotenv.config({ path: envPath });

function fail(message) {
  console.error(message);
  process.exit(1);
}

const round = process.argv[2];
if (!['round1', 'round2'].includes(round)) {
  fail('Ronde tidak valid. Jalankan melalui npm run round1 atau npm run round2 dari folder testing.');
}

let targetUrl;
try {
  targetUrl = new URL(process.env.BASE_URL || '');
} catch {
  fail('BASE_URL di testing/.env tidak valid. Contoh: http://192.168.1.50:3000');
}

if (!['http:', 'https:'].includes(targetUrl.protocol)
  || targetUrl.pathname !== '/'
  || targetUrl.search
  || targetUrl.hash) {
  fail('BASE_URL harus berupa alamat dasar saja, tanpa path, query, atau hash. Contoh: http://192.168.1.50:3000');
}

const baseUrl = targetUrl.origin.replace(/\/$/, '');
const k6Bin = process.env.K6_BIN?.trim() || 'k6';

function readPositiveInteger(name, fallback) {
  const value = process.env[name] ?? String(fallback);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    fail(`${name} harus berupa bilangan bulat positif; nilai sekarang: ${value}`);
  }
  return Number(value);
}

function readDuration(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (!/^[1-9]\d*(?:\.\d+)?(?:ms|s|m|h)$/.test(value)) {
    fail(`${name} harus berupa durasi seperti 15s, 500ms, 2m, atau 1h; nilai sekarang: ${value}`);
  }
  return value;
}

const warmupVus = readPositiveInteger('WARMUP_VUS', 300);
const peakVus = readPositiveInteger('PEAK_VUS', 1000);
const warmupDuration = readDuration('WARMUP_DURATION', '15s');
const peakDuration = readDuration('PEAK_DURATION', '15s');
const endpoint = round === 'round1' ? '/api/ping' : '/api/record';

async function preflight() {
  let response;
  try {
    response = await fetch(`${baseUrl}/api/ping`, { signal: AbortSignal.timeout(3000) });
  } catch (error) {
    fail(`Preflight gagal ke ${baseUrl}. Pastikan server Orange Pi berjalan dan IP/port benar. Detail: ${error.message}`);
  }

  if (!response.ok) {
    fail(`Preflight ${baseUrl}/api/ping mengembalikan HTTP ${response.status}.`);
  }

  let ping;
  try {
    ping = await response.json();
  } catch {
    fail(`Respons ${baseUrl}/api/ping bukan JSON yang valid.`);
  }

  if (!['node', 'rust'].includes(ping.runtime)) {
    fail(`Runtime tidak dikenali dari /api/ping: ${JSON.stringify(ping)}`);
  }
  return ping.runtime;
}

function runStage({ label, vus, duration, runtime, stamp }) {
  const resultsDir = resolve(projectRoot, 'results');
  mkdirSync(resultsDir, { recursive: true });
  const stem = `${stamp}-${round}-${runtime}-${label}-vus${vus}`;
  const logPath = resolve(resultsDir, `${stem}.txt`);
  const summaryPath = resolve(resultsDir, `${stem}.json`);
  const scriptPath = resolve(projectRoot, 'scripts', 'bench.js');
  const args = [
    'run',
    '--quiet',
    '--vus', String(vus),
    '--duration', duration,
    '--summary-trend-stats', 'avg,min,med,max,p(90),p(95)',
    '--summary-export', summaryPath,
    '-e', `BASE_URL=${baseUrl}`,
    '-e', `ROUND=${round}`,
    scriptPath,
  ];

  console.log(`\n== ${round} ${runtime} ${label}: vus=${vus}, duration=${duration}, URL=${baseUrl}${endpoint} ==`);
  console.log(`Menyimpan output: ${logPath}`);

  return new Promise((resolveStage) => {
    const log = createWriteStream(logPath, { flags: 'w' });
    const child = spawn(k6Bin, args, {
      cwd: projectRoot,
      env: { ...process.env, BASE_URL: baseUrl, ROUND: round },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let finished = false;

    const finish = (passed) => {
      if (finished) return;
      finished = true;
      log.end(() => resolveStage(passed));
    };

    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      log.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
      log.write(chunk);
    });
    child.on('error', (error) => {
      const message = `Tidak bisa menjalankan k6 (${k6Bin}). Instal k6 dan pastikan perintah k6 tersedia di PATH. Detail: ${error.message}\n`;
      process.stderr.write(message);
      log.write(message);
      finish(false);
    });
    child.on('close', (code) => finish(code === 0));
  });
}

async function main() {
  const runtime = await preflight();
  console.log(`Target: ${baseUrl} (${runtime})`);
  console.log(`Skenario: ${round} -> ${baseUrl}${endpoint}`);

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z').replace('T', '-');
  const stages = [
    { label: 'warmup', vus: warmupVus, duration: warmupDuration },
    { label: 'peak', vus: peakVus, duration: peakDuration },
  ];
  let failed = false;

  for (const stage of stages) {
    const passed = await runStage({ ...stage, runtime, stamp });
    if (!passed) {
      failed = true;
      console.error(`Tahap ${stage.label} gagal atau memiliki checks yang gagal; hasil tetap disimpan dan tahap berikutnya dilanjutkan.`);
    }
  }

  if (failed) {
    console.error('Benchmark selesai dengan satu atau lebih tahap gagal. Periksa file .txt dan .json di folder results.');
    process.exitCode = 1;
  }
}

main().catch((error) => fail(`Runner gagal: ${error.message}`));
