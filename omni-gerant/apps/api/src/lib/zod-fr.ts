import { z, ZodIssueCode } from 'zod';

// P2-08 : messages d'erreur Zod en francais.
// Enregistre via z.setErrorMap(fr) au demarrage de l'API.

export const frErrorMap: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === 'undefined') return { message: 'Ce champ est obligatoire.' };
      return { message: `Type attendu : ${issue.expected} (reçu : ${issue.received}).` };
    case ZodIssueCode.invalid_string:
      if (issue.validation === 'email') return { message: 'Adresse email invalide.' };
      if (issue.validation === 'url') return { message: 'URL invalide.' };
      if (issue.validation === 'uuid') return { message: 'Identifiant invalide.' };
      return { message: 'Format de chaîne invalide.' };
    case ZodIssueCode.too_small:
      if (issue.type === 'string') {
        if (issue.minimum === 1) return { message: 'Ce champ est obligatoire.' };
        return { message: `Doit contenir au moins ${issue.minimum} caractères.` };
      }
      if (issue.type === 'number') return { message: `Doit être supérieur ou égal à ${issue.minimum}.` };
      if (issue.type === 'array') return { message: `Doit contenir au moins ${issue.minimum} élément(s).` };
      return { message: 'Valeur trop petite.' };
    case ZodIssueCode.too_big:
      if (issue.type === 'string') return { message: `Doit contenir au plus ${issue.maximum} caractères.` };
      if (issue.type === 'number') return { message: `Doit être inférieur ou égal à ${issue.maximum}.` };
      if (issue.type === 'array') return { message: `Doit contenir au plus ${issue.maximum} élément(s).` };
      return { message: 'Valeur trop grande.' };
    case ZodIssueCode.invalid_enum_value:
      return { message: `Valeur invalide. Attendu : ${issue.options.join(', ')}.` };
    case ZodIssueCode.invalid_date:
      return { message: 'Date invalide.' };
    case ZodIssueCode.custom:
      return { message: issue.message ?? 'Valeur invalide.' };
    default:
      return { message: ctx.defaultError };
  }
};

export function installFrenchZodErrors(): void {
  z.setErrorMap(frErrorMap);
}
