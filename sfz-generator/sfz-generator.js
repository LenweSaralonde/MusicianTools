/**
 * SFZ GENERATOR
 *
 * Generate SFZ soundfont files of the Musician add-on instruments
 * The .sfz files will be created in the instruments directory of the Musician add-on.
 *
 * Usage:
 *    node sfz-generator.js <Musician add-on directory>
 */

'use strict'

const fs = require('fs');
const os = require('os');
const child_process = require('child_process');
const parser = require('luaparse');
const { isEmpty, fromPairs, map, invert } = require('lodash')
const WaveFile = require('wavefile').WaveFile;

const NOTE_NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
const NOTE_FILENAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const NOTE_FROM = 12; // C0
const NOTE_TO = 108; // C8

const LOOP_FIND_RANGE = 2;

let INSTRUMENTS;
let INSTRUMENTS_AVAILABLE;

let MIDI_INSTRUMENTS;
let MIDI_PERCUSSIONS;

let MIDI_INSTRUMENT_MAPPING;
let MIDI_PERCUSSION_MAPPING;

/**
 * Returns midi note frequency
 * @param {int} midiNote
 * @returns {float}
 */
function getFrequency(midiNote) {
	return 440 * Math.pow(2, (midiNote - 69) / 12);
}

/**
 * Return the phase index near indexTo matching the phase at indexFrom
 * @param {WaveFile} wav
 * @param {int} indexFrom
 * @param {int} indexTo
 * @param {int} period in samples
 * @return {int}
 */
 function findPhase(wav, indexFrom, indexTo, period) {
	let bestIndex = indexTo;
	let bestScore = Infinity; // Should be the lowest possible

	let offset;
	for (offset = -period; offset <= period; offset++) {
		let score = 0;
		let t = 0;
		for (t = 0; t <= period; t++) {
			const sampleA = wav.getSample((indexFrom + t) * wav.fmt.numChannels); // Reference sample
			const sampleB = wav.getSample((indexTo + t + offset) * wav.fmt.numChannels); // Sample to compare to
			score += Math.abs(sampleB - sampleA);
		}
		if (score < bestScore) {
			bestScore = score;
			bestIndex = indexTo + offset;
		}
	}

	return bestIndex;
}

/**
 * Open sample in OGG format and returns it as a wav
 * @param {string} oggFile
 * @return {WaveFile}
 */
function openSample(oggFile) {
	const tmpFile = os.tmpdir() + 'sfz-generator-sample.wav';

	const ffmpegCommand = `ffmpeg -i "${oggFile}" "${tmpFile}"`;
	child_process.spawnSync(ffmpegCommand, [], { shell: true }).output.toString();

	const wavSource = new WaveFile();
	wavSource.fromBuffer(fs.readFileSync(tmpFile));
	fs.unlinkSync(tmpFile);

	return wavSource;
}

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
 * Get display name out of internal instrument name
 * @param {string} instrumentName
 * @return {string}
 */
function getDisplayName(instrumentName) {
	const parts = (instrumentName || '').replace(/([A-Z])/g, ' $1').trim().split('-');
	let i
	for (i in parts) {
		parts[i] = parts[i].substr(0, 1).toUpperCase() + parts[i].substr(1).toLowerCase();
		break;
	}

	return parts.join(' ').replace(/[ ]+/g, ' ');
}

/**
 * Return normalized relative path
 * @param {string} path
 * @return {string}
 */
