import { normalizeFileExt, isFile } from './../../utils/path';
import { findAllMatches } from './../utils/regexp';
import { buildOutputFileName, buildOutputFilePath } from './index';
import { escapeString } from './../utils/string';
import { decoratorNameToValidationItemData } from './validationItem';
import { handleError, ErrorInFile, IssueError } from './../utils/error';
import { ValidationType, primitiveValidationTypes } from './../../validators/model';
import { requiredOneOfValidator, typeValidator } from './../../validators/common';
import { RequiredOneOfValidation, CustomValidation, IgnoreValidation, TypeValidation } from './../../decorators/index';
import {
  PreparedValidation,
  PreparedValidationItem,
  PreparedValidatorPayloadItem,
  HandleAsyncValidationAdd,
  HandleNestedValidationAdd,
  ExportedFunctionsMap
} from './model';
import { ClassMetadata, FunctionMetadata, ClassFieldTypeMetadata, ImportMetadata } from './../parse/model';
import { CodegenConfig, SeverityLevel } from './../../config/model';
import * as pkg from '../../../package.json';
import * as path from 'path';
import { Arg } from 'ts-file-parser';

export const buildValidationFromClassMetadata = ({
  cls,
  clsFileName,
  addImport,
  inputFileImportsMetadata,
  inputFileFunctionsMetadata,
  exportedFunctionsMap,
  inputFilePath,
  config,
  handleAsyncValidationAdd,
  handleNestedValidationAdd
}: {
  cls: ClassMetadata;
  clsFileName: string;
  addImport: (path: string, clause: string, isPackageName?: boolean) => void;
  inputFileImportsMetadata: ImportMetadata[];
  inputFileFunctionsMetadata: FunctionMetadata[];
  exportedFunctionsMap: ExportedFunctionsMap;
  inputFilePath: string;
  config: CodegenConfig;
  handleAsyncValidationAdd: HandleAsyncValidationAdd;
  handleNestedValidationAdd: HandleNestedValidationAdd;
}): PreparedValidation | undefined => {
  const name = getValidationName(cls.name);
  const items: PreparedValidationItem[] = [];
  let async = false;

  cls.decorators.forEach(({ name, arguments: args }) => {
    if (name === RequiredOneOfValidation.name) {
      const fields = <Parameters<typeof RequiredOneOfValidation>[0]>args[0];
      const customMessage = <Parameters<typeof RequiredOneOfValidation>[1]>args[1];

      if (!fields.length) {
        return;
      }

      fields.forEach((requiredFieldName) => {
        if (!cls.fields.find(({ name: clsFieldName }) => clsFieldName === requiredFieldName)) {
          throw new ErrorInFile(
            `Class "${cls.name}" has wrong field list in "${RequiredOneOfValidation.name}" decorator. Field "${requiredFieldName}" not exists in class declaration.`,
            clsFileName
          );
        }
      });

      const validatorPayload: PreparedValidatorPayloadItem[] = [
        { property: 'fields', value: `[${fields.map((f) => `'${f}'`).join(', ')}]`, type: 'array' }
      ];

      if (customMessage) {
        validatorPayload.push({ property: 'customMessage', value: escapeString(customMessage), type: 'string' });
      }

      addImport(pkg.name, requiredOneOfValidator.name, true);
      items.push({
        propertyName: '',
        validatorName: requiredOneOfValidator.name,
        validatorPayload
      });
    }
  });

  cls.fields.forEach((clsFieldMetadata) => {
    const { name: fieldName, type: typeMetadata, decorators, optional } = clsFieldMetadata;

    // Ignore validation
    if (decorators.find(({ name: decoratorName }) => decoratorName === IgnoreValidation.name)) {
      return;
    }

    // Type validation
    const { allowedValidationTypes } = decoratorNameToValidationItemData[TypeValidation.name];
    if (allowedValidationTypes.includes(typeMetadata.validationType)) {
      const customMessageForTypeValidator = <Parameters<typeof TypeValidation>[0] | undefined>(
        decorators.find(({ name: decoratorName }) => decoratorName === TypeValidation.name)?.arguments[0]
      );

      const validatorPayload: PreparedValidatorPayloadItem[] = [];
      if (customMessageForTypeValidator) {
        validatorPayload.push({
          property: 'customMessage',
          value: escapeString(customMessageForTypeValidator),
          type: 'string'
        });
      }

      if (!primitiveValidationTypes.includes(typeMetadata.validationType as any)) {
        type TypeValidatorPayloadRenderData =
          | {
              type: Exclude<
                ValidationType,
                ValidationType.enum | ValidationType.nested | ValidationType.array | ValidationType.union
              >;
              typeDescription: undefined;
            }
          | {
              type: ValidationType.enum;
              typeDescription: string;
            }
          | {
              type: ValidationType.nested;
              typeDescription: string;
            }
          | {
              type: ValidationType.array;
              typeDescription: TypeValidatorPayloadRenderData;
            }
          | {
              type: ValidationType.union;
              typeDescription: TypeValidatorPayloadRenderData[];
            };
        const buildTypeValidatorPayload = (typeMetadata: ClassFieldTypeMetadata): TypeValidatorPayloadRenderData => {
          // Not supported validation
          if (typeMetadata.validationType === ValidationType.notSupported) {
            let severityLevel = config.unknownPropertySeverityLevel;

            if (decorators.find(({ name: decoratorName }) => decoratorName === CustomValidation.name)) {
              severityLevel = Math.min(severityLevel, SeverityLevel.warning);
            }

            const error = new ErrorInFile(
              `Failed to create validation for "${cls.name}.${fieldName}". Type "${typeMetadata.name}" is not supported. Change field type or add "${IgnoreValidation.name}" decorator.`,
              clsFileName
            );
            handleError(error.message, severityLevel);

            return {
              type: typeMetadata.validationType
            } as TypeValidatorPayloadRenderData;
          }

          // Array validation
          if (typeMetadata.validationType === ValidationType.array) {
            return {
              type: ValidationType.array,
              typeDescription: buildTypeValidatorPayload(typeMetadata.arrayOf)
            };
          }

          // Union validation
          if (typeMetadata.validationType === ValidationType.union) {
            return {
              type: ValidationType.union,
              typeDescription: typeMetadata.unionTypes.map(buildTypeValidatorPayload)
            };
          }

          // Boolean, string, number, null validation
          if (primitiveValidationTypes.includes(typeMetadata.validationType as any)) {
            return {
              type: typeMetadata.validationType
            } as TypeValidatorPayloadRenderData;
          }

          // Enum & nested validation
          if (!typeMetadata.referencePath || !typeMetadata.name) {
            throw new IssueError(
              `Failed to create validation for "${cls.name}.${fieldName}" -> "${typeMetadata.validationType}" validation type requires "referencePath" and "name" filled in metadata, but some of them is empty.`
            );
          }

          if (
            typeMetadata.validationType !== ValidationType.enum &&
            typeMetadata.validationType !== ValidationType.nested
          ) {
            throw new IssueError(
              `Failed to create validation for "${cls.name}.${fieldName}" -> "${typeMetadata.validationType}" can't be handled by "buildTypeValidatorPayload" method.`
            );
          }

          const refPath = typeMetadata.referencePath;
          const importPath =
            typeMetadata.validationType === ValidationType.nested
              ? `${buildOutputFilePath({ inputFileName: refPath, config })}/${buildOutputFileName(refPath)}`
              : refPath;
          const typeDescription =
            typeMetadata.validationType === ValidationType.nested
              ? getValidationName(typeMetadata.name)
              : typeMetadata.name;

          addImport(path.resolve(importPath), typeDescription, false);

          if (typeMetadata.validationType === ValidationType.nested) {
            handleNestedValidationAdd({
              validationName: name,
              validationItemIndex: items.length,
              nestedValidationName: typeDescription,
              nestedValidationFilePath: importPath
            });
          }

          return {
            type: typeMetadata.validationType,
            typeDescription
          } as TypeValidatorPayloadRenderData;
        };

        const { type, typeDescription } = buildTypeValidatorPayload(typeMetadata);
        let value = typeof typeDescription === 'string' ? typeDescription : JSON.stringify(typeDescription, null, 2);
        if (type === ValidationType.array) {
          value = `${value} as TypeValidatorPayload`;
          addImport(pkg.name, 'TypeValidatorPayload', true);
        }
        if (type === ValidationType.union) {
          value = `${value} as TypeValidatorPayload[]`;
          addImport(pkg.name, 'TypeValidatorPayload', true);
        }

        validatorPayload.push({
          property: 'typeDescription',
          value,
          type: 'object'
        });
      }

      validatorPayload.push({
        property: 'type',
        value: `ValidationType.${typeMetadata.validationType}`,
        type: 'object'
      });
      validatorPayload.push({
        property: 'typeName',
        value: getTypeNameByTypeMeta(typeMetadata),
        type: 'string'
      });

      addImport(pkg.name, typeValidator.name, true);

      items.push({
        propertyName: fieldName,
        validatorName: typeValidator.name,
        optional,
        validatorPayload
      });
    }

    // Other validations
    decorators.forEach(({ name: decoratorName, arguments: args }) => {
      // Skip TypeValidation decorator
      if (decoratorName === TypeValidation.name) {
        return;
      }

      // Other validations for nested types not allowed
      if (typeMetadata.validationType === ValidationType.nested) {
        throw new ErrorInFile(
          `Decorator "@${decoratorName}" can't be used on "${cls.name}.${fieldName}" of type "${typeMetadata.validationType}". Additional validations for nested types not allowed.`,
          clsFileName
        );
      }

      // Decorator is not for validation -> skip
      if (!decoratorNameToValidationItemData[decoratorName]) {
        return;
      }

      const { validatorName, validatorArgumentNames, allowedValidationTypes } = decoratorNameToValidationItemData[
        decoratorName
      ];

      // Decorator misused
      let isDecoratorAllowed = allowedValidationTypes.includes(typeMetadata.validationType);
      if (
        isDecoratorAllowed &&
        typeMetadata.validationType === ValidationType.array &&
        allowedValidationTypes.length === 2
      ) {
        if (
          allowedValidationTypes.includes(ValidationType.string) &&
          typeMetadata.arrayOf?.validationType !== ValidationType.string
        ) {
          isDecoratorAllowed = false;
        }
        if (
          allowedValidationTypes.includes(ValidationType.number) &&
          typeMetadata.arrayOf?.validationType !== ValidationType.number
        ) {
          isDecoratorAllowed = false;
        }
      }
      if (!isDecoratorAllowed) {
        throw new ErrorInFile(
          `Decorator "${validatorName}" can't be used on "${cls.name}.${fieldName}" of type "${
            typeMetadata.validationType
          }" (allowed types: ${allowedValidationTypes.map((v) => `"${v}"`).join(', ')})`,
          clsFileName
        );
      }

      let isAsync = false;

      if (decoratorName === CustomValidation.name) {
        const customValidatorFunctionMeta = addImportsForCustomValidator({
          inputFileImportsMetadata,
          inputFileFunctionsMetadata,
          inputFilePath,
          decoratorArgs: args,
          onImportAdd: addImport
        });

        if (customValidatorFunctionMeta) {
          isAsync = isExportedFunctionAsync(exportedFunctionsMap, customValidatorFunctionMeta);
        } else {
          isAsync = Boolean(args[0].toString().match(/^\s*async/));
        }
      }

      if (isAsync) {
        async = true;
      }

      addImport(pkg.name, validatorName, true);
      items.push({
        propertyName: fieldName,
        validatorName,
        optional,
        async: isAsync,
        validatorPayload: args.map((arg, index) => {
          const property = validatorArgumentNames[index];
          let type = '';
          let value = arg.toString();

          if (property === 'allowUndefined' && arg === undefined) {
            value = 'false';
          }

          if (property === 'value') {
            type = typeMetadata.validationType;
          }

          if (['customMessage', 'targetPropertyName'].includes(property)) {
            type = 'string';
          }

          if (type === 'string') {
            value = escapeString(value);
          }

          return {
            property,
            value,
            type
          };
        })
      });
    });
  });

  if (async) {
    handleAsyncValidationAdd(name);
  }

  return {
    name,
    modelClassName: cls.name,
    items,
    async
  };
};

