import {
  AUDIT_ACTION_LABELS,
  AUDIT_ACTION_COLORS,
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
  AUDIT_ACTION_HEX,
  CHART_PALETTE,
  chartGradient,
  AuditAction,
} from './audit-log.model';

describe('audit-log.model', () => {
  // --- Constants ---

  it('AUDIT_ACTIONS has 9 actions', () => {
    expect(AUDIT_ACTIONS.length).toBe(9);
  });

  it('AUDIT_ACTION_LABELS has a label for every action', () => {
    for (const action of AUDIT_ACTIONS) {
      expect(AUDIT_ACTION_LABELS[action]).toBeTruthy();
    }
  });

  it('AUDIT_ACTION_COLORS has a color for every action', () => {
    for (const action of AUDIT_ACTIONS) {
      expect(AUDIT_ACTION_COLORS[action]).toBeTruthy();
    }
  });

  it('AUDIT_RESOURCE_TYPES has expected resource types', () => {
    expect(AUDIT_RESOURCE_TYPES).toContain('client');
    expect(AUDIT_RESOURCE_TYPES).toContain('engagement');
    expect(AUDIT_RESOURCE_TYPES).toContain('finding');
    expect(AUDIT_RESOURCE_TYPES).toContain('member');
    expect(AUDIT_RESOURCE_TYPES).toContain('auth');
  });

  it('AUDIT_ACTION_HEX has hex values for known actions', () => {
    expect(AUDIT_ACTION_HEX['create']).toBe('#00ffb3');
    expect(AUDIT_ACTION_HEX['delete']).toBe('#ff3b7a');
    expect(AUDIT_ACTION_HEX['update']).toBe('#00b7ff');
  });

  it('CHART_PALETTE has 12 colors', () => {
    expect(CHART_PALETTE.length).toBe(12);
  });

  it('CHART_PALETTE entries are hex color strings', () => {
    for (const color of CHART_PALETTE) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  // --- chartGradient ---

  it('chartGradient returns array of length count', () => {
    const result = chartGradient(5);
    expect(result.length).toBe(5);
  });

  it('chartGradient returns rgb() strings', () => {
    const result = chartGradient(3);
    for (const color of result) {
      expect(color).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
    }
  });

  it('chartGradient with count=1 returns the "from" color', () => {
    const result = chartGradient(1, '#ff0000', '#0000ff');
    expect(result.length).toBe(1);
    expect(result[0]).toBe('rgb(255,0,0)');
  });

  it('chartGradient with count=0 returns empty array', () => {
    const result = chartGradient(0);
    expect(result.length).toBe(0);
  });

  it('chartGradient with count=2 returns from and to colors', () => {
    const result = chartGradient(2, '#ff0000', '#0000ff');
    expect(result[0]).toBe('rgb(255,0,0)');
    expect(result[1]).toBe('rgb(0,0,255)');
  });

  it('chartGradient with count=3 interpolates midpoint', () => {
    const result = chartGradient(3, '#ff0000', '#0000ff');
    expect(result[0]).toBe('rgb(255,0,0)');
    expect(result[1]).toBe('rgb(128,0,128)'); // midpoint
    expect(result[2]).toBe('rgb(0,0,255)');
  });

  it('chartGradient uses default colors when not specified', () => {
    const result = chartGradient(2);
    // Default from = '#38bdf8', to = '#164e63'
    expect(result[0]).toBe('rgb(56,189,248)');
    expect(result[1]).toBe('rgb(22,78,99)');
  });
});
