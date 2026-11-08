'use strict';
// Otome Hearth character looks on NovelAI V5: ask NovelAI for a real transparent background ("Transparent BG")
// instead of a flat chroma backdrop that the Engine's colour-key cleanup then cuts out (that cut-out eats
// skin and shadows near the backdrop colour and leaves holes in the figure).
//
// Loaded with NODE_OPTIONS --require; does not modify Marinara or Otome Hearth files.
// - Touches only POST https://image.novelai.net/ai/generate-image with a JSON body, on a V5 model
//   (nai-diffusion-5 / -full / -curated), whose prompt carries Otome Hearth's look-backdrop phrase
//   ("full body, standing, neutral pose, plain flat solid chroma green #00FF00 background" or
//   "... plain flat mid-grey background"). Scenes, places, CGs and every other app stay as they are.
// - Replaces that backdrop phrase with "transparent background" and sets the web client's
//   parameters.tag_hint_transparent_background = true and parameters.straight_alpha = true.
// - If NovelAI rejects the changed request (4xx), sends the original request unchanged, so nothing gets worse.
// - The returned PNG already has alpha, so the Engine's cleanup leaves it as it is (alreadyTransparent).
// - Turn it off: OTOME_NOVELAI_TRANSPARENT_OFF=1.
const TAG = '[otome-novelai-transparent]';
const originalFetch = globalThis.fetch;

const BACKDROP = /plain flat (?:solid )?(?:chroma (?:green|magenta|cyan)\s*#?[0-9a-f]{0,6}|mid-grey|mid grey)\s*background/i;
const MARKER = /full body,\s*standing,\s*neutral pose/i;
const isV5 = (model) => /^nai-diffusion-5(?:-(?:curated|full))?$/i.test(String(model || '').trim());

function urlOf(input) {
  try { return new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url); } catch (_) { return null; }
}
function swapBackdrop(text) {
  if (typeof text !== 'string') return text;
  return text.replace(BACKDROP, 'transparent background');
}

// Otome Hearth's expression sheet asks for an *edit* of the look ("Edit the reference image of X: change ONLY
// the facial expression ... keep pose, framing, background"). NovelAI V5 can't take that reference (the Engine
// drops it), so V5 got a sentence with no pose and no backdrop: it drew squats/crouches on white, and the
// colour-key cut-out then ate skin, bandages and highlights. On V5 that prompt is rebuilt as a look prompt:
// features, outfit, the expression, full body standing, transparent background.
const EXPRESSION = /Edit the reference image of [^:]+: change ONLY the facial expression, to (?:an? )?([\s\S]+?)\.\s*Keep everything else[\s\S]*?Permanent features:\s*([\s\S]+?)\.(?:\s*Outfit:\s*([\s\S]+?)\.)?\s*(?:A nonsexual[\s\S]*?(?:art style\.|$)|$)/i;
const POSE_TAGS = 'full body, standing, neutral pose, arms at sides, front view, transparent background';
const POSE_NEGATIVE = 'sitting, squatting, crouching, kneeling, lying, cropped legs, white background, simple background, floor, cast shadow';

function rewriteExpression(text) {
  if (typeof text !== 'string') return text;
  return text.replace(EXPRESSION, (_, expr, features, outfit) => [
    features.trim(),
    outfit ? outfit.trim() : '',
    expr.trim().replace(/:\s*/, ', '),
    POSE_TAGS,
  ].filter(Boolean).join(', '));
}
function addNegative(params) {
  const join = (s) => (String(s || '').trim() ? `${String(s).trim()}, ${POSE_NEGATIVE}` : POSE_NEGATIVE);
  params.negative_prompt = join(params.negative_prompt);
  const neg = params.v4_negative_prompt?.caption;
  if (neg && typeof neg === 'object') neg.base_caption = join(neg.base_caption);
}

