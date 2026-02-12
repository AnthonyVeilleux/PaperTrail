import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  //lint all JS like files inclding apps script .gs
  {
    files: ["**/*.{js,mjs,cjs,gs}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        //browser + node (CI, Mocha, Playwright)
        ...globals.browser,
        ...globals.node,

        // apps script globls
        google: "readonly",
        DocumentApp: "readonly",
        PropertiesService: "readonly",
        ScriptApp: "readonly",
        DriveApp: "readonly",
        UrlFetchApp: "readonly",
        HtmlService: "readonly",
        Utilities: "readonly",
        Logger: "readonly",
        SpreadsheetApp: "readonly",
        GmailApp: "readonly",
        Session: "readonly",
        CacheService: "readonly",
        LockService: "readonly",
        ContentService: "readonly",
      },
    },
  },
  //apps script functions are called by name. allow unused top level functions in .gs : when running lint it will tell you there are errors or unused vars because those are apps script specific. 
  {
    files: ["**/*.gs"],
    rules: {
      "no-unused-vars": "off",
      "no-useless-escape": "off"  
    }
  },
  {     //stop throwing errors for "describe" and "it" in test files
  files: ["test/**/*.js"],
  languageOptions: {
    globals: {
      describe: "readonly",
      it: "readonly",
      before: "readonly",
      after: "readonly",
      beforeEach: "readonly",
      afterEach: "readonly"
    }
  }
}

  
]);
