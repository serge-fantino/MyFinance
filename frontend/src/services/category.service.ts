/**
 * Category API service.
 */
import api from "./api";
import type { Category } from "../types/category.types";

export const categoryService = {
  async list(): Promise<Category[]> {
    const response = await api.get("/categories");
    return response.data;
  },
};
