// This script reads the abilityEffects.js and itemEffects.js files as text,
// extracts all the keys (the names of the abilities and items) using regular expressions,
// and saves them into a new file named 'allNames.json'.
// This approach avoids issues with module dependencies within the source files.

// Import the 'fs' module to handle file system operations.
import * as fs from 'fs';
import * as path from 'path';

/**
 * Extracts top-level keys from a JavaScript object string using a regular expression.
 * @param {string} fileContent - The string content of the JavaScript file.
 * @returns {string[]} An array of the extracted key names.
 */
function extractKeys(fileContent) {
  // This regex looks for string literals (in single or double quotes)
  // that are followed by a colon and an opening curly brace, which
  // is the pattern for the main keys in your files.
  const regex = /['"]([^'"]+)['"]\s*:\s*{/g;
  const keys = [];
  let match;
  // Loop through all matches found in the file content.
  while ((match = regex.exec(fileContent)) !== null) {
    // Add the captured group (the key name) to our array.
    keys.push(match[1]);
  }
  return keys;
}

try {
  // Define the paths to your source files.
  // Make sure these paths are correct relative to where you run the script.
  const abilityFilePath = '../my-pokemon-app/src/hooks/battle-engine/abilityEffects.js';
  const itemFilePath = '../my-pokemon-app/src/hooks/battle-engine/itemEffects.js';

  // Read the file contents as plain text.
  const abilityFileContent = fs.readFileSync(abilityFilePath, 'utf8');
  const itemFileContent = fs.readFileSync(itemFilePath, 'utf8');

  // Extract the keys using our regex function.
  const abilityNames = extractKeys(abilityFileContent);
  // Sort the ability names alphabetically.
  abilityNames.sort();
  console.log(`Successfully extracted and sorted ${abilityNames.length} ability names.`);

  const itemNames = extractKeys(itemFileContent);
  // Sort the item names alphabetically.
  itemNames.sort();
  console.log(`Successfully extracted and sorted ${itemNames.length} item names.`);

  // Combine both arrays into a single object.
  const allNames = {
    abilities: abilityNames,
    items: itemNames,
  };

  // Convert the object to a nicely formatted JSON string.
  const fileContent = JSON.stringify(allNames, null, 2);

  // Define the output file name.
  const outputFileName = 'allNames.json';

  // Write the JSON string to the output file.
  fs.writeFileSync(outputFileName, fileContent);

  console.log(`Successfully created ${outputFileName} with all the names!`);

} catch (error) {
  // If any error occurs, log it to the console.
  console.error('An error occurred while creating the file:', error);
}

