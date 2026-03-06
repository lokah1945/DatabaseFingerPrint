/**
 * STEALTH FONT FINGERPRINTING SPOOFING MODULE V7
 * 
 * Handles all font-based fingerprinting methods:
 * 1. Canvas text rendering detection
 * 2. @font-face fallback detection
 * 3. document.fonts API
 * 4. CSS font enumeration
 * 5. Font metrics measurement
 * 
 * Integration: Works with V7 database font personas
 */

// ============================================================================
// FONT LIST BUILDER
// ============================================================================

function buildFontList(fontProfile, fontDatabase) {
  /**
   * Build complete font list from persona packs
   * 
   * @param {Object} fontProfile - From hardware.font_profile
   * @param {Object} fontDatabase - Complete font database
   * @returns {Array} - Complete list of available fonts
   */

  const os = fontProfile.os || 'windows';
  const packs = fontProfile.packs || ['base'];

  const availableFonts = new Set();

  // Build from packs
  for (const packName of packs) {
    if (fontDatabase[os] && fontDatabase[os][packName]) {
      const fonts = fontDatabase[os][packName].fonts || [];
      fonts.forEach(font => availableFonts.add(font));
    }
  }

  return Array.from(availableFonts).sort();
}

// ============================================================================
// PATCH: Canvas Text Rendering
// ============================================================================

