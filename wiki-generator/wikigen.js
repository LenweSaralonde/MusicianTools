/**
 * WIKIGEN
 * Generate API doc for the Wiki
 *
 * Usage:
 *    node wikigen.js <Musician add-on directory> <Musician.Wiki directory>
 */

'use strict'

const fs = require('fs');

function parseLua(file) {

    const functions = [];
    const events = [];
    const fields = []
    let moduleName;
    let moduleDescription;

    function flushFunctionDoc(blockSpecs) {
        if (blockSpecs.name && !blockSpecs.local) {
            // Function name (title)
            if (blockSpecs.field) {
                events.push({...blockSpecs});
            } else {
                functions.push({...blockSpecs});
            }
        }

        blockSpecs.name = '';
        blockSpecs.local = false;
        blockSpecs.description = [];
        blockSpecs.param = [];
        blockSpecs.returns = [];
    }

    const luaCode = fs.readFileSync(file, 'utf8').replace(/\r/g, '');
    const lines = luaCode.split("\n");

    let line;
    let blockSpecs = {};
    let inDescription = false;
    let inClass = false;

    flushFunctionDoc(blockSpecs);

    for (line of lines) {

        const descriptionMatches = line.match(/^--- *(.*)/);
        const descriptionMatches2 = line.match(/^-- *(.*)/);
        const typeMatches = line.match(/^-- *@type +([^ ]+)/);
        const paramMatches = line.match(/^-- *@param +([^ ]+) +\(([^ ]+)\)(.*)/);
        const paramOptMatches = line.match(/^-- *@param\[opt\] +([^ ]+) +\(([^ ]+)\)(.*)/);
        const paramDefaultMatches = line.match(/^-- *@param\[opt=([^\]]+)\] +([^ ]+) +\(([^ ]+)\)(.*)/);
        const returnsMatches = line.match(/^-- *@returns? ([^ ]+) \(([^ ]+)\)(.*)/);
        const moduleMatches = line.match(/^-- *@module +([^ ]+)/);
        const eventFieldMatches = line.match(/^-- *@field +([^ ]+)/);
        const classFieldMatches = line.match(/-- *@field +([^ ]+) +\(([^ ]+)\)(.*)/);
        const functionNameMatches = line.match(/^(local *)?(function *)?([^(=]+)/);

        // Module
        if (moduleMatches) {
            moduleDescription = [ ...blockSpecs.description ];
            moduleName = moduleMatches[1];
            blockSpecs.description = [];
            continue;
        }

        // First doc block line
        if (descriptionMatches) {
            inDescription = true;
            blockSpecs.description.push(descriptionMatches[1].trim());
        }
        else if (typeMatches) {
            inClass = true;
        }
        else if (inClass && classFieldMatches) {
            fields.push({
                name: classFieldMatches[1],
                type: classFieldMatches[2],
                desc: classFieldMatches[3],
            });
            blockSpecs.description = [];
        }
        // Field block
        else if (inDescription && eventFieldMatches) {
            blockSpecs.field = eventFieldMatches[1];
        }
        // Param block
        else if (inDescription && (paramDefaultMatches || paramOptMatches || paramMatches)) {
            if (paramDefaultMatches) {
                blockSpecs.param.push({
                    opt: true,
                    optDefault: paramDefaultMatches[1],
                    name: paramDefaultMatches[2],
                    type: paramDefaultMatches[3],
                    desc: paramDefaultMatches[4].trim(),
                });
            } else if (paramOptMatches) {
                blockSpecs.param.push({
                    opt: true,
                    name: paramOptMatches[1],
                    type: paramOptMatches[2],
                    desc: paramOptMatches[3].trim(),
                });
            } else if (paramMatches) {
                blockSpecs.param.push({
                    opt: false,
                    name: paramMatches[1],
                    type: paramMatches[2],
                    desc: paramMatches[3].trim(),
                });
            }
        }
        // Return block
        else if (returnsMatches && inDescription) {
            const returns = {
                name: returnsMatches[1],
                type: returnsMatches[2],
                desc: returnsMatches[3].trim(),
            }
            blockSpecs.returns.push(returns);
        }
        // Other description line
        else if (descriptionMatches2 && inDescription) {
            const descLine = descriptionMatches2[1].trim()
            descLine && blockSpecs.description.push(descLine);
        }
        // Function name
        else if (functionNameMatches && inDescription) {
            inDescription = false;
            blockSpecs.local = !!functionNameMatches[1];
            blockSpecs.name = functionNameMatches[3].trim();
            flushFunctionDoc(blockSpecs);
        }
        else {
            inDescription = false;
        }
    }

    return { moduleName, moduleDescription, events, functions, fields };
}

