/**
 * Singleton API request/response logger.
 * Records every OpenAI API call so the debug overlay can display them.
 */

let _nextId = 1;

const apiLog = {
  /** @type {Array<{id:number, timestamp:string, label:string, method:string, url:string, requestBody:object, requestHeaders:object, status:number, responseBody:object, durationMs:number}>} */
  entries: [],

  /** @type {Function|null} */
  onChange: null,

  /**
   * Record a completed API call.
   * Automatically redacts the Authorization header value.
   */
  record(entry) {
    // Redact Authorization header
    if (entry.requestHeaders) {
      const headers = { ...entry.requestHeaders };
      if (headers['Authorization'] || headers['authorization']) {
        const key = headers['Authorization'] ? 'Authorization' : 'authorization';
        headers[key] = 'Bearer ***';
      }
      entry.requestHeaders = headers;
    }

    entry.id = _nextId++;
    entry.timestamp = new Date().toLocaleTimeString();
    this.entries.push(entry);
    if (this.onChange) this.onChange(entry);
  },

  clear() {
    this.entries = [];
    _nextId = 1;
    if (this.onChange) this.onChange(null);
  },
};

export { apiLog };
