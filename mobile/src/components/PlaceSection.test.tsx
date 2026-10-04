import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import { PlaceSection } from './PlaceSection';

describe('PlaceSection', () => {
  it('asks to choose a place and keeps the fields hidden until it is tapped', () => {
    const u = render(
      <PlaceSection summary="">
        <Text>FIELDS</Text>
      </PlaceSection>,
    );
    expect(u.getByText('Choose a place')).toBeTruthy();
    expect(u.queryByText('FIELDS')).toBeNull();
    fireEvent.press(u.getByLabelText('Where is the work?'));
    expect(u.getByText('FIELDS')).toBeTruthy();
    fireEvent.press(u.getByLabelText('Where is the work?'));
    expect(u.queryByText('FIELDS')).toBeNull();
  });

  it('shows the place that was chosen', () => {
    const u = render(
      <PlaceSection summary="Gulshan, Karachi">
        <Text>FIELDS</Text>
      </PlaceSection>,
    );
    expect(u.getByText('Gulshan, Karachi')).toBeTruthy();
    expect(u.queryByText('Choose a place')).toBeNull();
  });
});
