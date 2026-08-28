import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(8, 'A senha deve ter ao menos 8 caracteres')
  .max(72, 'A senha deve ter no maximo 72 caracteres')
  .regex(/[a-z]/, 'Inclua ao menos uma letra minuscula')
  .regex(/[A-Z]/, 'Inclua ao menos uma letra maiuscula')
  .regex(/[0-9]/, 'Inclua ao menos um numero');

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Informe um e-mail valido'),
  password: z.string().min(1, 'Informe a senha'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Informe um e-mail valido'),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(10, 'Token invalido'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas nao conferem',
    path: ['confirmPassword'],
  });

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome completo').max(120),
  email: z.string().trim().toLowerCase().email('Informe um e-mail valido'),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Informe a senha atual'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas nao conferem',
    path: ['confirmPassword'],
  });

export type LoginDto = z.infer<typeof loginSchema>;
export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;
