/**
 * REFRESH LOCALIZATION
 * Run this script after any addition or deletion was made in the main localization file prior to proceeding to translations.
 *
 * Usage:
 *    node refresh-locales.js <Add-on directory>
 */

'use strict'

const fs = require('fs');
const {
	LOCALES,
	SOURCE_LOCALE,
	parseLuaLocaleFile,
	refreshLocaleFile,
} = require('./modules/common');

/**
 * Refresh locale files for addon
 * @param {string} addonPath
 */
function refreshLocales(addonPath) {
	// Extract addon name from path
	const addonName = addonPath.split('/').pop();

	// Parse source locale file
	const sourceLocaleParsedFile = parseLuaLocaleFile(`${addonPath}/locale/${addonName}.${SOURCE_LOCALE}.lua`);

	// Refresh translation files
	for (let locale of LOCALES) {
		refreshLocaleFile(addonPath, addonName, locale, sourceLocaleParsedFile);
	}

	// Refresh locale.xml

	let xml = `<Ui xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns="http://www.blizzard.com/wow/ui/">\n`;
	xml += `\t<!-- Base localization -->\n`;
	xml += `\t<Script file="${addonName}.base.lua" />\n`;
	xml += `\t<Script file="${addonName}.${SOURCE_LOCALE}.lua" />\n`;
	xml += `\t<!-- Additional localization -->\n`;
	for (let locale of LOCALES) {
		if (locale.id !== SOURCE_LOCALE) {
			xml += `\t<Script file="${addonName}.${locale.id}.lua" />\n`;
		}
	}
	xml += `</Ui>\n`;
	fs.writeFileSync(`${addonPath}/locale/locale.xml`, xml, 'utf8');
}

/**
 * Main function
 */
function main() {
	const args = process.argv.slice(2);
	const addonPath = args[0].replace(/\\/g, '/').replace(/\/+$/g, '').replace(/"+$/g, '');
	refreshLocales(addonPath);
}

main();