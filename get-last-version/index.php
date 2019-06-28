<?php
	// Retrieve the latest version of the addon
	// Returns s JS file to be included in the MIDI converter

	define('GITHUB_LATEST_TAG_URL', 'https://api.github.com/repos/LenweSaralonde/Musician/tags');
	define('DOWNLOAD_URL', 'https://www.curseforge.com/wow/addons/musician');
	define('GITHUB_API_USER_AGENT', 'Musician Tag Retreiver');
	define('VERSION_FILENAME', 'version.txt');
	define('CACHE_TTL', 300);

	$rootDir = dirname(__FILE__) . '/';
	$versionFile = $rootDir . VERSION_FILENAME;
	$version = @file_get_contents($versionFile);
	$url = DOWNLOAD_URL;

	if (!$version || (filemtime($versionFile) + CACHE_TTL < time())) {
		$ch = curl_init(GITHUB_LATEST_TAG_URL);
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
		curl_setopt($ch, CURLOPT_USERAGENT, GITHUB_API_USER_AGENT);
		$json = @json_decode(@curl_exec($ch), true);
		curl_close($ch);
		if ($json && $json[0] && $json[0]['name']) {
			$version = $json[0]['name'];
		}
		file_put_contents($versionFile, $version);
	} else {
		$version = file_get_contents($versionFile);
	}

	header('Content-type: application/javascript');
?>
var MUSICIAN_DOWNLOAD_URL = '<?php echo $url ?>';
var MUSICIAN_VERSION = '<?php echo $version ?>';
setMusicianVersion && setMusicianVersion(MUSICIAN_VERSION, MUSICIAN_DOWNLOAD_URL);