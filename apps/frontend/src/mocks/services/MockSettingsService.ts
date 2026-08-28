import type { SettingsService } from "@/features/settings/types";
export class MockSettingsService implements SettingsService {
  async save(section: string, values: Record<string, string | boolean>) {
    void section;
    void values;
    return Promise.resolve();
  }
}
