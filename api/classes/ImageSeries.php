<?php
/*
 * Created on Sep 15, 2008
 * 
 * Note: For movies, it is easiest to work with Unix timestamps since that is what is returned
 *       from the database. To get from a javascript Date object to a Unix timestamp, simply
 *       use "date.getTime() * 1000." (getTime returns the number of miliseconds)
 */
require('CompositeImage.php');
require('../phpClasses/lib/DbConnection.php');
require_once('../phpClasses/phpvideotoolkit/config.php');
require_once('../phpClasses/phpvideotoolkit/phpvideotoolkit.php5.php');


class ImageSeries {
	private $images = array();
	private $maxFrames;
	private $startTime;
	private $endTime;
	private $timeStep;
	private $db;
	private $tmpdir = "/var/www/hv/api/tmp/";
	private $tmpurl = "http://localhost/hv/api/tmp/";
	private $obs = "soho";
	private $filetype = "flv";
	private $highQualityBitrate = 845;
	private $watermarkURL = "/var/www/hv/images/watermark.gif";
	private $watermarkOptions = "-m1";
	
	/*
	 * constructor
	 */
	public function __construct($layers, $startTime, $zoomLevel, $numFrames, $frameRate, $hqFormat) {
		date_default_timezone_set('UTC');
		
		$this->layers = $layers;
		$this->startTime = $startTime;
		$this->zoomLevel = $zoomLevel;
		$this->numFrames = $numFrames;
		$this->frameRate = $frameRate;
		$this->highQualityFiletype = $hqFormat;
		
		$this->db = new DbConnection();
	}
	
	/*
	 * toMovie
	 */
	public function toMovie() {
		
	}
	
	/*
	 * toArchive
	 */
	public function toArchive() {
		
	}
	
	/*
	 * getNumFrames
	 */
	 public function getNumFrames() {
	 	
	 }
	 
	 /*
	  * buildMovie
	  */
	private function buildMovie() {
		
	}
	
	/*
	 * getImageTimes
	 * 
	 * Queries the database and returns an array of times of size equal to $this->numFrames. 
	 * If specified, each time will be chosen to be as close as possible to the time in the same
	 * indice of the $times array. Otherwise it will simply return an array of the closest 
	 * times to $this->startTime.
	 */
	private function getImageTimes($layer, $times = null) {
		$obs  = $this->obs;
		$inst = substr($layer, 0, 3);
		$det  = substr($layer, 3,3);
		$meas = substr($layer, 6,3);		

		$resultArray = array();

		//If $times is defined, correlate returned times to it.
		if ($times) {
			foreach ($times as $time) {
				$time = $time['unix_timestamp'];
				$sql = "SELECT DISTINCT timestamp, UNIX_TIMESTAMP(timestamp) AS unix_timestamp, UNIX_TIMESTAMP(timestamp) - $time AS timediff, ABS(UNIX_TIMESTAMP(timestamp) - $time) AS timediffAbs 
						FROM image
							LEFT JOIN measurement on measurementId = measurement.id
							LEFT JOIN measurementType on measurementTypeId = measurementType.id
							LEFT JOIN detector on detectorId = detector.id
							LEFT JOIN opacityGroup on opacityGroupId = opacityGroup.id
							LEFT JOIN instrument on instrumentId = instrument.id
							LEFT JOIN observatory on observatoryId = observatory.id
		             	WHERE observatory.abbreviation='$obs' AND instrument.abbreviation='$inst' AND detector.abbreviation='$det' AND measurement.abbreviation='$meas' ORDER BY timediffAbs LIMIT 0,1";
				$result = $this->db->query($sql);
				$row = mysql_fetch_array($result, MYSQL_ASSOC);
	    		array_push($resultArray, $row);
			}	
		}
		 
		//Otherwise simply return the closest times to the startTIme specified
		else {
			$sql = "SELECT DISTINCT timestamp, UNIX_TIMESTAMP(timestamp) AS unix_timestamp, UNIX_TIMESTAMP(timestamp) - $this->startTime AS timediff, ABS(UNIX_TIMESTAMP(timestamp) - $this->startTime) AS timediffAbs 
					FROM image
						LEFT JOIN measurement on measurementId = measurement.id
						LEFT JOIN measurementType on measurementTypeId = measurementType.id
						LEFT JOIN detector on detectorId = detector.id
						LEFT JOIN opacityGroup on opacityGroupId = opacityGroup.id
						LEFT JOIN instrument on instrumentId = instrument.id
						LEFT JOIN observatory on observatoryId = observatory.id
	             	WHERE observatory.abbreviation='$obs' AND instrument.abbreviation='$inst' AND detector.abbreviation='$det' AND measurement.abbreviation='$meas' ORDER BY timediffAbs LIMIT 0,$this->numFrames";
	
			//echo "SQL: $sql <br><br>";
	             	
			$result = $this->db->query($sql);
			
			while ($row = mysql_fetch_array($result, MYSQL_ASSOC)) {
	    		array_push($resultArray, $row);
			}
			
			//Sort the results
			foreach ($resultArray as $key => $row) {
	    		$timediff[$key]  = $row['timediff'];
			}
			array_multisort($timediff, SORT_ASC, $resultArray);
		}
		return $resultArray;		
	}
	
