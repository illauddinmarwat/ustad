import React from 'react';
import { render } from '@testing-library/react-native';

import { BiText } from './BiText';

describe('BiText', () => {
  it('renders English and Urdu lines together by default', () => {
    const { getByText } = render(<BiText id="dashboard.hero.title" variant="displayLg" />);
    expect(getByText('Get free quotes from local skilled workers')).toBeTruthy();
    expect(getByText('مقامی ہنر مند کارکنوں سے مفت تخمینے حاصل کریں')).toBeTruthy();
  });

  it('hides the Urdu line when `hideUrdu` is set', () => {
    const { getByText, queryByText } = render(
      <BiText id="common.signIn" hideUrdu />
    );
    expect(getByText('Sign in')).toBeTruthy();
    expect(queryByText('لاگ ان')).toBeNull();
  });

  it('falls back to body variant tones', () => {
    const { getByText } = render(<BiText id="common.email" tone="muted" />);
    expect(getByText('Email')).toBeTruthy();
    expect(getByText('ای میل')).toBeTruthy();
  });
});
