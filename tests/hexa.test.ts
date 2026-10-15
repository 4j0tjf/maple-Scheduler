import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { analyzePixels, createSearchState } from "../src/services/pixel-analysis";
import { fragmentReading, HEXA_DIGITS, readHexaFragments, type Pixels } from "../src/services/scanner";

// 실제 화면(2026-10 KMS)의 HEXA '보유한 재료' 작은 창. 솔 에르다 기운 966 / 1000, 조각 2개.
const widget = (): Pixels => ({ width: 169, height: 55, data: new Uint8ClampedArray(gunzipSync(readFileSync(new URL("./fixtures/hexa.rgba.gz", import.meta.url)))) });
const screen = (width: number, height: number, gray: number): Pixels => {
  const data = new Uint8ClampedArray(width * height * 4).fill(gray);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { width, height, data };
};
const paste = (frame: Pixels, piece: Pixels, x: number, y: number) => {
  for (let dy = 0; dy < piece.height; dy++) frame.data.set(piece.data.subarray(dy * piece.width * 4, (dy + 1) * piece.width * 4), ((y + dy) * frame.width + x) * 4);
  return frame;
};
const fill = (frame: Pixels, x: number, y: number, w: number, h: number, rgb: number[]) => {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) frame.data.set(rgb, ((y + dy) * frame.width + x + dx) * 4);
};
/** 조각 칸의 "2"를 지우고 다른 개수를 칸 가운데(x 122)에 같은 모양(흰 글자, 보라색 바탕)으로 그린다. */
const withCount = (text: string, shapes: Record<string, string[]> = {}) => {
  const frame = widget();
  fill(frame, 92, 41, 60, 7, [30, 30, 35]);
  const glyphs = [...text].map(ch => shapes[ch] ?? HEXA_DIGITS[ch][0]);
  const width = glyphs.reduce((sum, glyph) => sum + glyph[0].length + 1, -1);
  let x = 122 - Math.floor(width / 2);
  fill(frame, x - 1, 41, width + 2, 7, [80, 34, 192]);
  for (const glyph of glyphs) {
    glyph.forEach((row, dy) => [...row].forEach((tone, dx) => { if (tone === "o") frame.data.set([255, 255, 255], ((42 + dy) * frame.width + x + dx) * 4); }));
    x += glyph[0].length + 1;
  }
  return frame;
};

test("live HEXA material window reads the fragment count next to the Sol Erda gauge", () => {
  const found = readHexaFragments(widget())!;
  assert.equal(found.count, 2);
  assert.deepEqual(found.slash, { x: 47, y: 42, w: 5, h: 5 }, "the gauge's slash anchors the window");
  assert.ok(found.region.x <= 120 && found.region.x + found.region.w >= 125, "the evidence crop covers the count");
});
test("the HEXA window is found anywhere on a full screen and its position is reused", () => {
  const frame = paste(screen(1920, 1080, 25), widget(), 1500, 700);
  const found = readHexaFragments(frame)!;
  assert.equal(found.count, 2);
  assert.deepEqual(found.slash, { x: 1547, y: 742, w: 5, h: 5 });
  assert.equal(readHexaFragments(frame, found.slash)?.count, 2);
  assert.equal(readHexaFragments(screen(1920, 1080, 25), found.slash), null, "a closed window is not remembered");
  const state = createSearchState();
  const empty = { width: 20, height: 20, data: new Uint8ClampedArray(1600) };
  const icons = { meso: empty, point: empty, small: empty, large: empty, fragment: empty };
  assert.equal(analyzePixels({ pixels: frame, icons }, state).hexa?.count, 2);
  assert.deepEqual(state.hexa, found.slash);
});
test("zero and multi-digit counts are read wherever centering puts them", () => {
  for (const text of ["0", "10", "1269", "9906", "21"]) assert.equal(readHexaFragments(withCount(text))?.count, Number(text), text);
});
test("an unknown digit shape or a second group of marks makes the count unknown, never a different number", () => {
  assert.equal(readHexaFragments(withCount("12", { "2": ["ooooo", "ooooo", "ooooo", "ooooo", "ooooo"] })), null);
  const split = withCount("12");
  fill(split, 140, 41, 7, 7, [80, 34, 192]);
  HEXA_DIGITS["6"][0].forEach((row, dy) => [...row].forEach((tone, dx) => { if (tone === "o") split.data.set([255, 255, 255], ((42 + dy) * 169 + 141 + dx) * 4); }));
  assert.equal(readHexaFragments(split), null);
  const touched = withCount("12");
  touched.data.set([255, 255, 255], (41 * 169 + 121) * 4);
  assert.equal(readHexaFragments(touched), null, "white right above the digits is part of something larger");
  assert.equal(readHexaFragments(screen(400, 200, 30)), null);
});
test("drafted digit shapes never collide with one another or the slash", () => {
  const all = Object.entries(HEXA_DIGITS).flatMap(([key, shapes]) => shapes.map(shape => ({ key, shape: shape.join("|") })));
  for (const a of all) for (const b of all) if (a.key !== b.key) assert.notEqual(a.shape, b.shape, `${a.key} vs ${b.key}`);
});
test("fragments: inventory total first, the HEXA window when the inventory shows none, otherwise unknown", () => {
  const hexa = { count: 0, slash: { x: 0, y: 0, w: 5, h: 5 }, region: { x: 0, y: 0, w: 60, h: 21 } };
  const slot = { x: 0, y: 0, w: 30, h: 32 };
  assert.deepEqual(fragmentReading({ stacks: [slot], total: 1200 }, { ...hexa, count: 1199 }), { count: 1200, visible: true, fromHexa: false });
  assert.deepEqual(fragmentReading({ stacks: [], total: null }, hexa), { count: 0, visible: true, fromHexa: true }, "no slot + window → 0");
  assert.deepEqual(fragmentReading(null, { ...hexa, count: 7 }), { count: 7, visible: true, fromHexa: true }, "inventory closed");
  assert.deepEqual(fragmentReading({ stacks: [slot], total: null }, { ...hexa, count: 30 }), { count: 30, visible: true, fromHexa: true });
  assert.deepEqual(fragmentReading({ stacks: [], total: null }, null), { count: null, visible: false, fromHexa: false }, "no slot alone is not zero");
});
test("the full-screen HEXA search stays fast on busy screens", () => {
  const busy = screen(1920, 1080, 0);
  for (let y = 0; y < 1080; y++) for (let x = 0; x < 1920; x++) if ((x + y) % 3 === 0 || (x * 7 + y * 3) % 11 === 0) busy.data.set([250, 250, 250], (y * 1920 + x) * 4);
  const started = performance.now();
  assert.equal(readHexaFragments(busy), null);
  assert.ok(performance.now() - started < 1000, `took ${Math.round(performance.now() - started)}ms`);
});
