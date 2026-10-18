import { extractDomain } from '../src/utils/urlUtils';

describe('extractDomain', () => {
  it.each([
    ['https://bit.ly:443/x', 'bit.ly'],
    ['https://bit.ly./x', 'bit.ly'],
    ['https://BIT.LY/x', 'bit.ly'],
    ['https://google.com@evil.xyz/x', 'evil.xyz'],
    ['https://user:pa@ss@host.com:8080/p?q#f', 'host.com'],
    ['http://www.example.com?a=1', 'example.com'],
    ['ourl.jp/XXXXX', 'ourl.jp'],
    ['go.tinder.com/x', 'go.tinder.com'],
  ])('%s -> %s', (url, host) => {
    expect(extractDomain(url)).toBe(host);
  });
});
