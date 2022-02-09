"use strict";
/*!
 * module node-elfparser
 * Copyright(c) 2019 STMicroelectronics
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractAddress = exports.computeTypeValue = exports.extractType = exports.parseGdbVariablesInfo = exports.checkClassRecursion = void 0;
const stm32cubemonitor_logger_1 = require("@stm32/stm32cubemonitor-logger");
const logger = stm32cubemonitor_logger_1.getLogger("elfparser");
const os_1 = __importDefault(require("os"));
/**
 * Type used to convert "type string" (returned by GDB) to "type value" sent to readElf caller
 */
var TYPE_VALUE;
(function (TYPE_VALUE) {
    TYPE_VALUE[TYPE_VALUE["UNSIGNED_8"] = 1] = "UNSIGNED_8";
    TYPE_VALUE[TYPE_VALUE["SIGNED_8"] = 2] = "SIGNED_8";
    TYPE_VALUE[TYPE_VALUE["UNSIGNED_16"] = 3] = "UNSIGNED_16";
    TYPE_VALUE[TYPE_VALUE["SIGNED_16"] = 4] = "SIGNED_16";
    TYPE_VALUE[TYPE_VALUE["UNSIGNED_32"] = 5] = "UNSIGNED_32";
    TYPE_VALUE[TYPE_VALUE["SIGNED_32"] = 6] = "SIGNED_32";
    TYPE_VALUE[TYPE_VALUE["UNSIGNED_64"] = 7] = "UNSIGNED_64";
    TYPE_VALUE[TYPE_VALUE["SIGNED_64"] = 8] = "SIGNED_64";
    TYPE_VALUE[TYPE_VALUE["FLOAT"] = 9] = "FLOAT";
    TYPE_VALUE[TYPE_VALUE["DOUBLE"] = 10] = "DOUBLE";
})(TYPE_VALUE || (TYPE_VALUE = {}));
/**
 * Service to check if a class member redefines itself or create a circular reference
 * @param classHierarchy - GDB response after sending "info variables" to GDB
 * @param className - indicates if the array information should be limited to the first element or not
 * @returns boolean - Variables information filled with the first elements (file, identifiers of first level)
 */
function checkClassRecursion(classHierarchy, className) {
    // check if the class name is already in the hierarchy
    const pos = classHierarchy.indexOf(className);
    return pos !== -1;
}
exports.checkClassRecursion = checkClassRecursion;
/**
 * Service to read GDB response (after sending "info variables" to GDB) and
 * to extract filename(s) and variables identifiers (of first level).
 * @param data - GDB response after sending "info variables" to GDB
 * @param expandTableElements - indicates if the array information should be limited to the first element or not
 * @returns TgdbVariablesInfo - Variables information filled with the first elements (file, identifiers of first level)
 */
