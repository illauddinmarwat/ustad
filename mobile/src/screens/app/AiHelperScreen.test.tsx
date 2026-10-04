import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AiHelperScreen from './AiHelperScreen';

const mockPopTo = jest.fn();
const mockGoBack = jest.fn();
const mockAsk = jest.fn();
const mockJobDraft = jest.fn();
const mockListingDraft = jest.fn();
const mockParams: { current: Record<string, unknown> } = {
  current: { mode: 'job', categories: ['plumber', 'electrician'] },
};

jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ language: 'en' }) }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ popTo: mockPopTo, goBack: mockGoBack }),
  useRoute: () => ({ params: mockParams.current }),
}));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/aiDraft', () => ({
  ...jest.requireActual('../../lib/aiDraft'),
  askQuestions: (...a: unknown[]) => mockAsk(...a),
  makeJobDraft: (...a: unknown[]) => mockJobDraft(...a),
  makeListingDraft: (...a: unknown[]) => mockListingDraft(...a),
}));

const wrap = () =>
  render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
    >
      <AiHelperScreen />
    </SafeAreaProvider>,
  );

const QUESTIONS = [
  { id: 'q1', text: 'Where is the water coming from?', options: ['Tap spout', 'Pipe under sink', 'Both'] },
  { id: 'q2', text: 'When should the Ustad come?', options: ['Today', 'Tomorrow evening'] },
];

const JOB_DRAFT = {
  source: 'en',
  category: 'plumber',
  title: 'Kitchen tap leaking',
  description: 'Water drips from the mixer.',
};

beforeEach(() => {
  [mockPopTo, mockGoBack, mockAsk, mockJobDraft, mockListingDraft].forEach((m) => m.mockReset());
  mockParams.current = { mode: 'job', categories: ['plumber', 'electrician'] };
});

const say = (u: ReturnType<typeof wrap>, text: string) => {
  fireEvent.changeText(u.UNSAFE_getByType(TextInput), text);
  fireEvent.press(u.getByLabelText('Send'));
};

