import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { WizardShell } from './WizardShell';

const wrap = (node: React.ReactElement) =>
  render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
    >
      {node}
    </SafeAreaProvider>,
  );

describe('WizardShell', () => {
  it('shows the step, its name and the content in English and Urdu', () => {
    const u = wrap(
      <WizardShell step={2} total={3} stepNameId="post.step.details" onNext={jest.fn()} onBack={jest.fn()}>
        <Text>content</Text>
      </WizardShell>,
    );
    expect(u.getByText('Step 2 of 3')).toBeTruthy();
    expect(u.getByText('مرحلہ 2 از 3')).toBeTruthy();
    expect(u.getByText('Details')).toBeTruthy();
    expect(u.getByText('content')).toBeTruthy();
  });

  it('has no Back button on the first step and calls Next', () => {
    const onNext = jest.fn();
    const u = wrap(
      <WizardShell step={1} total={3} stepNameId="post.step.media" onNext={onNext}>
        <Text>x</Text>
      </WizardShell>,
    );
    expect(u.queryByText('Back')).toBeNull();
    fireEvent.press(u.getByText('Next'));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('calls Back, and does not call anything while busy', () => {
    const onNext = jest.fn();
    const onBack = jest.fn();
    const u = wrap(
      <WizardShell step={3} total={3} stepNameId="post.step.review" nextLabelId="post.submit" onNext={onNext} onBack={onBack} busy>
        <Text>x</Text>
      </WizardShell>,
    );
    fireEvent.press(u.getByText('Post job'));
    fireEvent.press(u.getByText('Back'));
    expect(onNext).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });
});