function rewrite(body) {
  if (!body || typeof body !== 'object' || !isV5(body.model)) return null;
  const input = String(body.input || '');
  const look = MARKER.test(input) && BACKDROP.test(input);
  const expression = !look && EXPRESSION.test(input);
  if (!look && !expression) return null;
  const fix = look ? swapBackdrop : rewriteExpression;
  const next = JSON.parse(JSON.stringify(body));
  next.input = fix(next.input);
  const cap = next.parameters?.v4_prompt?.caption;
  if (cap && typeof cap.base_caption === 'string') cap.base_caption = fix(cap.base_caption);
  next.parameters = next.parameters || {};
  addNegative(next.parameters);
  next.parameters.tag_hint_transparent_background = true;
  next.parameters.straight_alpha = true;
  return next;
}

// One-shot look override: put look-override/<character name>.png next to this file, then press
// "다시 그리기" on that character's look in Otome Hearth. The game gets that picture instead of a new
// NovelAI image (and saves, cuts out and links it through its own code); the file is then renamed
// to <name>.used-<time>.png so the next repaint draws normally again. Expressions are not affected.
const fs = require('fs');
const path = require('path');
const OVERRIDE_DIR = path.join(__dirname, 'look-override');
const isOtomeCall = () => /(?:^|[\\/])otome-forge(?:-\d[^\\/]*)?[\\/](?:\d[^\\/]*[\\/])?server\.mjs/.test(new Error().stack || '');

function takeOverride(input, init) {
  const url = urlOf(input);
  if (!url || url.pathname !== '/api/characters/avatar-generation'
    || String(init?.method || '').toUpperCase() !== 'POST' || typeof init?.body !== 'string') return null;
  let body;
  try { body = JSON.parse(init.body); } catch (_) { return null; }
  const name = String(body?.name || '').trim();
  const prompt = String(body?.appearance || '');
  if (!name || !MARKER.test(prompt) || /[\\/:*?"<>|]/.test(name)) return null;
  const file = path.join(OVERRIDE_DIR, `${name}.png`);
  if (!fs.existsSync(file) || !isOtomeCall()) return null;
  const png = fs.readFileSync(file);
  try { fs.renameSync(file, path.join(OVERRIDE_DIR, `${name}.used-${Date.now()}.png`)); } catch (_) {}
  console.info(`${TAG} look override: gave Otome Hearth ${path.basename(file)} for ${name}`);
  return new Response(JSON.stringify({ image: `data:image/png;base64,${png.toString('base64')}`, prompt }),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
}

if (process.env.OTOME_NOVELAI_TRANSPARENT_OFF === '1') {
  console.info(`${TAG} off (OTOME_NOVELAI_TRANSPARENT_OFF=1)`);
} else if (typeof originalFetch === 'function') {
  globalThis.fetch = async function otomeNovelAiTransparent(input, init) {
    const override = takeOverride(input, init);
    if (override) return override;
    const url = urlOf(input);
    if (!url || url.hostname !== 'image.novelai.net' || url.pathname !== '/ai/generate-image'
      || String(init?.method || '').toUpperCase() !== 'POST' || typeof init?.body !== 'string') {
      return originalFetch.apply(this, arguments);
    }
    let body;
    try { body = JSON.parse(init.body); } catch (_) { return originalFetch.apply(this, arguments); }
    const next = rewrite(body);
    if (!next) return originalFetch.apply(this, arguments);

    console.info(`${TAG} Otome Hearth look on ${body.model}: asking NovelAI for a transparent background`);
    const res = await originalFetch.call(this, input, { ...init, body: JSON.stringify(next) });
    if (res.ok) return res;
    if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 402 && res.status !== 429) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 200); } catch (_) {}
      console.warn(`${TAG} NovelAI refused Transparent BG (${res.status}${detail ? `: ${detail}` : ''}); sending the original request`);
      return originalFetch.apply(this, arguments);
    }
    return res;
  };
  console.info(`${TAG} preload loaded; Otome Hearth looks on NovelAI V5 use Transparent BG`);
}

module.exports = { rewrite, swapBackdrop };