describe('AiHelperScreen (job)', () => {
  it('opens with a greeting in English and Urdu, and promises no price talk', () => {
    const u = wrap();
    expect(u.getByText('Tell me what needs fixing. You can type in English, Urdu or Roman Urdu.')).toBeTruthy();
    expect(u.getByText('I never ask about or suggest a price.')).toBeTruthy();
  });

  it('will not send fewer than three characters', () => {
    const u = wrap();
    fireEvent.changeText(u.UNSAFE_getByType(TextInput), 'ab');
    fireEvent.press(u.getByLabelText('Send'));
    expect(mockAsk).not.toHaveBeenCalled();
  });

  it('keeps a phone number out: warns and stays on the typing step', () => {
    const u = wrap();
    say(u, 'Tap leaking, call 0300 1234567');
    expect(u.getByText(/remove phone numbers and links/i)).toBeTruthy();
    expect(mockAsk).not.toHaveBeenCalled();
    expect(u.UNSAFE_getByType(TextInput)).toBeTruthy();
  });

  it('asks the questions, lets the person tap answers, and builds the draft from them', async () => {
    mockAsk.mockResolvedValue({ ok: true, data: QUESTIONS });
    mockJobDraft.mockResolvedValue({ ok: true, data: JOB_DRAFT });
    const u = wrap();
    say(u, 'Kitchen tap leaking');
    expect(await u.findByText('Where is the water coming from?')).toBeTruthy();
    expect(mockAsk).toHaveBeenCalledWith({ kind: 'job', lang: 'en', text: 'Kitchen tap leaking', categories: ['plumber', 'electrician'] });

    fireEvent.press(u.getByText('Tap spout'));
    fireEvent.press(u.getByText('Tomorrow evening'));
    fireEvent.press(u.getByText('Create my draft'));

    await waitFor(() => expect(mockJobDraft).toHaveBeenCalled());
    expect(mockJobDraft).toHaveBeenCalledWith({
      lang: 'en',
      text: 'Kitchen tap leaking',
      categories: ['plumber', 'electrician'],
      answers: [
        { question: 'Where is the water coming from?', answer: 'Tap spout' },
        { question: 'When should the Ustad come?', answer: 'Tomorrow evening' },
      ],
    });
    expect(await u.findByText('Your draft is ready. Read it on the next screen and change anything you like.')).toBeTruthy();
    fireEvent.press(u.getByText('Review my draft'));
    expect(mockPopTo).toHaveBeenCalledWith('PostJob', { draft: JOB_DRAFT }, { merge: true });
  });

  it('lets a person change an answer by tapping it again', async () => {
    mockAsk.mockResolvedValue({ ok: true, data: QUESTIONS });
    mockJobDraft.mockResolvedValue({ ok: true, data: JOB_DRAFT });
    const u = wrap();
    say(u, 'Kitchen tap leaking');
    await u.findByText('Tap spout');
    fireEvent.press(u.getByText('Tap spout'));
    fireEvent.press(u.getByText('Tap spout'));
    fireEvent.press(u.getByText('Create my draft'));
    await waitFor(() => expect(mockJobDraft).toHaveBeenCalled());
    expect(mockJobDraft.mock.calls[0][0].answers).toEqual([]);
  });

  it('can skip the questions', async () => {
    mockAsk.mockResolvedValue({ ok: true, data: QUESTIONS });
    mockJobDraft.mockResolvedValue({ ok: true, data: JOB_DRAFT });
    const u = wrap();
    say(u, 'Kitchen tap leaking');
    fireEvent.press(await u.findByText('Skip the questions'));
    await waitFor(() => expect(mockJobDraft).toHaveBeenCalled());
    expect(mockJobDraft.mock.calls[0][0].answers).toEqual([]);
  });

  it('goes straight to the draft when there is nothing more to ask', async () => {
    mockAsk.mockResolvedValue({ ok: true, data: [] });
    mockJobDraft.mockResolvedValue({ ok: true, data: JOB_DRAFT });
    const u = wrap();
    say(u, 'Kitchen tap leaking, the mixer drips all day');
    await waitFor(() => expect(mockJobDraft).toHaveBeenCalled());
    expect(await u.findByText('Review my draft')).toBeTruthy();
  });

  it('explains when the daily AI help is used up and offers to write it myself', async () => {
    mockAsk.mockResolvedValue({ ok: false, error: 'limit' });
    const u = wrap();
    say(u, 'Kitchen tap leaking');
    expect(await u.findByText(/used all of your AI help/)).toBeTruthy();
    expect(u.queryByText('Continue')).toBeNull();
    fireEvent.press(u.getByText('Write it myself'));
    // What they typed goes into the form, so nothing is lost.
    expect(mockPopTo).toHaveBeenCalledWith('PostJob', { prefill: { description: 'Kitchen tap leaking' } }, { merge: true });
  });

  it('keeps the typed words for the form when the draft was refused', async () => {
    mockAsk.mockResolvedValue({ ok: true, data: [] });
    mockJobDraft.mockResolvedValue({ ok: false, error: 'blocked' });
    const u = wrap();
    say(u, 'Kitchen tap leaking, the mixer drips all day');
    expect(await u.findByText(/Your words are saved/)).toBeTruthy();
    fireEvent.press(u.getByText('Write it myself'));
    expect(mockPopTo).toHaveBeenCalledWith(
      'PostJob',
      { prefill: { description: 'Kitchen tap leaking, the mixer drips all day' } },
      { merge: true },
    );
  });

  it('tells people they can speak instead of typing, on the typing step only', async () => {
    mockAsk.mockResolvedValue({ ok: true, data: QUESTIONS });
    const u = wrap();
    expect(u.getByText('Tip: you can speak. Tap the microphone on your keyboard.')).toBeTruthy();
    say(u, 'Kitchen tap leaking');
    await u.findByText('Tap spout');
    expect(u.queryByText('Tip: you can speak. Tap the microphone on your keyboard.')).toBeNull();
  });

  it('asks in Urdu when the person writes Roman Urdu, whatever their setting', async () => {
    mockAsk.mockResolvedValue({ ok: true, data: QUESTIONS });
    mockJobDraft.mockResolvedValue({ ok: true, data: JOB_DRAFT });
    const u = wrap();
    say(u, 'nal se pani tapak raha hai kitchen ka');
    await u.findByText('Tap spout');
    expect(mockAsk).toHaveBeenCalledWith(expect.objectContaining({ lang: 'ur' }));
    fireEvent.press(u.getByText('Create my draft'));
    await waitFor(() => expect(mockJobDraft).toHaveBeenCalled());
    expect(mockJobDraft.mock.calls[0][0].lang).toBe('ur');
  });

  it('keeps the setting language for plain English', async () => {
    mockAsk.mockResolvedValue({ ok: true, data: QUESTIONS });
    const u = wrap();
    say(u, 'Kitchen tap leaking');
    await u.findByText('Tap spout');
    expect(mockAsk).toHaveBeenCalledWith(expect.objectContaining({ lang: 'en' }));
  });

  it('lets a person try again after a failure and uses the same text', async () => {
    mockAsk.mockResolvedValueOnce({ ok: false, error: 'ai_failed' }).mockResolvedValueOnce({ ok: true, data: QUESTIONS });
    const u = wrap();
    say(u, 'Kitchen tap leaking');
    expect(await u.findByText(/Something went wrong/)).toBeTruthy();
    fireEvent.press(u.getByText('Continue'));
    expect(await u.findByText('Where is the water coming from?')).toBeTruthy();
    expect(mockAsk).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'Kitchen tap leaking' }));
  });

  it('retries only the draft when the draft failed', async () => {
    mockAsk.mockResolvedValue({ ok: true, data: QUESTIONS });
    mockJobDraft.mockResolvedValueOnce({ ok: false, error: 'blocked' }).mockResolvedValueOnce({ ok: true, data: JOB_DRAFT });
    const u = wrap();
    say(u, 'Kitchen tap leaking');
    fireEvent.press(await u.findByText('Tap spout'));
    fireEvent.press(u.getByText('Create my draft'));
    expect(await u.findByText(/Your words are saved/)).toBeTruthy();
    fireEvent.press(u.getByText('Continue'));
    expect(await u.findByText('Review my draft')).toBeTruthy();
    expect(mockAsk).toHaveBeenCalledTimes(1);
    expect(mockJobDraft.mock.calls[1][0].answers).toEqual([{ question: 'Where is the water coming from?', answer: 'Tap spout' }]);
  });
});

