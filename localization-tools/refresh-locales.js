/**
 * REFRESH LOCALIZATION
 * Run this script after any addition or deletion was made in the main localization file prior to proceeding to translations.
 *
 * Usage:
 *    node refresh-locales.js <Add-on directory>
 */

'use strict'

const fs = require('fs');
const os = require('os');
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

	const xml = [];
	xml.push(`<Ui xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns="http://www.blizzard.com/wow/ui/">`);
	xml.push(`\t<!-- Base localization -->`);
	xml.push(`\t<Script file="${addonName}.base.lua" />`);
	xml.push(`\t<Script file="${addonName}.${SOURCE_LOCALE}.lua" />`);
	xml.push(`\t<!-- Additional localization -->`);
	for (let locale of LOCALES) {
		if (locale.id !== SOURCE_LOCALE) {
			xml.push(`\t<Script file="${addonName}.${locale.id}.lua" />`);
		}
	}
	xml.push(`</Ui>`);
	xml.push(``);
	fs.writeFileSync(`${addonPath}/locale/locale.xml`, xml.join(os.EOL), 'utf8');
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