	/*
	 * showMovie
	 */
	public function showMovie($url, $width, $height) {
	?>
		<!-- MC Media Player -->
		<script type="text/javascript">
			playerFile = "http://www.mcmediaplayer.com/public/mcmp_0.8.swf";
			fpFileURL = "<?php print $url?>";
			playerSize = "<?php print $width . 'x' . $height?>";
		</script>
		<script type="text/javascript" src="http://www.mcmediaplayer.com/public/mcmp_0.8.js"></script>
		<!-- / MC Media Player -->
	<?php
	}
	
	/*
	 * quickMovie
	 */
	public function quickMovie() {
		// Make a temporary directory
		$now = time();
		$movieName = "Helioviewer-Quick-Movie-" . $this->startTime;
		$tmpdir = $this->tmpdir . $now . "/";
		$tmpurl = $this->tmpurl . $now . "/" . "$movieName." . $this->filetype;
		mkdir($tmpdir);

		// Create an array of the timestamps to use for each layer
		$imageTimes = array();
		
		$i = 0;
		foreach ($this->layers as $layer) {
			if ($i == 0)
				$times = $this->getImageTimes($layer);
			else
				$times = $this->getImageTimes($layer, $imageTimes[0]);
				
			array_push($imageTimes, $times);
			$i++;
		}
		//print "<br>" . sizeOf($imageTimes) . "<br><br>";
		
		// For each frame, create a composite images and store it into $this->images
		for ($j = 0; $j < $this->numFrames; $j++) {
			
			// CompositeImage expects an array of timestamps
			$timestamps = array();
		
			// Grab timestamp for each layer
			foreach ($imageTimes as $time) {
				array_push($timestamps, $time[$j]['unix_timestamp']);
			}
			
			// Build a composite image
			$img = new CompositeImage($this->layers, $timestamps, $this->zoomLevel, false);
			$filename = $tmpdir . $j . '.jpg';
			$img->writeImage($filename);
			
			array_push($this->images, $filename);
		}
		
		// 	init PHPVideoToolkit class
		$toolkit = new PHPVideoToolkit($tmpdir);
				
		// 	compile the image to the tmp dir
		$ok = $toolkit->prepareImagesForConversionToVideo($this->images, $this->frameRate);
		if(!$ok)
		{
			// 		if there was an error then get it
			echo $toolkit->getLastError()."<br />\r\n";
			exit;
		}
		
		$toolkit->setVideoOutputDimensions(1024, 1024);

		// 	set the output parameters (Flash video)
		$output_filename = "$movieName." . $this->filetype;
		$ok = $toolkit->setOutput($tmpdir, $output_filename, PHPVideoToolkit::OVERWRITE_EXISTING);
		if(!$ok)
		{
			// 		if there was an error then get it
			echo $toolkit->getLastError()."<br />\r\n";
			exit;
		}
		
		// 	execute the ffmpeg command
		$quickMov = $toolkit->execute(false, true);
		
		// 	check the return value in-case of error
		if($quickMov !== PHPVideoToolkit::RESULT_OK) {
			// 		if there was an error then get it
			echo $toolkit->getLastError()."<br />\r\n";
			exit;
		}
		
		// Create a high-quality version as well
		$hq_filename = "$movieName." . $this->highQualityFiletype;
		
		$toolkit->setVideoBitRate($this->highQualityBitrate);
		
		// Add a watermark
		$toolkit->addWatermark($this->watermarkURL, $this->watermarkOptions);
		
		$ok = $toolkit->setOutput($tmpdir, $hq_filename, PHPVideoToolkit::OVERWRITE_EXISTING);
		if(!$ok)
		{
			// 		if there was an error then get it
			echo $toolkit->getLastError()."<br />\r\n";
			exit;
		}
		
		// 	execute the ffmpeg command
		$mp4 = $toolkit->execute(false, true);
		if($mp4 !== PHPVideoToolkit::RESULT_OK) {
			// 		if there was an error then get it
			echo $toolkit->getLastError()."<br />\r\n";
			exit;
		}
	
		//$thumb = array_shift($toolkit->getLastOutput());
		//echo $thumb;
		//$this->showMovie($tmpurl, 512, 512);
		
		header('Content-type: application/json');
		echo json_encode($tmpurl);
	}
}
?>