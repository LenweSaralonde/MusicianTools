/**
 * WAV2SFZ
 *
 * Generate a SFZ soundfont file for a WAV sample collection.
 *
 * Usage:
 *    node wav2sfz.js [<options>] <wav file>
 *
 * Options:
 *    -d {duration} : Note sample duration in seconds (default: 6)
 *    --attack <attack> : Set the attack time in seconds (default: 0)
 *    --release <release> : Set the release time in seconds (default: 0.5)
 *    --from <note from> : Note from (default: C0)
 *    --to <note to> : Note to (default: C8)
 *    --offset <offset> : Shifts the sample start to the given duration in seconds (default: 0)
 */

'use strict'

const fs = require('fs');
const WaveFile = require('wavefile').WaveFile;

const NOTE_NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
const NOTE_KEYS = { 'c': 0, 'c#': 1, 'd': 2, 'd#': 3, 'e': 4, 'f': 5, 'f#': 6, 'g': 7, 'g#': 8, 'a': 9, 'a#': 10, 'b': 11 };

function getNoteName(key) {
	const noteId = key - 12;
	const octave = Math.floor(noteId / 12);
	const note = noteId % 12;
	return NOTE_NAMES[note] + octave;
}

function getNoteKey(name) {
	let matches = name.toLowerCase(name).match(/([a-z#]+)([0-9]+)/);

	if (!matches) {
		return null;
	}

	return matches[2] * 12 + 12 + NOTE_KEYS[matches[1]];
}

function getFrequency(midiNote) {
	return 440 * Math.pow(2, (midiNote - 69) / 12);
}

/**
 * Get loop points for the sample chunk
 * @param {int} offset Sample offset
 * @param {int} end  Sample end
 * @param {WaveFile} wav WAV file object
 * @return {array} [loopStart, loopEnd]
 */
function getLoopPoints(offset, end, wav) {
	let cuePoint;
	for (cuePoint of wav.listCuePoints()) {
		const loopStart = cuePoint.dwSampleOffset;
		const loopEnd = loopStart + cuePoint.dwSampleLength;

		if (loopStart >= offset && loopStart <= end && loopEnd >= offset && loopEnd <= end) {
			return [loopStart, loopEnd];
		}
	}

	return [];
}

/**
 * Main function
 */
function main() {

	const argv = require('minimist')(process.argv.slice(2));

	if (argv['_'][0] === undefined) {
		process.stderr.write("Usage: node wav2sfz.js [<options>] <wav file>\n");
		process.exit(1);
	}

	const file = argv['_'][0].replace(/\\/g, '/');
	if (!fs.existsSync(file)) {
		process.stderr.write(`Error: ${file} does not exist.\n`);
		process.exit(1);
	}

	const wav = new WaveFile();
	wav.fromBuffer(fs.readFileSync(file));

	const sfzFileName = file.replace(/\.[a-z0-9A-Z]+$/, '') + '.sfz';
	const sampleFileName = file.split('/').pop();
	const sampleRate = wav.fmt.sampleRate;
	const noteFrom = (argv['from'] || 'c0').toLowerCase();
	const noteTo = (argv['to'] || 'c8').toLowerCase();
	const sampleLength = argv['d'] || 6;
	const globalOffset = argv['offset'] || 0;
	const globalAttack = argv['attack'] || 0;
	const globalRelease = argv['release'] || 0.5;

	let sfz = '';

	sfz += `<control>`;
	sfz += `\n\thint_load_method=1`;
	sfz += `\n\tset_cc1=0     //Power-on Default Values: Modulation`;
	sfz += `\n\tset_cc11=127  //Power-on Default Values: Expression`;
	sfz += `\n\tset_cc64=0    //Power-on Default Values: Sustain Pedal`;
	sfz += `\n\n`;

	sfz += `<global>`;
	sfz += `\n\tamp_velcurve_1=1 // All notes play max velocity`;
	sfz += `\n\tsample=${sampleFileName}`;
	sfz += `\n\tampeg_release=${globalRelease}`;
	sfz += `\n\tampeg_attack=${globalAttack}`;
	sfz += `\n\n`;

	const keyFrom = getNoteKey(noteFrom);
	const keyTo = getNoteKey(noteTo);
	let key;
	let sampleId = 0;
	for (key = keyFrom; key <= keyTo; key++) {
		const noteName = getNoteName(key).toUpperCase();
		const start = sampleId * sampleLength * sampleRate;
		const offset = start + Math.round(globalOffset * sampleRate);
		const end = (sampleId + 1) * sampleLength * sampleRate - 1;

		sfz += `<region>`;
		sfz += `\n\tlokey=${key} hikey=${key} pitch_keycenter=${key}`;
		sfz += `\n\tregion_label=${noteName}`;
		sfz += `\n\toffset=${offset} end=${end}`;

		const [loopStart, loopEnd] = getLoopPoints(offset, end, wav)

		if (loopEnd) {
			sfz += `\n\tloop_type=forward loop_mode=loop_continuous`;
			sfz += `\n\tloop_start=${loopStart} loop_end=${loopEnd}`;
		}

		sfz += `\n\n`;

		sampleId++;
	}

	fs.writeFileSync(sfzFileName, sfz);

	process.stderr.write(`Created SFZ file: ${sfzFileName}\n`);
}

main();

