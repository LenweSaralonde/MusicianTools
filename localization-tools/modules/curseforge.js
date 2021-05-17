'use strict'

/**
 * Curseforge API documentation:
 * https://support.curseforge.com/en/support/solutions/articles/9000197321-curseforge-api
 */

const https = require('https');

const CurseforgeConfig = require('./../curseforge-config.json');

const {
	LOCALES,
	SOURCE_LOCALE,
	parseLuaLocaleFile,
	extractMessages,
	extractMidiKeyReplacements,
	refreshLocaleFile
} = require('./common');

const CURSEFORGE_LANGUAGES = ['enUS', 'esES', 'frFR', 'ptBR', 'deDE', 'itIT', 'ruRU', 'koKR', 'zhCN', 'zhTW'];
const CURSEFORGE_SOURCE_LANGUAGE = 'enUS';

/**
 * Get locale data from CurseForge locale code
 * @param {string} language in CurseForge format (ie enUS)
 * @returns {object}
 */
function getLocale(language) {
	for (let locale of LOCALES) {
		if (locale.codes.includes(language)) {
			return locale;
		}
	}

	return null;
}

/**
 * Format message key parsed from LUA into Curseforge locale key
 * @param {string} key
 * @param {object} keyReplacements
 * @returns {string}
 */
function formatMessageKey(key, keyReplacements = {}) {
	const keyParts = key.replace(/\[/, '/').replace(/([^a-zA-Z0-9\/]+)/g, '_').replace(/_*\/_*/g, '/').replace(/^_+/g, '').replace(/_+$/, '').split('/');

	// Add MIDI instrument and percussion numbers
	if (keyParts[0] === 'MIDI_INSTRUMENT_NAMES' && keyReplacements.MIDI_INSTRUMENTS) {
		const instrumentKey = keyParts[1].replace(/^Instrument_/, '');
		const instrumentNumber = keyReplacements.MIDI_INSTRUMENTS[instrumentKey];
		keyParts[1] = instrumentNumber ? `${instrumentNumber.padStart(3, '0')}_${instrumentKey}` : instrumentKey;
	} else if (keyParts[0] === 'MIDI_PERCUSSION_NAMES' && keyReplacements.MIDI_PERCUSSIONS) {
		const percussionKey = keyParts[1].replace(/^Percussion_/, '');
		const percussionNumber = keyReplacements.MIDI_PERCUSSIONS[percussionKey];
		keyParts[1] = percussionNumber ? `${percussionNumber.padStart(2, '0')}_${percussionKey}` : percussionKey;
	}

	return keyParts.join('/');
}

/**
 * Export project LUA translations to Curseforge
 * @param {string} addonPath
 * @param {string} projectID
 * @param {string} [language]
 */
async function exportLocaleToCurseforge(addonPath, projectID, language = CURSEFORGE_SOURCE_LANGUAGE) {
	const keyReplacements = extractMidiKeyReplacements(addonPath);
	process.stdout.write(`Exporting ${language} to CurseForge...\n`);
	const lua = getLuaForCurseforgeExport(addonPath, language, keyReplacements);
	await exportLanguageToCurseforge(language, projectID, lua);
}

/**
 * Export a single language file to Curseforge
 * @param {string} language
 * @param {string} projectID
 * @param {string} lua
 */
async function exportLanguageToCurseforge(language, projectID, lua) {

	if (lua === '') {
		return;
	}

	const metadata = {
		//Note all of these are optional exception language
		language, //[enUS, deDE, esES, ect], Required, No Default
		//namespace: "toc", //Any namespace name, comma delimited. Default: Base Namespace
		formatType: "TableAdditions", //['GlobalStrings','TableAdditions','SimpleTable']. Default: TableAdditions
		'missing-phrase-handling': (language === CURSEFORGE_SOURCE_LANGUAGE) ? "DeletePhrase" : "DoNothing" //['DoNothing', 'DeleteIfNoTranslations', 'DeleteIfTranslationsOnlyExistForSelectedLanguage', 'DeletePhrase']. Default: DoNothing
	};

	const body = `metadata=${encodeURIComponent(JSON.stringify(metadata))}&localizations=${encodeURIComponent(lua)}`;

	const options = {
		hostname: 'wow.curseforge.com',
		port: 443,
		path: `/api/projects/${projectID}/localization/import`,
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'Content-Length': Buffer.byteLength(body),
			'X-Api-Token': CurseforgeConfig.apiToken
		}
	};

	return new Promise((resolve, reject) => {
		const req = https.request(options, (res) => {
			res.setEncoding('utf8');
			let data = '';
			res.on('data', d => data += d);
			res.on('end', () => {
				if (!res.complete) {
					reject(`Incomplete response`);
				} else if (res.statusCode !== 200) {
					reject(data);
				} else {
					resolve(data);
				}
			});
		});
		req.on('error', reject);
		req.write(body);
		req.end();
	});
}

