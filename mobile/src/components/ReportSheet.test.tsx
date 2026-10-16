import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { buildReportReason } from '../lib/reports';

import { ReportSheet } from './ReportSheet';

const mockInsert = jest.fn();
jest.mock('../lib/supabase', () => ({
  supabase: { from: () => ({ insert: (...a: unknown[]) => mockInsert(...a) }) },
}));

const wrap = (node: React.ReactElement) =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      {node}
    </SafeAreaProvider>,
  );

describe('buildReportReason', () => {
  it('stores the code alone, or the code with the trimmed note', () => {
    expect(buildReportReason('scam', '  ')).toBe('scam');
    expect(buildReportReason('abuse', ' he shouted at me ')).toBe('abuse: he shouted at me');
  });

  it('caps a very long note', () => {
    expect(buildReportReason('other', 'x'.repeat(900)).length).toBe('other: '.length + 500);
  });
});

describe('ReportSheet', () => {
  const target = { reporterId: 'me', reportedUserId: 'them', jobId: 'job1' };

  beforeEach(() => mockInsert.mockReset().mockResolvedValue({ error: null }));

  it('cannot send until a reason is picked, then files the report', async () => {
    const onClose = jest.fn();
    const { getByText } = wrap(<ReportSheet visible target={target} onClose={onClose} />);

    await act(async () => {
      fireEvent.press(getByText('Send report'));
    });
    expect(mockInsert).not.toHaveBeenCalled();

    fireEvent.press(getByText('Rude, abusive or threatening'));
    await act(async () => {
      fireEvent.press(getByText('Send report'));
    });
    expect(mockInsert).toHaveBeenCalledWith({
      reporter_id: 'me',
      reported_user_id: 'them',
      job_id: 'job1',
      reason: 'abuse',
    });
    expect(getByText('Thank you. Your report was sent to our team.')).toBeTruthy();
  });

  it('shows the error and stays open when the insert fails', async () => {
    mockInsert.mockResolvedValue({ error: { message: 'rls denied' } });
    const { getByText } = wrap(<ReportSheet visible target={target} onClose={jest.fn()} />);
    fireEvent.press(getByText('Something else'));
    await act(async () => {
      fireEvent.press(getByText('Send report'));
    });
    expect(getByText('rls denied')).toBeTruthy();
  });
});
