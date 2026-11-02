import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { CdpSession } from "../injector.mjs";

const run = promisify(execFile);
const scripts = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("failed CDP initialization closes the socket and clears pending commands", async () => {
  const original = globalThis.WebSocket;
  class StalledSocket extends EventTarget {
    constructor() {
      super();
      queueMicrotask(() => this.dispatchEvent(new Event("open")));
    }
    send(data) {
      const command = JSON.parse(data);
      if (command.method === "Runtime.enable") {
        queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", {
          data: JSON.stringify({ id: command.id, result: {} }),
        })));
      }
      // Page.enable and the closing handshake intentionally never answer.
    }
    close() { this.closeRequested = true; }
  }
  globalThis.WebSocket = StalledSocket;
  try {
    const session = new CdpSession({ webSocketDebuggerUrl: "ws://127.0.0.1:19335/devtools/page/test" }, { timeoutMs: 25 });
    await assert.rejects(session.open(), /timed out.*Page.enable/);
    assert.equal(session.closed, true);
    assert.equal(session.ws.closeRequested, true);
    assert.equal(session.pending.size, 0);
  } finally {
    globalThis.WebSocket = original;
  }
});

test("one-shot verification exits on its deadline when target discovery stalls", async () => {
  const server = http.createServer(() => {});
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const before = Date.now();
  try {
    await assert.rejects(run(process.execPath, [path.join(scripts, "injector.mjs"),
      "--verify", "--port", String(server.address().port), "--timeout-ms", "250"], { timeout: 2500 }),
    (error) => error.code === 1 && /exceeded 250ms/.test(error.stderr));
    assert.ok(Date.now() - before < 2000);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("concurrent launches share one injector; layout failures do not restart it", async (t) => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), "autoskin-stability-"));
  const state = path.join(fixture, "state");
  await fs.mkdir(path.join(fixture, "lib"));
  await fs.mkdir(state);
  let injectorPid;
  let watcher;
  t.after(async () => {
    if (watcher) {
      watcher.kill("SIGTERM");
      await new Promise((resolve) => watcher.once("exit", resolve));
    }
    if (injectorPid) { try { process.kill(injectorPid, "SIGTERM"); } catch {} }
    await fs.rm(fixture, { recursive: true, force: true });
  });
  for (const name of ["start-dream-skin.sh", "watch-dream-skin.sh"]) {
    await fs.copyFile(path.join(scripts, name), path.join(fixture, name));
    await fs.chmod(path.join(fixture, name), 0o755);
  }
  const common = await fs.readFile(path.join(scripts, "lib/mac-common.sh"), "utf8");
  await fs.writeFile(path.join(fixture, "lib/mac-common.sh"), common + `
dream_require_macos() { :; }
dream_installed_port() { printf '19335'; }
dream_state_root() { printf '%s' "$AUTOSKIN_TEST_STATE"; }
dream_resolve_app() { APP_BUNDLE='fixture'; APP_BUNDLE_ID='fixture'; }
dream_resolve_node() { NODE_BIN="$AUTOSKIN_TEST_NODE"; }
dream_cdp_ready() { return 0; }
`);
  await fs.writeFile(path.join(fixture, "injector.mjs"), `
import fs from 'node:fs';
import path from 'node:path';
const state = process.env.AUTOSKIN_TEST_STATE;
if (process.argv.includes('--watch')) {
  fs.appendFileSync(path.join(state, 'starts'), String(process.pid) + '\\n');
  setInterval(() => {}, 1000);
} else {
  fs.appendFileSync(path.join(state, 'verifies'), 'verify\\n');
  setTimeout(() => process.exit(fs.existsSync(path.join(state, 'fail-verify')) ? 2 : 0), 100);
}
`);
  const env = { ...process.env, AUTOSKIN_TEST_STATE: state, AUTOSKIN_TEST_NODE: process.execPath };
  const launch = () => run("/bin/bash", [path.join(fixture, "start-dream-skin.sh")], { env, timeout: 10000 });
  await Promise.all(Array.from({ length: 4 }, launch));
  injectorPid = JSON.parse(await fs.readFile(path.join(state, "state.json"), "utf8")).injectorPid;
  assert.equal((await fs.readFile(path.join(state, "starts"), "utf8")).trim().split("\n").length, 1);
  const verificationCount = await fs.readFile(path.join(state, "verifies"), "utf8");
  await fs.writeFile(path.join(state, "fail-verify"), "1");
  await launch();
  assert.equal(JSON.parse(await fs.readFile(path.join(state, "state.json"), "utf8")).injectorPid, injectorPid);
  watcher = spawn("/bin/bash", [path.join(fixture, "watch-dream-skin.sh"), "--poll-seconds", "1"], { env, stdio: "ignore" });
  await sleep(2400);
  assert.equal((await fs.readFile(path.join(state, "starts"), "utf8")).trim().split("\n").length, 1);
  assert.equal(await fs.readFile(path.join(state, "verifies"), "utf8"), verificationCount);
  assert.doesNotThrow(() => process.kill(injectorPid, 0));
  watcher.kill("SIGTERM");
  await new Promise((resolve) => watcher.once("exit", resolve));
  watcher = null;
  process.kill(injectorPid, "SIGTERM");
  await sleep(100);
  await assert.rejects(launch(), (error) => error.code === 1 && /layout verification failed/.test(error.stderr));
  injectorPid = JSON.parse(await fs.readFile(path.join(state, "state.json"), "utf8")).injectorPid;
  assert.doesNotThrow(() => process.kill(injectorPid, 0));
  await launch();
  assert.equal(JSON.parse(await fs.readFile(path.join(state, "state.json"), "utf8")).injectorPid, injectorPid);
});

