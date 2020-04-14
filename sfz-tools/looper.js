/**
 * LOOPER
 *
 * Generate crossfaded loops within a WAV sample collection.
 *
 * Usage:
 *    node looper.js [<options>] <wav file>
 *
 * Options:
 *    -d {duration} : Note sample duration in seconds (default: 6)
 *    --from <note from> : Note from (default: C0)
 *    --to <note to> : Note to (default: C8)
 *    --loop-from <time> : Loop start point in seconds from the begining of the note sample (default: 0)
 *    --loop-duration <duration> : Loop duration in seconds (default: 0)
 *    --crossfade <duration> : Crossfade duration in seconds (default: loop duration / 4)
 */

'use strict'

const fs = require('fs');
const WaveFile = require('wavefile').WaveFile;

const NOTE_NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
const NOTE_KEYS = { 'c': 0, 'c#': 1, 'd': 2, 'd#': 3, 'e': 4, 'f': 5, 'f#': 6, 'g': 7, 'g#': 8, 'a': 9, 'a#': 10, 'b': 11 };

function getFrequency(midiNote) {
	return 440 * Math.pow(2, (midiNote - 69) / 12);
}

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

/**
 * Flattened Hann crossfade
 * This splice is everywhere continuous in the zeroth, first, and second
 * derivative. A very smooth crossfade.
 * https://dsp.stackexchange.com/a/49989
 * @param {float} t [-1..1]
 * @returns {float} [-1..1]
 */
function flattenedHann(t) {
	const et = .5;
	const ot = (9/16) * Math.sin(t * Math.PI / 2) + (1/16) * Math.sin(t * 3 * Math.PI / 2);
	return et + ot;
}

/**
 * Crossfade between sources
 * https://dsp.stackexchange.com/a/49989
 * @param {float} sampleFrom [-1..1]
 * @param {float} sampleTo [-1..1]
 * @param {float} t [0..1]
 * @returns {float} [-1..1]
 */
function crossFade(sampleFrom, sampleTo, t) {
	// Algorithm
	const a = flattenedHann;

	const t2 = t * 2 - 1; // Convert t range from [0..1] to [-1..1]
	const mix = a(t2) * sampleFrom + a(-t2) * sampleTo;
	return Math.max(-1, Math.min(1, mix));
}

/**
 * Main function
 */
function main() {

	const argv = require('minimist')(process.argv.slice(2));

	if (argv['_'][0] === undefined) {
		process.stderr.write("Usage: node looper.js [<options>] <wav file>\n");
		process.exit(1);
	}

	const file = argv['_'][0].replace(/\\/g, '/');
	if (!fs.existsSync(file)) {
		process.stderr.write(`Error: ${file} does not exist.\n`);
		process.exit(1);
	}

	const outFile = file.replace(/\.wav$/i, '-looped.wav');
	const noteFrom = (argv['from'] || 'c0').toLowerCase();
	const noteTo = (argv['to'] || 'c8').toLowerCase();
	const sampleDuration = argv['d'] || 6;
	const loopFrom = argv['loop-from'] || 0;
	const loopDuration = argv['loop-duration'] || 0;
	const crossfade = argv['crossfade'] || loopDuration / 4;

	if (!loopDuration) {
		process.stderr.write(`Error: No loop duration specified.\n`);
		process.exit(1);
	}

	// Open source WAV file
	const wavSource = new WaveFile();
	wavSource.fromBuffer(fs.readFileSync(file));

	// Only 16-bit WAV files are supported
	if (wavSource.fmt.bitsPerSample !== 16) {
		process.stderr.write("Only 16-bit WAV files are supported.\n");
		process.exit(1);
	}

	// WaveFile has several issues with metadata
	// Create a fresh new instance and just link the data together
	const wav = new WaveFile();
	wav.fromScratch(
		wavSource.fmt.numChannels,
		wavSource.fmt.sampleRate,
		wavSource.fmt.bitsPerSample,
		[]
	);
	wav.data = wavSource.data; // Kids, don't do that

	const sampleRate = wav.fmt.sampleRate;
	const range = 32767; // Range for 16-bit WAV files
	const channels = wav.fmt.numChannels;

	const keyFrom = getNoteKey(noteFrom);
	const keyTo = getNoteKey(noteTo);
	let key;
	let sampleId = 0;
	for (key = keyFrom; key <= keyTo; key++) {
		// Adjust loop duration to match note phase
		const period = 1 / getFrequency(key); // s
		const duration = Math.round(loopDuration / period) * period; // s

		// Set cue region for looping
		const sampleStart = sampleId * sampleDuration * 1000; // ms
		const sampleEnd = (sampleId + 1) * sampleDuration * 1000; // ms
		const loopStart = sampleStart + loopFrom * 1000; // ms
		const loopEnd = Math.min(sampleEnd, loopStart + 1000 * duration); // ms

		wav.setCuePoint({
			position: loopStart,
			end: loopEnd,
			//label: `Loop ${getNoteName(key).toUpperCase()}`, // Labels are not properly supported by WaveFile
			dwPurposeID: 544106354,
			dwCountry: 0,
			dwLanguage: 0,
			dwDialect: 0,
			dwCodePage: 0,
		});

		// Crossfade
		const sampleLoopFrom = Math.round(loopStart / 1000 * sampleRate); // Sample index of loop start
		const sampleLoopTo = Math.round(loopEnd / 1000 * sampleRate); // Sample index of loop end
		const crossfadeSamples = Math.round(crossfade * sampleRate); // Crossfade length in samples

		let sample;
		for (sample = 0; sample <= crossfadeSamples; sample++) {
			const t = sample / crossfadeSamples;
			let c = 0;
			for (c = 0; c < channels; c++) {
				const indexFrom  = (sampleLoopTo   - sample) * channels + c; // inside loop (end), fading out
				const indexTo    = (sampleLoopFrom - sample) * channels + c; // outside loop (before), fading in
				const indexFromEnd = (sampleLoopTo + sample + 1) * channels + c; // inside loop (start), fading out
				const indexToEnd   = (sampleLoopFrom   + sample + 1) * channels + c; // outside loop (after), fading in

				const sampleFrom = wav.getSample(indexFrom) / range;
				const sampleTo = wav.getSample(indexTo) / range;

				const sampleFromEnd = wav.getSample(indexFromEnd) / range;
				const sampleToEnd = wav.getSample(indexToEnd) / range;

				const mixIn = crossFade(sampleFrom, sampleTo, t);
				wav.setSample(indexFrom, Math.round(mixIn * range));

				const mixOut = crossFade(sampleFromEnd, sampleToEnd, t);
				wav.setSample(indexFromEnd, Math.round(mixOut * range));
			}
		}

		sampleId++;
	}

	fs.writeFileSync(outFile, wav.toBuffer());

	process.stderr.write(`Created looped WAV file: ${outFile}\n`);
}

main();

