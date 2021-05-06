/**
 * EXPORT LOCALIZATION TO CURSEFORGE
 * Run this script to push new translations from the repo to Curseforge.
 *
 * Usage:
 *    node curseforge-export.js <Add-on directory> <CurseForge project ID>
 */

'use strict'

const { exportLocalesToCurseforge } = require('./modules/curseforge');

/**
 * Main function
 */
async function main() {
	const args = process.argv.slice(2);
	const addonPath = args[0] && args[0].replace(/\\/g, '/').replace(/\/+$/g, '').replace(/"+$/g, '');
	const projectId = args[1];

	try {
		if (!addonPath) {
			throw `Missing add-on path.`;
		}
		if (!projectId) {
			throw `Missing CurseForge project ID.`;
		}

		await exportLocalesToCurseforge(addonPath, projectId);
	} catch (e) {
		process.stderr.write(`An error occurred: ${e}`);
	}
}

main();