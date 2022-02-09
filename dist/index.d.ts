/*!
 * module node-elfparser
 * Copyright(c) 2019 STMicroelectronics
 */
/**
 * Status returned by readElf function
 */
export declare enum Status {
  ELFPARSER_OK = 0,
  ELFPARSER_ELFFILENAME_NOT_FOUND = "Elf file not found",
  ELFPARSER_PARSING_ONGOING = "Parsing of the elf file is ongoing",
  ELFPARSER_ERR = "Unexpected error"
}
/**
 * function readElf callback parameters
 */
export declare type TvariablesInfo = Array<{
  /** Variable name */
  name: string;
  /** Variable address */
  address: string;
  /** Variable type index (possible values are listed in {@link gdbInfoDecoder#TYPE_VALUE} */
  type: number;
}>;
/**
 * This class aims at offering some generic services to parse and extract main information from a elf-formatted file.
 */
export declare class ElfParser {
  /** Current elf parser state (mainly used to determine next actions when gdb has replied) */
  private currentState;
  /** Previous elf parser state (mainly used to compute elf parsing progress status) */
  private previousState;
  /**
   * Variable used to keep the callback value (one of function readElf input parameter).
   * This value is used in function sendVariablesInfoToClient to send result to the client.
   */
  private callback;
  /**
   * Variable used to keep the expandTableElements value (one of function readElf input parameter).
   * This value is used when parsing variables of type array returned by GDB.
   */
  private expandTableElements;
  /**
   * Variable used to keep the progress callback value (one of function readElf input parameter).
   * This value is used during elf parsing to send progress status to the client.
   */
  private progressCallback;
  /** GDB process identifier */
  private gdbProcess;
  /** Variable used to concatenate responses coming from GDB process by stdout pipe */
  private dataBuffer;
  /** Variable used to keep the elf parsing start time */
  private startTime;
  /** Variable used to keep the elf parsing end time */
  private endTime;
  /**
   * Array used to store successively all variables information coming from GDB process
   * and used to fill callback parameters (type TvariablesInfo).
   */
  private gdbVariablesInfo;
  /**
   * Arrays used to store temporarily new types (like struct & union fields) coming from GDB process.
   * During the identification of the type of each identifier, new types (like struct & union fields) can be identified.
   * After the treatment of one batch of commands to identify types, newGdbVariablesInfo content is moved
   * to gdbVariablesInfo and a new batch of commands to identify these new types is launched.
   */
  private newGdbVariablesInfo;
  /** Counter of GDB responses (mainly used to compute elf parsing progress status) */
  private gdbResponseCounter;
  /** Number of variables identified by GDB (mainly used to compute elf parsing progress status) */
  private numberOfVariables;
  /** Current progress status (minly used to return the progress status to the client) */
  private progressStatus;
  /** Current filename index (used to store quickly responses coming from GDB in private gdbVariablesInfo) */
  private currentFilenameIdx;
  /** Current identifiers index (used to store quickly responses coming from GDB in private gdbVariablesInfo) */
  private currentIdentifierIdx;
  /**
   * List of constants useful to decode GDB responses
   */
  /** Command to request GDB to omit the methods definitions inside a class */
  private GDB_SET_METHOD_OFF;
  /** Command to request GDB to omit the typedef definitions inside a class */
  private GDB_SET_TYPEDEF_OFF;
  /** Command to request GDB to return all variables (of first level) */
  private GDB_GET_INFO_VARIABLES;
  /** Command to request GDB to return the type of a variable */
  private GDB_GET_TYPE_HEAD;
  /** Tail of the command to request GDB to return the type of a variable */
  private GDB_GET_TYPE_TAIL;
  /** Command to request GDB to return the size of a variable */
  private GDB_GET_SIZE_HEAD;
  /** Tail of the command to request GDB to return the size of a variable */
  private GDB_GET_SIZE_TAIL;
  /** Command to request GDB to return the address of a variable */
  private GDB_GET_ADDRESS_HEAD;
  /** Tail of the command to request GDB to return the address of a variable */
  private GDB_GET_ADDRESS_TAIL;
  /** Command to quit GDB */
  private GDB_QUIT;
  /** Constant used to detect the end of GDB response */
  private GDB_PROMPT;
  /** Head of the GDB response for a command to get the type of a variable */
  private GDB_RESP_TYPE_HEAD;
  /**
   * Class constructor
   */
  constructor();
  /**
   * Service to return global variables information from elf file.
   *
   * @param elfFilename - elf file name.
   * @param callback - callback called with elf variables information.
   * @param expandTableElements - indicates if the array information should be limited to the first element or not.
   * @returns - status.
   */
  readElf(
    elfFilename: string,
    callback: (variablesInfo: TvariablesInfo) => void,
    expandTableElements?: boolean,
    progressCallback?: (progressStatus: number) => void
  ): Status;
  /**
   * Service to decode data returned by GDB.
   * Perform a different treatment following the current elf parser machine state.
   *
   * @param data - Data returned by GDB.
   * @returns void
   */
  private readData;
  /**
   * Service to manage error returned by GDB.
   *
   * @param err - Error returned by GDB
   * @returns void
   */
  private readError;
  /**
   * Service to send variables information to client (after GDB has exited).
   *
   * @param code - Code returned by GDB after exiting.
   * @returns void
   */
  private sendVariablesInfoToClient;
  /**
   * Service to send one command to GDB (using stdin pipe).
   *
   * @param command - command to GDB.
   * @returns void
   */
  private sendCommandToGdb;
  /**
   * Service to send a batch of GDB commands to get the param InformationType of all identifiers.
   *
   * @param informationType - Information type requested to GDB.
   */
  private requestAllElementsToGdb;
  /**
   * Service to store the GDB response param gdbResponse of type param InformationType in private gdbVariablesInfo.
   *
   * @param gdbResponse - GDB response.
   * @param informationType - Information type requested to GDB.
   * @returns - Indicates whether the identifier has been found.
   */
  private storeAllElementsFromGdb;
  /**
   * Post process information related to arrays in gdbVariablesInfo.
   * Apply the same type and size for each array element.
   *
   * @returns void
   */
  private postProcessArraysInfo;
  /**
   * Service to compute the number of variables (identified by GDB).
   * Thee number of variables is useful to compute the elf parsing progress status.
   *
   * @returns - number of variables.
   */
  private computeNumberOfVariables;
  /**
   * Service to send progress status to client during elf parsing.
   *
   * @returns void
   */
  private sendProgressStatusToClient;
}
