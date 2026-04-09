/**
 * DreamPlay Media Indexer — Brand Config
 * Self-contained copy. Do NOT import from the Asset Generator project.
 * Updated: 2026-04-03
 */

// ── Brand Guardrails ────────────────────────────────────────────────────────
// These are baked into every AI prompt to prevent hallucinations.

export const DREAMPLAY_BRAND_RULES = `
DREAMPLAY PIANOS — MANDATORY BRAND GUARDRAILS (apply to every generation):

VISUAL STYLE:
- Color palette: midnight black, warm gold (#C9A84C), deep charcoal, ivory white
- Mood: aspirational, cinematic, luxury, emotionally resonant
- Lighting: studio-grade, high contrast, dramatic shadows, photorealistic
- Background: dark moody (default) or clean white for commercial shots
- Quality: 8K ultra-detail, sharp product photography, photorealistic rendering

CRITICAL ACCURACY REQUIREMENTS — NEVER VIOLATE:
(1) KEYBOARD GEOMETRY: Piano keys MUST follow the standard alternating pattern — black keys in groups of 2 then 3 (2-black, 3-black, 2-black, 3-black repeating). Never render evenly-spaced black keys or wrong groupings. This is non-negotiable.
(2) KEY PROPORTIONS: White keys are taller and wider. Black keys are shorter, narrower, and raised above white keys. Never flatten or distort these proportions.
(3) DREAMPLAY LOGO: The DreamPlay logo must be clearly visible on any shot showing the piano body. It appears above the keyboard on the instrument's face panel.
(4) PHYSICAL CONSISTENCY: No floating objects, no impossible geometry, no distorted perspective, correct light physics with accurate reflections and real material surface textures.
(5) DS MODEL ACCURACY: The DS5.5 is 7/8 size (slightly narrower keys), DS6.0 is universal standard size, DS6.5 is conventional/wide. Represent key spacing accordingly.
`.trim();

// ── DS Model Definitions ─────────────────────────────────────────────────────

export const DS_MODELS = {
  'DS5.5': {
    label: 'DS5.5® (Zone A)',
    description: '7/8 size keyboard for small hands, hand span under 7.6 inches, slightly narrower key spacing',
    zone: 'Zone A',
  },
  'DS6.0': {
    label: 'DS6.0® (Zone B)',
    description: 'Universal standard size, hand span 7.6"–8.5", the benchmark model',
    zone: 'Zone B',
  },
  'DS6.5': {
    label: 'DS6.5™ (Zone C)',
    description: 'Conventional/wide size for larger hands, hand span over 8.5"',
    zone: 'Zone C',
  },
} as const;

// ── Prompt Presets ──────────────────────────────────────────────────────────

export const SUBJECT_PRESETS = [
  { id: 'hands-keys', label: 'Hands on Keys', prompt: 'pianist\'s hands elegantly placed on the piano keys, showcasing ergonomic hand positioning' },
  { id: 'piano-full', label: 'Full Piano', prompt: 'full view of the DreamPlay piano, entire instrument visible from front angle' },
  { id: 'closeup-keys', label: 'Close-up Keys', prompt: 'extreme close-up of the piano keyboard, highlighting key detail and craftsmanship' },
  { id: 'lifestyle', label: 'Lifestyle Scene', prompt: 'pianist in a premium lifestyle setting, emotionally engaged with the instrument' },
  { id: 'talking-head', label: 'Talking Head', prompt: 'presenter or musician talking directly to camera with the piano visible behind them' },
  { id: 'product-only', label: 'Product Only', prompt: 'isolated product shot of the DreamPlay piano, no hands, clean and commercial' },
];

export const SHOT_TYPE_PRESETS = [
  { id: 'studio-product', label: 'Studio Product', prompt: 'studio product photography, perfectly lit, sharp focus, professional commercial quality' },
  { id: 'cinematic-overhead', label: 'Cinematic Overhead', prompt: 'cinematic overhead/top-down shot, dramatic angle, moody atmospheric lighting' },
  { id: 'pov-performer', label: 'POV Performer', prompt: 'point-of-view shot from the pianist\'s perspective looking down at the keys' },
  { id: 'lifestyle-scene', label: 'Lifestyle Scene', prompt: 'wide lifestyle scene, room environment visible, aspirational home or studio setting' },
  { id: 'detail-macro', label: 'Detail Macro', prompt: 'macro detail shot, extreme close-up on a specific element (knobs, logo, key edge, material texture)' },
  { id: 'three-quarter', label: '3/4 Angle', prompt: 'classic three-quarter angle product shot, slight elevation, premium e-commerce framing' },
];

export const MOOD_PRESETS = [
  { id: 'cinematic-dark', label: '🎬 Cinematic Dark', prompt: 'cinematic, dark and moody, deep shadows, dramatic rim lighting, film noir atmosphere, high contrast' },
  { id: 'luxury-minimal', label: '✨ Luxury Minimal', prompt: 'luxury minimal, clean and airy, editorial white space, premium brand aesthetic, refined simplicity' },
  { id: 'warm-lifestyle', label: '☀️ Warm Lifestyle', prompt: 'warm and inviting, golden hour light, cozy aspirational lifestyle, emotional connection, authentic feel' },
  { id: 'sharp-commercial', label: '📸 Sharp Commercial', prompt: 'sharp commercial product photography, pure white or seamless background, neutral lighting, maximum clarity' },
  { id: 'concert-stage', label: '🎹 Concert Stage', prompt: 'concert performance atmosphere, stage lighting, dramatic spotlights, professional recital hall environment' },
];

export const CAMPAIGN_PRESETS = [
  { id: 'ceo-spotlight', label: 'CEO Spotlight', prompt: 'CEO or founder presenting the DreamPlay piano, authoritative and charismatic, thought leadership tone' },
  { id: 'piano-comparison', label: 'Piano Comparison', prompt: 'side-by-side or contextual comparison showing the difference in keyboard sizes between DS models' },
  { id: 'la-campanella', label: 'La Campanella', prompt: 'virtuosic piano performance context, La Campanella by Liszt energy, technically demanding, passionate playing' },
  { id: 'namm', label: 'NAMM / Trade Show', prompt: 'trade show exhibition context, professional musicians demoing the piano, industry event atmosphere' },
  { id: 'handspan-demo', label: 'Handspan Demo', prompt: 'educational demonstration of hand span measurement on the piano keys, Zone system visualization' },
  { id: 'none', label: 'No Campaign', prompt: '' },
];

export const OUTPUT_FORMAT_PRESETS = [
  { id: 'hero-image', label: 'Hero Image', prompt: 'hero product image, website banner format, wide aspect ratio, commanding presence' },
  { id: 'social-reel', label: 'Social Reel', prompt: 'vertical 9:16 format optimized for Instagram/TikTok Reels, mobile-first framing' },
  { id: 'email-banner', label: 'Email Banner', prompt: '600px wide email banner format, clean and impactful, fast-loading aesthetic' },
  { id: 'product-carousel', label: 'Product Carousel', prompt: 'square 1:1 format for e-commerce product carousel, clean background, all angles' },
];
