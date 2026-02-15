/**
 * Zod validation schemas.
 *
 * Note: login/register validation is handled by Keycloak.
 */
import { z } from "zod";

export const accountSchema = z.object({
  name: z.string().min(1, "Nom requis"),
  type: z.enum(["courant", "epargne", "carte", "invest"]),
  currency: z.string().length(3).default("EUR"),
  bank_name: z.string().optional(),
  initial_balance: z.number().default(0),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export const transactionSchema = z.object({
  account_id: z.number(),
  date: z.string(),
  label_raw: z.string().min(1, "Libellé requis"),
  amount: z.number().refine((v) => v !== 0, "Le montant ne peut pas être zéro"),
  currency: z.string().length(3).default("EUR"),
  category_id: z.number().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export type AccountForm = z.infer<typeof accountSchema>;
export type TransactionForm = z.infer<typeof transactionSchema>;
