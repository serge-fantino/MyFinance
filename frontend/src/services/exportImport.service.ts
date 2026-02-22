/**
 * Export/import of categories and classification rules (YAML).
 */
import api from "./api";

export interface ImportResult {
  categories_created: number;
  rules_created: number;
  rules_skipped: number;
}

export const exportImportService = {
  async export(): Promise<void> {
    const response = await api.get("/export-import/export", {
      responseType: "text",
    });
    const blob = new Blob([response.data], { type: "application/x-yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `myfinance-export-${new Date().toISOString().slice(0, 10)}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  },

  async import(content: string): Promise<ImportResult> {
    const response = await api.post<ImportResult>("/export-import/import", { content });
    return response.data;
  },
};
