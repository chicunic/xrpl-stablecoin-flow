/**
 * Jest setup file for global test configuration
 * This file runs before all tests and sets up global mocks and configurations
 */

const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeAll(() => {
  // Override console.log for compact output that bypasses Jest's formatting
  console.log = (...args: any[]) => {
    const message = args
      .map(arg => (typeof arg === 'string' ? arg : typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
      .join(' ');

    // Use process.stderr.write to bypass Jest's console capture
    process.stderr.write('\x1b[36m' + message + '\x1b[0m\n'); // Cyan color for visibility
  };

  console.error = jest.fn((message: any, ...args: any[]) => {
    // Check both the message and the error object (usually the second argument)
    const errorMessage = typeof message === 'string' ? message : String(message);
    const errorObj = args.length > 0 ? String(args[0]) : '';
    const fullMessage = errorMessage + ' ' + errorObj;

    // Define expected error patterns that should be suppressed in test output
    // These are errors we expect to happen during normal test execution
    const expectedErrors = ['Error expected in test:'];

    const isExpectedError = expectedErrors.some(pattern => fullMessage.includes(pattern));

    // Only suppress expected errors, let real errors through for debugging
    if (!isExpectedError) {
      originalConsoleError(message, ...args);
    }
  });
});

afterAll(() => {
  // Restore original console methods after all tests complete
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});

// Optional: Add global test utilities or mocks here
export {};
