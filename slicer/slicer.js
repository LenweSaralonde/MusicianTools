/**
 * SLICER
 * Requires ffmpeg and ffmpeg-normalize https://github.com/slhck/ffmpeg-normalize
 */

'use strict'

const fs = require('fs');
const child_process = require('child_process');

function main() {

	const argv = require('minimist')(process.argv.slice(2));

	if (argv['_'][0] === undefined) {
		process.stderr.write("Usage: node slicer.js [-l <normalize level>] [-n <normalize type>] <wav file>");
		process.exit(1);
	}

	const slicesFile = argv['_'][0];
	const slicesDir = slicesFile.replace(/\.[^\.]+$/, '');

	if (!fs.existsSync(slicesFile)) {
		process.stderr.write("Error: " + slicesFile + " does not exist.");
		process.exit(1);
	}

	try {
		fs.mkdirSync(slicesDir);
	} catch (e) {}

	const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
	let NOTES_FROM = argv.from || 'C0';
	let NOTES_TO   = argv.to || 'C8';
	let NOTE_DURATION = (argv.d !== undefined)?parseInt(argv.d):6;
	let FFMPEG_PARAMS = '';
	let SLICE_FORMAT = argv.format || 'ogg';
	let NORMALIZE_LEVEL = argv.l;
	let NORMALIZE_TYPE = argv.n;

	const notesFromMatches = NOTES_FROM.match(/([A-Z#]+)([0-9-]+)/);

	let fileIndex = 0;
	let noteIndex = NOTES.indexOf(notesFromMatches[1]);
	let currentOctave = notesFromMatches[2];
	let currentNote;
	let ffmpegCommand;

	const normalizedFile = slicesDir + '_normalized.' + SLICE_FORMAT;

	const outputFiles = [];

	do {
		currentNote = NOTES[noteIndex] + currentOctave;
		const outputFile = slicesDir + '/' + currentNote + '.' + SLICE_FORMAT;
		let out;

		// Extract sample
		ffmpegCommand = `ffmpeg -i "${slicesFile}" -y -ss ${fileIndex * NOTE_DURATION} -t ${NOTE_DURATION} __chunk__.wav`;
		out = child_process.spawnSync(ffmpegCommand, [], { shell: true }).output.toString();

		let level = 0;

		// Normalize sample
		if (NORMALIZE_TYPE) {
			// Measure level to adjust
			ffmpegCommand = `ffmpeg-normalize __chunk__.wav -n -v -f -nt ${NORMALIZE_TYPE} -t ${NORMALIZE_LEVEL}`;
			out = child_process.spawnSync(ffmpegCommand, [], { shell: true }).output.toString();
			const levelMatch = out.match(/INFO: Adjusting stream .+ by (.*) dB to reach/);
			level = levelMatch && (levelMatch[1] * 1);
		}

		// Encode sample and adjust level if needed
		const volumeCommand = level ? `-filter:a "volume=${level}dB"`:'';
		ffmpegCommand = `ffmpeg -i __chunk__.wav -y ${volumeCommand} ${FFMPEG_PARAMS} "${outputFile}"`;
		const levelDisplay = level ? ('(' + (level > 0 ? '+' : '') + new Intl.NumberFormat('en-US').format(level) + 'dB)') : '';
		process.stdout.write(`Encoding ${outputFile} ${levelDisplay}\n`);
		out = child_process.spawnSync(ffmpegCommand, [], { shell: true }).output.toString();

		try {
			fs.unlinkSync('__chunk__.wav');
		} catch (e) {}

		outputFiles.push(outputFile);

		fileIndex++;
		noteIndex++;
		if (noteIndex === NOTES.length) {
			noteIndex = 0;
			currentOctave++;
		}
	} while (currentNote !== NOTES_TO)

	// Create normalized source file for comparison
	const concatFiles = outputFiles.join('|');
	ffmpegCommand = `ffmpeg -i "concat:${concatFiles}" -y -acodec copy "${normalizedFile}"`;
	child_process.spawnSync(ffmpegCommand, [], { shell: true }).output.toString();
}

main();