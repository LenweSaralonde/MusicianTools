/**
 * REFRESH LOCALIZATION
 * Run this script after any addition or deletion was made in the main localization file prior to proceeding to translations.
 *
 * Usage:
 *    node refresh-locales.js <Add-on directory>
 */

'use strict'

/////////////////////////////////////////////////////////////////////////////////

const LOCALES = [
	{ id: 'en', name: 'English', codes: ['enUS', 'enGB'] },
	{ id: 'es', name: 'Español', codes: ['esMX', 'esES'] },
	{ id: 'fr', name: 'Français', codes: ['frFR'] },
	{ id: 'pt', name: 'Português', codes: ['ptBR'] },
	{ id: 'de', name: 'Deutsch', codes: ['deDE'] },
	{ id: 'it', name: 'Italiano', codes: ['itIT'] },
	{ id: 'ru', name: 'Русский', codes: ['ruRU'] },
	{ id: 'kr', name: '한국어', codes: ['koKR'] },
	{ id: 'zh', name: '中文', codes: ['zhTW', 'zhCN'] },
];

const SOURCE_LOCALE = 'en';

const ROW_TYPE_MESSAGE = 'message';
const ROW_TYPE_TODO = 'todo';
const ROW_TYPE_COMMENT = 'comment';
const ROW_TYPE_CODE = 'code';
const ROW_TYPE_CODE_INIT = 'codeInit';
const ROW_TYPE_RAW = 'raw';

/////////////////////////////////////////////////////////////////////////////////

const fs = require('fs');

/**
 * Parse LUA locale file
 * @param {string} filename
 * @returns {array} Parsed file
 */
function parseLuaLocaleFile(filename) {
	const lua = fs.readFileSync(filename, 'utf8').replace(/\r/g, '').split("\n");

	const parsedRows = [];

	// Extract
	for (const row of lua) {
		const trimmedRow = row.trim()
		const msgMatches = trimmedRow.replace(/[ \t]*$/, '').match(/^[ \t]*msg\.(([^\[ \t]+)(\[([^\]]+)\])?)[ \t]*=[ \t]*(["'].+["'])([ \t]*--+[ \t]*(.*))?$/);
		const codeInitMatches = trimmedRow.replace(/[ \t]*$/, '').match(/(local[ \t]+msg[ \t]+=.+)$/);
		const codeMatches = trimmedRow.replace(/[ \t]*$/, '').match(/(local.+)$/);
		const todoMatches = trimmedRow.match(/^--[ \t]*msg\.(.+)$/);
		const commentMatches = trimmedRow.match(/^--+[ \t]*(.*)$/);

		if (msgMatches) {
			try {
				const key = msgMatches[1].replace(/[']/g, '"');
				const key1 = msgMatches[2] && msgMatches[2].replace(/[']/g, '"') || '';
				const key2 = msgMatches[4] && msgMatches[4].replace(/[']/g, '"') || '';
				const value = JSON.parse(msgMatches[5]);
				const comment = msgMatches[6];
				parsedRows.push({ type: ROW_TYPE_MESSAGE, key, key1, key2, value, comment });
			} catch (e) {
				process.stderr.write('Error parsing string', row);
			}
		} else if (todoMatches) {
			parsedRows.push({ type: ROW_TYPE_TODO, comment: trimmedRow });
		} else if (commentMatches) {
			parsedRows.push({ type: ROW_TYPE_COMMENT, comment: trimmedRow });
		} else if (codeInitMatches) {
			parsedRows.push({ type: ROW_TYPE_CODE_INIT, code: trimmedRow });
		} else if (codeMatches) {
			parsedRows.push({ type: ROW_TYPE_CODE, code: trimmedRow });
		} else {
			parsedRows.push({ type: ROW_TYPE_RAW, text: trimmedRow });
		}
	}

	return parsedRows;
}

/**
 * Extract messages map from parsed file
 * @param {array} parsedRows
 * @return {Map}
 */
function extractMessages(parsedRows) {
	const messages = new Map();

	for (let row of parsedRows) {
		if (row.type === ROW_TYPE_MESSAGE) {
			messages.set(row.key, row);
		}
	}

	return messages;
}

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
		// Ignore source locale
		if (locale.id === SOURCE_LOCALE) {
			continue;
		}

		// Extract translation file, if exists
		const filename = `${addonPath}/locale/${addonName}.${locale.id}.lua`;
		let translations = new Map();
		if (fs.existsSync(filename)) {
			const parsedFile = parseLuaLocaleFile(filename);
			translations = extractMessages(parsedFile);
		}

		// Refresh translation file
		const rows = [];
		for (let sourceRow of sourceLocaleParsedFile) {
			switch (sourceRow.type) {
				case ROW_TYPE_CODE_INIT:
					const initArgs = [locale.id, locale.name, ...locale.codes];
					rows.push(`local msg = ${addonName}.InitLocale(${initArgs.map(JSON.stringify).join(', ')})`);
					break;

				case ROW_TYPE_CODE:
					rows.push(sourceRow.code);
					break;

				case ROW_TYPE_MESSAGE:
					let lua = `msg.${sourceRow.key} = `;

					const translation = translations.get(sourceRow.key)
					if (translation) { // Message is translated
						lua += JSON.stringify(translation.value);
					} else { // Not translated: comment it
						lua = '-- ' + lua + JSON.stringify(sourceRow.value);
					}

					// Comment at the end of the line
					const comment = translation && translation.comment || sourceRow.comment || '';
					if (comment !== '') {
						lua += comment;
					}

					rows.push(lua);

					break;

				case ROW_TYPE_TODO:
					break;

				case ROW_TYPE_COMMENT:
					rows.push(sourceRow.comment);
					break;

				case ROW_TYPE_RAW:
					rows.push(sourceRow.raw || '');

				default:
			}
		}
		fs.writeFileSync(filename, rows.join('\n'), 'utf8');
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