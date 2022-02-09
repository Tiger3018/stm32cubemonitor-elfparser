/*!
 * module node-elfparser
 * Copyright(c) 2019 STMicroelectronics
 */

import { getLogger } from "@stm32/stm32cubemonitor-logger";
const logger = getLogger("elfparser");

import { spawn } from "child_process";
import { existsSync } from "fs";
import * as path from "path";
import {
  computeTypeValue,
  extractAddress,
  extractType,
  parseGdbVariablesInfo,
  TgdbVariablesInfo
} from "./gdbInfoDecoder";

/**
 * Elf parser state machine
 */
enum State {
  SET_METHODS_OFF = "Set methods off",
  SET_TYPEDEFS_OFF = "init typedefs off",
  IDLE = "Idle",
  START_GDB = "Start GDB",
  GET_VARIABLES_INFO = "Request Info Variables",
  GET_TYPE = "Get identifier type",
  GET_SIZE = "Get identifier size",
  GET_ADDRESS = "Get identifier address"
}

/**
 * Information type requested to GDB
 */
enum InformationType {
  IDENTIFIER = "Identifier",
  TYPE = "Type",
  SIZE = "Size",
  ADDRESS = "Address"
}

/**
 * Status returned by readElf function
 */
export enum Status {
  // common result codes
  ELFPARSER_OK,
  ELFPARSER_ELFFILENAME_NOT_FOUND = "Elf file not found",
  ELFPARSER_PARSING_ONGOING = "Parsing of the elf file is ongoing",
  ELFPARSER_ERR = "Unexpected error"
}

/**
 * function readElf callback parameters
 */
