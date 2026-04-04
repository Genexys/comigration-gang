import '@testing-library/jest-dom';

// Mock EventSource for SSE tests (not available in jsdom)
class MockEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  readyState = MockEventSource.OPEN;
  close() { this.readyState = MockEventSource.CLOSED; }
  addEventListener() {}
  removeEventListener() {}
}

globalThis.EventSource = MockEventSource as unknown as typeof EventSource;
