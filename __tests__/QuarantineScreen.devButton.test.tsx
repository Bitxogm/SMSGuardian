import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { QuarantineScreen } from '../src/screens/QuarantineScreen';

jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('../src/services/QuarantineService', () => ({
  QuarantineService: { getQuarantinedSMS: jest.fn().mockResolvedValue([]) },
}));

jest.mock('../src/services/DatabaseService', () => ({ databaseService: {} }));
jest.mock('../src/services/URLThreatAnalyzer', () => ({ URLThreatAnalyzer: {} }));

const globals = globalThis as unknown as { __DEV__: boolean };

describe('QuarantineScreen ⚡TEST button', () => {
  const originalDev = globals.__DEV__;
  let renderer: ReactTestRenderer.ReactTestRenderer | null = null;

  const renderAndFindTestButton = async () => {
    await act(async () => {
      renderer = ReactTestRenderer.create(<QuarantineScreen />);
    });
    return renderer!.root.findAllByType(Text).some(t => t.props.children === '⚡ TEST');
  };

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    await act(async () => {
      renderer?.unmount();
    });
    renderer = null;
    globals.__DEV__ = originalDev;
  });

  it('is not rendered in release builds (__DEV__ = false)', async () => {
    globals.__DEV__ = false;
    expect(await renderAndFindTestButton()).toBe(false);
  });

  it('is rendered in development builds (__DEV__ = true)', async () => {
    globals.__DEV__ = true;
    expect(await renderAndFindTestButton()).toBe(true);
  });
});
