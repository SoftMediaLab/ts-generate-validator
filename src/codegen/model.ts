import { UserContext, PartialValidationConfig } from '../config/model';

export const allowedFileExt = ['ts', 'tsx', 'js', 'jsx'] as const;

export type Data = Record<string, any>;

export type GeneratedValidation = <D extends Data, C extends UserContext>(
  data: D,
  config?: PartialValidationConfig,
  context?: C,
  propNamePrefix?: string
) => void | Promise<void>;
