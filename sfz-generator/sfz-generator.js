/**
 * SFZ GENERATOR
 */

'use strict'

const fs = require('fs');
const parser = require('luaparse');
const { isEmpty, fromPairs, map, invert } = require('lodash')

const NOTE_NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
const NOTE_FILENAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const NOTE_FROM = 12; // C0
const NOTE_TO = 108; // C8

let INSTRUMENTS;
let INSTRUMENTS_AVAILABLE;

let MIDI_INSTRUMENTS;
let MIDI_PERCUSSIONS;

let MIDI_INSTRUMENT_MAPPING;
let MIDI_PERCUSSION_MAPPING;

/**
 * Converts parsed LUA variable into JSON
 * Based on https://github.com/kcwiki/lua-json
 * @param {object} ast
 * @returns {object}
 */
const luaAstToJson = ast => {
	// literals
	if (['NilLiteral', 'BooleanLiteral', 'NumericLiteral', 'StringLiteral'].includes(ast.type)) {
		return ast.value || JSON.parse(ast.raw);
	}
	// basic expressions
	if (ast.type === 'UnaryExpression' && ast.operator === '-') {
		return -luaAstToJson(ast.argument)
	}
	if (ast.type === 'Identifier') {
		return ast.name
	}
	// tables
	if (['TableKey', 'TableKeyString'].includes(ast.type)) {
		return { __internal_table_key: true, key: luaAstToJson(ast.key), value: luaAstToJson(ast.value) }
	}
	if (ast.type === 'TableValue') {
		return luaAstToJson(ast.value)
	}
	if (ast.type === 'TableConstructorExpression') {
		if (ast.fields[0] && ast.fields[0].key) {
			const object = fromPairs(
				map(ast.fields, field => {
					const { key, value } = luaAstToJson(field)
					return [key, value]
				}),
			)
			return isEmpty(object) ? [] : object
		}
		return map(ast.fields, field => {
			const value = luaAstToJson(field)
			return value && value.__internal_table_key ? [value.key, value.value] : value
		})
	}
	// top-level statements, only looking at the first statement, either return or local
	// todo: filter until return or local?
	if (ast.type === 'LocalStatement') {
		const values = ast.init.map(luaAstToJson)
		return values.length === 1 ? values[0] : values
	}
	if (ast.type === 'ReturnStatement') {
		const values = ast.arguments.map(luaAstToJson)
		return values.length === 1 ? values[0] : values
	}
	if (ast.type === 'Chunk') {
		return luaAstToJson(ast.body[0])
	}
	if (ast.type === 'MemberExpression') {
		return ast.identifier.name
	}

	return ast.type
}


/**
 * Extract LUA constant from file
 * @param {string} path
 * @param {string} variableBase
 * @param {string} variableIdentifier
 * @return {object}
 */
function getLuaConstant(file, variableBase, variableIdentifier) {
	const lua = fs.readFileSync(file, 'utf8');
	const ast = parser.parse(lua, {
		comments: false,
	});

	let statement;
	for (statement of ast.body) {
		if (statement.type === 'AssignmentStatement') {
			try {
				const baseName = statement.variables[0].base.name;
				const identifierName = statement.variables[0].identifier.name;
				if (baseName === variableBase && identifierName === variableIdentifier) {
					return luaAstToJson(statement.init[0]);
				}
			} catch (e) {
				console.error(e);
				process.stderr.write(`Error: Error extracting ${variableBase}.${variableIdentifier} from ${file}\n`);
				process.exit(1);
			};
		}
	}

	process.stderr.write(`Error: Could not extract ${variableBase}.${variableIdentifier} from ${file}\n`);
	process.exit(1);
}

/**
 * Get display name out of internam instrument name
 * @param {string} instrumentName
 * @return {string}
 */
function getDisplayName(instrumentName) {
	const parts = (instrumentName || '').replace(/([A-Z])/g, ' $1').trim().split('-');
	let word, i
	for (i in parts) {
		parts[i] = parts[i].substr(0, 1).toUpperCase() + parts[i].substr(1).toLowerCase();
		break;
	}

	return parts.join(' ');
}

/**
 * Return normalized relative path
 * @param {string} path
 * @return {string}
 */