test("renderer reaches idle and repairs native DOM changes without replacing stable chrome", {
  skip: !process.env.AUTOSKIN_PLAYWRIGHT_MODULE,
}, async () => {
  const { chromium } = await import(process.env.AUTOSKIN_PLAYWRIGHT_MODULE);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
    await page.setContent(`<style>
      body{margin:0;display:flex}aside{width:250px;height:800px}main{width:850px;height:800px}
      form{margin-top:500px;width:700px;height:100px;border-radius:20px;background:white}
      [contenteditable]{width:600px;height:50px}
    </style><aside><nav><button>New task</button><button>A</button><button>B</button></nav></aside>
    <main><article>Fixture message</article><form><div role="textbox" contenteditable="true"></div></form></main>`);
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
    const manifest = { order: ["fixture"], defaultTheme: "fixture", defaultLayout: "fullscreen",
      meta: { fixture: { brand: "Fixture", edition: "Test", signature: "Stable" } } };
    const payload = (await fs.readFile(path.join(scripts, "../assets/renderer-inject.js"), "utf8"))
      .replace("__DREAM_CSS_JSON__", JSON.stringify("/* fixture */"))
      .replace("__DREAM_ART_ASSETS_JSON__", JSON.stringify({ fixture: { home: png, chat: png } }))
      .replace("__DREAM_MANIFEST_JSON__", JSON.stringify(manifest));
    await page.evaluate(payload);
    await page.evaluate(() => {
      window.fixtureChrome = document.getElementById("codex-dream-skin-chrome");
      window.fixtureMutations = 0;
      new MutationObserver((records) => { window.fixtureMutations += records.length; })
        .observe(window.fixtureChrome, { subtree: true, childList: true });
    });
    await sleep(1200);
    assert.equal(await page.evaluate(() => window.fixtureMutations), 0);
    assert.equal(await page.evaluate(() => window.__CODEX_DREAM_SKIN_STATE__.scheduler.timeout), null);
    const repaint = await page.evaluate(async () => {
      const composer = document.querySelector('.dream-composer-surface');
      const changes = [];
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          if (record.target === composer || record.target === document.documentElement) {
            changes.push(record.attributeName);
          }
        }
      });
      observer.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
      for (let pass = 0; pass < 4; pass++) window.__CODEX_DREAM_SKIN_STATE__.ensure();
      await new Promise((resolve) => setTimeout(resolve, 0));
      observer.disconnect();
      return { mutations: changes.length, sameComposer: composer === document.querySelector('.dream-composer-surface') };
    });
    assert.deepEqual(repaint, { mutations: 0, sameComposer: true }, 'refresh must not remove and repaint a stable composer');
    await page.evaluate(payload);
    assert.equal(await page.evaluate(() => document.getElementById("codex-dream-skin-chrome") === window.fixtureChrome), true);
    await page.evaluate(() => window.fixtureChrome.remove());
    await sleep(450);
    assert.equal(await page.evaluate(() => Boolean(document.getElementById("codex-dream-skin-chrome"))), true);
  } finally {
    await browser.close();
  }
});

