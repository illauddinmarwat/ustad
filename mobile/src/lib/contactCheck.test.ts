import { looksLikeContact, normalizeDigits } from './contactCheck';

describe('looksLikeContact', () => {
  it.each([
    'call 0300 1234567',
    'whatsapp me',
    'mail me at a.b@example.com',
    'see www.example.com',
    '+92 300 1234567',
  ])('flags %s', (t) => expect(looksLikeContact(t)).toBe(true));

  it.each(['Fix kitchen tap', 'Room 12, street 4', 'Starts at 5pm tomorrow'])('allows %s', (t) =>
    expect(looksLikeContact(t)).toBe(false),
  );

  it('flags a phone number written in Urdu digits', () => {
    expect(looksLikeContact('رابطہ ۰۳۰۰۱۲۳۴۵۶۷')).toBe(true);
  });

  it('flags a phone number written in Arabic-Indic digits', () => {
    expect(looksLikeContact('٠٣٠٠١٢٣٤٥٦٧')).toBe(true);
  });
});

describe('normalizeDigits', () => {
  it('turns Urdu and Arabic-Indic digits into Latin digits and leaves other text alone', () => {
    expect(normalizeDigits('۰۱۲۳۴۵۶۷۸۹ ٠١٢٣٤٥٦٧٨٩ ab')).toBe('0123456789 0123456789 ab');
  });
});
