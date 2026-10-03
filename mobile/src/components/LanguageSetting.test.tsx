import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { LanguageSetting } from './LanguageSetting';

const mockSetLanguage = jest.fn();
const mockAuth: { current: { language?: 'en' | 'ur'; setLanguage: (l: string) => Promise<void> } } = {
  current: { language: 'en', setLanguage: (l) => mockSetLanguage(l) },
};
jest.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth.current }));

beforeEach(() => {
  mockSetLanguage.mockReset();
  mockSetLanguage.mockResolvedValue(undefined);
  mockAuth.current = { language: 'en', setLanguage: (l) => mockSetLanguage(l) };
});

describe('LanguageSetting', () => {
  it('shows both choices and explains what the setting does', () => {
    const u = render(<LanguageSetting />);
    expect(u.getByText('Language for posts')).toBeTruthy();
    expect(u.getByText('English')).toBeTruthy();
    expect(u.getByText('Urdu')).toBeTruthy();
  });

  it('switches to Urdu', async () => {
    const u = render(<LanguageSetting />);
    fireEvent.press(u.getByText('Urdu'));
    await waitFor(() => expect(mockSetLanguage).toHaveBeenCalledWith('ur'));
  });

  it('does nothing when the current language is chosen again', () => {
    const u = render(<LanguageSetting />);
    fireEvent.press(u.getByText('English'));
    expect(mockSetLanguage).not.toHaveBeenCalled();
  });

  it('says so when the change could not be saved', async () => {
    mockSetLanguage.mockRejectedValue(new Error('offline'));
    const u = render(<LanguageSetting />);
    fireEvent.press(u.getByText('Urdu'));
    expect(await u.findByText(/Something went wrong/)).toBeTruthy();
  });
});
