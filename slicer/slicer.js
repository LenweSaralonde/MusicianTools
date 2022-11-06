/**
 * SLICER
 *
 * Slice the source WAV file containing all instrument samples into normalized instrument OGG files for the Musician add-on.
 * The output files will be created in a directory having the same name as the source WAV file.
 * Requires ffmpeg and ffmpeg-normalize https://github.com/slhck/ffmpeg-normalize
 *
 * Usage:
 *    node slicer.js [<options>] <wav file> [<output dir>]
 *
 * Options:
 *    -l <normalize level> : Normalization level in dB (default: 0)
 *    -n {rms|peak} : Normalization type (default: peak)
 *    -d {duration} : Note sample duration in seconds (default: 6)
 *    -t {true|false} : Trim audio at end (default: false)
 *    --from <note from> : Note from (default: C0)
 *    --to <note to> : Note to (default: C8)
 *    --format <format> : Output file format (default: ogg)
 *    --fileIndex <index> : First note index in the file (default: 0)
 *    --ffmpegParams <params> : Additional parameters to be provided to ffmpeg
 */

'use strict'

const fs = require('fs');
const child_process = require('child_process');

function main() {

	const argv = require('minimist')(process.argv.slice(2));

	if (argv['_'][0] === undefined) {
		process.stderr.write("Usage: node slicer.js [<options>] <wav file>");
		process.exit(1);
	}

	const slicesFile = argv['_'][0];
	const slicesDir = argv['_'][1] || slicesFile.replace(/\.[^\.]+$/, '');

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
	let FFMPEG_PARAMS = argv.ffmpegParams || '';
	let SLICE_FORMAT = argv.format || 'ogg';
	let NORMALIZE_LEVEL = argv.l;
	let NORMALIZE_TYPE = argv.n;
	let TRIM = argv.t;

	const notesFromMatches = NOTES_FROM.match(/([A-Z#]+)([0-9-]+)/);

	let fileIndex = argv.fileIndex || 0;
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

		// Get peak level
		ffmpegCommand = `ffmpeg -i __chunk__.wav -af asetnsamples=${44100 * NOTE_DURATION},astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level -f null -`;
		out = child_process.spawnSync(ffmpegCommand, [], { shell: true }).output.toString();
		const overall = out.match(/\] Overall([\s\S]+)$/gm);
		const peak = overall[0].match(/Peak level dB: (.+)/)[1];

		if (peak !== '-inf' && peak > -50) {
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
			const filters = [];
			if (NORMALIZE_TYPE && level !== 0) {
				filters.push(`volume=${level}dB`);
			}
			if (TRIM) {
				filters.push(`silenceremove=stop_periods=-1:stop_duration=0.05:stop_threshold=-65dB`);
			}
			const filterCommand = (filters.length > 0) ? `-af ${filters.join(',')}` : '';
			ffmpegCommand = `ffmpeg -i __chunk__.wav -y ${filterCommand} ${FFMPEG_PARAMS} "${outputFile}"`;
			const levelDisplay = level ? ('(' + (level > 0 ? '+' : '') + new Intl.NumberFormat('en-US').format(level) + 'dB)') : '';
			process.stdout.write(`Encoding ${outputFile} ${levelDisplay}\n`);
			out = child_process.spawnSync(ffmpegCommand, [], { shell: true }).output.toString();

			outputFiles.push(outputFile);
		} else {
			process.stdout.write(`Skipping ${outputFile} (empty)\n`);
		}

		try {
			fs.unlinkSync('__chunk__.wav');
		} catch (e) {}

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