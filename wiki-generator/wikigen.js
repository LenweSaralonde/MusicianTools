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

function getToc(list, level = 1) {
    let indent;
    switch(level) {
        case 1: indent = '- '; break;
        case 2: indent = '  * '; break;
        case 3: indent = '    + '; break;
        default: indent = '';
    }

    let toc = "";
    list.forEach((e) => {
        const anchor = e.anchor || e.name.toLowerCase().replace(/[^a-z0-9_]+/g, '').replace(/_/g, '-');

        toc += `${indent}[${e.name}](#${anchor})\n`;
    })
    return toc;
}

function getFunctionsDoc(title, module) {
    let md = `### ${title}\n`;

    md += `${module.moduleDescription}\n\n`;

    // Module is a class: Add fields
    if (module.fields) {
        md += `#### Fields\n`;
        module.fields.forEach((field) => {
           md += `* **${field.name}** _(${field.type})_ ${field.desc}\n`;
        });
    }

    // Functions
    module.functions.forEach((funcSpecs) => {
        if (!funcSpecs.name || funcSpecs.local) {
            return;
        }

        // Function name (title)
        md += '#### ' + funcSpecs.name + "\n";

        // Description
        md += funcSpecs.description.join("\n\n") + "\n";

        // Usage snippet
        const luaParams = funcSpecs.param.reduce((str, param) => (str !== '' ? (str + ', ') : '') + param.name, '');
        const luaReturns = funcSpecs.returns.reduce((str, returns) => (str !== '' ? (str + ', ') : '') + returns.name, '');
        md += '```lua' + "\n" + (luaReturns ? (luaReturns + ' = ') : '') + funcSpecs.name + '(' + luaParams + ')' + "\n```\n";

        // Arguments
        if (funcSpecs.param.length) {
            let param;
            md += `\n**Arguments**\n`;
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

    return md;
}

function getEventsDoc(module) {

    let md = '';

    // Events
    module.events.forEach((eventSpecs) => {
        // Event name
        md += '### ' + eventSpecs.name + "\n";

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

function getDocs(directory) {
    const docs = {};

    // functions
    const main = parseLua(`${directory}/core/Musician.lua`); // Main
    const sampler = parseLua(`${directory}/core/Musician.Sampler.lua`); // Sampler
    const comm = parseLua(`${directory}/core/Musician.Comm.lua`); // Communication
    const registry = parseLua(`${directory}/core/Musician.Registry.lua`); // Registry
    const live = parseLua(`${directory}/core/Musician.Live.lua`); // Live
    const utils = parseLua(`${directory}/core/Musician.Utils.lua`); // Utility functions
    const worker = parseLua(`${directory}/core/Musician.Worker.lua`); // Worker manager

    // classes
    const song = parseLua(`${directory}/core/Musician.Song.lua`); // Musician.Song
    const volumeMeter = parseLua(`${directory}/core/Musician.VolumeMeter.lua`); // Musician.VolumeMeter

    // events
    const events = parseLua(`${directory}/constants/Musician.Constants.lua`); // Events

    // Generate markdown
    let md = '';

    //////// TOC

    // Functions
    md += getToc([{ name: "Functions" }], 1);
    md += getToc([{ name: "Main" }], 2);
    md += getToc(main.functions, 3);
    md += getToc([{ name: "Sampler" }], 2);
    md += getToc(sampler.functions, 3);
    md += getToc([{ name: "Communication" }], 2);
    md += getToc(comm.functions, 3);
    md += getToc([{ name: "Registry" }], 2);
    md += getToc(registry.functions, 3);
    md += getToc([{ name: "Live" }], 2);
    md += getToc(live.functions, 3);
    md += getToc([{ name: "Worker" }], 2);
    md += getToc(worker.functions, 3);
    md += getToc([{ name: "Utility functions" }], 2);
    md += getToc(utils.functions, 3);

    // Classes
    md += getToc([{ name: "Classes" }], 1);
    md += getToc([{ name: "Musician.Song" }], 2);
    md += getToc([{ name: "Fields", anchor: 'fields' }], 3);
    md += getToc(song.functions, 3);
    md += getToc([{ name: "Musician.VolumeMeter" }], 2);
    md += getToc([{ name: "Fields", anchor: 'fields-1' }], 3);
    md += getToc(volumeMeter.functions, 3);

    // Events
    md += getToc([{ name: "Events" }], 1);
    md += getToc(events.events, 2);

    //////// Content

    // Functions
    md += `## Functions\n`;
    md += getFunctionsDoc("Main", main);
    md += getFunctionsDoc("Sampler", sampler);
    md += getFunctionsDoc("Communication", comm);
    md += getFunctionsDoc("Registry", registry);
    md += getFunctionsDoc("Live", live);
    md += getFunctionsDoc("Worker", worker);
    md += getFunctionsDoc("Utility functions", utils);

    // Classes
    md += `## Classes\n`;
    md += getFunctionsDoc("Musician.Song", song);
    md += getFunctionsDoc("Musician.VolumeMeter", volumeMeter);

    // Events
    md += `## Events\n`;
    md += getEventsDoc(events);

    return md;
}


function main() {
    const argv = require('minimist')(process.argv.slice(2));
    const addonDirectory = argv['_'][0];
    const wikiDirectory = argv['_'][1];

    const md = getDocs(addonDirectory);

    fs.writeFileSync(`${wikiDirectory}/API-documentation.md`, md);
}

main();
