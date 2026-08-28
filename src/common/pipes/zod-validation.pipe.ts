import { ArgumentMetadata, BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodError, ZodSchema } from 'zod';

/**
 * Valida o payload com Zod e devolve mensagens de erro por campo,
 * no formato consumido pelos formularios do painel.
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata) {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of error.issues) {
          const key = issue.path.join('.') || '_';
          if (!fieldErrors[key]) fieldErrors[key] = issue.message;
        }
        throw new BadRequestException({
          statusCode: 400,
          message: 'Dados invalidos. Revise os campos destacados.',
          errors: fieldErrors,
        });
      }
      throw new BadRequestException('Dados invalidos.');
    }
  }
}

export const zodPipe = (schema: ZodSchema) => new ZodValidationPipe(schema);
