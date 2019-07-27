<?php
	// Generate animated texture for MusicianAnimatedImageTemplate from an Adobe Premiere video

	define('SOURCE_WIDTH', 160);
	define('SOURCE_HEIGHT', 256);
	
	define('SOURCE_FILE', 'png/nameplate-demo-loop%s.png');
	define('TARGET_FILE', 'nameplates-demo.png');	
	
	define('TILE_WIDTH', 128);
	define('TILE_HEIGHT', 256);
	
	define('TEXTURE_WIDTH', 1024);
	define('TEXTURE_HEIGHT', 1024);

	/////////////////////////////////////////////////////////////////////

	function paste($file, $image, $x, $y) {
		$tile = imagecreatefrompng($file);
		imagealphablending($tile, true);
		
		imagecopyresampled(
			$image, $tile,
			$x * TILE_WIDTH, $y * TILE_HEIGHT,
			0, 0,
			TILE_WIDTH, TILE_HEIGHT,
			SOURCE_WIDTH, SOURCE_HEIGHT);
	}
	
	function image_create($w, $h) {
		$image = imagecreatetruecolor($w, $h);
		imagealphablending($image, true);
        $alpha_channel = imagecolorallocatealpha($image, 0, 0, 0, 127); 
        imagecolortransparent($image, $alpha_channel); 
        imagefill($image, 0, 0, $alpha_channel);
        imagesavealpha($image,true); 
		return $image;		
	}

	/////////////////////////////////////////////////////////////////////

	ini_set('memory_limit','1024M');
	
	$dir = dirname(__FILE__) . '/';
	
	$tilesX = floor(TEXTURE_WIDTH / TILE_WIDTH);
	$tilesY = floor(TEXTURE_HEIGHT / TILE_HEIGHT);
	$tiles = $tilesX * $tilesY;
	$digits = floor(log10($tiles)) + 1;
	
	$image = image_create(TEXTURE_WIDTH, TEXTURE_HEIGHT);
	
	$i = 0;
	for($y = 0; $y < $tilesY; $y++) {
		for($x = 0; $x < $tilesX; $x++) {
	
			$filename = $dir . sprintf(SOURCE_FILE, str_pad($i, $digits, '0', STR_PAD_LEFT));
			paste($filename, $image, $x, $y);
			$i++;
		}
	}
	
	imagepng($image, $dir . TARGET_FILE);