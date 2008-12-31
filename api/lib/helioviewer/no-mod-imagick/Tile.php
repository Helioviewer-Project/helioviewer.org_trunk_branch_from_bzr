<?php
/**
 * @class Tile
 */
require('JP2Image.php');

class Tile extends JP2Image {
	private $imageId;
	private $x;
	private $y;

	/**
	 * constructor
	 */
	public function __construct($id, $zoomLevel, $x, $y, $tileSize) {
		$xRange = array("start" => $x, "end" => $x);
		$yRange = array("start" => $y, "end" => $y);
		
		parent::__construct($zoomLevel, $xRange, $yRange, $tileSize);
		
		$this->x = $x;
		$this->y = $y;
		$this->imageId = $id;
		$this->getTile();
	}

	/**
	 * getTile
	 */
	function getTile() {
		// Retrieve meta-information
		$imageInfo = $this->getMetaInfo();
		
		// Filepaths (For .tif and .png images)
		$png = $this->getFilePath($imageInfo['timestamp'], $this->zoomLevel, $this->x, $this->y);
		$tif = substr($png, 0, -3) . "tif";

		$actualToDesired = ($imageInfo['imgScaleX'] / $this->desiredScale);

		// If tile already exists in cache, use it
		if (file_exists($png)) {
			//$this->image = new Imagick($png);
			$this->image = $png;
			$this->display();
			exit();
		}
		// Otherwise, if the resolution requested is higher than the image's native resolution, try and use a cached version of the highest res tile available
		/*
		elseif ($actualToDesired > 1) {
			$newX    = ($this->x < 0) ? floor($this->x / pow($actualToDesired, 2)) : ceil($this->x / pow($actualToDesired, 2));
			$newY    = ($this->y < 0) ? floor($this->y / pow($actualToDesired, 2)) : ceil($this->y / pow($actualToDesired, 2));
			$newZoom = $this->zoomLevel + log($actualToDesired, 2);
			
			$cached = $this->getFilePath($imageInfo['timestamp'], $newZoom, $newX, $newY);
			
			$im = new Imagick($cached);
		}*/

		// If nothing useful is in the cache, create the tile from scratch
		else {
			// kdu_expand command
			$im = $this->extractRegion($imageInfo['uri'], $tif, $imageInfo["width"], $imageInfo["height"], $imageInfo['imgScaleX'], $imageInfo['detector'], $imageInfo['measurement']);
			
			// Convert to png
			//$im->setFilename($png);
			//$im->writeImage($im->getFilename());
			exec("convert $tif $png", $out, $ret);
			
			// Optimize PNG
			exec("optipng $png", $out, $ret);
	
			// Delete tif image
			unlink($tif);
		}
		
		// Store image
		//$this->image = $im;
		$this->image = $png;
	}

	/**
	 * getFilePath
	 * @return 
	 * @param $timestamp Object
	 */
	function getFilePath($timestamp, $zoomLevel, $x, $y) {
		// Starting point
		$filepath = $this->cacheDir . $this->tileSize . "/";
		if (!file_exists($filepath))
			mkdir($filepath);
			
		// Date information
		$year  = substr($timestamp,0,4);
		$month = substr($timestamp,5,2);
		$day   = substr($timestamp,8,2);

		// Create necessary directories
		$filepath .= $year . "/";
		if (!file_exists($filepath))
			mkdir($filepath);

		$filepath .= $month . "/";
		if (!file_exists($filepath))
			mkdir($filepath);

		$filepath .= $day . "/";
		if (!file_exists($filepath))
			mkdir($filepath);

		// Convert coordinates to strings
		$xStr = "+" . str_pad($x, 2, '0', STR_PAD_LEFT);
		if (substr($x,0,1) == "-")
			$xStr = "-" . str_pad(substr($x, 1), 2, '0', STR_PAD_LEFT);

		$yStr = "+" . str_pad($y, 2, '0', STR_PAD_LEFT);
		if (substr($y,0,1) == "-")
			$yStr = "-" . str_pad(substr($y, 1), 2, '0', STR_PAD_LEFT);

		$filepath .= $this->imageId . "_" . $zoomLevel . "_" . $xStr . "_" . $yStr . ".png";

		return $filepath;
	}



	/**
	 * getMetaInfo
	 * @return
	 * @param $imageId Object
	 */
	function getMetaInfo() {
		$query  = "SELECT timestamp, uri, width, height, imgScaleX, imgScaleY, measurement.abbreviation as measurement, detector.abbreviation as detector FROM image ";
		$query .= "LEFT JOIN measurement on image.measurementId = measurement.id  LEFT JOIN detector on measurement.detectorId = detector.id WHERE image.id=$this->imageId";

		// Query database
		$result = $this->db->query($query);
		if (!$result) {
		        echo "$query - failed\n";
		        die (mysql_error());
		}
		if (mysql_num_rows($result) > 0)
			return mysql_fetch_array($result, MYSQL_ASSOC);
		else
			return false;
	}
}
?>