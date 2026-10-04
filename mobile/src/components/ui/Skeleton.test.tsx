import React from 'react';
import { render } from '@testing-library/react-native';

import { SkeletonList } from './Skeleton';

describe('SkeletonList', () => {
  it('shows the asked number of loading cards', () => {
    const u = render(<SkeletonList count={4} />);
    expect(u.getAllByLabelText('Loading')).toHaveLength(4);
  });
});