function getFunctionsDoc(module) {
	let md = '';

    md += `${module.moduleDescription}\n\n`;

	if (module.fields.length > 0) {
		md += `- [Fields](#fields)\n`;
		module.fields.forEach((e) => {
			const anchor = e.name.toLowerCase().replace(/[^a-z0-9_]+/g, '').replace(/_/g, '-');
			md += `  * [${e.name}](#${anchor})\n`;
		})
	}

	if (module.functions.length > 0) {
		md += `- [Functions](#functions)\n`;
		module.functions.forEach((e) => {
			const anchor = e.name.toLowerCase().replace(/[^a-z0-9_]+/g, '').replace(/_/g, '-');
			md += `  * [${e.name}](#${anchor})\n`;
		})
	}

	md += `\n`;

    // Fields
    if (module.fields.length > 0) {
        md += `# Fields\n`;
        module.fields.forEach((field) => {
           md += `* **${field.name}** _(${field.type})_ ${field.desc}\n`;
        });
    }

	// Functions
    if (module.functions.length > 0) {
        md += `# Functions\n`;
		module.functions.forEach((funcSpecs) => {
			if (!funcSpecs.name || funcSpecs.local) {
				return;
			}

			// Function name (title)
			md += '## ' + funcSpecs.name + "\n";

			// Description
			md += funcSpecs.description.join("\n\n") + "\n";

			// Usage snippet
			const luaParams = funcSpecs.param.reduce((str, param) => (str !== '' ? (str + ', ') : '') + param.name, '');
			const luaReturns = funcSpecs.returns.reduce((str, returns) => (str !== '' ? (str + ', ') : '') + returns.name, '');
			md += '```lua' + "\n" + (luaReturns ? (luaReturns + ' = ') : '') + funcSpecs.name + '(' + luaParams + ')' + "\n```\n";

			// Arguments
			if (funcSpecs.param.length) {
				let param;
				md += `**Arguments**\n`;
				for (param of funcSpecs.param) {

					let desc = param.desc ? (' ' + param.desc) : ''
					let opt = param.opt ?
						(param.optDefault ?
							` _(default=${param.optDefault})` :
							' _(optional)_') :
						'';

					md += `* **${param.name}** _(${param.type})_${desc}${opt}\n`;
				}
			}

			// Returns
			if (funcSpecs.returns.length) {
				let returns;
				md += "\n" + '**Returns**' + "\n";
				for (returns of funcSpecs.returns) {
					md += '* **' + returns.name + '**' + ' _(' + returns.type + ')_' + (returns.desc ? (' ' + returns.desc) : '') + "\n";
				}
			}

			md += `\n`;
		});
	}

    return md;
}

function getEventsDoc(module) {

	let md = '';

	module.events.forEach((e) => {
		const anchor = e.name.toLowerCase().replace(/[^a-z0-9_]+/g, '').replace(/_/g, '-');
		md += `- [${e.name}](#${anchor})\n`;
	});

	md += `\n`;

    // Events
    module.events.forEach((eventSpecs) => {
        // Event name
        md += '# ' + eventSpecs.name + "\n";

        // Description
        md += eventSpecs.description.join("\n\n") + "\n";

        // Arguments
        if (eventSpecs.param.length) {
            let param;
            md += "\n" + '**Arguments**' + "\n";
            for (param of eventSpecs.param) {
                md += '* **' + param.name + '**' + ' _(' + param.type + ')_' + (param.desc ? (' ' + param.desc) : '') + (param.opt ? ' _(optional)_' : '') + "\n";
            }
        }

        // Returns
        if (eventSpecs.returns.length) {
            let returns;
            md += "\n" + '**Returns**' + "\n";
            for (returns of eventSpecs.returns) {
                md += '* **' + returns.name + '**' + ' _(' + returns.type + ')_' + (returns.desc ? (' ' + returns.desc) : '') + "\n";
            }
        }

    });

    return md;
}

function getDocs(directory, wikiDirectory) {
	fs.writeFileSync(`${wikiDirectory}/API-Main.md`, getFunctionsDoc(parseLua(`${directory}/core/Musician.lua`)));
    fs.writeFileSync(`${wikiDirectory}/API-Sampler.md`, getFunctionsDoc(parseLua(`${directory}/core/Musician.Sampler.lua`)));
    fs.writeFileSync(`${wikiDirectory}/API-Communication.md`, getFunctionsDoc(parseLua(`${directory}/core/Musician.Comm.lua`)));
    fs.writeFileSync(`${wikiDirectory}/API-Registry.md`, getFunctionsDoc(parseLua(`${directory}/core/Musician.Registry.lua`)));
    fs.writeFileSync(`${wikiDirectory}/API-Live.md`, getFunctionsDoc(parseLua(`${directory}/core/Musician.Live.lua`)));
    fs.writeFileSync(`${wikiDirectory}/API-Worker.md`, getFunctionsDoc(parseLua(`${directory}/core/Musician.Worker.lua`)));
	fs.writeFileSync(`${wikiDirectory}/API-Utility-functions.md`, getFunctionsDoc(parseLua(`${directory}/core/Musician.Utils.lua`)));

	fs.writeFileSync(`${wikiDirectory}/API-Song.md`, getFunctionsDoc(parseLua(`${directory}/core/Musician.Song.lua`)));
    fs.writeFileSync(`${wikiDirectory}/API-SongLinks.md`, getFunctionsDoc(parseLua(`${directory}/core/Musician.SongLinks.lua`)));
	fs.writeFileSync(`${wikiDirectory}/API-VolumeMeter.md`, getFunctionsDoc(parseLua(`${directory}/core/Musician.VolumeMeter.lua`)));

    fs.writeFileSync(`${wikiDirectory}/API-Events.md`, getEventsDoc(parseLua(`${directory}/constants/Musician.Constants.lua`)));
}

function main() {
    const argv = require('minimist')(process.argv.slice(2));
    const addonDirectory = argv['_'][0];
    const wikiDirectory = argv['_'][1];

    const md = getDocs(addonDirectory, wikiDirectory);
}

main();