function getRelativePath(path) {
	return path.replace(/\\/g, '/').replace(/Interface\/AddOns\/Musician\/instruments\//, '');
}

/**
 * Return the note data corresponding its MIDI key
 * @param {int} key MIDI key index
 * @param {string} instrumentName
 * @return {string}
 */
function getNoteData(key, instrumentName) {
	const instrument = INSTRUMENTS[instrumentName];
	const noteData = {};

	const noteId = key - 12;
	const octave = Math.floor(noteId / 12);
	const note = noteId % 12;
	noteData.midi = instrument.midi;
	noteData.decay = instrument.decay;
	noteData.isPercussion = instrument.isPercussion;
	noteData.noteName = NOTE_NAMES[note] + octave;
	noteData.noteLabel = NOTE_FILENAMES[note] + octave;
	noteData.noteFilenames = [];
	noteData.source = instrument.source;

	if (instrument.midi !== 128) {
		if (!instrument.isPercussion) {
			noteData.noteFilenames.push(getRelativePath(instrument.path + '\\' + NOTE_FILENAMES[note] + octave + '.ogg'));
		} else {
			noteData.noteLabel = getDisplayName(MIDI_PERCUSSIONS[key]) || noteData.noteLabel;
			if (instrument.path) {
				noteData.noteFilenames.push(getRelativePath(instrument.path + '.ogg'));
			} else if (instrument.pathList) {
				instrument.pathList.forEach((path) => {
					noteData.noteFilenames.push(getRelativePath(path + '.ogg'));
				});
			}
		}

		if (instrument.midi > 127) {
			noteData.noteLabel = getDisplayName(MIDI_PERCUSSIONS[key]) || noteData.noteLabel;;
		}

	} else {
		const percussionMidiInstrumentName = MIDI_PERCUSSIONS[key];
		const percussionInstrumentName = MIDI_PERCUSSION_MAPPING[percussionMidiInstrumentName];
		noteData.isPercussion = true;
		if (percussionMidiInstrumentName && percussionInstrumentName && percussionInstrumentName !== 'none') {
			const percussionNoteData = getNoteData(key, percussionInstrumentName);
			noteData.noteLabel = getDisplayName(percussionInstrumentName);
			noteData.source = percussionNoteData.source;
			noteData.decay = percussionNoteData.decay;
			noteData.noteFilenames = percussionNoteData.noteFilenames;
		}
	}

	return noteData;
}

/**
 * Main function
 */
function main() {

	const argv = require('minimist')(process.argv.slice(2));

	if (argv['_'][0] === undefined) {
		process.stderr.write("Usage: node sfz-generator.js <Musician add-on directory>\n");
		process.exit(1);
	}

	const addonDir = argv['_'][0].replace(/\.[^\.]+$/, '').replace(/\\/g, '/');
	const instrumentsDir = `${addonDir}/instruments`;

	if (!fs.existsSync(addonDir)) {
		process.stderr.write(`Error: ${addonDir} does not exist.\n`);
		process.exit(1);
	}

	INSTRUMENTS = getLuaConstant(`${addonDir}/constants/Musician.Instruments.lua`, 'Musician', 'INSTRUMENTS');
	INSTRUMENTS_AVAILABLE = getLuaConstant(`${addonDir}/constants/Musician.Instruments.lua`, 'Musician', 'INSTRUMENTS_AVAILABLE');

	MIDI_INSTRUMENTS = getLuaConstant(`${addonDir}/constants/Musician.Midi.lua`, 'Musician', 'MIDI_INSTRUMENTS');
	MIDI_PERCUSSIONS = getLuaConstant(`${addonDir}/constants/Musician.Midi.lua`, 'Musician', 'MIDI_PERCUSSIONS');
	MIDI_PERCUSSIONS = invert(MIDI_PERCUSSIONS);

	MIDI_INSTRUMENT_MAPPING = getLuaConstant(`${addonDir}/constants/Musician.MidiMapping.lua`, 'Musician', 'MIDI_INSTRUMENT_MAPPING');
	MIDI_PERCUSSION_MAPPING = getLuaConstant(`${addonDir}/constants/Musician.MidiMapping.lua`, 'Musician', 'MIDI_PERCUSSION_MAPPING');

	// Generate SFZ files
	INSTRUMENTS_AVAILABLE.forEach((instrumentName) => {
		if (instrumentName === 'none') {
			return;
		}

		const displayName = getDisplayName(instrumentName);
		const midi = INSTRUMENTS[instrumentName].midi;
		const paddedMidi = ('000' + midi).slice(-3);

		let instrumentSfz = '';

		instrumentSfz += `<group>\n`;
		if (midi <= 127) {
			instrumentSfz += `group_label=${midi}. ${displayName}\n`;
		} else {
			instrumentSfz += `group_label=${displayName}\n`;
		}
		instrumentSfz += `amp_velcurve_1=1 // All notes play max velocity\n`;
		instrumentSfz += `\n`;

		let key;
		let sources = [];
		for (key = NOTE_FROM; key <= NOTE_TO; key++) {

			const noteData = getNoteData(key, instrumentName);

			if (noteData.noteFilenames.length > 0 && fs.existsSync(`${instrumentsDir}/${noteData.noteFilenames[0]}`)) {
				noteData.noteFilenames.forEach((filename, index) => {
					instrumentSfz += `<region>`;
					instrumentSfz += `\n\tregion_label=${noteData.noteLabel}`;
					instrumentSfz += `\n\tkey=${noteData.noteName}`;
					instrumentSfz += `\n\tsample=${filename}`;
					instrumentSfz += `\n\tampeg_release=${noteData.decay * 4 / 1000}`; // Adjust in-game decay to SFZ decay

					// Sample randomization
					if (noteData.noteFilenames.length > 1) {
						const range = 1 / noteData.noteFilenames.length;
						instrumentSfz += `\n\tlorand=${range * index}`;
						instrumentSfz += `\n\thirand=${range * (index + 1)}`;
					}

					instrumentSfz += `\n\n`;
				});
			}

			if (noteData.source && !sources.includes(noteData.source)) {
				sources.push(noteData.source);
			}
		}

		// Generate header

		let header = '';

		header += `/*\n`;
		header += `// **********************************************************************\n`;
		header += `// ${displayName}\n`;
		header += `// Soundfont from Musician, the music add-on for World of Warcraft\n`;
		header += `// https://musician.lenwe.io\n`;
		header += `// MIDI program: ${(midi <= 127) ? midi : 'Percussion set'}\n`;
		if (sources.length) {
			header += `// Samples from ${sources.join(', ')}\n`;
		}
		header += `// **********************************************************************\n`;
		header += `*/\n`;
		header += `\n`;

		header += `<global>\n`;
		header += `global_label=Musician instruments\n`;
		header += `\n`;

		// Write SFZ file
		const fileName = `${addonDir}/instruments/${paddedMidi} - ${displayName}.sfz`;
		process.stdout.write(`${fileName}\n`);
		fs.writeFileSync(fileName, header + instrumentSfz);
	});
}

main();
