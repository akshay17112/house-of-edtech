import { z } from "zod";

export const credentialsSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(200),
});

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().email().max(254),
  password: z.string().min(8).max(200),
});

export type RegisterInput = z.infer<typeof registerSchema>;