const getValidationName = (className: string): string => {
  return `validate${className[0].toLocaleUpperCase()}${className.slice(1)}`;
};

const addImportsForCustomValidator = ({
  inputFileImportsMetadata,
  inputFileFunctionsMetadata,
  inputFilePath,
  decoratorArgs,
  onImportAdd
}: {
  inputFileImportsMetadata: ImportMetadata[];
  inputFileFunctionsMetadata: FunctionMetadata[];
  inputFilePath: string;
  decoratorArgs: (Arg | Arg[])[];
  onImportAdd: (path: string, clause: string, isPackageName?: boolean) => void;
}): void | { functionName: string; functionPathAbs: string } => {
  const func = (<string>decoratorArgs[0]).trim();

  // Case #1: inline function
  if (func.match(/^(async\s*){0,1}function\s*[(]{1}/) || func.match(/^(async\s*){0,1}.+(=>).+/)) {
    // Find all possible entities, which may be imported
    const listOfPossibleImports = findAllMatches(/\w+/gm, func);

    // For each found entity -> try to add import
    listOfPossibleImports.forEach((possibleImport) => {
      const matchedImportMetadata = inputFileImportsMetadata.find((im) => im.clauses.some((c) => c === possibleImport));
      if (matchedImportMetadata) {
        const resolvedPath = path.resolve(process.cwd(), matchedImportMetadata.absPath);
        const isPackageName = !isFile(normalizeFileExt(resolvedPath));
        const importPath = isPackageName ? matchedImportMetadata.absPath : resolvedPath;
        onImportAdd(importPath, possibleImport, isPackageName);
      }
    });

    return;
  }

  // Case #2: function in same model file
  const foundFuncMeta = inputFileFunctionsMetadata.find(({ name }) => name === func);
  if (foundFuncMeta) {
    if (foundFuncMeta.isExported) {
      onImportAdd(path.resolve(inputFilePath), func);
      return { functionName: func, functionPathAbs: inputFilePath };
    } else {
      throw new ErrorInFile(
        `Custom validation function "${foundFuncMeta.name}" is used, but not exported. Add export keyword to this function or remove it from @CustomValidation decorator.`,
        inputFilePath
      );
    }
  }

  // Case #3: imported function
  const foundFuncImport = inputFileImportsMetadata.find((m) => m.clauses.some((c) => c === func));
  if (foundFuncImport) {
    onImportAdd(path.resolve(foundFuncImport.absPath), func);
    return { functionName: func, functionPathAbs: foundFuncImport.absPath };
  }
};

const isExportedFunctionAsync = (
  map: ExportedFunctionsMap,
  { functionName, functionPathAbs }: { functionName: string; functionPathAbs: string }
): boolean => {
  const foundFunctionMeta = map[functionPathAbs]?.find((meta) => meta.functionName === functionName);
  return foundFunctionMeta?.isAsync ?? false;
};

const getTypeNameByTypeMeta = (meta: ClassFieldTypeMetadata): string => {
  if (meta.validationType === ValidationType.array) {
    return `${getTypeNameByTypeMeta(meta.arrayOf)}[]`;
  }

  if (meta.validationType === ValidationType.union) {
    return meta.unionTypes.map(getTypeNameByTypeMeta).join(' | ');
  }

  return meta.name ?? meta.validationType;
};
