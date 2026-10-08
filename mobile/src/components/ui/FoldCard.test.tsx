import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import { FoldCard } from './FoldCard';

describe('FoldCard', () => {
  it('starts folded or open as asked and toggles from the title row', () => {
    const u = render(
      <FoldCard titleId="payment.title" defaultOpen={false}>
        <Text>inside</Text>
      </FoldCard>,
    );
    expect(u.queryByText('inside')).toBeNull();
    fireEvent.press(u.getByRole('button'));
    expect(u.getByText('inside')).toBeTruthy();
    fireEvent.press(u.getByRole('button'));
    expect(u.queryByText('inside')).toBeNull();
  });
});
