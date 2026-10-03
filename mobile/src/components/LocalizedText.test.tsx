import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { LocalizedText } from './LocalizedText';

const mockAuth: { current: { language?: 'en' | 'ur' } } = { current: { language: 'en' } };
jest.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth.current }));

const i18n = { source: 'en' as const, en: 'Kitchen tap leaking', ur: 'کچن کے نل سے پانی ٹپک رہا ہے', ai: true };

beforeEach(() => {
  mockAuth.current = { language: 'en' };
});

describe('LocalizedText', () => {
  it('shows the original to a reader of the source language, with no link', () => {
    const u = render(<LocalizedText original="Kitchen tap leaking" i18n={i18n} />);
    expect(u.getByText('Kitchen tap leaking')).toBeTruthy();
    expect(u.queryByText('Show original')).toBeNull();
  });

  it('shows the reader language and a way back to the original', () => {
    mockAuth.current = { language: 'ur' };
    const u = render(<LocalizedText original="Kitchen tap leaking" i18n={i18n} />);
    expect(u.getByText('کچن کے نل سے پانی ٹپک رہا ہے')).toBeTruthy();
    fireEvent.press(u.getByText('Show original'));
    expect(u.getByText('Kitchen tap leaking')).toBeTruthy();
    fireEvent.press(u.getByText('Show translation'));
    expect(u.getByText('کچن کے نل سے پانی ٹپک رہا ہے')).toBeTruthy();
  });

  it('shows no link on cards (compact)', () => {
    mockAuth.current = { language: 'ur' };
    const u = render(<LocalizedText original="Kitchen tap leaking" i18n={i18n} compact />);
    expect(u.getByText('کچن کے نل سے پانی ٹپک رہا ہے')).toBeTruthy();
    expect(u.queryByText('Show original')).toBeNull();
  });

  it('falls back to the original when there are no translations', () => {
    mockAuth.current = { language: 'ur' };
    const u = render(<LocalizedText original="Kitchen tap leaking" i18n={null} />);
    expect(u.getByText('Kitchen tap leaking')).toBeTruthy();
    expect(u.queryByText('Show original')).toBeNull();
  });

  it('reads English when the context has no language yet', () => {
    mockAuth.current = {};
    const u = render(<LocalizedText original="Kitchen tap leaking" i18n={i18n} />);
    expect(u.getByText('Kitchen tap leaking')).toBeTruthy();
  });

  it('lays Urdu text out right to left', () => {
    mockAuth.current = { language: 'ur' };
    const u = render(<LocalizedText original="Kitchen tap leaking" i18n={i18n} />);
    const style = u.getByText('کچن کے نل سے پانی ٹپک رہا ہے').props.style;
    expect(JSON.stringify(style)).toContain('rtl');
  });
});
