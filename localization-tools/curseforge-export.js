/**
 * EXPORT LOCALIZATION TO CURSEFORGE
 * Run this script to push new translations from the repo to Curseforge.
 *
 * Usage:
 *    node curseforge-export.js <Add-on directory> <CurseForge project ID> <Language code>
 */

'use strict'

const { exportLocaleToCurseforge, CURSEFORGE_LANGUAGES } = require('./modules/curseforge');

/**
 * Main function
 */
async function main() {
	const args = process.argv.slice(2);
	const addonPath = args[0] && args[0].replace(/\\/g, '/').replace(/\/+$/g, '').replace(/"+$/g, '');
	const projectId = args[1];
	const languageCode = args[2];

	try {
		if (!addonPath) {
			throw `Missing add-on path.`;
		}
		if (!projectId) {
			throw `Missing CurseForge project ID.`;
		}

		if (languageCode === 'ALL') {
			for (const language of CURSEFORGE_LANGUAGES) {
				await exportLocaleToCurseforge(addonPath, projectId, language);
			}
		} else {
			await exportLocaleToCurseforge(addonPath, projectId, languageCode);
		}
	} catch (e) {
		process.stderr.write(`An error occurred: ${e}`);
	}
}

main();