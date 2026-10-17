import { z } from "zod";

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
export const PASSWORD_MIN = 8;
// Upper bound keeps argon2 hashing cheap for oversized inputs.
export const PASSWORD_MAX = 128;

const noNul = (s: string) => !s.includes("\u0000");
const NUL_MESSAGE = "Must not contain NUL characters";

const email = z
  .string()
  .max(254, "Email is too long")
  .refine(noNul, NUL_MESSAGE)
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address"));

export const registerSchema = z.object({
  email,
  username: z
    .string()
    .refine(noNul, NUL_MESSAGE)
    .regex(
      USERNAME_PATTERN,
      "3-20 characters: lowercase letters, digits or underscore",
    ),
  password: z
    .string()
    .refine(noNul, NUL_MESSAGE)
    .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`)
    .max(PASSWORD_MAX, `Password must be at most ${PASSWORD_MAX} characters`),
});

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .max(254, "Email is too long")
    .refine(noNul, NUL_MESSAGE)
    .trim()
    .toLowerCase(),
  password: z
    .string()
    .min(1, "Password is required")
    .max(PASSWORD_MAX, `Password must be at most ${PASSWORD_MAX} characters`)
    .refine(noNul, NUL_MESSAGE),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

/** JSON error body returned by the auth API (400/401/403/409/413). */
export type AuthErrorBody = {
  error: string;
  fieldErrors?: Partial<Record<string, string>>;
};