async function patchCanvasFonts(context, fontList) {
  /**
   * Override canvas text rendering to match font availability
   * Prevents detection via pixel-perfect font rendering
   */

  await context.addInitScript(data => {
    const allowedFonts = new Set(data.fontList);

    // Override CanvasRenderingContext2D.font setter
    const originalFontDescriptor = Object.getOwnPropertyDescriptor(
      CanvasRenderingContext2D.prototype,
      'font'
    );

    Object.defineProperty(CanvasRenderingContext2D.prototype, 'font', {
      get: function() {
        return originalFontDescriptor.get.call(this);
      },
      set: function(value) {
        // Parse font family from font string
        // e.g., "14px Arial, sans-serif" -> ["Arial", "sans-serif"]
        const fontFamilies = value.match(/(?:\"|')?([^"',;]+)(?:\"|')?/g) || [];

        // Check if requested font is in allowed list
        let hasAllowedFont = false;
        for (const family of fontFamilies) {
          const cleanFamily = family.replace(/["\']/g, '').trim();
          if (allowedFonts.has(cleanFamily)) {
            hasAllowedFont = true;
            break;
          }
        }

        // If no allowed font, fallback to generic
        if (!hasAllowedFont && fontFamilies.length > 0) {
          const fontSize = value.match(/\d+px/) || ['14px'];
          const fallback = allowedFonts.has('Arial') ? 'Arial' : 
                          allowedFonts.has('DejaVu Sans') ? 'DejaVu Sans' :
                          allowedFonts.has('Helvetica') ? 'Helvetica' : 'sans-serif';
          value = `${fontSize[0]} ${fallback}`;
        }

        return originalFontDescriptor.set.call(this, value);
      },
      configurable: true
    });

  }, { fontList });
}

// ============================================================================
// PATCH: document.fonts API
// ============================================================================

async function patchDocumentFonts(context, fontList) {
  /**
   * Override document.fonts.check() and related methods
   * Chrome/Edge expose this API for font availability checking
   */

  await context.addInitScript(data => {
    const allowedFonts = new Set(data.fontList);

    if (typeof document !== 'undefined' && document.fonts) {

      // Override FontFaceSet.check()
      const originalCheck = FontFaceSet.prototype.check;
      FontFaceSet.prototype.check = function(font, text) {
        // Parse font family from font string
        const fontFamily = font.match(/(?:"|')?([^"',;]+)(?:"|')?/);
        if (fontFamily && fontFamily[1]) {
          const cleanFamily = fontFamily[1].trim();

          // Return false if font not in allowed list
          if (!allowedFonts.has(cleanFamily)) {
            return false;
          }
        }

        // Call original if font is allowed
        return originalCheck.call(this, font, text);
      };

      // Override FontFaceSet.load()
      const originalLoad = FontFaceSet.prototype.load;
      FontFaceSet.prototype.load = function(font, text) {
        const fontFamily = font.match(/(?:"|')?([^"',;]+)(?:"|')?/);
        if (fontFamily && fontFamily[1]) {
          const cleanFamily = fontFamily[1].trim();

          // Reject if font not in allowed list
          if (!allowedFonts.has(cleanFamily)) {
            return Promise.reject(new Error('Font not available'));
          }
        }

        return originalLoad.call(this, font, text);
      };
    }

  }, { fontList });
}

// ============================================================================
// PATCH: @font-face Detection (CSS)
// ============================================================================

async function patchFontFaceDetection(context, fontList) {
  /**
   * Override CSS @font-face detection methods
   * Prevents enumeration via local() font loading
   */

  await context.addInitScript(data => {
    const allowedFonts = new Set(data.fontList);

    // Override CSSFontFaceRule (if available)
    if (typeof CSSFontFaceRule !== 'undefined') {

      const originalInsertRule = CSSStyleSheet.prototype.insertRule;
      CSSStyleSheet.prototype.insertRule = function(rule, index) {

        // Check if it's a @font-face rule with local()
        if (rule.includes('@font-face') && rule.includes('local(')) {
          const localMatches = rule.match(/local\(["']?([^"'\)]+)["']?\)/g);

          if (localMatches) {
            let hasAllowedFont = false;
            for (const match of localMatches) {
              const fontName = match.match(/local\(["']?([^"'\)]+)["']?\)/)[1];
              if (allowedFonts.has(fontName)) {
                hasAllowedFont = true;
                break;
              }
            }

            // Block rule if no allowed fonts
            if (!hasAllowedFont) {
              return index; // Silently ignore
            }
          }
        }

        return originalInsertRule.call(this, rule, index);
      };
    }

  }, { fontList });
}

// ============================================================================
// PATCH: Font Metrics Measurement
// ============================================================================

async function patchFontMetrics(context, fontList, profileId) {
  /**
   * Add subtle variations to font metrics to prevent fingerprinting
   * while keeping measurements consistent per profile
   */

  await context.addInitScript(data => {
    const allowedFonts = new Set(data.fontList);

    // Create PRNG for consistent variations
    function createPRNG(seed) {
      let state = 0;
      for (let i = 0; i < seed.length; i++) {
        state = ((state << 5) - state + seed.charCodeAt(i)) | 0;
      }
      return function() {
        state = (state * 1664525 + 1013904223) | 0;
        return Math.abs(state) / 0x100000000;
      };
    }

    const prng = createPRNG(data.profileId);

    // Override measureText
    const originalMeasureText = CanvasRenderingContext2D.prototype.measureText;
    CanvasRenderingContext2D.prototype.measureText = function(text) {
      const metrics = originalMeasureText.call(this, text);

      // Extract font family from current font
      const currentFont = this.font || '10px sans-serif';
      const fontFamily = currentFont.match(/(?:"|')?([^"',;]+)(?:"|')?/);

      if (fontFamily && fontFamily[1]) {
        const cleanFamily = fontFamily[1].trim();

        // If font not in allowed list, add noise to metrics
        if (!allowedFonts.has(cleanFamily)) {
          const noise = (prng() - 0.5) * 0.1; // ±0.05 variance

          Object.defineProperty(metrics, 'width', {
            value: metrics.width * (1 + noise),
            configurable: true
          });
        }
      }

      return metrics;
    };

  }, { fontList, profileId });
}

// ============================================================================
// MAIN FONT SPOOFING FUNCTION
// ============================================================================

async function injectFontSpoofing(context, fingerprint, fontDatabase) {
  /**
   * Main function to inject all font spoofing patches
   * 
   * @param {Object} context - Playwright browser context
   * @param {Object} fingerprint - Complete fingerprint from device_manager
   * @param {Object} fontDatabase - Font database JSON
   */

  // Build font list from persona
  const fontList = buildFontList({
    os: fingerprint.os,
    packs: fingerprint.font_profile.packs
  }, fontDatabase);

  console.log(`[Font Spoofing] Persona: ${fingerprint.font_profile.persona}`);
  console.log(`[Font Spoofing] Loaded ${fontList.length} fonts from packs: ${fingerprint.font_profile.packs.join(', ')}`);

  // Apply all patches
  await patchCanvasFonts(context, fontList);
  await patchDocumentFonts(context, fontList);
  await patchFontFaceDetection(context, fontList);
  await patchFontMetrics(context, fontList, fingerprint.fingerprintSeed);

  console.log('[Font Spoofing] All patches applied successfully');
}

// ============================================================================
// EXPORT
// ============================================================================

module.exports = {
  injectFontSpoofing,
  buildFontList,
  patchCanvasFonts,
  patchDocumentFonts,
  patchFontFaceDetection,
  patchFontMetrics
};
