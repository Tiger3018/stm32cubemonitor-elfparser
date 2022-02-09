/*!
 * module node-elfparser
 * Copyright(c) 2019 STMicroelectronics
 */
interface IGdbVariableInfo {
  /** file name in which is located the identifier */
  filename: string;
  /** Identifiers list */
  identifiersList: Array<{
    /** Identifier name */
    identifier: string;
    /** Identifier type */
    type?: string;
    /** Identifier value (see enum TYPE_VALUE) */
    typeValue?: number;
    /** Identifier address */
    address?: string;
    /** Identifier address */
    classHierarchy?: string;
  }>;
}
export declare type TgdbVariablesInfo = IGdbVariableInfo[];
/**
 * Service to check if a class member redefines itself or create a circular reference
 * @param classHierarchy - GDB response after sending "info variables" to GDB
 * @param className - indicates if the array information should be limited to the first element or not
 * @returns boolean - Variables information filled with the first elements (file, identifiers of first level)
 */
export declare function checkClassRecursion(classHierarchy: string, className: string): boolean;
/**
 * Service to read GDB response (after sending "info variables" to GDB) and
 * to extract filename(s) and variables identifiers (of first level).
 * @param data - GDB response after sending "info variables" to GDB
 * @param expandTableElements - indicates if the array information should be limited to the first element or not
 * @returns TgdbVariablesInfo - Variables information filled with the first elements (file, identifiers of first level)
 */
export declare function parseGdbVariablesInfo(data: string, expandTableElements: boolean): TgdbVariablesInfo;
/**
 * Service to extract type from a variable type from one expression (C-grammar like)
 * rootIdentifier is used for expanding structures and unions.
 * Returns true if the type was successfully identified or the symbol was already known, false otherwise.
 * @param variablesInfo - current variables information (which will be updated if expr is a struct or union)
 * @param newVariablesInfo - to be filled
 * @param expr - input expression
 * @param rootIdentifier - root structure (with the suffix '.')
 * @param rootHierarchy - root  classHierarchy
 * @param bExpandTableElements - indicates if the array information should be limited to the first element or not
 * @returns string - extracted type
 */
export declare function extractType(
  variablesInfo: TgdbVariablesInfo,
  newVariablesInfo: TgdbVariablesInfo,
  filename: string,
  expr: string,
  rootIdentifier: string,
  rootHierarchy: string,
  bExpandTableElements: boolean
): string;
/**
 * Service to compute the type value returned to elf parser client.
 * @param expr - input type returned by GDB (following C-grammar)
 * @param size - type size returned by GDB
 * @returns number - extracted type (among TYPE_VALUE enum)
 */
export declare function computeTypeValue(expr: string, size: string): number;
/**
 * Service to extract address.
 * @param expr - input string containing address returned by GDB
 * @returns string - extracted address
 */
export declare function extractAddress(expr: string): string;
export {};
