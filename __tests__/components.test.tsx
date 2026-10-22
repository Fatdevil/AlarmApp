import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { AlarmRow } from '../src/components/AlarmRow';
import { NextCard } from '../src/components/NextCard';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { LocalAlarm } from '../src/types';

// Ikonteckensnittet laddas via expo-font, som inte finns i testmiljön
jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`[${name}]`}</Text> };
});
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(async () => {}) }));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});

const now = new Date(2026, 9, 22, 12, 0);
const jobbet = { id: 'p', name: 'Jobbet', latitude: 59, longitude: 18, radius: 150 };

function alarm(overrides: Partial<LocalAlarm> = {}): LocalAlarm {
  return {
    id: 'a',
    creatorId: 'ME',
    recipientId: 'ME',
    content: 'Köp blommor',
    triggerType: 'TIME',
    dateTime: new Date(2026, 9, 23, 16, 0).toISOString(),
    repeat: 'NONE',
    status: 'SCHEDULED',
    createdAt: now.toISOString(),
    notificationIds: ['n1'],
    ...overrides,
  };
}

const noop = () => {};

describe('AlarmRow', () => {
  it('visar klockslag, dag och uppföljning för en tidspåminnelse', async () => {
    const followUp = alarm({ triggerType: 'EXIT_LOCATION', location: jobbet, status: 'ACTIVE_GEOFENCE' });
    await render(<AlarmRow alarm={followUp} now={now} onToggleChecklist={noop} onComplete={noop} onDelete={noop} />);
    expect(screen.getByText('16:00')).toBeTruthy();
    expect(screen.getByText('imorgon')).toBeTruthy();
    expect(screen.getByText('Sedan: när du lämnar Jobbet')).toBeTruthy();
  });

  it('visar platsen för ett platslarm', async () => {
    await render(
      <AlarmRow
        alarm={alarm({ triggerType: 'ENTER_LOCATION', dateTime: null, location: jobbet, status: 'ACTIVE_GEOFENCE' })}
        now={now}
        onToggleChecklist={noop}
        onComplete={noop}
        onDelete={noop}
      />
    );
    expect(screen.getByText('När du kommer till Jobbet')).toBeTruthy();
    expect(screen.queryByText('16:00')).toBeNull();
  });

  it('fäller ut checklistan och bockar av punkter', async () => {
    const toggle = jest.fn();
    const withList = alarm({ checklistItems: [{ id: 'i1', text: 'Tulpaner', done: false }] });
    await render(<AlarmRow alarm={withList} now={now} onToggleChecklist={toggle} onComplete={noop} onDelete={noop} />);
    expect(screen.queryByText('Tulpaner')).toBeNull();
    await fireEvent.press(screen.getByText('Köp blommor'));
    await fireEvent.press(screen.getByText('Tulpaner'));
    expect(toggle).toHaveBeenCalledWith('a', 'i1');
  });

  it('har åtgärderna Klar och Radera för skärmläsare', async () => {
    const complete = jest.fn();
    const remove = jest.fn();
    await render(<AlarmRow alarm={alarm()} now={now} onToggleChecklist={noop} onComplete={complete} onDelete={remove} />);
    const row = screen.getByLabelText(/Köp blommor/);
    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'complete' } });
    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });
});

describe('NextCard', () => {
  it('visar nästa påminnelse stort och kan markeras klar', async () => {
    const complete = jest.fn();
    await render(<NextCard alarm={alarm()} now={now} onComplete={complete} />);
    expect(screen.getByText('NÄSTA')).toBeTruthy();
    expect(screen.getByText('16:00')).toBeTruthy();
    expect(screen.getByText('om 1 dag')).toBeTruthy();
    await fireEvent.press(screen.getByText('Klar'));
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });
});

describe('ScreenHeader', () => {
  it('visar rubrik som rubrik för skärmläsare', async () => {
    await render(<ScreenHeader title="Påminnelser" subtitle="Torsdag 22 oktober" />);
    expect(screen.getByRole('header', { name: 'Påminnelser' })).toBeTruthy();
    expect(screen.getByText('Torsdag 22 oktober')).toBeTruthy();
  });
});