/**
 * Import translations from Curseforge to the LUA locale files
 * @param {string} addonPath
 * @param {string} projectID
 */
async function importLocalesFromCurseforge(addonPath, projectID) {
	const keyReplacements = extractMidiKeyReplacements(addonPath);
	for (let language of CURSEFORGE_LANGUAGES) {
		if (language !== CURSEFORGE_SOURCE_LANGUAGE) {
			process.stdout.write(`Importing ${language} from CurseForge...\n`);
			const translations = await importLanguageFromCurseforge(language, projectID);
			updateLuaFromCurseforgeImport(translations, addonPath, language, keyReplacements);
		}
	}
}

/**
 * Import a single language from Curseforge
 * @param {string} language
 * @param {string} projectID
 * @return {Object} translations as key: value
 */
async function importLanguageFromCurseforge(language, projectID) {
	const options = {
		hostname: 'wow.curseforge.com',
		port: 443,
		path: `/api/projects/${projectID}/localization/export?export-type=TableAdditions&unlocalized=Ignore&lang=${language}`,
		method: 'GET',
		headers: {
			'X-Api-Token': CurseforgeConfig.apiToken
		},
	};

	return new Promise((resolve, reject) => {
		const req = https.request(options, (res) => {
			res.setEncoding('utf8');
			let data = '';
			res.on('data', d => data += d);
			res.on('end', () => {
				if (!res.complete) {
					reject(`Incomplete response`);
				} else if (res.statusCode !== 200) {
					reject(data);
				} else {
					// Reformat LUA to JSON
					try {
						data = data.replace(/L = L or \{\}\n/, '');
						data = data.replace(/(\[=\[)([.\s\S]+?)(\]=\])/g, (match, _, msg) => {
							return JSON.stringify(msg);
						});
						data = data.replace(/L\[("[^"]+")\] = /g, '$1:')
						data = data.replace(/"\n/g, `",\n`).replace(/,[\n]*$/, '');
						data = '{' + data + '}';
						resolve(JSON.parse(data));
					} catch (e) {
						reject(e);
					}
				}
			});
		});
		req.on('error', reject);
		req.end();
	});
}

/**
 * Generate LUA locale file formatted for Curseforge import
 * @param {string} addonPath
 * @param {string} [language]
 * @param {object} [keyReplacements]
 * @returns {string}
 */
function getLuaForCurseforgeExport(addonPath, language = CURSEFORGE_SOURCE_LANGUAGE, keyReplacements = {}) {
	const locale = getLocale(language);
	if (!locale) {
		throw `Locale ${language} not found.`;
	}

	// Extract addon name from path
	const addonName = addonPath.split('/').pop();

	const parsedFile = parseLuaLocaleFile(`${addonPath}/locale/${addonName}.${locale.id}.lua`);
	const messages = extractMessages(parsedFile);

	let lua = ``;

	for (const entry of messages) {
		const [key, row] = entry;
		const formattedKey = formatMessageKey(key, keyReplacements);
		lua += `_L[${JSON.stringify(formattedKey)}] = ${JSON.stringify(row.value)}\n`;
	}

	return lua;
}

/**
 * Update add-on LUA locale file from Curseforge translations
 * @param {Object} curseforgeTranslations as key: value
 * @param {string} addonPath
 * @param {string} [language]
 * @param {object} [keyReplacements]
 * @returns {string}
 */
function updateLuaFromCurseforgeImport(curseforgeTranslations, addonPath, language = CURSEFORGE_SOURCE_LANGUAGE, keyReplacements = {}) {
	const keyFormatter = key => formatMessageKey(key, keyReplacements);

	// Extract addon name from path
	const addonName = addonPath.split('/').pop();

	// Parse source locale file
	const sourceLocaleParsedFile = parseLuaLocaleFile(`${addonPath}/locale/${addonName}.${SOURCE_LOCALE}.lua`);

	// Refresh translation file
	for (let locale of LOCALES) {
		if (locale.codes.includes(language)) {
			refreshLocaleFile(addonPath, addonName, locale, sourceLocaleParsedFile, curseforgeTranslations, keyFormatter);
		}
	}
}


module.exports = {
	CURSEFORGE_LANGUAGES,
	exportLocaleToCurseforge,
	importLocalesFromCurseforge
}