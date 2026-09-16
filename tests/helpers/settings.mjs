import SettingsProvider from '@deepseek-ai/dsh-settings';

// Exercise the real DSH validation/revision/lifecycle service with isolated storage.
export class MemorySettings extends SettingsProvider {
  writable = true;
  document = {};
  writes = 0;
  async load() { return this.document; }
  async persist(ns, section) { this.writes++; this.document[ns] = structuredClone(section); }
}