function parseGdbVariablesInfo(data, expandTableElements) {
    logger.trace("data = ", data);
    logger.trace("expandTableElements = ", expandTableElements);
    const FILE_MARKER_START = "File ";
    const FILE_MARKER_END = ":" + os_1.default.EOL;
    const NON_DEBUG_MARKER = "Non-debugging symbols:";
    const gdbVariablesInfo = [];
    let filename;
    // Variables are sorted according to the file declaring them
    let fileBlockStart = data.indexOf(FILE_MARKER_START);
    let fileBlockEnd;
    let parsingIsEnded = false;
    // Iterate on each new file
    while (fileBlockStart !== -1 && parsingIsEnded === false) {
        // The current block ends before the next file, if any
        fileBlockEnd = data.indexOf(FILE_MARKER_START, fileBlockStart + 1);
        if (fileBlockEnd === -1) {
            // Non debugging symbols appear lastly (if any): skip them
            fileBlockEnd = data.indexOf(NON_DEBUG_MARKER, fileBlockStart + 1);
            parsingIsEnded = true;
        }
        if (fileBlockEnd === -1) {
            // Otherwise this is the last block to process
            // Go in this branch if there is no debugging symbol in elf file
            fileBlockEnd = data.length - 1;
            parsingIsEnded = true;
        }
        // First get the fileName
        const endFilenameIdx = data.indexOf(FILE_MARKER_END, fileBlockStart);
        if (endFilenameIdx === -1) {
            logger.error("Info var parsing error while getting filename - fileBlockStart = ", fileBlockStart);
            return [];
        }
        filename = data.substring(fileBlockStart + FILE_MARKER_START.length, endFilenameIdx);
        logger.trace("filename = ", filename);
        // Now, only variables should remain
        // Build the list of identifiers included in the current filename
        const identifiersList = buildVarList(data.substring(endFilenameIdx + FILE_MARKER_END.length, fileBlockEnd), "", expandTableElements);
        // Store identifiers list in gdbVariablesInfo
        gdbVariablesInfo.push({ filename, identifiersList });
        // Go forward if something remains
        fileBlockStart = fileBlockEnd;
    }
    for (let index = 0; index < gdbVariablesInfo.length; index++) {
        logger.trace("gdbVariablesInfo[" + index + "].filename = ", gdbVariablesInfo[index].filename);
        logger.trace("gdbVariablesInfo[" + index + "].identifiersList = ", gdbVariablesInfo[index].identifiersList);
    }
    return gdbVariablesInfo;
}
exports.parseGdbVariablesInfo = parseGdbVariablesInfo;
/**
 * Service to extract a list of variables identifiers from a String buffer containing expressions separated by ';'.
 * May be called recursively when parsing structures. rootIdentifier is then used
 * to give the root structure name (including the '.'). In standard case, rootIdentifier=""
 * @param fileBlock - list of variables separated by ';'
 * @param rootIdentifier - root structure (with the suffix '.')
 * @param expandTableElements - indicates if the array information should be limited to the first element or not
 * @returns TgdbIdentifiersList - variables identifiers list
 */
function buildVarList(fileBlock, rootIdentifier, expandTableElements) {
    logger.trace("fileBlock = ", fileBlock, ", rootIdentifier = ", rootIdentifier, ", expandTableElements = ", expandTableElements);
    let expr;
    let tmpStr;
    let startIdx = 0;
    let firstSemiColon;
    let firstOpenBrace;
    let closeBraceIdx;
    let endIdx;
    const variablesList = [];
    // Then parse all expressions
    while (startIdx < fileBlock.length) {
        tmpStr = fileBlock.substring(startIdx);
        firstSemiColon = tmpStr.indexOf(";");
        firstOpenBrace = tmpStr.indexOf("{");
        closeBraceIdx = 0;
        if (firstOpenBrace !== -1 && firstOpenBrace < firstSemiColon) {
            // There is a block in this expression: go to the end of the block
            closeBraceIdx = getMatchingClosingBrace(tmpStr);
            if (closeBraceIdx === -1) {
                // Parsing error: an opened brace was found without matching closed brace
                logger.error("Info var parsing error: opened brace not closed !");
                return variablesList;
            }
        }
        // End of expression
        endIdx = tmpStr.indexOf(";", closeBraceIdx);
        if (endIdx === -1) {
            // No more expressions
            break;
        }
        // Look only for the identifier in a first stage: ignore block contents (if any)
        if (closeBraceIdx !== 0) {
            expr = tmpStr.substring(0, firstOpenBrace) + tmpStr.substring(closeBraceIdx + 1, endIdx);
        }
        else {
            expr = tmpStr.substring(0, endIdx);
        }
        const identifiers = extractIdentifiers(expr, rootIdentifier, expandTableElements);
        // Add identifiers to variables list
        if (identifiers[0] !== "") {
            for (const entry of identifiers) {
                variablesList.push({
                    identifier: entry
                });
            }
        }
        startIdx += endIdx + 1; // +1 for the ";"
    }
    logger.trace("variablesList = ", variablesList);
    return variablesList;
}
/**
 * Routine looking for the first opening brace '\{' in the string. If not found, returns 0;
 * If found, looks for the matching closing brace '\}', and returns its index (\>0) in the
 * string or -1 if not found
 * @param block - string buffer containing block with open and close brace(s)
 * @returns number - index of the matching clsoing brace
 */
