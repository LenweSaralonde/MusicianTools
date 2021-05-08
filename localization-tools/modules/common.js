'use strict'

const fs = require('fs');
const os = require('os');

const LOCALES = [
	{ id: 'en', name: 'English', codes: ['enUS', 'enGB'] },
	{ id: 'es', name: 'Español', codes: ['esES', 'esMX'] },
	{ id: 'fr', name: 'Français', codes: ['frFR'] },
	{ id: 'pt', name: 'Português', codes: ['ptBR'] },
	{ id: 'de', name: 'Deutsch', codes: ['deDE'] },
	{ id: 'it', name: 'Italiano', codes: ['itIT'] },
	{ id: 'ru', name: 'Русский', codes: ['ruRU'] },
	{ id: 'ko', name: '한국어', codes: ['koKR'] },
	{ id: 'zh', name: '中文', codes: ['zhCN'] },
	{ id: 'tw', name: '繁體中文', codes: ['zhTW'] },
];

const SOURCE_LOCALE = 'en';

const ROW_TYPE = {
	MESSAGE: 'message',
	TODO: 'todo',
	COMMENT: 'comment',
	CODE: 'code',
	CODE_INIT: 'codeInit',
	RAW: 'raw'
}

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
				parsedRows.push({ type: ROW_TYPE.MESSAGE, key, key1, key2, value, comment });
			} catch (e) {
				process.stderr.write('Error parsing string', row);
			}
		} else if (todoMatches) {
			parsedRows.push({ type: ROW_TYPE.TODO, comment: trimmedRow });
		} else if (commentMatches) {
			parsedRows.push({ type: ROW_TYPE.COMMENT, comment: trimmedRow });
		} else if (codeInitMatches) {
			parsedRows.push({ type: ROW_TYPE.CODE_INIT, code: trimmedRow });
		} else if (codeMatches) {
			parsedRows.push({ type: ROW_TYPE.CODE, code: trimmedRow });
		} else {
			parsedRows.push({ type: ROW_TYPE.RAW, text: trimmedRow });
		}
	}

	return parsedRows;
}

/**
 * Refresh a single locale file
 * @param {string} addonPath
 * @param {string} addonName
 * @param {object} locale
 * @param {array} sourceLocaleParsedFile
 * @param {object} [externalTranslations]
 * @param {function} [formatExternalMessageKey]
 */
function refreshLocaleFile(addonPath, addonName, locale, sourceLocaleParsedFile, externalTranslations = {}, formatExternalMessageKey = key => key) {
	// Ignore source locale
	if (locale.id === SOURCE_LOCALE) {
		return;
	}

	// Extract translation file, if exists
	const filename = `${addonPath}/locale/${addonName}.${locale.id}.lua`;
	let localTranslations = new Map();
	if (fs.existsSync(filename)) {
		const parsedFile = parseLuaLocaleFile(filename);
		localTranslations = extractMessages(parsedFile);
	}

	// Refresh translation file
	const rows = [];
	for (let sourceRow of sourceLocaleParsedFile) {
		switch (sourceRow.type) {
			case ROW_TYPE.CODE_INIT:
				const initArgs = [locale.id, locale.name, ...locale.codes];
				rows.push(`local msg = ${addonName}.InitLocale(${initArgs.map(JSON.stringify).join(', ')})`);
				break;

			case ROW_TYPE.CODE:
				rows.push(sourceRow.code);
				break;

			case ROW_TYPE.MESSAGE:
				let lua = `msg.${sourceRow.key} = `;

				const externalTranslation = externalTranslations[formatExternalMessageKey(sourceRow.key)];
				const localTranslation = localTranslations.get(sourceRow.key);
				const translation = (externalTranslation !== undefined) ? externalTranslation : localTranslation && localTranslation.value;
				if (translation) { // Message is translated
					lua += JSON.stringify(translation);
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

			case ROW_TYPE.TODO:
				break;

			case ROW_TYPE.COMMENT:
				rows.push(sourceRow.comment);
				break;

			case ROW_TYPE.RAW:
				rows.push(sourceRow.raw || '');

			default:
		}
	}
	fs.writeFileSync(filename, rows.join(os.EOL), 'utf8');
}

/**
 * Extract messages map from parsed file
 * @param {array} parsedRows
 * @return {Map}
 */
function extractMessages(parsedRows) {
	const messages = new Map();

	for (let row of parsedRows) {
		if (row.type === ROW_TYPE.MESSAGE) {
			messages.set(row.key, row);
		}
	}

	return messages;
}

/**
 * Extract MIDI instrument key replacement strings
 * @param {string} addonPath Path to the Musician add-on
 * @return {Object}
 */
function extractMidiKeyReplacements(addonPath) {
	try {
		const filename = `${addonPath}/constants/Musician.Midi.lua`;

		const lua = fs.readFileSync(filename, 'utf8').replace(/\r/g, '').split("\n");

		let section = null;

		const midiKeys = {};

		for (let row of lua) {
			const sectionStartMatches = row.match(/^Musician\.([^= \t]+)[ \t]*\=[ \t]*\{/);
			const sectionEndMatches = row.match(/\}/);
			const valueMatches = row.match(/^[ \t]+([^ \t=]+)[ \t]*=[ \t]([0-9]+),/);

			if (sectionStartMatches) {
				section = sectionStartMatches[1];
				midiKeys[section] = {};
			} else if (sectionEndMatches) {
				section = null;
			} else if (valueMatches && section !== null) {
				midiKeys[section][valueMatches[1]] = valueMatches[2];
			}
		}

		return midiKeys;
	} catch (e) {
		return {}; // Not Musician
	}
}

module.exports = {
	LOCALES,
	SOURCE_LOCALE,
	ROW_TYPE,
	parseLuaLocaleFile,
	extractMessages,
	extractMidiKeyReplacements,
	refreshLocaleFile
}