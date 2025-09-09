/**
 * Mock Factory Utilities
 * Generic utilities for creating mock objects
 */

// Create Jest mock functions
export function createJestMock() {
  return jest.fn();
}

// Create simple Jest module mock
export function createSimpleModuleMock(modulePath: string, mockImplementations: Record<string, any>) {
  return jest.mock(modulePath, () => mockImplementations);
}