function getMatchingClosingBrace(block) {
    logger.trace("block = ", block);
    // Find the first open brace
    const firstOpenBrace = block.indexOf("{");
    if (firstOpenBrace === -1) {
        logger.error("No open brace in block !");
        return 0;
    }
    // Find the matching closing brace
    let nbOpen = 1;
    let nextOpen = block.indexOf("{", firstOpenBrace + 1);
    let nextClose = block.indexOf("}", firstOpenBrace + 1);
    while (nbOpen !== 0) {
        if (nextClose === -1) {
            // No match
            return -1;
        }
        if (nextOpen !== -1) {
            // There is another open brace ...
            if (nextOpen < nextClose) {
                // ... that is placed before the first closing one => nested block
                nbOpen++;
                nextOpen = block.indexOf("{", nextOpen + 1);
            }
        }
        // Go forward the current closing brace
        nbOpen--;
        if (nbOpen > 0) {
            // We still have not found the end of the current block
            nextClose = block.indexOf("}", nextClose + 1);
        }
    }
    logger.trace("nextClose = ", nextClose);
    return nextClose;
}
/**
 * Service to extract identifier from a string containing elements like 'type', 'variableName', '*', '[', ']', ...
 * This service expands arrays if bExpandTableElements is true.
 * @param expr - input string
 * @param rootIdentifier - root structure (with the suffix '.')
 * @param bExpandTableElements - indicates if the array information should be limited to the first element or not
 * @returns string[] - List of variables identifiers
 */
