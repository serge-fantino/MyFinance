/**
 * Account API service.
 */
import api from "./api";
import type { Account, AccountCreate, AccountSummary, AccountUpdate } from "../types/account.types";

export const accountService = {
  async list(): Promise<Account[]> {
    const response = await api.get("/accounts");
    return response.data;
  },

  async create(data: AccountCreate): Promise<Account> {
    const response = await api.post("/accounts", data);
    return response.data;
  },

  async get(id: number): Promise<Account> {
    const response = await api.get(`/accounts/${id}`);
    return response.data;
  },

  async update(id: number, data: AccountUpdate): Promise<Account> {
    const response = await api.patch(`/accounts/${id}`, data);
    return response.data;
  },

  async archive(id: number): Promise<void> {
    await api.delete(`/accounts/${id}`);
  },

  async getSummary(): Promise<AccountSummary> {
    const response = await api.get("/accounts/summary");
    return response.data;
  },

  async calibrate(
    accountId: number,
    date: string,
    amount: number
  ): Promise<Account> {
    const response = await api.post(`/accounts/${accountId}/calibrate`, {
      date,
      amount,
    });
    return response.data;
  },
};