describe('AiHelperScreen: what the wizard already has', () => {
  it('starts with the text already typed, and tells the AI how much was attached', async () => {
    mockParams.current = { mode: 'job', categories: ['plumber'], startText: 'tap leaking', attached: { photos: 2, voice: false, video: true } };
    mockAsk.mockResolvedValue({ ok: true, data: [] });
    mockJobDraft.mockResolvedValue({ ok: true, data: JOB_DRAFT });
    const u = wrap();
    expect(u.UNSAFE_getByType(TextInput).props.value).toBe('tap leaking');
    fireEvent.press(u.getByLabelText('Send'));
    await waitFor(() => expect(mockJobDraft).toHaveBeenCalled());
    expect(mockJobDraft.mock.calls[0][0].attached).toEqual({ photos: 2, voice: false, video: true });
  });
});

describe('AiHelperScreen (listing)', () => {
  beforeEach(() => {
    mockParams.current = { mode: 'listing', serviceTitle: 'Leak inspection & minor fix' };
  });

  it('starts from the service and sends the draft back to the listing wizard', async () => {
    const draft = {
      source: 'en',
      headline: 'Leak and tap repair',
      about: 'I fix mixers and pipes.',
    };
    mockAsk.mockResolvedValue({ ok: true, data: [{ id: 'q1', text: 'How long have you done this work?', options: ['1–3 years', '5–10 years'] }] });
    mockListingDraft.mockResolvedValue({ ok: true, data: draft });
    const u = wrap();
    expect(u.getByText('Tell me about your work, or tap Continue and I will ask you.')).toBeTruthy();
    fireEvent.press(u.getByLabelText('Continue'));
    expect(await u.findByText('How long have you done this work?')).toBeTruthy();
    expect(mockAsk).toHaveBeenCalledWith(expect.objectContaining({ kind: 'listing', text: 'Service: Leak inspection & minor fix' }));
    fireEvent.press(u.getByText('5–10 years'));
    fireEvent.press(u.getByText('Create my draft'));
    await waitFor(() => expect(mockListingDraft).toHaveBeenCalled());
    fireEvent.press(await u.findByText('Review my draft'));
    expect(mockPopTo).toHaveBeenCalledWith('ListingWizard', { draft, templateId: undefined }, { merge: true });
  });

  it('adds what the Ustad typed to the service', async () => {
    mockAsk.mockResolvedValue({ ok: true, data: [] });
    mockListingDraft.mockResolvedValue({ ok: false, error: 'ai_failed' });
    const u = wrap();
    say(u, 'I have eight years of experience');
    await waitFor(() => expect(mockAsk).toHaveBeenCalled());
    expect(mockAsk.mock.calls[0][0].text).toBe('Service: Leak inspection & minor fix. I have eight years of experience');
  });
});

