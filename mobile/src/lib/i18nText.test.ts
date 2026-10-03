import { buildI18n, detectLang, localized } from './i18nText';

describe('detectLang', () => {
  it('says Urdu for Urdu script and English otherwise', () => {
    expect(detectLang('کچن کے نل سے پانی ٹپک رہا ہے')).toBe('ur');
    expect(detectLang('Kitchen tap leaking')).toBe('en');
    expect(detectLang('nal se pani tapak raha hai')).toBe('en');
    expect(detectLang('Tap ٹپک رہا')).toBe('ur');
  });
});

describe('buildI18n', () => {
  it('trims both versions and keeps the source and AI flag', () => {
    expect(buildI18n('ur', ' Leaking tap ', ' نل لیک ', true)).toEqual({ source: 'ur', en: 'Leaking tap', ur: 'نل لیک', ai: true });
  });
});

describe('localized', () => {
  const i18n = { source: 'en' as const, en: 'Leaking tap', ur: 'نل لیک', ai: true };

  it('shows the reader language when there is a version of it', () => {
    expect(localized('Leaking tap', i18n, 'ur')).toEqual({ text: 'نل لیک', translated: true, original: 'Leaking tap' });
  });

  it('shows the original, not translated, to a reader of the source language', () => {
    expect(localized('Leaking tap', i18n, 'en')).toEqual({ text: 'Leaking tap', translated: false, original: 'Leaking tap' });
  });

  it('falls back to the original when there are no translations or no version for the reader', () => {
    expect(localized('Leaking tap', null, 'ur')).toEqual({ text: 'Leaking tap', translated: false, original: 'Leaking tap' });
    expect(localized('Leaking tap', undefined, 'ur').translated).toBe(false);
    expect(localized('Leaking tap', { source: 'en', en: 'Leaking tap' }, 'ur').text).toBe('Leaking tap');
  });

  it('handles missing original text', () => {
    expect(localized(null, i18n, 'ur').text).toBe('نل لیک');
    expect(localized(undefined, null, 'en').text).toBe('');
  });

  it('works without a source by comparing with the original', () => {
    expect(localized('Leaking tap', { en: 'Leaking tap', ur: 'نل لیک' }, 'ur').translated).toBe(true);
    expect(localized('Leaking tap', { en: 'Leaking tap', ur: 'نل لیک' }, 'en').translated).toBe(false);
  });
});
