import { DOMChangesPlugin } from '../src';

describe('DOMChangesPlugin', () => {
  it('should have a VERSION constant', () => {
    expect(DOMChangesPlugin.VERSION).toBe('1.0.0');
  });

  it('should create an instance', () => {
    const mockContext = {
      data: () => ({ experiments: [] }),
      peek: jest.fn(),
      treatment: jest.fn(),
      override: jest.fn(),
      customFieldValue: jest.fn(),
    };

    const plugin = new DOMChangesPlugin({
      context: mockContext,
      autoApply: false,
    });

    expect(plugin).toBeInstanceOf(DOMChangesPlugin);
  });
});