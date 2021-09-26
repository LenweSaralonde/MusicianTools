/**
 * Get decay for each individual sample of a SFZ instrument
 *
 * Usage:
 *    node sample-decay.js <Musician add-on directory> <instrument name> <max decay>
 */

 'use strict'

 const fs = require('fs');
 const child_process = require('child_process');

 const NOTE_FILENAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

 /**
 * Main function
 */
function main() {
	const argv = require('minimist')(process.argv.slice(2));

	if (argv['_'][1] === undefined) {
		process.stderr.write("Usage: node sample-decay.js <Musician add-on directory> <instrument name>\n");
		process.exit(1);
	}

	const addonFolder = argv['_'][0];
	const instrumentFolder = argv['_'][1];
	const maxDecay = parseInt(argv['_'][2] || 1000);

	for (let key = 0; key <= 127; key++) {
		const octave = Math.floor(key / 12) - 1;
		const note = key % 12;
		const filename = `${addonFolder}/instruments/${instrumentFolder}/${NOTE_FILENAMES[note]}${octave}.ogg`
		if (fs.existsSync(filename)) {
			const ffprobeCommand = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filename}"`;
			const out = child_process.spawnSync(ffprobeCommand, [], { shell: true }).output.toString().trim();
			const durationMatch = out.match(/([0-9\.]+)/);
			const duration = parseFloat(durationMatch[0]);
			process.stdout.write(`[${key}] = ${Math.min(maxDecay, Math.floor(duration * 1000))},\n`);
		}
	}
}

main();
