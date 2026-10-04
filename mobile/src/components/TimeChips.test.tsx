import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { TimeChips } from './TimeChips';

describe('TimeChips', () => {
  it('sets the time with one tap, in English words the Ustad can read', () => {
    const onChange = jest.fn();
    const u = render(<TimeChips value="" onChange={onChange} />);
    fireEvent.press(u.getByText('Tomorrow'));
    expect(onChange).toHaveBeenCalledWith('Tomorrow');
    expect(u.getByText('کل')).toBeTruthy();
  });

  it('clears the choice when the chosen one is tapped again', () => {
    const onChange = jest.fn();
    const u = render(<TimeChips value="Today" onChange={onChange} />);
    fireEvent.press(u.getByText('Today'));
    expect(onChange).toHaveBeenCalledWith('');
  });
});
