import '@testing-library/jest-dom';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor(
    public callback: IntersectionObserverCallback,
    public options?: IntersectionObserverInit
  ) {}
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
  takeRecords = jest.fn().mockReturnValue([]);
  root = null;
  rootMargin = '';
  thresholds = [];
} as any;

// Reset DOM between tests
beforeEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

// Clear all mocks after each test
afterEach(() => {
  jest.clearAllMocks();
});
