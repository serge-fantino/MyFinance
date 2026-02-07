/**
 * Zod validation schemas.
 */
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(1, "Mot de passe requis"),
});

export const registerSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z
    .string()
    .min(8, "Minimum 8 caractères")
    .regex(/[A-Z]/, "Au moins une majuscule")
    .regex(/[0-9]/, "Au moins un chiffre"),
  full_name: z.string().min(2, "Nom requis (2 caractères minimum)"),
});

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

export type LoginForm = z.infer<typeof loginSchema>;
export type RegisterForm = z.infer<typeof registerSchema>;
export type AccountForm = z.infer<typeof accountSchema>;
export type TransactionForm = z.infer<typeof transactionSchema>;