test("fullscreen Work layout keeps its composer stable across refresh and replacement", {
  skip: !process.env.AUTOSKIN_PLAYWRIGHT_MODULE,
}, async () => {
  const { chromium } = await import(process.env.AUTOSKIN_PLAYWRIGHT_MODULE);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
    await page.setContent(`<style>
      body{margin:0;display:flex}aside{width:250px;height:950px;flex-shrink:0}
      main{width:1150px;height:950px}.home-main-content{width:100%;height:100%}
      .home-main-content>div{height:100%;display:flex;flex-direction:column;justify-content:space-between}
      [data-feature="game-source"]{font-size:32px;margin-top:100px}
      .home-suggestions{display:flex;gap:10px}.home-suggestions button{width:150px;height:75px}
      form{margin:20px auto;width:700px;min-height:100px;border-radius:20px;background:white}
      [contenteditable]{width:600px;height:50px}
    </style><aside><nav><button>New task</button><button>A</button><button>B</button></nav></aside>
    <main><div role="main" class="home-main-content"><div>
      <div><div><div data-feature="game-source">Work in <button>Fixture</button>?</div>
      <div class="home-suggestions"><button>One</button><button>Two</button></div></div></div>
      <div class="relative z-20"><form><div role="textbox" contenteditable="true"></div></form></div>
    </div></div></main>`);
    const manifest = { order: ["fixture"], defaultTheme: "fixture", defaultLayout: "fullscreen",
      meta: { fixture: { brand: "Fixture", edition: "Test", signature: "Stable" } } };
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
    const css = (await fs.readFile(path.join(scripts, "../styles/dream/style.css"), "utf8"))
      .replace(/__AUTOSKIN_RUNTIME_ASSET__\/[a-z-]+\.svg/g, png);
    const payload = (await fs.readFile(path.join(scripts, "../assets/renderer-inject.js"), "utf8"))
      .replace("__DREAM_CSS_JSON__", JSON.stringify(css))
      .replace("__DREAM_ART_ASSETS_JSON__", JSON.stringify({ fixture: { home: png, chat: png } }))
      .replace("__DREAM_MANIFEST_JSON__", JSON.stringify(manifest));
    await page.evaluate(payload);
    await sleep(500);
    const result = await page.evaluate(async () => {
      const state = window.__CODEX_DREAM_SKIN_STATE__;
      const composer = document.querySelector('.dream-composer-surface');
      const snapshot = () => {
        const rect = composer.getBoundingClientRect();
        return { surface: state.adapter.signals.surface, rect: [rect.x, rect.y, rect.width, rect.height] };
      };
      const before = snapshot();
      let composerMutations = 0;
      const observer = new MutationObserver((records) => { composerMutations += records.length; });
      observer.observe(composer, { attributes: true, attributeFilter: ['class', 'style'] });
      const samples = [];
      for (let pass = 0; pass < 8; pass++) {
        state.ensure();
        samples.push(snapshot());
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
      observer.disconnect();
      return { before, samples, composerMutations };
    });
    assert.equal(result.before.surface, 'work-home');
    assert.ok(result.before.rect[1] < 950 && result.before.rect[1] + result.before.rect[3] > 0);
    assert.equal(result.composerMutations, 0);
    for (const sample of result.samples) assert.deepEqual(sample, result.before);
    await page.addStyleTag({ content: '[data-feature="game-source"].dream-hero-source { visibility: hidden !important; }' });
    const retained = await page.evaluate(() => {
      const state = window.__CODEX_DREAM_SKIN_STATE__;
      const samples = [];
      for (let pass = 0; pass < 6; pass++) {
        state.ensure();
        samples.push({ hero: Boolean(document.querySelector('[data-feature="game-source"].dream-hero-source')),
          content: Boolean(document.querySelector('.dream-home-content')) });
      }
      return samples;
    });
    for (const sample of retained) assert.deepEqual(sample, { hero: true, content: true });
    await page.addStyleTag({ content: `
      .home-main-content > div > div:last-child { transform: translateY(1800px); }
      .home-main-content > div > div:last-child:has(.dream-composer-surface) { transform: none; }
    ` });
    const recovered = await page.evaluate(() => {
      document.querySelector('.dream-composer-surface').classList.remove('dream-composer-surface');
      window.__CODEX_DREAM_SKIN_STATE__.ensure();
      const node = document.querySelector('.dream-composer-surface');
      const rect = node?.getBoundingClientRect();
      return { marked: Boolean(node), visible: Boolean(rect && rect.top < innerHeight && rect.bottom > 0) };
    });
    assert.deepEqual(recovered, { marked: true, visible: true }, 'offscreen home editor must be re-anchored');
    await page.evaluate(() => {
      const previous = document.querySelector('.dream-composer-surface');
      const replacement = previous.cloneNode(true);
      replacement.classList.remove('dream-composer-surface');
      replacement.querySelector('.dream-usage-orb')?.remove();
      replacement.dataset.fixtureReplacement = 'true';
      previous.replaceWith(replacement);
    });
    await sleep(500);
    assert.equal(await page.evaluate(() => document.querySelector('.dream-composer-surface')?.dataset.fixtureReplacement), 'true');
    assert.equal(await page.evaluate(() => document.querySelectorAll('.dream-composer-surface').length), 1);
  } finally {
    await browser.close();
  }
});