function extractIdentifiers(expr, rootIdentifier, bExpandTableElements) {
    let tmpStr;
    const identifiers = [];
    let lastTableIdx;
    // Suppress "public:", "protected:" and "private:" keywords
    tmpStr = expr.replace(/\s*(public:|private:|protected:)/g, "");
    // Suppress line numbers , leading and trailing spaces
    tmpStr = tmpStr.replace(/\d+:/, "").trim();
    logger.trace("expr = ", tmpStr, ", rootIdentifier = ", rootIdentifier, ", bExpandTableElements = ", bExpandTableElements);
    // Manage the case of arrays
    // Tables must be expanded (one variable for each element) if bExpandTableElements is true
    const tblStartIdx = tmpStr.indexOf("[");
    if (tblStartIdx !== -1) {
        // Extract the table name
        let tblName = tmpStr.substring(tmpStr.lastIndexOf(" ", tblStartIdx) + 1, tblStartIdx).trim();
        if (tmpStr.substring(tblStartIdx + 1).indexOf("[") !== -1) {
            // Case of multidimensional tables which are not managed
            // Stop treatment and return
            logger.warn("multidimensional tables are not managed - " + tblName);
            identifiers[0] = "";
            return identifiers;
        }
        else {
            // Case of table of pointers
            if (tblName.lastIndexOf("*") !== -1) {
                tblName = tblName.substring(tblName.lastIndexOf("*") + 1).trim();
            }
            // Set the last elements of the table in identifiers
            const sizeStr = tmpStr.substring(tblStartIdx + 1, tmpStr.indexOf("]", tblStartIdx));
            lastTableIdx = parseInt(sizeStr, 10) - 1;
            if (bExpandTableElements === true) {
                identifiers[0] = rootIdentifier + tblName + "[" + lastTableIdx + "]";
            }
            else {
                identifiers[0] = rootIdentifier + tblName + "[0]";
            }
            logger.trace("identifiers = ", identifiers);
            return identifiers;
        }
    }
    // Manage the case of pointers
    if (tmpStr.lastIndexOf("*") !== -1) {
        // Special case for function pointers: (*func)(...)
        const endIdx = tmpStr.indexOf(")");
        if (endIdx !== -1) {
            // The first closing parenthesis is expected to mark the end of identifier
            tmpStr = tmpStr.substring(0, endIdx);
        }
        // For pointers, the identifier is after the last '*' ...
        tmpStr = tmpStr.substring(tmpStr.lastIndexOf("*") + 1).trim();
        // ... but there may be a storage class specifier to skip: char * const pVar
        if (tmpStr.lastIndexOf(" ") !== -1) {
            tmpStr = tmpStr.substring(tmpStr.lastIndexOf(" ") + 1).trim();
        }
        identifiers[0] = rootIdentifier + tmpStr;
    }
    else if (tmpStr.indexOf(" : ") !== -1) {
        // Bit fields are currently not managed;
        logger.warn("Bit fields are currently not managed - " + tmpStr);
        identifiers[0] = "";
    }
    else {
        // All other cases
        identifiers[0] = rootIdentifier + tmpStr.substring(tmpStr.lastIndexOf(" ") + 1).trim();
    }
    logger.trace("identifiers = ", identifiers);
    return identifiers;
}
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
function extractType(variablesInfo, newVariablesInfo, filename, expr, rootIdentifier, rootHierarchy, bExpandTableElements) {
    logger.trace("filename = ", filename, ", expr = ", expr, ", rootIdentifier = ", rootIdentifier, ",bExpandTableElements = ", bExpandTableElements);
    let tmpStr;
    let firstOpenBrace;
    let closeBraceIdx;
    let hierarchy = "";
    // Suppress leading and trailing spaces
    tmpStr = expr.trim();
    // Remove storage class specifier
    tmpStr = removeStorageClassSpecifier(tmpStr);
    // struct and union types can not be resolved, but instead fields are expanded
    if (tmpStr.startsWith("struct ") || tmpStr.startsWith("union ") || tmpStr.startsWith("class ")) {
        firstOpenBrace = tmpStr.indexOf("{");
        if (firstOpenBrace === -1) {
            // The expression does not contain the structure body => failure
            logger.error("Can not match opened brace in ", tmpStr);
            return "";
        }
        else {
            if (tmpStr.startsWith("class ")) {
                // update the class hierarchy and check there is no recursion
                const className = tmpStr.substring(5, firstOpenBrace).trim();
                if (checkClassRecursion(rootHierarchy || "", className) === true) {
                    // the class is using recursive definition, do not parse it.
                    return "";
                }
                hierarchy = (rootHierarchy || "") + "." + className;
            }
            closeBraceIdx = getMatchingClosingBrace(tmpStr);
            if (closeBraceIdx === -1) {
                // Parsing error: an opened brace was found without matching closed brace
                logger.error("Can not match closed brace in ", tmpStr);
                return "";
            }
            if (tmpStr.indexOf("*", closeBraceIdx + 1) === -1) {
                // Expand the structure or union.
                const blockStr = tmpStr.substring(firstOpenBrace + 1, closeBraceIdx);
                const variablesList = buildVarList(blockStr, rootIdentifier + ".", bExpandTableElements);
                // remove line containing rootIdentifier in gdbVariablesInfo
                let indexRootIdentifier = -1;
                for (const entry of variablesInfo) {
                    if (entry.filename === filename) {
                        entry.identifiersList.forEach((item, index) => {
                            if (item.identifier === rootIdentifier) {
                                indexRootIdentifier = index;
                            }
                        });
                        if (indexRootIdentifier !== -1) {
                            // Remove the line containing rootIdentifier
                            entry.identifiersList.splice(indexRootIdentifier, 1);
                        }
                        else {
                            logger.error("PROGRAMMING ERROR - Unknown identifier");
                        }
                        break;
                    }
                }
                // add lines with "rootIdentifier." in newGdbVariablesInfo
                let filenameExist = false;
                let variableInfo = {
                    filename,
                    identifiersList: []
                };
                for (variableInfo of newVariablesInfo) {
                    if (variableInfo.filename === filename) {
                        // There are already new identifiers added for the current filename
                        filenameExist = true;
                        break;
                    }
                }
                // Add the new filename in the list
                if (filenameExist === false) {
                    variableInfo = {
                        filename,
                        identifiersList: []
                    };
                    newVariablesInfo.push(variableInfo);
                }
                for (const newEntry of variablesList) {
                    variableInfo.identifiersList.push({
                        classHierarchy: hierarchy,
                        identifier: newEntry.identifier
                    });
                }
                return "";
            }
        }
    }
    logger.trace("type = ", tmpStr);
    return tmpStr;
}
exports.extractType = extractType;
/**
 * Service to compute the type value returned to elf parser client.
 * @param expr - input type returned by GDB (following C-grammar)
 * @param size - type size returned by GDB
 * @returns number - extracted type (among TYPE_VALUE enum)
 */
