/**
 * IMPORT AS TEXT
 *
 * Usage:
 *    node import-text.js <Add-on directory> <locale code> <text file name>
 */

'use strict'

const fs = require('fs');

const {
	ROW_TYPE,
	LOCALES,
	SOURCE_LOCALE,
	parseLuaLocaleFile,
	refreshLocaleFile,
} = require('./modules/common');

/**
 * Main function
 */
function main() {
	const args = process.argv.slice(2);
	const addonPath = args[0].replace(/\\/g, '/').replace(/\/+$/g, '').replace(/"+$/g, '');
	const localeId = args[1];
	const filename = args[2];

	try {
		if (!addonPath) {
			throw `Missing add-on path.`;
		}
		if (!localeId) {
			throw `Missing locale ID.`;
		}
		if (!filename) {
			throw `Missing text file name.`;
		}

		const addonName = addonPath.split('/').pop();
		const sourceLocaleParsedFile = parseLuaLocaleFile(`${addonPath}/locale/${addonName}.${SOURCE_LOCALE}.lua`);
		const textRows = fs.readFileSync(filename, 'utf8').replace(/\r/g, '').split("\n");

		let rowIndex = 0;
		let errors = 0;
		const translations = {};
		for (let sourceRow of sourceLocaleParsedFile) {
			if (sourceRow.type === ROW_TYPE.MESSAGE) {
				// Restore line ends
				let translated = textRows[rowIndex] && textRows[rowIndex].replace(/[ ]*\\[ ]?n[ ]*/g, '\n').replace(/[ ]+$/, '');

				// Check variable consistancy
				const matches = sourceRow.value.matchAll(/\{[a-zA-Z0-9_]+\}/g);
				for (const match of matches) {
					// Variable not found in translated string
					if (translated.indexOf(match[0]) === -1) {
						process.stderr.write(`ERROR: Variable ${match[0]} was not found at line ${rowIndex + 1}.\n`);
						errors++;
					}
				}

				translations[sourceRow.key] = translated;
				rowIndex++;
			}
		}

		// Do not update if provided text file is not valid
		if (errors > 0) {
			process.stderr.write(`Some error occurred. Locale file was NOT updated.\n`);
			return;
		}

		// Refresh translation file
		for (let locale of LOCALES) {
			if (locale.id === localeId) {
				refreshLocaleFile(addonPath, addonName, locale, sourceLocaleParsedFile, translations);
			}
		}
	} catch (e) {
		process.stderr.write(`An error occurred: ${e}`);
	}
}

main();