export type TvariablesInfo = Array<{
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
export class ElfParser {
  /** Current elf parser state (mainly used to determine next actions when gdb has replied) */
  private currentState: State;
  /** Previous elf parser state (mainly used to compute elf parsing progress status) */
  private previousState: State;

  /**
   * Variable used to keep the callback value (one of function readElf input parameter).
   * This value is used in function sendVariablesInfoToClient to send result to the client.
   */
  private callback;
  /**
   * Variable used to keep the expandTableElements value (one of function readElf input parameter).
   * This value is used when parsing variables of type array returned by GDB.
   */
  private expandTableElements: boolean;

  /**
   * Variable used to keep the progress callback value (one of function readElf input parameter).
   * This value is used during elf parsing to send progress status to the client.
   */
  private progressCallback;

  /** GDB process identifier */
  private gdbProcess;

  /** Variable used to concatenate responses coming from GDB process by stdout pipe */
  private dataBuffer: string;

  /** Variable used to keep the elf parsing start time */
  private startTime: number;

  /** Variable used to keep the elf parsing end time */
  private endTime: number;

  /**
   * Array used to store successively all variables information coming from GDB process
   * and used to fill callback parameters (type TvariablesInfo).
   */
  private gdbVariablesInfo: TgdbVariablesInfo;

  /**
   * Arrays used to store temporarily new types (like struct & union fields) coming from GDB process.
   * During the identification of the type of each identifier, new types (like struct & union fields) can be identified.
   * After the treatment of one batch of commands to identify types, newGdbVariablesInfo content is moved
   * to gdbVariablesInfo and a new batch of commands to identify these new types is launched.
   */
  private newGdbVariablesInfo: TgdbVariablesInfo;

  /** Counter of GDB responses (mainly used to compute elf parsing progress status) */
  private gdbResponseCounter: number;

  /** Number of variables identified by GDB (mainly used to compute elf parsing progress status) */
  private numberOfVariables: number;

  /** Current progress status (minly used to return the progress status to the client) */
  private progressStatus: number;

  /** Current filename index (used to store quickly responses coming from GDB in private gdbVariablesInfo) */
  private currentFilenameIdx: number;

  /** Current identifiers index (used to store quickly responses coming from GDB in private gdbVariablesInfo) */
  private currentIdentifierIdx: number;

  /**
   * List of constants useful to decode GDB responses
   */
  /** Command to request GDB to omit the methods definitions inside a class */
  private GDB_SET_METHOD_OFF: string = "set print type methods off\n";
  /** Command to request GDB to omit the typedef definitions inside a class */
  private GDB_SET_TYPEDEF_OFF: string = "set print type typedefs off\n";
  /** Command to request GDB to return all variables (of first level) */
  private GDB_GET_INFO_VARIABLES: string = "info variables\n";
  /** Command to request GDB to return the type of a variable */
  private GDB_GET_TYPE_HEAD: string = "ptype ";
  /** Tail of the command to request GDB to return the type of a variable */
  private GDB_GET_TYPE_TAIL: string = "\n";
  /** Command to request GDB to return the size of a variable */
  private GDB_GET_SIZE_HEAD: string = "p sizeof ";
  /** Tail of the command to request GDB to return the size of a variable */
  private GDB_GET_SIZE_TAIL: string = "\n";
  /** Command to request GDB to return the address of a variable */
  private GDB_GET_ADDRESS_HEAD: string = "print /x &(";
  /** Tail of the command to request GDB to return the address of a variable */
  private GDB_GET_ADDRESS_TAIL: string = ")\n";
  /** Command to quit GDB */
  private GDB_QUIT: string = "quit\n";
  /** Constant used to detect the end of GDB response */
  private GDB_PROMPT: string = "(gdb) ";
  /** Head of the GDB response for a command to get the type of a variable */
  private GDB_RESP_TYPE_HEAD: string = "type = ";

  /**
   * Class constructor
   */
  constructor() {
    this.currentState = State.IDLE;
    this.previousState = State.IDLE;
    this.dataBuffer = "";
    this.gdbProcess = null;
    this.expandTableElements = false;
    this.callback = null;
    this.progressCallback = null;
    this.gdbVariablesInfo = [];
    this.newGdbVariablesInfo = [];
    this.startTime = 0;
    this.endTime = 0;
    this.gdbResponseCounter = 0;
    this.numberOfVariables = 0;
    this.progressStatus = 0;
    this.currentFilenameIdx = 0;
    this.currentIdentifierIdx = 0;
  }

  /**
   * Service to return global variables information from elf file.
   *
   * @param elfFilename - elf file name.
   * @param callback - callback called with elf variables information.
   * @param expandTableElements - indicates if the array information should be limited to the first element or not.
   * @returns - status.
   */
  public readElf(
    elfFilename: string,
    callback: (variablesInfo: TvariablesInfo) => void,
    expandTableElements: boolean = false,
    progressCallback?: (progressStatus: number) => void
  ): Status {
    logger.debug("elfFilename = " + elfFilename + ", expandTableElements = " + expandTableElements);
    logger.trace("callback = " + callback);
    if (progressCallback) {
      logger.trace("progressCallback = " + progressCallback);
    }

    // Take and Store the elf parsing start time
    this.startTime = new Date().getTime();

    let status: Status = Status.ELFPARSER_OK;

    // Store input parameters value
    this.callback = callback;
    this.expandTableElements = expandTableElements;
    this.progressCallback = progressCallback;

    // Return one error if eflFilename does not exist
    if (!existsSync(elfFilename)) {
      status = Status.ELFPARSER_ELFFILENAME_NOT_FOUND;
    } else if (this.currentState !== State.IDLE) {
      status = Status.ELFPARSER_PARSING_ONGOING;
    } else {
      // Start GDB (and indicate elf file name as parameter)
      logger.trace("Start GDB");
      let gdbExecName: string;
      if (process.platform === "linux") {
        gdbExecName = "arm-none-eabi-gdb";
      } else if (process.platform === "darwin") {
        gdbExecName = "arm-none-eabi-gdb-macos";
      } else {
        // windows
        gdbExecName = "arm-none-eabi-gdb.exe";
      }
      // the gdb binaries are not inside the asar pack. Update the path to use unpacked
      const gdbExec: string = path.join(__dirname, "..", "bin", gdbExecName).replace("app.asar", "app.asar.unpacked");
      this.currentState = State.START_GDB;
      this.gdbProcess = spawn(gdbExec, [elfFilename], { stdio: ["pipe"] });

      // Set stdio pipe listeners
      logger.trace("Set listeners");
      this.gdbProcess.stdout.on("data", (data) => {
        this.readData(data);
      });

      this.gdbProcess.stderr.on("data", (data) => {
        this.readError(data);
      });

      this.gdbProcess.on("close", (code) => {
        this.sendVariablesInfoToClient(code);
      });
    }

    if (status !== Status.ELFPARSER_OK) {
      logger.error("readElf file reading NOT started - Status = " + status);
      this.callback([]);
      // Store the elf parsing ending time
      this.endTime = new Date().getTime();
      logger.trace("Elf parsing duration = " + (this.endTime - this.startTime) + " ms");
    } else {
      logger.info("readElf file reading started");
    }

    logger.debug("status = " + status);
    return status;
  }

  /**
   * Service to decode data returned by GDB.
   * Perform a different treatment following the current elf parser machine state.
   *
   * @param data - Data returned by GDB.
   * @returns void
   */
  private readData(data: string): void {
    logger.trace("data = " + data);

    // Concatenate incoming data in internal data buffer
    this.dataBuffer = this.dataBuffer.concat(data);

    // return if GDB has not finished to process the last command
    if (this.dataBuffer.includes(this.GDB_PROMPT) !== true) {
      logger.trace("GDB has not finished to process the last command");
      return;
    }

    // Read response(s) coming from GDB
    while (this.dataBuffer !== "") {
      // Build the first GDB response
      const endGdbResponse: number = this.dataBuffer.indexOf(this.GDB_PROMPT);
      if (endGdbResponse === -1) {
        // No more (or no complete) GDB response, stop parsing dataBuffer
        break;
      }

      // Build the GDB response
      const gdbResponse: string = this.dataBuffer.slice(0, endGdbResponse + this.GDB_PROMPT.length);
      this.dataBuffer = this.dataBuffer.slice(endGdbResponse + this.GDB_PROMPT.length);

      let identifierFound: boolean = false;

      // Treat GDB response (following current elf parser state machine)
      switch (this.currentState) {
        case State.IDLE:
          break;

        case State.START_GDB:
          this.currentState = State.SET_METHODS_OFF;
          logger.trace("currentState = " + this.currentState);
          this.sendCommandToGdb(this.GDB_SET_METHOD_OFF);
          break;

        case State.SET_METHODS_OFF:
          this.currentState = State.SET_TYPEDEFS_OFF;
          logger.trace("currentState = " + this.currentState);
          this.sendCommandToGdb(this.GDB_SET_TYPEDEF_OFF);
          break;

        case State.SET_TYPEDEFS_OFF:
          // GDB has been started
          // Request to GDB the information of variables (of first level)
          this.currentState = State.GET_VARIABLES_INFO;
          logger.trace("currentState = " + this.currentState);
          this.sendCommandToGdb(this.GDB_GET_INFO_VARIABLES);
          break;

        case State.GET_VARIABLES_INFO:
          // Information of variables (of first level) has been returned by GDB
          // Start building gdbVariablesInfo
          this.gdbVariablesInfo = parseGdbVariablesInfo(gdbResponse, this.expandTableElements);

          if (this.gdbVariablesInfo.length === 0) {
            // No global variable has been detected by GDB in the elf file
            // Request to quit GDB
            this.currentState = State.IDLE;
            logger.trace("currentState = " + this.currentState);
            this.sendCommandToGdb(this.GDB_QUIT);
          } else {
            // Request to GDB to get the type of all identifiers
            this.requestAllElementsToGdb(InformationType.TYPE);
            this.currentState = State.GET_TYPE;
          }
          break;

        case State.GET_TYPE:
          // Type of one identifer has been returned by GDB
          identifierFound = this.storeAllElementsFromGdb(gdbResponse, InformationType.TYPE);

          if (identifierFound === false) {
            // Each type of each variable identifier has been returned by GDB

            if (this.newGdbVariablesInfo.length !== 0) {
              // New types (like structure fields) have been identified and stored in newGdbVariablesInfo.
              // move newGdbVariablesInfo content into gdbVariablesInfo content
              for (const newEntry of this.newGdbVariablesInfo) {
                for (const entry of this.gdbVariablesInfo) {
                  if (newEntry.filename === entry.filename) {
                    for (const newElement of newEntry.identifiersList) {
                      entry.identifiersList.push(newElement);
                    }
                  }
                }
              }

              // Reset newGdbVariablesInfo content
              this.newGdbVariablesInfo = [];

              // Request to GDB to get the type of all these new identifiers
              this.requestAllElementsToGdb(InformationType.TYPE);
            } else {
              // Types of all identifiers have been identified.
              // Request now to GDB the size of all the identifiers
              this.requestAllElementsToGdb(InformationType.SIZE);
              this.currentState = State.GET_SIZE;
            }
          }
          break;

        case State.GET_SIZE:
          // Size of one identifier has been returned by GDB
          identifierFound = this.storeAllElementsFromGdb(gdbResponse, InformationType.SIZE);

          if (identifierFound === false) {
            // Size of each variable identifier has been returned by GDB
            // Apply now the same type and size for each array element
            this.postProcessArraysInfo();

            // Request now to GDB the address of all the identifiers
            this.requestAllElementsToGdb(InformationType.ADDRESS);
            this.currentState = State.GET_ADDRESS;
          }
          break;

        case State.GET_ADDRESS:
          // Address of one identifier has been returned by GDB
          identifierFound = this.storeAllElementsFromGdb(gdbResponse, InformationType.ADDRESS);

          if (identifierFound === false) {
            // Address of each variable identifier has been returned by GDB
            this.currentState = State.IDLE;
            logger.trace("currentState = " + this.currentState);
            this.sendCommandToGdb(this.GDB_QUIT);
          }
          break;

        default:
          break;
      }
    }

    // Send progress status to client
    this.sendProgressStatusToClient();
  }

  /**
   * Service to manage error returned by GDB.
   *
   * @param err - Error returned by GDB
   * @returns void
   */
  private readError(err: string): void {
    logger.warn("Information returned by gdb : " + err);
  }

  /**
   * Service to send variables information to client (after GDB has exited).
   *
   * @param code - Code returned by GDB after exiting.
   * @returns void
   */
  private sendVariablesInfoToClient(code: string): void {
    logger.trace("code = " + code);

    // build variablesInfo (using gdbVariablesInfo)
    const variablesInfo: TvariablesInfo = [];
    for (const entry of this.gdbVariablesInfo) {
      for (const element of entry.identifiersList) {
        if (element.address !== undefined && element.address !== "" && element.typeValue !== undefined) {
          variablesInfo.push({
            address:
              "0x" +
              Number(element.address)
                .toString(16)
                .padStart(8, "0"),
            name: element.identifier,
            type: element.typeValue
          });
        }
      }
    }

    // Sort array of variables information
    variablesInfo.sort((a, b) => {
      return a.name.localeCompare(b.name);
    });

    logger.debug(variablesInfo);

    // Call the callback (mentioned as parameter in readElf) with the variables information
    this.callback(variablesInfo);

    // Store the elf parsing end time
    this.endTime = new Date().getTime();
    logger.trace("Elf parsing duration = " + (this.endTime - this.startTime) + " ms");

    logger.info("readElf execution completed");
  }

  /**
   * Service to send one command to GDB (using stdin pipe).
   *
   * @param command - command to GDB.
   * @returns void
   */
  private sendCommandToGdb(command: string): void {
    logger.trace("command = " + command);
    this.gdbProcess.stdin.write(command);
  }

  /**
   * Service to send a batch of GDB commands to get the param InformationType of all identifiers.
   *
   * @param informationType - Information type requested to GDB.
   */
  private requestAllElementsToGdb(informationType: InformationType): void {
    logger.trace("informationType = " + informationType);

    switch (informationType) {
      case InformationType.TYPE:
        for (const entry of this.gdbVariablesInfo) {
          for (const element of entry.identifiersList) {
            if (element.type === undefined) {
              this.sendCommandToGdb(this.GDB_GET_TYPE_HEAD + element.identifier + this.GDB_GET_TYPE_TAIL);
            } else if (element.type[0] === "?") {
              this.sendCommandToGdb(this.GDB_GET_TYPE_HEAD + element.type.substring(1) + this.GDB_GET_TYPE_TAIL);
            }
          }
        }
        this.sendCommandToGdb("StopRequestType\n");
        break;

      case InformationType.SIZE:
        for (const entry of this.gdbVariablesInfo) {
          for (const element of entry.identifiersList) {
            this.sendCommandToGdb(this.GDB_GET_SIZE_HEAD + element.identifier + this.GDB_GET_SIZE_TAIL);
          }
        }
        this.sendCommandToGdb("StopRequestSize\n");
        this.currentState = State.GET_SIZE;
        break;

      case InformationType.ADDRESS:
        for (const entry of this.gdbVariablesInfo) {
          for (const element of entry.identifiersList) {
            this.sendCommandToGdb(this.GDB_GET_ADDRESS_HEAD + element.identifier + this.GDB_GET_ADDRESS_TAIL);
          }
        }
        this.sendCommandToGdb("StopRequestAddress\n");
        this.currentState = State.GET_ADDRESS;
        break;

      default:
        logger.error(
          "requestAllElementsToGdb - PROGRAMMING ERROR - State = " +
            this.currentState +
            " - Unknown information type = " +
            informationType +
            " - gdbVariablesInfo = " +
            this.gdbVariablesInfo
        );
        break;
    }

    // Reset current filename and identifier index
    this.currentFilenameIdx = 0;
    this.currentIdentifierIdx = 0;

    // Update the number of variables (identified by GDB)
    this.numberOfVariables = this.computeNumberOfVariables();
  }

  /**
   * Service to store the GDB response param gdbResponse of type param InformationType in private gdbVariablesInfo.
   *
   * @param gdbResponse - GDB response.
   * @param informationType - Information type requested to GDB.
   * @returns - Indicates whether the identifier has been found.
   */
  private storeAllElementsFromGdb(gdbResponse: string, informationType: InformationType): boolean {
    logger.trace("informationType = " + informationType);
    let identifierFound: boolean = false;
    let element;

    storeElement: for (
      let filenameIndex = this.currentFilenameIdx;
      filenameIndex < this.gdbVariablesInfo.length;
      filenameIndex++
    ) {
      for (
        let identifiersListIndex = this.currentIdentifierIdx;
        identifiersListIndex < this.gdbVariablesInfo[filenameIndex].identifiersList.length;
        identifiersListIndex++
      ) {
        element = this.gdbVariablesInfo[filenameIndex].identifiersList[identifiersListIndex];

        switch (informationType) {
          case InformationType.TYPE:
            if (element.type === undefined || element.type[0] === "?") {
              identifierFound = true;
              element.type = extractType(
                this.gdbVariablesInfo,
                this.newGdbVariablesInfo,
                this.gdbVariablesInfo[filenameIndex].filename,
                gdbResponse
                  .substring(this.GDB_RESP_TYPE_HEAD.length, gdbResponse.length - this.GDB_PROMPT.length)
                  .trim(),
                element.identifier,
                element.classHierarchy,
                this.expandTableElements
              );
            }
            break;

          case InformationType.SIZE:
            if (element.typeValue === undefined) {
              identifierFound = true;
              if (element.type !== undefined) {
                element.typeValue = computeTypeValue(
                  element.type,
                  gdbResponse.substring(0, gdbResponse.length - this.GDB_PROMPT.length).trim()
                );
              }
            }
            break;

          case InformationType.ADDRESS:
            if (element.address === undefined) {
              identifierFound = true;
              element.address = extractAddress(
                gdbResponse.substring(0, gdbResponse.length - this.GDB_PROMPT.length).trim()
              );
            }
            break;

          default:
            logger.error(
              "storeAllElementsFromGdb - PROGRAMMING ERROR - State = " +
                this.currentState +
                " - Unknown information type = " +
                informationType +
                " - gdbVariablesInfo = " +
                this.gdbVariablesInfo
            );
            break;
        }

        if (identifierFound === true) {
          this.currentFilenameIdx = filenameIndex;
          this.currentIdentifierIdx = identifiersListIndex;
          this.gdbResponseCounter++;
          break storeElement;
        }
      }

      this.currentIdentifierIdx = 0;
    }

    logger.trace("identifierFound = " + identifierFound);
    return identifierFound;
  }

  /**
   * Post process information related to arrays in gdbVariablesInfo.
   * Apply the same type and size for each array element.
   *
   * @returns void
   */
  private postProcessArraysInfo(): void {
    if (this.expandTableElements === true) {
      // Add "markers" in [] which will help to duplicate array information
      for (const entry of this.gdbVariablesInfo) {
        for (const element of entry.identifiersList) {
          element.identifier = element.identifier.replace(/\[/g, "[x");
          element.identifier = element.identifier.replace(/\]/g, "x]");
        }
      }

      // Boolean indicating whether the postprocessing is ongoing or not
      let stillProcessing: boolean;
      // Head of the identifier (up to "[")
      let identifierHead: string;
      // Array size
      let arraySizeStr: string;
      let arraySize: number;
      // Tail of the identifier (from "]")
      let IdentifierTail: string;

      // Parse each file of gdbVariablesInfo
      for (const entry of this.gdbVariablesInfo) {
        stillProcessing = true;

        while (stillProcessing === true) {
          stillProcessing = false;

          // Parse identifiers list (of each file)
          for (const element of entry.identifiersList) {
            // Locate array (starting from the end of the identifier name)
            const tblStartIdx: number = element.identifier.lastIndexOf("[x");
            const tblEndIdx: number = element.identifier.lastIndexOf("x]");

            if (tblStartIdx !== -1) {
              // One array has been detected in the identifier name
              stillProcessing = true;

              identifierHead = element.identifier.slice(0, tblStartIdx + 1);
              arraySizeStr = element.identifier.substring(tblStartIdx + 2, tblEndIdx);
              arraySize = parseInt(arraySizeStr, 10);
              IdentifierTail = element.identifier.slice(tblEndIdx + 1);
              logger.trace(
                "identifier = " +
                  element.identifier +
                  ", identifierHead = " +
                  identifierHead +
                  ", arraySize = " +
                  arraySize +
                  ", IdentifierTail = " +
                  IdentifierTail
              );

              // Update the current identifier (by removing the marker and setting the correct size)
              element.identifier = identifierHead + arraySize + IdentifierTail;

              // Expanding the array but with 10000  elements max
              const size = Math.min(arraySize, 10000);
              for (let i = 0; i < size; i++) {
                entry.identifiersList.push({
                  identifier: identifierHead + i + IdentifierTail,
                  type: element.type,
                  typeValue: element.typeValue
                });
              }
            }
          }
        }
      }
    }
  }

  /**
   * Service to compute the number of variables (identified by GDB).
   * Thee number of variables is useful to compute the elf parsing progress status.
   *
   * @returns - number of variables.
   */
  private computeNumberOfVariables(): number {
    let numberOfVariables: number = 0;
    for (const entry of this.gdbVariablesInfo) {
      numberOfVariables += entry.identifiersList.length;
    }
    logger.trace("Number of Variables = " + numberOfVariables);
    return numberOfVariables;
  }

  /**
   * Service to send progress status to client during elf parsing.
   *
   * @returns void
   */
  private sendProgressStatusToClient(): void {
    let progressStatus: number = 0;

    if (this.progressCallback) {
      switch (this.currentState) {
        case State.IDLE:
          progressStatus = 100;
          break;

        case State.START_GDB:
        case State.SET_METHODS_OFF:
        case State.SET_TYPEDEFS_OFF:
          break;

        case State.GET_VARIABLES_INFO:
          progressStatus = 10;
          break;

        case State.GET_TYPE:
          progressStatus = 25;
          break;

        case State.GET_SIZE:
          if (this.previousState !== this.currentState) {
            progressStatus = 50;
            this.gdbResponseCounter = 0;
          } else {
            progressStatus = 50 + Math.floor((75 - 50) * (this.gdbResponseCounter / this.numberOfVariables));
          }
          break;

        case State.GET_ADDRESS:
          if (this.previousState !== this.currentState) {
            progressStatus = 75;
            this.gdbResponseCounter = 0;
          } else {
            progressStatus = 75 + Math.floor((100 - 75) * (this.gdbResponseCounter / this.numberOfVariables));
          }
          break;

        default:
          break;
      }
      this.previousState = this.currentState;
      // Call progress callback only if progress status has changed
      if (this.progressStatus !== progressStatus) {
        this.progressStatus = progressStatus;
        logger.trace(progressStatus);
        this.progressCallback(progressStatus);
      }
    }
  }
}