function computeTypeValue(expr, size) {
    logger.trace("expr = ", expr, ", size = ", size);
    // Suppress leading and trailing spaces
    let typeValue;
    let tmpStr = expr.trim();
    const SIZE_MARKER = "= ";
    const pos = size.indexOf(SIZE_MARKER) + SIZE_MARKER.length;
    const tmpSize = size.substring(pos, size.length).trim();
    // Remove storage class specifier
    tmpStr = removeStorageClassSpecifier(tmpStr);
    // Special case for pointers, that are managed independently from the pointed type.
    if (tmpStr.lastIndexOf("*") !== -1) {
        // Default to 16 bits unsigned, as most common value in case of error.
        // FIXME: Note that we can not currently manage 3-bytes pointers ...
        typeValue = TYPE_VALUE.UNSIGNED_16;
        // Use the GDB command "sizeof" in order to compute the type of the instance
        if (tmpSize === "1") {
            // Pointers as 8 bits unsigned
            typeValue = TYPE_VALUE.UNSIGNED_8;
        }
        if (tmpSize === "4") {
            // Pointers as 32 bits unsigned
            typeValue = TYPE_VALUE.UNSIGNED_32;
        }
    }
    else if (tmpStr.startsWith("enum")) {
        // Special case for enum: default type on STM8 and STM32 is signed 16 bits, but may
        // be less according to the compiler.
        typeValue = TYPE_VALUE.SIGNED_16;
        // Use the GDB command "sizeof" in order to compute the type of the instance
        if (tmpSize === "1") {
            // Enum as signed 8 bits
            typeValue = TYPE_VALUE.SIGNED_8;
        }
    }
    else {
        switch (tmpStr) {
            case "unsigned char":
            case "_Bool":
                // unsigned 8bits: 1
                typeValue = TYPE_VALUE.UNSIGNED_8;
                break;
            case "char":
            case "signed char":
                // signed 8bits: 2
                typeValue = TYPE_VALUE.SIGNED_8;
                break;
            case "unsigned short":
            case "unsigned short int":
            case "short unsigned int":
                // unsigned 16 bits : 3
                typeValue = TYPE_VALUE.UNSIGNED_16;
                break;
            case "short":
            case "short int":
            case "signed short":
            case "signed short int":
            case "short signed int":
                // signed 16bits: 4
                typeValue = TYPE_VALUE.SIGNED_16;
                break;
            case "unsigned int":
                // The size of "int" depends on the target (16 bits on STM8, 32 on STM32)
                // Set as unsigned 32 bits by default: 5
                typeValue = TYPE_VALUE.UNSIGNED_32;
                if (tmpSize === "2") {
                    // unsigned 16bits: 3
                    typeValue = TYPE_VALUE.UNSIGNED_16;
                }
                break;
            case "int":
            case "signed int":
                // The size of "int" depends on the target (16 bits on STM8, 32 on STM32)
                // Set as signed 32 bits by default: 6
                typeValue = TYPE_VALUE.SIGNED_32;
                if (tmpSize === "2") {
                    // signed 16bits: 4
                    typeValue = TYPE_VALUE.SIGNED_16;
                }
                break;
            case "unsigned long":
            case "unsigned long int":
            case "long unsigned int":
                // unsigned 32bits on STM32: 5
                typeValue = TYPE_VALUE.UNSIGNED_32;
                break;
            case "long":
            case "long int":
            case "signed long":
            case "signed long int":
            case "long signed int":
                typeValue = TYPE_VALUE.SIGNED_32;
                // signed 32bits on STM32: 6
                break;
            case "unsigned long long":
            case "unsigned long long int":
            case "long long unsigned int":
                // unsigned 64bits on STM32: 7
                typeValue = TYPE_VALUE.UNSIGNED_64;
                break;
            case "long long":
            case "long long int":
            case "signed long long":
            case "signed long long int":
            case "long long signed int":
                // signed 64bits on STM32: 8
                typeValue = TYPE_VALUE.SIGNED_64;
                break;
            case "float":
                // Float on STM32: 9
                typeValue = TYPE_VALUE.FLOAT;
                break;
            case "double":
            case "long double":
                // Double on STM32: 10
                typeValue = TYPE_VALUE.DOUBLE;
                break;
            default:
                // If we are here: unexpected expression
                logger.error("ComputeTypeValue - Unexpected expression = ", tmpStr);
                typeValue = -1;
                break;
        }
    }
    logger.trace("typeValue = ", typeValue);
    return typeValue;
}
exports.computeTypeValue = computeTypeValue;
/**
 * Service to extract address.
 * @param expr - input string containing address returned by GDB
 * @returns string - extracted address
 */
