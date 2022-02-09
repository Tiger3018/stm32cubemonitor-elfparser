/*!
 * module node-elfparser
 * Copyright(c) 2019 STMicroelectronics
 */

import { expect } from "chai";
import "mocha";
import * as path from "path";

/**
 * Tested module
 */
/* allow console.log for unit tests */
/* eslint no-console: ["error", { allow: ["log"]}] */
import { ElfParser, Status } from "../src/index";

describe("#readElf()", () => {
  it("should read variables from elf file", (done) => {
    const elfParser = new ElfParser();
    const elfFileName = path.join(__dirname, "NUCLEO-L476RG.out");
    const cb = (variablesInfo) => {
      console.log("cb called");
      expect(variablesInfo.length).to.equal(58);
      done();
    };
    expect(elfParser.readElf(elfFileName, cb)).to.equal(Status.ELFPARSER_OK);
  });

  it("should read variables from elf file containing C++ classes", (done) => {
    const elfParser = new ElfParser();
    const elfFileName = path.join(__dirname, "test_cpp_f411.elf");
    const cb = (variablesInfo) => {
      console.log("cb called");
      expect(variablesInfo.length).to.equal(62);
      done();
    };
    expect(elfParser.readElf(elfFileName, cb)).to.equal(Status.ELFPARSER_OK);
  });

  it("should read variables from elf file from pure C++ project", (done) => {
    const elfParser = new ElfParser();
    const elfFileName = path.join(__dirname, "GRLMPP.axf");
    const cb = (variablesInfo) => {
      console.log("cb called");
      expect(variablesInfo.length).to.equal(620);
      done();
    };
    expect(elfParser.readElf(elfFileName, cb)).to.equal(Status.ELFPARSER_OK);
  });

  it("should read variables from elf file (Array will not be expanded)", (done) => {
    const elfParser = new ElfParser();
    const elfFileName = path.join(__dirname, "NUCLEO-L476RG.out");
    const expandTableElements: boolean = false;
    const cb = (variablesInfo) => {
      console.log("cb called");
      expect(variablesInfo.length).to.equal(58);
      done();
    };
    expect(elfParser.readElf(elfFileName, cb, expandTableElements)).to.equal(Status.ELFPARSER_OK);
  });

  it("should read variables from elf file (Array will be expanded)", (done) => {
    const elfParser = new ElfParser();
    const elfFileName = path.join(__dirname, "NUCLEO-L476RG.out");
    const expandTableElements: boolean = true;
    const cb = (variablesInfo) => {
      console.log("cb called");
      expect(variablesInfo.length).to.equal(165);
      done();
    };
    expect(elfParser.readElf(elfFileName, cb, expandTableElements)).to.equal(Status.ELFPARSER_OK);
  });

  it("should return no variable if the elf file is empty", (done) => {
    const elfParser = new ElfParser();
    const elfFileName = path.join(__dirname, "null.out");
    const expandTableElements: boolean = false;
    const cb = (variablesInfo) => {
      console.log("cb called");
      expect(variablesInfo.length).to.equal(0);
      done();
    };
    expect(elfParser.readElf(elfFileName, cb, expandTableElements)).to.equal(Status.ELFPARSER_OK);
  });

  it("should fail if the elf file does not exist", (done) => {
    const elfParser = new ElfParser();
    const elfFileName = path.join(__dirname, "unknown.out");
    const expandTableElements: boolean = false;
    const cb = (variablesInfo) => {
      console.log("cb called");
      expect(variablesInfo.length).to.equal(0);
      done();
    };
    expect(elfParser.readElf(elfFileName, cb, expandTableElements)).to.equal(Status.ELFPARSER_ELFFILENAME_NOT_FOUND);
  });

  it("should fail if the elf file is corrupted", (done) => {
    const elfParser = new ElfParser();
    const elfFileName = path.join(__dirname, "erroneousElfFile.elf");
    const expandTableElements: boolean = false;
    const cb = (variablesInfo) => {
      console.log("cb called");
      expect(variablesInfo.length).to.equal(0);
      done();
    };
    expect(elfParser.readElf(elfFileName, cb, expandTableElements)).to.equal(Status.ELFPARSER_OK);
  });

  it("should not fail whether some variables in elf file are multidimensional arrays", (done) => {
    const elfParser = new ElfParser();
    const elfFileName = path.join(__dirname, "NUCLEO-F411RE.out");
    const cb = (variablesInfo) => {
      console.log("cb called");
      expect(variablesInfo.length).to.equal(60);
      done();
    };
    expect(elfParser.readElf(elfFileName, cb)).to.equal(Status.ELFPARSER_OK);
  });

  it("should not fail whether one variable in elf file is multidimensional array (Array will be expanded)", (done) => {
    const elfParser = new ElfParser();
    const elfFileName = path.join(__dirname, "NUCLEO-F411RE.out");
    const expandTableElements: boolean = true;
    const cb = (variablesInfo) => {
      console.log("cb called");
      expect(variablesInfo.length).to.equal(156);
      done();
    };
    expect(elfParser.readElf(elfFileName, cb, expandTableElements)).to.equal(Status.ELFPARSER_OK);
  });

  it("read elf file for Evaluation G0 board (Array will not be expanded)", (done) => {
    const elfParser = new ElfParser();
    const elfFileName = path.join(__dirname, "EVAL_G0_GUI.out");
    const expandTableElements: boolean = false;
    const cb = (variablesInfo) => {
      console.log("cb called");
      expect(variablesInfo.length).to.equal(522);
      done();
    };
    expect(elfParser.readElf(elfFileName, cb, expandTableElements)).to.equal(Status.ELFPARSER_OK);
  });

  it("read elf file for Evaluation G0 board (Array will not be expanded, progressCb is set)", (done) => {
    const elfParser = new ElfParser();
    const elfFileName = path.join(__dirname, "EVAL_G0_GUI.out");
    const expandTableElements: boolean = false;
    const cb = (variablesInfo) => {
      console.log("cb called");
      expect(variablesInfo.length).to.equal(522);
      done();
    };
    const progressCb = (progress) => {
      console.log("Progress status = " + progress);
    };
    expect(elfParser.readElf(elfFileName, cb, expandTableElements, progressCb)).to.equal(Status.ELFPARSER_OK);
  });

  it("read elf file for Evaluation G0 board (Array will be expanded)", (done) => {
    const elfParser = new ElfParser();
    const elfFileName = path.join(__dirname, "EVAL_G0_GUI.out");
    const expandTableElements: boolean = true;
    const cb = (variablesInfo) => {
      console.log("cb called");
      expect(variablesInfo.length).to.equal(27356);
      done();
    };
    expect(elfParser.readElf(elfFileName, cb, expandTableElements)).to.equal(Status.ELFPARSER_OK);
  });

  it("should read elf file with very huge array (Array will be expanded)", (done) => {
    const elfParser = new ElfParser();
    const elfFileName = path.join(__dirname, "NUCLEO-L476RG-Array-45000u8.out");
    const expandTableElements: boolean = true;
    const cb = (variablesInfo) => {
      console.log("cb called");
      expect(variablesInfo.length).to.equal(20044);
      done();
    };
    expect(elfParser.readElf(elfFileName, cb, expandTableElements)).to.equal(Status.ELFPARSER_OK);
  });

  it("should read elf file with very huge array (Array will be expanded up to 10000 elements)", (done) => {
    const elfParser = new ElfParser();
    const elfFileName = path.join(__dirname, "test_big_array_f411.elf");
    const expandTableElements: boolean = true;
    const cb = (variablesInfo) => {
      console.log("cb called");
      expect(variablesInfo.length).to.equal(10185);
      expect(variablesInfo.filter((element) => element.name.startsWith("tableau")).length).to.equal(10001);
      done();
    };
    expect(elfParser.readElf(elfFileName, cb, expandTableElements)).to.equal(Status.ELFPARSER_OK);
  });

  it("should read customer axf file with very huge array (Array will be expanded up to 10000 elements)", (done) => {
    const elfParser = new ElfParser();
    const elfFileName = path.join(__dirname, "MGT-FC.axf");
    const expandTableElements: boolean = true;
    const cb = (variablesInfo) => {
      console.log("cb called");
      expect(variablesInfo.length).to.equal(58156);
      expect(variablesInfo.filter((element) => element.name.startsWith("mem2base")).length).to.equal(10001);
      expect(variablesInfo.findIndex((element) => element.name.startsWith("mem2base[29605887]"))).to.be.greaterThan(0);
      done();
    };
    expect(elfParser.readElf(elfFileName, cb, expandTableElements)).to.equal(Status.ELFPARSER_OK);
  });
});
