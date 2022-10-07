MusicianTools
=============

Tools and sources of the [Musician](https://github.com/LenweSaralonde/Musician) WoW add-on.

* **get-last-version**: Fetch the latest version of the add-on from GitHub tags as JS code for the MIDI converter page (PHP)
* **instrument-template**: MIDI file used to create Musician soundfonts from virtual instruments
* **musician-list-demo-songs**: Guide to generate the demo songs code for [MusicianList](https://github.com/LenweSaralonde/MusicianList)
* **psd**: Sources of images, textures and animations (Adobe Photoshop and Adobe Premiere)
* **sfz-generator**: Script to export Musician's instruments into SFZ soundfonts (Node.js)
* **sfz-tools**: Misc scripts to generate SFZ soundfonts out of WAV sample collections.
	* **wav2sfz**: Generate a SFZ soundfont file for a WAV sample collection.
	* **looper**: Generate crossfaded loops within a WAV sample collection.
* **slicer**: Splits the audio file containing all the instrument samples into normalized OGG files (Node.js, ffmpeg and ffmpeg-normalize)

Requirements
------------
* [Node.js](https://nodejs.org/)
* [Python 3](https://www.python.org/downloads/)
* [ffmpeg](https://ffmpeg.org/)
* [ffmpeg-normalize](https://github.com/slhck/ffmpeg-normalize)