function extractAddress(expr) {
    logger.trace("expr = ", expr);
    let addr = "";
    const ADDRESS_MARKER = "= ";
    const pos = expr.indexOf(ADDRESS_MARKER);
    if (pos !== -1) {
        const start = pos + ADDRESS_MARKER.length;
        const end = expr.length;
        addr = expr.substring(start, end);
    }
    else {
        logger.warn("not valid address : ", expr);
    }
    logger.trace("addr = ", addr);
    return addr;
}
exports.extractAddress = extractAddress;
/**
 * Service to remove all the storage class
 * @param expr - input string containing type returned by GDB
 * @returns string - type without storage class
 */
function removeStorageClassSpecifier(expr) {
    logger.trace("expr = ", expr);
    const EXTERN_MARKER = "extern ";
    const STATIC_MARKER = "static ";
    const VOLATILE_MARKER = "volatile ";
    const CONST_MARKER = "const ";
    let tmpStr = expr;
    // Ignore storage class specifier, if any. Use a loop in order to get rid of the order.
    let bStorageClassFound = true;
    while (bStorageClassFound === true) {
        bStorageClassFound = false;
        if (tmpStr.startsWith(EXTERN_MARKER)) {
            tmpStr = tmpStr.substring(EXTERN_MARKER.length);
            bStorageClassFound = true;
        }
        if (tmpStr.startsWith(STATIC_MARKER)) {
            tmpStr = tmpStr.substring(STATIC_MARKER.length);
            bStorageClassFound = true;
        }
        if (tmpStr.startsWith(VOLATILE_MARKER)) {
            tmpStr = tmpStr.substring(VOLATILE_MARKER.length);
            bStorageClassFound = true;
        }
        if (tmpStr.startsWith(CONST_MARKER)) {
            tmpStr = tmpStr.substring(CONST_MARKER.length);
            bStorageClassFound = true;
        }
    }
    logger.trace("Without storage class specifier = ", tmpStr);
    return tmpStr;
}