describe('AiHelperScreen (listing, choosing the service in the chat)', () => {
  const services = [
    { id: 't-leak', title: 'Leak inspection & minor fix' },
    { id: 't-drain', title: 'Drain cleaning and blockage' },
  ];
  const draft = {
    source: 'ur',
    headline: 'پلمبر',
    about: 'میں لیکیج ٹھیک کرتا ہوں۔',
  };

  beforeEach(() => {
    mockParams.current = { mode: 'listing', services };
  });

  it('first asks which kind of work the Ustad does, with the services to tap', () => {
    const u = wrap();
    expect(u.getByText('What kind of work do you do? Tap one.')).toBeTruthy();
    expect(u.getByText('Leak inspection & minor fix')).toBeTruthy();
    expect(u.getByText('Drain cleaning and blockage')).toBeTruthy();
    expect(u.queryByText('Tell me about your work, or tap Continue and I will ask you.')).toBeNull();
  });

  it('goes on to ask about the work once a service is tapped, and sends the draft back with that service', async () => {
    mockAsk.mockResolvedValue({ ok: true, data: [] });
    mockListingDraft.mockResolvedValue({ ok: true, data: draft });
    const u = wrap();
    fireEvent.press(u.getByText('Drain cleaning and blockage'));
    expect(await u.findByText('Tell me about your work, or tap Continue and I will ask you.')).toBeTruthy();
    fireEvent.press(u.getByLabelText('Continue'));
    await waitFor(() => expect(mockAsk).toHaveBeenCalled());
    expect(mockAsk.mock.calls[0][0].text).toBe('Service: Drain cleaning and blockage');
    fireEvent.press(await u.findByText('Review my draft'));
    expect(mockPopTo).toHaveBeenCalledWith('ListingWizard', { draft, templateId: 't-drain' }, { merge: true });
  });

  it('keeps the chosen service when the helper cannot write a draft and the Ustad finishes by hand', async () => {
    mockAsk.mockResolvedValue({ ok: true, data: [] });
    mockListingDraft.mockResolvedValue({ ok: false, error: 'blocked' });
    const u = wrap();
    fireEvent.press(u.getByText('Leak inspection & minor fix'));
    await u.findByText('Tell me about your work, or tap Continue and I will ask you.');
    say(u, 'main plumber hun');
    expect(await u.findByText(/Your words are saved/)).toBeTruthy();
    fireEvent.press(u.getByText('Write it myself'));
    expect(mockPopTo).toHaveBeenCalledWith('ListingWizard', { prefill: { about: 'main plumber hun' }, templateId: 't-leak' }, { merge: true });
  });

  it('does not ask again when the service was already chosen in the wizard', () => {
    mockParams.current = { mode: 'listing', services, serviceTitle: 'Leak inspection & minor fix', serviceId: 't-leak' };
    const u = wrap();
    expect(u.queryByText('What kind of work do you do? Tap one.')).toBeNull();
    expect(u.getByText('Tell me about your work, or tap Continue and I will ask you.')).toBeTruthy();
  });

  it('goes straight to the intro when there are no services to choose from', () => {
    mockParams.current = { mode: 'listing', services: [] };
    const u = wrap();
    expect(u.queryByText('What kind of work do you do? Tap one.')).toBeNull();
    expect(u.getByText('Tell me about your work, or tap Continue and I will ask you.')).toBeTruthy();
  });
});

