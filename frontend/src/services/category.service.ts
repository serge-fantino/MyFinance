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

  async create(data: { name: string; parent_id?: number; icon?: string; color?: string }): Promise<Category> {
    const response = await api.post("/categories", data);
    return response.data;
  },

  async update(id: number, data: { name?: string; parent_id?: number; icon?: string; color?: string }): Promise<Category> {
    const response = await api.patch(`/categories/${id}`, data);
    return response.data;
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/categories/${id}`);
  },
};