function getRelativePath(path) {
	return path.replace(/\\/g, '/').replace(/Interface\/AddOns\/[^\/]+\/instruments\//, '');
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
	noteData.decay = instrument.decayByKey && instrument.decayByKey[key] || instrument.decay;
	noteData.isPercussion = instrument.isPercussion;
	noteData.noteName = NOTE_NAMES[note] + octave;
	noteData.noteLabel = NOTE_FILENAMES[note] + octave;
	noteData.noteFilenames = [];
	noteData.source = instrument.source;
	noteData.keyMod = instrument.keyMod;

	if (instrument.midi !== 128) {
		if (!instrument.isPercussion) {
			if (instrument.path) {
				noteData.noteFilenames.push(getRelativePath(instrument.path + '\\' + NOTE_FILENAMES[note] + octave + '.ogg'));
			} else if (instrument.regions) {
				let region;
				for (region of instrument.regions) {
					if (key >= region.loKey && key <= region.hiKey) {
						noteData.noteFilenames.push(getRelativePath(region.path + '\\' + NOTE_FILENAMES[note] + octave + '.ogg'));
					}
				}
			}
		} else if (noteData.keyMod && instrument.pathList) {
			const index = (key - noteData.keyMod) % instrument.pathList.length;
			const sampleName = getDisplayName(instrument.pathList[index].split('\\').pop());
			noteData.noteLabel += ' - ' + sampleName;
			noteData.noteFilenames.push(getRelativePath(instrument.pathList[index] + '.ogg'));
		} else {
			noteData.noteLabel += ' - ' + (getDisplayName(MIDI_PERCUSSIONS[key]) || 'N/A');
			if (instrument.path) {
				noteData.noteFilenames.push(getRelativePath(instrument.path + '.ogg'));
			} else if (instrument.pathList) {
				instrument.pathList.forEach((path) => {
					noteData.noteFilenames.push(getRelativePath(path + '.ogg'));
				});
			}
		}

		if (instrument.midi > 127) {
			noteData.noteLabel += ' - ' + (getDisplayName(MIDI_PERCUSSIONS[key]) || 'N/A');
		}

	} else {
		const percussionMidiInstrumentName = MIDI_PERCUSSIONS[key];
		const percussionInstrumentName = MIDI_PERCUSSION_MAPPING[percussionMidiInstrumentName];
		noteData.isPercussion = true;
		if (percussionMidiInstrumentName && percussionInstrumentName && percussionInstrumentName !== 'none') {
			const percussionNoteData = getNoteData(key, percussionInstrumentName);
			noteData.noteLabel += ' - ' + getDisplayName(percussionInstrumentName);
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
	const soundfontsDir = `${addonDir}/soundfonts`;

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
	const sfzFiles = {};
	INSTRUMENTS_AVAILABLE.forEach((instrumentName) => {
		if (instrumentName === 'none') {
			return;
		}

		const displayName = getDisplayName(instrumentName);
		const midi = INSTRUMENTS[instrumentName].midi;
		let paddedMidi = '';
		if (midi < 128) {
			paddedMidi = '000-' + ('000' + midi).slice(-3);
		} else {
			paddedMidi = '128-' + ('000' + (midi - 128)).slice(-3);
		}

		// Loop end position, in seconds
		let loop;
		if (INSTRUMENTS[instrumentName].loop) {
			loop = (parseFloat(INSTRUMENTS[instrumentName].loop[0]) + parseFloat(INSTRUMENTS[instrumentName].loop[1])) / 2;
		}

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
					instrumentSfz += `\n\tsample=../instruments/${filename}`;
					instrumentSfz += `\n\tampeg_release=${noteData.decay * 4 / 1000}`; // Adjust in-game decay to SFZ decay

					// Sample round robin
					if (!noteData.keyMod && noteData.noteFilenames.length > 1) {
						instrumentSfz += `\n\tseq_length=${noteData.noteFilenames.length} seq_position=${index + 1}`;
					}

					// Loop
					if (loop !== undefined) {
						const wav = openSample(`${instrumentsDir}/${filename}`);
						const sampleRate = wav.fmt.sampleRate;

						const period = 1 / getFrequency(key);

						const loopStart = Math.round(loop / 2 / period) * period;
						const loopEnd = Math.round(loop / period) * period;

						const loopStartIndex = Math.round(loopStart * sampleRate);
						const loopEndIndex = Math.round(loopEnd * sampleRate);
						const loopEndPhasedIndex = findPhase(wav, loopStartIndex, loopEndIndex, Math.round(LOOP_FIND_RANGE * period * sampleRate));

						instrumentSfz += `\n\tloop_mode=loop_continuous`;
						instrumentSfz += `\n\tloop_start=${loopStartIndex}`;
						instrumentSfz += `\n\tloop_end=${loopEndPhasedIndex - 1}`;

						// loop_crossfade is not yet supported
						// const crossfade = (INSTRUMENTS[instrumentName].crossfade || 0) / 1000;
						// if (crossfade > 0) {
						// 	instrumentSfz += `\n\tloop_crossfade=${crossfade}`;
						// }
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
		const fileName = `[${paddedMidi}] ${displayName}.sfz`;
		process.stdout.write(`${soundfontsDir}/${fileName}\n`);
		fs.writeFileSync(`${soundfontsDir}/${fileName}`, header + instrumentSfz);
		sfzFiles[instrumentName] = fileName;
	});

	// Generate soundfont list for CoolSoft VirtualMIDISynth
	let soundfontList = `[SoundFonts]\n`;

	let soundfontIndex = 1;

	function addSoundfontInstrument(instrumentName, preset, bank) {
		soundfontList += `sf${soundfontIndex}=${sfzFiles[instrumentName]}\n`;
		soundfontList += `sf${soundfontIndex}.enabled=1\n`;
		soundfontList += `sf${soundfontIndex}.preset=${preset}\n`;
		soundfontList += `sf${soundfontIndex}.bank=${bank}\n`;

		soundfontIndex++;
	}

	Object.keys(MIDI_INSTRUMENTS).forEach((midiInstrumentName) => {
		let instrumentId = MIDI_INSTRUMENTS[midiInstrumentName];
		const instrumentName = MIDI_INSTRUMENT_MAPPING[midiInstrumentName];

		if (instrumentName === 'none') {
			return;
		}

		if (instrumentId < 128) { // Melodic
			addSoundfontInstrument(instrumentName, instrumentId, 0);
		} else { // Percussions
			addSoundfontInstrument(instrumentName, instrumentId - 128, 128);
		}
	})

	const fileName = 'Musician_GM_soundfonts.vmssf';
	process.stdout.write(`${soundfontsDir}/${fileName}\n`);
	fs.writeFileSync(`${soundfontsDir}/${fileName}`, soundfontList);
}

main();
