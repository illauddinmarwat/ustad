import {
  OCR_DEFAULT_MIN_CONFIDENCE,
  parseCnicNumber,
  parseDocument,
  parseLicenseNumber,
} from './parsers';

describe('OCR parsers (Phase 3)', () => {
  it('extracts a hyphenated CNIC', () => {
    expect(parseCnicNumber('Holder: Ali — CNIC 35202-1234567-8 issued')).toBe('35202-1234567-8');
  });

  it('canonicalises a flat 13-digit CNIC', () => {
    expect(parseCnicNumber('Number 3520212345678 expires 2030')).toBe('35202-1234567-8');
  });

  it('returns null for short or missing CNIC', () => {
    expect(parseCnicNumber('no digits here')).toBeNull();
    expect(parseCnicNumber('1234')).toBeNull();
  });

  it('extracts a license number with mixed alphanumerics', () => {
    expect(parseLicenseNumber('License No: ABC1234567 issued')).toBe('ABC1234567');
  });

  it('returns null when no plausible license token', () => {
    expect(parseLicenseNumber('only words here')).toBeNull();
    expect(parseLicenseNumber('1234567890')).toBeNull();
  });

  it('parseDocument marks low-confidence runs as not acceptable', () => {
    const result = parseDocument({
      doc: 'cnic',
      text: '35202-1234567-8 — John Doe',
      confidence: 0.4,
    });
    expect(result.acceptable).toBe(false);
    expect(result.fields.cnic_number).toBe('35202-1234567-8');
  });

  it('parseDocument accepts high-confidence runs with at least one field', () => {
    const result = parseDocument({
      doc: 'cnic',
      text: '35202-1234567-8 — John Doe',
      confidence: 0.9,
    });
    expect(result.acceptable).toBe(true);
    expect(result.fields.cnic_number).toBe('35202-1234567-8');
  });

  it('default confidence threshold is reasonable', () => {
    expect(OCR_DEFAULT_MIN_CONFIDENCE).toBeGreaterThan(0);
    expect(OCR_DEFAULT_MIN_CONFIDENCE).toBeLessThan(1);
  });

  it('honors per-call minConfidence override', () => {
    const result = parseDocument({
      doc: 'license',
      text: 'License No: XYZ987654',
      confidence: 0.55,
      minConfidence: 0.5,
    });
    expect(result.acceptable).toBe(true);
    expect(result.fields.license_number).toBe('XYZ987654');
  });
});
