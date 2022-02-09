const Configuration = {
  /*
     * Resolve and load @commitlint/config-conventional from node_modules.
     * Referenced packages must be installed
     */
  extends: ["@commitlint/config-conventional"],
  /*
     * Any rules defined here will override rules from @commitlint/config-conventional
     */
  rules: {
    "header-max-length": [0, "always", 100]
  }
};

module.exports = Configuration;
