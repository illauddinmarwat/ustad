import React from 'react';
import { Image } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import { ServiceCard } from './ServiceCard';

const mockAuth: { current: { language?: 'en' | 'ur' } } = { current: { language: 'en' } };
jest.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth.current }));

beforeEach(() => {
  mockAuth.current = { language: 'en' };
});

const base = { headline: 'Leak and tap repair', onPress: jest.fn() };

describe('ServiceCard', () => {
  it('shows the Ustad, rating, reviews, jobs done, areas and a Request a quote prompt, with no price', () => {
    const u = render(
      <ServiceCard
        {...base}
        workerName="Usman Khan"
        rating={4.7}
        reviewCount={12}
        verified
        jobsDone={25}
        areas={['Gulshan', 'DHA']}
      />,
    );
    expect(u.getByText('Leak and tap repair')).toBeTruthy();
    expect(u.getByText('Usman Khan')).toBeTruthy();
    expect(u.getByText('4.7')).toBeTruthy();
    expect(u.getByText('(12)')).toBeTruthy();
    expect(u.getByText('25 jobs done')).toBeTruthy();
    expect(u.getByText('Gulshan')).toBeTruthy();
    expect(u.getByText('Request a quote')).toBeTruthy();
    expect(u.queryByText(/Rs/)).toBeNull();
  });

  it('shows the first photo as the cover and how many there are', () => {
    const u = render(<ServiceCard {...base} photos={['https://x/1.jpg', 'https://x/2.jpg', 'https://x/3.jpg']} />);
    const uris = u.UNSAFE_getAllByType(Image).map((i: { props: { source: { uri?: string } } }) => i.props.source?.uri);
    expect(uris).toEqual(['https://x/1.jpg']);
    expect(u.getByText('3')).toBeTruthy();
  });

  it('falls back to the Ustad initials when there is no photo', () => {
    const u = render(<ServiceCard {...base} workerName="Usman Khan" />);
    expect(u.getAllByText('UK').length).toBeGreaterThan(0);
  });

  it('marks a Ustad with no rating as new, and shows no jobs line', () => {
    const u = render(<ServiceCard {...base} workerName="Bilal" rating={null} />);
    expect(u.getByText('New')).toBeTruthy();
    expect(u.queryByText(/jobs done/)).toBeNull();
  });

  it('keeps the card short when a Ustad covers many areas', () => {
    const u = render(<ServiceCard {...base} areas={['A', 'B', 'C', 'D', 'E']} />);
    expect(u.getByText('+2')).toBeTruthy();
    expect(u.queryByText('E')).toBeNull();
  });

  it('flags a featured listing', () => {
    const u = render(<ServiceCard {...base} featured />);
    expect(u.getByText('Featured')).toBeTruthy();
  });

  it('shows the headline in the reader language', () => {
    mockAuth.current = { language: 'ur' };
    const u = render(
      <ServiceCard {...base} headlineI18n={{ source: 'en', en: 'Leak and tap repair', ur: 'نل اور لیکیج کی مرمت', ai: true }} />,
    );
    expect(u.getByText('نل اور لیکیج کی مرمت')).toBeTruthy();
  });

  it('opens when tapped', () => {
    const onPress = jest.fn();
    const u = render(<ServiceCard {...base} onPress={onPress} />);
    fireEvent.press(u.getByLabelText('Leak and tap repair'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows an own service with its status and an Edit prompt, not Request a quote', () => {
    const onEdit = jest.fn();
    const u = render(<ServiceCard {...base} status="paused" onEdit={onEdit} />);
    expect(u.getByText('Paused')).toBeTruthy();
    expect(u.getByText('Edit')).toBeTruthy();
    expect(u.queryByText('Request a quote')).toBeNull();
  });

  it('says View instead of Request a quote to someone who cannot request it', () => {
    const u = render(<ServiceCard {...base} viewOnly />);
    expect(u.getByText('View')).toBeTruthy();
    expect(u.queryByText('Request a quote')).toBeNull();
  });
});
