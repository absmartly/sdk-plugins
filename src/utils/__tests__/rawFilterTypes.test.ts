import type { InjectionDataWithFilter, URLFilter } from '../../types';
import type { URLRedirectConfig } from '../../url-redirect/types';

// Compile-time guard: the exported raw config types must keep accepting every
// URLFilter shape customers write (ts-jest fails this file if they narrow).
describe('raw URL filter config types', () => {
  it('URLRedirectConfig accepts partial, string and array filters', () => {
    const configs: URLRedirectConfig[] = [
      { redirects: [] },
      { redirects: [], urlFilter: '/checkout' },
      { redirects: [], urlFilter: ['/checkout'] },
      { redirects: [], urlFilter: { include: ['/checkout'] } },
      { redirects: [], urlFilter: { exclude: ['/cart'], mode: 'regex' } },
    ];

    expect(configs).toHaveLength(5);
  });

  it('InjectionDataWithFilter accepts every URLFilter shape', () => {
    const filters: URLFilter[] = ['/checkout', ['/checkout'], { include: ['/checkout'] }];
    const items: InjectionDataWithFilter[] = filters.map(urlFilter => ({
      data: { headEnd: '<script></script>' },
      urlFilter,
    }));

    expect(items).toHaveLength(3);
  });
});
