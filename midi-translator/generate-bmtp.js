'use strict'

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const MAPPING = [
	'1008',
	'1009',
	'106E',
	'106B',
	'106D',
	'106A',
	'116F',
	'1060',
	'1061',
	'1062',
	'1063',
	'1064',
	'1065',
	'1066',
	'1067',
	'1068',
	'1069',
	'1041',
	'1042',
	'1043',
	'1044',
	'1045',
	'1046',
	'1047',
	'1048',
	'1049',
	'104A',
	'104B',
	'104C',
	'104D',
	'104E',
	'104F',
	'1050',
	'1051',
	'1052',
	'1053',
	'1054',
	'1055',
	'1056',
	'1057',
	'1058',
	'1059',
	'105A',
	'1031',
	'1032',
	'1033',
	'1034',
	'1035',
	'1036',
	'1037',
	'1038',
	'1039',
	'1030',
	'1124',
	'1123',
	'1122',
	'1121',
	'1125',
	'1126',
	'1127',
	'1128',
];

const START = 36;

let bmtp =
	`[Project]\n` +
	`Version=1\n`;

let c;
for (c = 0; c < 16; c++) {
	bmtp +=
		`\n[Preset.${c}]\n` +
		`Name=Musician MIDI (channel ${c + 1})\n` +
		`Active=1\n`;

	const cHex = c.toString(16).toUpperCase();
	let rule = 0;
	let i;
	for (i in MAPPING) {
		const compKeyCode = MAPPING[i];
		const midiKey = START + parseInt(i, 10);
		const midiKeyCode = midiKey.toString(16).toUpperCase();
		const octave = Math.floor((midiKey - 12) / 12);
		const note = (midiKey - 12) % 12;
		const midiKeyName = NOTE_NAMES[note] + octave;

		bmtp +=
			`Name${rule}=${midiKeyName} up\n` +
			`Incoming${rule}=MID18${cHex}${midiKeyCode}pp\n` +
			`Outgoing${rule}=KAM12100KSQ1000${compKeyCode}\n` +
			`Options${rule}=Actv01Stop00OutO00\n`;
		rule++;
		bmtp +=
			`Name${rule}=${midiKeyName} up (alternate)\n` +
			`Incoming${rule}=MID19${cHex}${midiKeyCode}00\n` +
			`Outgoing${rule}=KAM12100KSQ1000${compKeyCode}\n` +
			`Options${rule}=Actv01Stop01OutO00\n`;
		rule++;
		bmtp +=
			`Name${rule}=${midiKeyName} down\n` +
			`Incoming${rule}=MID19${cHex}${midiKeyCode}pp\n` +
			`Outgoing${rule}=KAM11000KSQ1000${compKeyCode}\n` +
			`Options${rule}=Actv01Stop00OutO00\n`;
		rule++;
	}

	bmtp +=
		`Name${rule}=Pedal down\n` +
		`Incoming${rule}=MID1B${cHex}407F\n` +
		`Outgoing${rule}=KAM11000KSQ10001020\n` +
		`Options${rule}=Actv01Stop00OutO00\n`;
	rule++;
	bmtp +=
		`Name${rule}=Pedal up\n` +
		`Incoming${rule}=MID1B${cHex}4000\n` +
		`Outgoing${rule}=KAM12100KSQ10001020\n` +
		`Options${rule}=Actv01Stop00OutO00\n`;
}

process.stdout.write(bmtp);