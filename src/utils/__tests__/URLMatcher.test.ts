import { URLMatcher } from '../URLMatcher';

describe('URLMatcher', () => {
  describe('Simple pattern matching', () => {
    it('matches exact paths', () => {
      expect(URLMatcher.matches('/page', 'https://example.com/page')).toBe(true);
      expect(URLMatcher.matches('/page', 'https://example.com/other')).toBe(false);
    });

    it('matches wildcard patterns with *', () => {
      expect(URLMatcher.matches('/products/*', 'https://example.com/products/any/path')).toBe(
        true
      );
      expect(URLMatcher.matches('/*', 'https://example.com/')).toBe(true);
      expect(URLMatcher.matches('/products/*', 'https://example.com/shop')).toBe(false);
    });

    it('matches middle wildcards', () => {
      expect(
        URLMatcher.matches('/products/*/details', 'https://example.com/products/123/details')
      ).toBe(true);
      expect(
        URLMatcher.matches('/products/*/details', 'https://example.com/products/abc/details')
      ).toBe(true);
      expect(
        URLMatcher.matches('/products/*/details', 'https://example.com/products/123/reviews')
      ).toBe(false);
    });

    it('matches prefix wildcards', () => {
      expect(URLMatcher.matches('*/checkout', 'https://example.com/checkout')).toBe(true);
      expect(URLMatcher.matches('*/checkout', 'http://test.com/cart/checkout')).toBe(true);
      expect(URLMatcher.matches('*/checkout', 'https://example.com/cart')).toBe(false);
    });

    it('matches wildcards in paths', () => {
      expect(URLMatcher.matches('/*/page', 'https://example.com/section/page')).toBe(true);
      expect(URLMatcher.matches('/products/*', 'https://www.example.com/products/123')).toBe(
        true
      );
      expect(URLMatcher.matches('/admin/*', 'https://test.com/page')).toBe(false);
    });

    it('matches single character wildcard ?', () => {
      expect(URLMatcher.matches('/page?', 'https://example.com/page1')).toBe(true);
      expect(URLMatcher.matches('/page?', 'https://example.com/page2')).toBe(true);
      expect(URLMatcher.matches('/page?', 'https://example.com/page12')).toBe(false);
    });

    it('escapes regex special characters', () => {
      expect(URLMatcher.matches('/test.html', 'https://example.com/test.html')).toBe(true);
      expect(URLMatcher.matches('/test.html', 'https://example.com/testXhtml')).toBe(false);
    });
  });

  describe('Array of patterns', () => {
    it('matches if any pattern matches', () => {
      const patterns = ['/products/*', '/shop/*'];

      expect(URLMatcher.matches(patterns, 'https://example.com/products/123')).toBe(true);
      expect(URLMatcher.matches(patterns, 'https://example.com/shop/abc')).toBe(true);
      expect(URLMatcher.matches(patterns, 'https://example.com/about')).toBe(false);
    });

    it('handles empty array', () => {
      expect(URLMatcher.matches([], 'https://example.com/page')).toBe(true);
    });
  });

  describe('Advanced configuration with include/exclude', () => {
    it('handles exclude patterns', () => {
      const filter = {
        include: ['/*'],
        exclude: ['/admin/*'],
      };

      expect(URLMatcher.matches(filter, 'https://example.com/products')).toBe(true);
      expect(URLMatcher.matches(filter, 'https://example.com/admin/users')).toBe(false);
      expect(URLMatcher.matches(filter, 'https://example.com/admin/settings')).toBe(false);
      expect(URLMatcher.matches(filter, 'https://other.com/about')).toBe(true);
    });

    it('exclude takes precedence over include', () => {
      const filter = {
        include: ['/*'],
        exclude: ['/products/*'],
      };

      expect(URLMatcher.matches(filter, 'https://example.com/about')).toBe(true);
      expect(URLMatcher.matches(filter, 'https://example.com/products/123')).toBe(false);
    });

    it('matches all when no include patterns', () => {
      const filter = {
        exclude: ['/admin/*'],
      };

      expect(URLMatcher.matches(filter, 'https://example.com/products')).toBe(true);
      expect(URLMatcher.matches(filter, 'https://other.com/page')).toBe(true);
      expect(URLMatcher.matches(filter, 'https://example.com/admin/users')).toBe(false);
    });
  });

  describe('Regex mode', () => {
    it('supports regex patterns', () => {
      const filter = {
        include: ['^/(products|shop)/.*'],
        mode: 'regex' as const,
      };

      expect(URLMatcher.matches(filter, 'https://example.com/products/123')).toBe(true);
      expect(URLMatcher.matches(filter, 'https://example.com/shop/abc')).toBe(true);
      expect(URLMatcher.matches(filter, 'https://example.com/about')).toBe(false);
    });

    it('handles multiple regex patterns', () => {
      const filter = {
        include: ['^/products/.*', '^/shop/.*'],
        mode: 'regex' as const,
      };

      expect(URLMatcher.matches(filter, 'https://example.com/products/123')).toBe(true);
      expect(URLMatcher.matches(filter, 'https://example.com/shop/abc')).toBe(true);
      expect(URLMatcher.matches(filter, 'https://example.com/about')).toBe(false);
    });

    it('handles invalid regex patterns gracefully', () => {
      const filter = {
        include: ['[invalid regex'],
        mode: 'regex' as const,
      };

      // Should return false and not throw
      expect(URLMatcher.matches(filter, 'https://example.com/page')).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('handles URLs with query parameters', () => {
      expect(URLMatcher.matches('/products/*', 'https://example.com/products/123?color=red')).toBe(
        true
      );
    });

    it('handles URLs with hash fragments', () => {
      expect(URLMatcher.matches('/page', 'https://example.com/page#section')).toBe(false);
      expect(URLMatcher.matches('/page*', 'https://example.com/page#section')).toBe(true);
    });

    it('handles empty string pattern', () => {
      expect(URLMatcher.matches('', 'https://example.com/page')).toBe(false);
    });

    it('handles undefined/empty filters', () => {
      const filter = {};
      expect(URLMatcher.matches(filter, 'https://example.com/page')).toBe(true);
    });
  });

  describe('Match Type', () => {
    const testURL = 'https://shop.example.com/products/123?color=red&size=M#reviews';

    describe('path mode (default)', () => {
      it('matches path only', () => {
        const filter = {
          include: ['/products/*'],
          matchType: 'path' as const,
        };

        expect(URLMatcher.matches(filter, testURL)).toBe(true);
        expect(URLMatcher.matches(filter, 'https://other.com/products/123')).toBe(true);
        expect(URLMatcher.matches(filter, 'https://example.com/shop/123')).toBe(false);
      });

      it('includes hash in path matching', () => {
        const filter = {
          include: ['/products/123#reviews'],
          matchType: 'path' as const,
        };

        expect(URLMatcher.matches(filter, testURL)).toBe(true);
      });

      it('ignores domain and query in path matching', () => {
        const filter = {
          include: ['/products/123'],
          matchType: 'path' as const,
        };

        expect(URLMatcher.matches(filter, 'https://example.com/products/123?color=red')).toBe(
          true
        );
      });
    });

    describe('full-url mode', () => {
      it('matches complete URL including query and hash', () => {
        const filter = {
          include: ['https://shop.example.com/products/123?color=red&size=M#reviews'],
          matchType: 'full-url' as const,
        };

        expect(URLMatcher.matches(filter, testURL)).toBe(true);
      });

      it('requires exact protocol match', () => {
        const filter = {
          include: ['http://shop.example.com/products/*'],
          matchType: 'full-url' as const,
        };

        expect(URLMatcher.matches(filter, testURL)).toBe(false);
        expect(URLMatcher.matches(filter, 'http://shop.example.com/products/123')).toBe(true);
      });

      it('supports wildcards in full URL', () => {
        const filter = {
          include: ['https://shop.example.com/products/*'],
          matchType: 'full-url' as const,
        };

        expect(URLMatcher.matches(filter, testURL)).toBe(true);
        expect(URLMatcher.matches(filter, 'https://shop.example.com/products/456')).toBe(true);
      });
    });

    describe('domain mode', () => {
      it('matches domain only', () => {
        const filter = {
          include: ['shop.example.com'],
          matchType: 'domain' as const,
        };

        expect(URLMatcher.matches(filter, testURL)).toBe(true);
        expect(URLMatcher.matches(filter, 'https://shop.example.com/any/path')).toBe(true);
        expect(URLMatcher.matches(filter, 'http://shop.example.com/other')).toBe(true);
        expect(URLMatcher.matches(filter, 'https://other.example.com/products')).toBe(false);
      });

      it('supports wildcard domain matching', () => {
        const filter = {
          include: ['*.example.com'],
          matchType: 'domain' as const,
        };

        expect(URLMatcher.matches(filter, testURL)).toBe(true);
        expect(URLMatcher.matches(filter, 'https://www.example.com/page')).toBe(true);
        expect(URLMatcher.matches(filter, 'https://api.example.com/data')).toBe(true);
        expect(URLMatcher.matches(filter, 'https://example.net/page')).toBe(false);
      });
    });

    describe('query mode', () => {
      it('matches query string only', () => {
        const filter = {
          include: ['?color=red*'],
          matchType: 'query' as const,
        };

        expect(URLMatcher.matches(filter, testURL)).toBe(true);
        expect(URLMatcher.matches(filter, 'https://other.com/page?color=red')).toBe(true);
        expect(URLMatcher.matches(filter, 'https://example.com/page?size=M')).toBe(false);
      });

      it('matches specific query parameter', () => {
        const filter = {
          include: ['*utm_source=google*'],
          matchType: 'query' as const,
        };

        expect(
          URLMatcher.matches(filter, 'https://example.com/page?utm_source=google&utm_medium=cpc')
        ).toBe(true);
        expect(URLMatcher.matches(filter, 'https://example.com/page?utm_source=facebook')).toBe(
          false
        );
      });

      it('handles empty query string', () => {
        const filter = {
          include: ['?*'],
          matchType: 'query' as const,
        };

        expect(URLMatcher.matches(filter, 'https://example.com/page')).toBe(false);
        expect(URLMatcher.matches(filter, 'https://example.com/page?key=value')).toBe(true);
      });
    });

    describe('hash mode', () => {
      it('matches hash fragment only', () => {
        const filter = {
          include: ['#reviews'],
          matchType: 'hash' as const,
        };

        expect(URLMatcher.matches(filter, testURL)).toBe(true);
        expect(URLMatcher.matches(filter, 'https://other.com/page#reviews')).toBe(true);
        expect(URLMatcher.matches(filter, 'https://example.com/page#about')).toBe(false);
      });

      it('supports wildcard hash matching', () => {
        const filter = {
          include: ['#section-*'],
          matchType: 'hash' as const,
        };

        expect(URLMatcher.matches(filter, 'https://example.com/page#section-1')).toBe(true);
        expect(URLMatcher.matches(filter, 'https://example.com/page#section-comments')).toBe(
          true
        );
        expect(URLMatcher.matches(filter, 'https://example.com/page#other')).toBe(false);
      });

      it('handles empty hash', () => {
        const filter = {
          include: ['#*'],
          matchType: 'hash' as const,
        };

        expect(URLMatcher.matches(filter, 'https://example.com/page')).toBe(false);
        expect(URLMatcher.matches(filter, 'https://example.com/page#top')).toBe(true);
      });
    });

    describe('default behavior', () => {
      it('defaults to path matching when matchType not specified', () => {
        const filter = {
          include: ['/products/*'],
        };

        expect(URLMatcher.matches(filter, testURL)).toBe(true);
      });

      it('defaults to path for string filters', () => {
        expect(URLMatcher.matches('/products/*', testURL)).toBe(true);
        expect(URLMatcher.matches('/products/*', 'https://other.com/products/123')).toBe(true);
      });
    });
  });

  describe('Real-world use cases', () => {
    it('E-commerce: Product pages', () => {
      const filter = '/products/*';

      expect(URLMatcher.matches(filter, 'https://shop.example.com/products/shoes')).toBe(true);
      expect(URLMatcher.matches(filter, 'https://shop.example.com/products/shoes/nike')).toBe(
        true
      );
      expect(URLMatcher.matches(filter, 'https://shop.example.com/cart')).toBe(false);
    });

    it('SPA: Multiple page patterns', () => {
      const filter = ['/products/*', '/shop/*', '/checkout'];

      expect(URLMatcher.matches(filter, 'https://example.com/products/123')).toBe(true);
      expect(URLMatcher.matches(filter, 'https://example.com/shop/abc')).toBe(true);
      expect(URLMatcher.matches(filter, 'https://example.com/checkout')).toBe(true);
      expect(URLMatcher.matches(filter, 'https://example.com/about')).toBe(false);
    });

    it('Multi-domain: Domain-based filtering', () => {
      const filter = {
        include: ['*.example.com', '*.example.net'],
        exclude: ['admin.example.com'],
        matchType: 'domain' as const,
      };

      expect(URLMatcher.matches(filter, 'https://shop.example.com/products')).toBe(true);
      expect(URLMatcher.matches(filter, 'https://www.example.net/products')).toBe(true);
      expect(URLMatcher.matches(filter, 'https://admin.example.com/users')).toBe(false);
      expect(URLMatcher.matches(filter, 'https://other.com/page')).toBe(false);
    });

    it('UTM tracking: Query parameter filtering', () => {
      const filter = {
        include: ['*utm_source=email*'],
        matchType: 'query' as const,
      };

      expect(
        URLMatcher.matches(filter, 'https://example.com/landing?utm_source=email&utm_campaign=promo')
      ).toBe(true);
      expect(URLMatcher.matches(filter, 'https://example.com/other?utm_source=social')).toBe(
        false
      );
    });

    it('SPA sections: Hash-based filtering', () => {
      const filter = {
        include: ['#section-*'],
        matchType: 'hash' as const,
      };

      expect(URLMatcher.matches(filter, 'https://example.com/page#section-about')).toBe(true);
      expect(URLMatcher.matches(filter, 'https://example.com/page#section-contact')).toBe(true);
      expect(URLMatcher.matches(filter, 'https://example.com/page#top')).toBe(false);
    });
  });
});
