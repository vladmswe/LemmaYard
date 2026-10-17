import { z } from "zod";

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
export const PASSWORD_MIN = 8;
// Upper bound keeps argon2 hashing cheap for oversized inputs.
export const PASSWORD_MAX = 128;

// UI copy for the auth fields, one source for hints (auth-form) and errors
// (schemas, register route): sentences with a final period, en dash in ranges.
export const USERNAME_RULE = "3–20 characters: lowercase letters, digits or underscore.";
export const PASSWORD_HINT = `At least ${PASSWORD_MIN} characters.`;
export const AUTH_MESSAGES = {
  emailRequired: "Email is required.",
  emailInvalid: "Enter a valid email address.",
  emailTooLong: "Email is too long.",
  emailTaken: "This email is already registered.",
  usernameTaken: "This username is taken.",
  passwordRequired: "Password is required.",
  passwordTooShort: `Password must be at least ${PASSWORD_MIN} characters.`,
  passwordTooLong: `Password must be at most ${PASSWORD_MAX} characters.`,
  nul: "Must not contain NUL characters.",
} as const;

const noNul = (s: string) => !s.includes("\u0000");
const NUL_MESSAGE = AUTH_MESSAGES.nul;

const email = z
  .string()
  .min(1, AUTH_MESSAGES.emailRequired)
  .max(254, AUTH_MESSAGES.emailTooLong)
  .refine(noNul, NUL_MESSAGE)
  .trim()
  .toLowerCase()
  .pipe(z.email(AUTH_MESSAGES.emailInvalid));

export const registerSchema = z.object({
  email,
  username: z
    .string()
    .refine(noNul, NUL_MESSAGE)
    .regex(USERNAME_PATTERN, USERNAME_RULE),
  password: z
    .string()
    .refine(noNul, NUL_MESSAGE)
    .min(PASSWORD_MIN, AUTH_MESSAGES.passwordTooShort)
    .max(PASSWORD_MAX, AUTH_MESSAGES.passwordTooLong),
});

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, AUTH_MESSAGES.emailRequired)
    .max(254, AUTH_MESSAGES.emailTooLong)
    .refine(noNul, NUL_MESSAGE)
    .trim()
    .toLowerCase(),
  password: z
    .string()
    .min(1, AUTH_MESSAGES.passwordRequired)
    .max(PASSWORD_MAX, AUTH_MESSAGES.passwordTooLong)
    .refine(noNul, NUL_MESSAGE),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

/** JSON error body returned by the auth API (400/401/403/409/413). */
export type AuthErrorBody = {
  error: string;
  fieldErrors?: Partial<Record<string, string>>;
};
