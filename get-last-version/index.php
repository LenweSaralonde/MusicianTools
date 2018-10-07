<?php
	// Retrieve the latest version of the addon
	// Returns s JS file to be included in the MIDI converter

	define('CURSEFORGE_LATEST_FILE_URL', 'https://wow.curseforge.com/projects/musician/files/latest');
	define('URL_FILENAME', 'download-url.txt');

	$rootDir = dirname(__FILE__) . '/';
	$urlFile = $rootDir . URL_FILENAME;

	$url = '';
	if (!file_exists($urlFile) || (filemtime($urlFile) + 300 < time())) {
		$ch = curl_init(CURSEFORGE_LATEST_FILE_URL);

		curl_setopt($ch, CURLOPT_HEADER, 1);
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
		$headers = curl_exec($ch);
		curl_close($ch);

		$matches = [];
		if (preg_match('/Location:[[:space:]]+(.*)/', $headers, $matches)) {
			$url = trim($matches[1]);
			file_put_contents($urlFile, $url);
		}
	} else {
		$url = file_get_contents($urlFile);
	}

	$version = preg_replace('/Musician-/', '', preg_replace('/\.zip$/', '', basename($url)));

	header('Content-type: application/javascript');
?>
var MUSICIAN_DOWNLOAD_URL = '<?php echo $url ?>';
var MUSICIAN_VERSION = '<?php echo $version ?>';
setMusicianVersion && setMusicianVersion(MUSICIAN_VERSION, MUSICIAN_DOWNLOAD_URL);