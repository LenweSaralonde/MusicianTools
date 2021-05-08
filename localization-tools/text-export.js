/**
 * EXPORT AS TEXT
 *
 * Usage:
 *    node export-text.js <Add-on directory> <locale code> <text file name> <chunk size>
 */

'use strict'

const fs = require('fs');

const {
	ROW_TYPE,
	parseLuaLocaleFile,
} = require('./modules/common');

/**
 * Main function
 */
function main() {
	const args = process.argv.slice(2);
	const addonPath = args[0].replace(/\\/g, '/').replace(/\/+$/g, '').replace(/"+$/g, '');
	const localeId = args[1];
	const filename = args[2];
	const chunkSize = args[3] && parseInt(args[3], 10) || 0;

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
		const sourceLocaleParsedFile = parseLuaLocaleFile(`${addonPath}/locale/${addonName}.${localeId}.lua`);

		let text = '';
		let chunkNumber = 1;
		for (let sourceRow of sourceLocaleParsedFile) {
			if (sourceRow.type === ROW_TYPE.MESSAGE) {
				// Escape new lines to keep multiline translations as a single line
				const newLine = sourceRow.value.replace(/\n/g, ' \\n ').replace(/ +/, ' ') + '\n';
				if (chunkSize && text.length + newLine.length > chunkSize) {
					fs.writeFileSync(filename.replace(/([^\.]+)$/, `${chunkNumber}.$1`), text, 'utf8');
					text = newLine;
					chunkNumber++;
				} else {
					text += newLine;
				}
			}
		}

		if (chunkNumber > 1) {
			fs.writeFileSync(filename.replace(/([^\.]+)$/, `${chunkNumber}.$1`), text, 'utf8');
		} else {
			fs.writeFileSync(filename, text, 'utf8');
		}
	} catch (e) {
		process.stderr.write(`An error occurred: ${e}`);
	}
}

main();