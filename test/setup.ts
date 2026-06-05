// Installs a single shared IDBFactory on globalThis. Suites that open a Dexie
// database MUST isolate state per test: `await db.delete()` in beforeEach (or
// construct Dexie with `{ indexedDB: new IDBFactory(), IDBKeyRange }` from
// "fake-indexeddb" for a factory per test).
import "fake-indexeddb/auto";
