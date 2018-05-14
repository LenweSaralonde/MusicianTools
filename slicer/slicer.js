/**
 * SLICER
 * Requires ffmpeg and ffmpeg-normalize https://github.com/slhck/ffmpeg-normalize
 */

'use strict'

const fs = require('fs');
const child_process = require('child_process');
const argv = require('minimist')(process.argv.slice(2));

if (argv['_'][0] === undefined) {
	console.error("Usage: node slicer.js [-l <normalize level>] [-n <normalize type>] <wav file>");
	process.exit(1);
}

const slicesFile = argv['_'][0];
const slicesDir = slicesFile.replace(/\.[^\.]+$/, '');

if (!fs.existsSync(slicesFile)) {
	console.error("Error: " + slicesFile + " does not exist.");
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
let NORMALIZE_LEVEL = (argv.l !== undefined)?argv.l:-10;
let NORMALIZE_TYPE = (argv.n !== undefined)?argv.n:'peak';

const notesFromMatches = NOTES_FROM.match(/([A-Z#]+)([0-9-]+)/);

let fileIndex = 0;
let noteIndex = NOTES.indexOf(notesFromMatches[1]);
let currentOctave = notesFromMatches[2];
let currentNote;
let ffmpegCommand;

const normalizedFile = slicesDir + '_normalized.ogg';

const outputFiles = [];

do {
	currentNote = NOTES[noteIndex] + currentOctave;
	const outputFile = slicesDir + '/' + currentNote + '.' + SLICE_FORMAT;
	let out;

	// Extract sample
	ffmpegCommand = `ffmpeg -i ${slicesFile} -y -ss ${fileIndex * NOTE_DURATION} -t ${NOTE_DURATION} __chunk__.wav`;
	out = child_process.spawnSync(ffmpegCommand, [], { shell: true }).output.toString();

	// Normalize sample
	ffmpegCommand = `ffmpeg-normalize __chunk__.wav -nt ${NORMALIZE_TYPE} -t ${NORMALIZE_LEVEL} -o __normalized__.wav`;
	child_process.execSync(ffmpegCommand);

	// Encode sample
	ffmpegCommand = `ffmpeg -i __normalized__.wav -y ${FFMPEG_PARAMS} ${outputFile}`;
	child_process.execSync(ffmpegCommand);

	try {
		fs.unlinkSync('__chunk__.wav');
		fs.unlinkSync('__normalized__.wav');
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
ffmpegCommand = `ffmpeg -i "concat:${concatFiles}" -y -acodec copy ${normalizedFile}`;
child_process.execSync(ffmpegCommand);
