// Speech-input path with a mocked recognizer (no real microphone needed).
// Checks: mic toggle, "no speech" feedback, unrelated answer, a correct
// spoken answer picking the card, and turning the mic off mid-listen.
// Needs `npm run dev`. Usage: node scripts/speech.mjs
import { launch, harness } from './lib.mjs';

const base = process.env.BASE || 'http://localhost:5173';
const out = process.env.SHOTS_DIR || '.shots/speech';
const { browser, page } = await launch();
const H = harness(page, out);
const { log, shot, state, sleep, expect } = H;

await page.addInitScript(() => {
  window.__speechPlan = [];
  window.__speechStarts = 0;
  class FakeSR {
    static async available() { return 'available'; }
    constructor() { this.processLocally = false; }
    start() {
      window.__speechStarts++;
      const step = window.__speechPlan.shift() || { hang: true };
      if (step.hang) return;
      this._t = setTimeout(() => {
        if (step.error) { this.onerror?.({ error: step.error }); this.onend?.(); return; }
        const result = [{ transcript: step.transcript, confidence: 0.9 }];
        result.isFinal = true;
        this.onresult?.({ results: [result] });
        this.onend?.();
      }, 300);
    }
    stop() { clearTimeout(this._t); this.onend?.(); }
    abort() { clearTimeout(this._t); this.onerror?.({ error: 'aborted' }); this.onend?.(); }
  }
  window.SpeechRecognition = FakeSR;
  window.webkitSpeechRecognition = FakeSR;
});

await page.goto(base + '/?autostart=sample&name=Rio');
await page.waitForFunction(() => window.__esl && window.__esl.sceneId === 'classroom', null, { timeout: 30000 });
await sleep(1200);
const chip = await page.locator('.micchip').innerText();
expect(/Mic OFF/i.test(chip), `mic starts OFF (chip says "${chip.replace(/\s+/g, ' ')}")`);
await page.locator('.micchip').click();
await sleep(300);
expect(/Mic ON/i.test(await page.locator('.micchip').innerText()), 'mic chip turns ON');

// Wait for the welcome's answer card.
await page.waitForFunction(() => document.querySelector('.dlg-choices') && !document.querySelector('.dlg-choices').hidden, null, { timeout: 30000 }).catch(() => null);
for (let i = 0; i < 12 && !(await page.locator('.dlg-cards .card').first().isVisible().catch(() => false)); i++) { await page.keyboard.press('Space'); await sleep(450); }
expect(await page.locator('.mic-btn').isVisible(), 'speak button shown with the cards');
await shot('cards-with-mic');

// 1) No speech
await page.evaluate(() => window.__speechPlan.push({ error: 'no-speech' }));
await page.keyboard.press('Space');
await sleep(800);
const heard1 = await page.locator('.mic-heard').innerText();
expect(/didn.t hear/i.test(heard1), `no-speech feedback: "${heard1}"`);
expect(await page.locator('.dlg-cards .card').first().isVisible(), 'cards stay available after no-speech');

// 2) Unrelated speech
await page.evaluate(() => window.__speechPlan.push({ transcript: 'the weather is very cold' }));
await page.locator('.mic-btn').click();
await sleep(900);
const heard2 = await page.locator('.mic-heard').innerText();
expect(/Try again|tap a card/i.test(heard2), `unrelated speech feedback: "${heard2}"`);
await shot('unrelated');

// 3) Mic turned off mid-listen: never a failure
await page.evaluate(() => window.__speechPlan.push({ hang: true }));
await page.locator('.mic-btn').click();
await sleep(300);
await page.locator('.micchip').click();
await sleep(500);
const heard3 = await page.locator('.mic-heard').innerText().catch(() => '');
expect(!/didn.t hear|Time.s up|wrong/i.test(heard3), 'turning the mic off is not treated as an error');
expect(/Mic OFF/i.test(await page.locator('.micchip').innerText()), 'mic chip shows OFF again');
await page.locator('.micchip').click();
await sleep(300);

// 4) Correct answer
await page.evaluate(() => window.__speechPlan.push({ transcript: 'hello my name is Rio nice to meet you' }));
await page.locator('.mic-btn').click();
await sleep(1500);
await shot('spoken');
const badge = await page.locator('.dlg-name').innerText().catch(() => '');
const spoken = await page.evaluate(() => Object.values(window.__esl.world.save.lang.expr).some((e) => e.spoken > 0));
expect(spoken, 'spoken answer was recorded in the phrase book');
log('speaker badge after answer:', badge.replace(/\s+/g, ' '));

await browser.close();
if (H.errors.length) { console.log('\nFAILED with', H.errors.length, 'problem(s):'); for (const e of H.errors) console.log(' -', e); process.exit(1); }
console.log('\nSPEECH CHECKS PASSED');
