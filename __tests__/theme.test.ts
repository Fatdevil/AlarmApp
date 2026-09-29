import { palettes } from '../src/theme';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe.each(Object.entries(palettes))('%s tema uppfyller WCAG AA', (_, p) => {
  const backgrounds = { background: p.background, surface: p.surface, surfaceElevated: p.surfaceElevated };
  const texts = {
    textPrimary: p.textPrimary,
    textSecondary: p.textSecondary,
    textMuted: p.textMuted,
    accentText: p.accentText,
    danger: p.danger,
    warning: p.warning,
    success: p.success,
  };

  for (const [tName, t] of Object.entries(texts)) {
    for (const [bName, b] of Object.entries(backgrounds)) {
      it(`${tName} på ${bName} ≥ 4.5:1`, () => {
        expect(contrast(t, b)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it('text på accentknapp ≥ 4.5:1', () => {
    expect(contrast(p.onAccent, p.accent)).toBeGreaterThanOrEqual(4.5);
  });
});
