/**
 * @fileOverview Contains the class definition for an TileLayer class.
 * @author <a href="mailto:keith.hughitt@nasa.gov">Keith Hughitt</a>
 * @author <a href="mailto:patrick.schmiedel@gmx.net">Patrick Schmiedel</a>
 * @see TileLayerAccordion, Layer
 * @requires Layer
 * 
 */
/*jslint browser: true, white: true, onevar: true, undef: true, nomen: false, eqeqeq: true, plusplus: true, 
bitwise: true, regexp: true, strict: true, newcap: true, immed: true, maxlen: 120, sub: true */
/*global Class, Layer, $, JP2Image, Image, console */
"use strict";
var TileLayer = Layer.extend( 
    /** @lends TileLayer.prototype */
    {    
    /**
     * @description Default TileLayer options
     */
    defaultOptions: {
        type        : 'TileLayer',
        opacity     : 100,
        autoOpacity : true,
        sharpen     : false
    },

    /**
     * @constructs
     * @description Creates a new TileLayer
     * @param {Object} viewport Viewport to place the tiles in
     * <br>
     * <br><div style='font-size:16px'>Options:</div><br>
     * <div style='margin-left:15px'>
     *      <b>type</b>        - The type of the layer (used by layer manager to differentiate event vs.
     *                           tile layers)<br>
     *      <b>tileSize</b>    - Tilesize to use<br>
     *      <b>source</b>      - Tile source ["database" | "filesystem"]<br>
     *      <b>opacity</b>     - Default opacity (adjusted automatically when layer is added)<br>
     *      <b>autoOpaicty</b> - Whether or not the opacity should be automatically determined when the image
     *                           properties are loaded<br>
     * </div>
     */
    init: function (controller, index, date, tileSize, api, baseURL, observatory, instrument, detector, measurement, 
                    sourceId, name, visible, opacity, layeringOrder, server) {
        $.extend(this, this.defaultOptions);
        this._super();
        
        this._requestDate = date;

        this.controller = controller;
        this.tileLayers = controller.tileLayers;
        this.viewport   = controller.viewport;
        this.tileSize   = tileSize;
        
        this.layeringOrder = layeringOrder;
        this.visible       = visible;
        this.opacity       = opacity;
        this.baseURL       = baseURL;
        this.name          = name;
        
        this.id = "tile-layer-" + sourceId;

        this.domNode = $('<div class="tile-layer-container" />').appendTo(
            this.viewport.movingContainer
        );
        
        this._setupEventHandlers();

        this.tiles = [];
        this._loadStaticProperties();
        
        $(document).trigger("create-tile-layer-accordion-entry", 
            [index, this.id, name, observatory, instrument, detector, measurement, date, false, opacity, visible,
             $.proxy(this.setOpacity, this)
            ]
        );
        
        this.image = new JP2Image(observatory, instrument, detector, measurement, sourceId, 
                                  date, server, api, $.proxy(this.onLoadImage, this));
    },
    
    /**
     * Changes data source and fetches image for new source
     */
    updateDataSource: function (observatory, instrument, detector, measurement, sourceId, name, layeringOrder) {
        this.name = name;
        this.layeringOrder = layeringOrder;
        
        this.image.updateDataSource(observatory, instrument, detector, measurement, sourceId);
    },
    
    /**
     * @description Refresh the tile layer
     * @param {Boolean} zoomLevelChanged Whether or not the zoom level has been changed
     * 
     * Rotation:
     *   Currently, EIT and MDI images are pre-rotated, and their corresponding meta-information
     *   is guaranteed to be accurate. LASCO images on the other hand are rotated during FITS -> JP2
     *   conversion. The meta-information from the FITS header is not modified, however, and reflects
     *   the original unrotated image. Therefore, when rotated = true, the coordinates should be flipped
     *   to reflect the rotation that was already done to the image itself.
     *   
     *   if (this.rotated) {
     *       this.sunCenterOffsetX = - this.sunCenterOffsetX;
     *       this.sunCenterOffsetY = - this.sunCenterOffsetY;
     *    }
     *   
     */
    refresh: function (zoomLevelChanged) {
        // Ratio of original JP2 image scale to the viewport/desired image scale
        this.scaleFactor = this.image.scale / this.viewport.getImageScale();
        
        this.width  = this.image.width  * this.scaleFactor;
        this.height = this.image.height * this.scaleFactor;
        
        // Offset image
        this.sunCenterOffsetX = parseFloat((this.image.offsetX * this.scaleFactor).toPrecision(8));
        this.sunCenterOffsetY = parseFloat((this.image.offsetY * this.scaleFactor).toPrecision(8));
        
        this.domNode.css({
            "left": - this.sunCenterOffsetX,
            "top" : - this.sunCenterOffsetY
        });
        
        this.refreshTiles(zoomLevelChanged);
    },
    
    /**
     * 
     */
    onLoadImage: function () {
        this.viewport.checkTiles(true);
        this.refresh(false);
        
        // Update viewport sandbox if necessary
        $(document).trigger("tile-layer-finished-loading", [this.getDimensions()]).
                    trigger("update-tile-layer-accordion-entry", 
                           [this.id, this.name, this.opacity, new Date(getUTCTimestamp(this.image.date)), 
                            this.image.filepath, this.image.filename, this.image.server]);
    },        
    
    /**
     * @description Refresh displayed tiles
     * @param {Boolean} zoomLevelChanged Whether or not the zoom level has been changed
     */
    refreshTiles: function (zoomLevelChanged) {
        var i, j, old, numTiles, numTilesLoaded, indices, tile, onLoadComplete, visible, self = this;
        
        visible = this.viewport.visible;

        this.computeValidTiles();
        this.tiles = [];
        
        old = this.getTileArray();

        // When zooming, remove old tiles right away to avoid visual glitches
        if (zoomLevelChanged) {
            this.removeTileDomNodes(old);
        }
        
        numTiles = 0;
        numTilesLoaded = 0;
    
        indices = this.viewport.visibleRange;
        
        // When stepping forward or back in time remove old times only after all new ones have been added
        onLoadComplete = function () {
            numTilesLoaded += 1;

            // After all tiles have loaded, stop indicator (and remove old-tiles if haven't already)
            if (numTilesLoaded === numTiles) {
                if (!zoomLevelChanged) {
                    self.removeTileDomNodes(old);
                }
            }
        };
        
        // Load tiles that lie within the current viewport
        for (i = indices.xStart; i <= indices.xEnd; i += 1) {
            for (j = indices.yStart; j <= indices.yEnd; j += 1) {
                if (!this.validTiles[i]) {
                    this.validTiles[i] = [];
                }

                if (visible[i][j] && this.validTiles[i][j]) {
                    tile = this.getTile(i, j, this.viewport.imageScale);
                    this.domNode.append(tile);
    
                    if (!this.tiles[i]) {
                        this.tiles[i] = [];
                    }
    
                    this.tiles[i][j] = {};
                    this.tiles[i][j].img = tile;
    
                    numTiles += 1;
    
                    // Makes sure all of the images have finished downloading before swapping them in
                    this.tiles[i][j].img.load(onLoadComplete);
                }
            }
        }        
    },
    
    /**
     * @description remove tile dom-nodes
     */
    removeTileDomNodes: function (tileArray) {
        $.each(tileArray, function () {
            if (this.parentNode) {
                $(this).remove();
            }
        });
    },
    
    /**
     * @description Returns an array container the values of the positions for each edge of the TileLayer.
     */
    getDimensions: function () {
        return {
            "width" : this.width  + this.sunCenterOffsetX,
            "height": this.height + this.sunCenterOffsetY
        };
    },
    
    /**
     * @description Creates an array of tile dom-nodes
     * @return {Array} An array containing pointgetDimensions: ers to all of the tiles currently loaded
     */
    getTileArray: function () {
        var tiles = [];
        
        this.domNode.children().each(function () {
            tiles.push(this);
        });
        
        return tiles;
    },

    /**
     * @description Creates a 2d array representing the range of valid (potentially data-containing) tiles
     */
    computeValidTiles: function () {
        var i, j, indices;
        
        indices = this.getValidTileRange();
        
        // Reset array
        this.validTiles = [];
        
        // Update validTiles array
        for (i = indices.xStart; i <= indices.xEnd; i += 1) {
            for (j = indices.yStart; j <= indices.yEnd; j += 1) {
                if (!this.validTiles[i]) {
                    this.validTiles[i] = [];
                }
                this.validTiles[i][j] = true;
            }
        }        
    },
    
    /**
     * @description Determines the boundaries for the valid tile range
     * @return {Array} An array containing the tile boundaries
     */
    getValidTileRange: function () {
        var numTilesX, numTilesY, boundaries, ts = this.tileSize;
        
        // Number of tiles for the entire image
        numTilesX = Math.max(2, Math.ceil(this.width  / ts));
        numTilesY = Math.max(2, Math.ceil(this.height  / ts));
        
        // Tile placement architecture expects an even number of tiles along each dimension
        if ((numTilesX % 2) !== 0) {
            numTilesX += 1;
        }

        if ((numTilesY % 2) !== 0) {
            numTilesY += 1;
        }

        // boundaries for tile range
        boundaries = {
            xStart: - (numTilesX / 2),
            xEnd  :   (numTilesX / 2) - 1,
            yStart: - (numTilesY / 2),
            yEnd  :   (numTilesY / 2) - 1
        };
        
        return boundaries;
    },

    /**
     * @description Sets the opacity for the layer, taking into account layers which overlap one another.
     */
    setInitialOpacity: function () {
        var self = this,
            opacity = 1,
            counter = 0;

        this.tileLayers.each(function () {
            if (parseInt(this.layeringOrder, 10) === parseInt(self.layeringOrder, 10)) {
                counter += 1;
            }
        });
        
        //Do no need to adjust opacity if there is only one image
        if (counter > 1) {
            opacity = opacity / counter;
            this.setOpacity(opacity * 100);
        }
        
        this.autoOpacity = false;
    },

    /**
     * @description Update the tile layer's opacity
     * @param {int} Percent opacity to use
     */
    setOpacity: function (opacity) {
        this.opacity = opacity;
        
        // IE
        if (!$.support.opacity) {
            $(this.domNode).find(".tile").each(function () {
                $(this).css("opacity", opacity / 100);
            });
        }
        // Everyone else
        else {
            $(this.domNode).css("opacity", opacity / 100);
        }
    },
    
    /**
     * @description Sets up image properties that are not dependent on the specific image,
     * but only on the type (source) of the image.
     * 
     * IE7: Want z-indices < 1 to ensure event icon visibility
     */
    _loadStaticProperties: function () {
        this.domNode.css("z-index", parseInt(this.layeringOrder, 10) - 10);
        
        // opacity
        if (this.opacity !== 100) {
            this.setOpacity(this.opacity);
        }
        else if (this.autoOpacity) {
            this.setInitialOpacity();
        }
        
        // visibility
        if (!this.visible) {
            this.setVisibility(false);
        }
    },
    
    /**
     * @description Toggle image sharpening
     */
    toggleSharpening: function () {
        if (this.sharpen === true) {
            
        } else {
            //$(this.domNode.childElements());
            //$("img.tile[src!=resources/images/transparent_512.gif]").pixastic("sharpen", {amount: 0.35});
        }
        this.sharpen = !this.sharpen;
    },

    /**
     * @description Check to see if all visible tiles have been loaded
     */
    viewportMove: function () {
        var visible, indices, i, j;
        
        this.viewport.checkTiles();
        
        visible = this.viewport.visible;
        indices = this.viewport.visibleRange;    

        for (i = indices.xStart; i <= indices.xEnd; i += 1) {
            for (j = indices.yStart; j <= indices.yEnd; j += 1) {
                if (!this.tiles[i]) {
                    this.tiles[i] = [];
                }
                if (!this.validTiles[i]) {
                    this.validTiles[i] = [];
                }
                if (visible[i][j] && (!this.tiles[i][j]) && this.validTiles[i][j]) {
                    this.tiles[i][j] = this.getTile(i, j).appendTo(this.domNode);
                }
            }
        }
    },

    /**
     * @description Generates URL to retrieve a single Tile and displays the transparent tile if request fails
     * @param {Int} x Tile X-coordinate
     * @param {Int} y Tile Y-coordinate
     * @returns {String} URL to retrieve the requested tile
     * 
     * IE: CSS opacities do not behave properly with absolutely positioned elements. Opacity is therefor 
     * set at tile-level.
     */
    getTile: function (x, y) {
        var top, left, imageScale, ts, img, rf, emptyTile, uri, self  = this;

        left       = x * this.tileSize;
        top        = y * this.tileSize;
        imageScale = this.viewport.imageScale;
        ts         = this.tileSize;
        
        rf = function () {
            return false;
        };
        
        emptyTile = 'resources/images/transparent_' + ts + '.gif';
            
        //img = $('<img class="tile" style="left:' + left + 'px; top:' + top + 'px;"></img>');
        img = new Image();

        img.unselectable = 'on';

        img.onmousedown   = rf;
        img.ondrag        = rf;
        img.onmouseover   = rf;
        img.oncontextmenu = rf;
        img.onselectstart = rf;
        img.galleryimg    = 'no';

        img = $(img).addClass("tile").css({"left": left, "top": top}).attr("alt", "");

        // IE (can only adjust opacity at the image level)
        if (!$.support.opacity) {
            img.css("opacity", this.opacity / 100);
        }
        
        uri = this.image.filepath + "/" + this.image.filename;

        // Load tile
        img.error(function (e) {
            img.unbind("error");
            $(this).attr("src", emptyTile);
        }).load(function () {
            $(this).width(512).height(512); // Wait until image is done loading specify dimensions in order to prevent 
                                            // Firefox from displaying place-holders
        }).attr("src", this.getTileURL(this.image.server, x, y));
        
        return img;
    },
    
    /**
     * @description Returns a formatted string representing a query for a single tile
     * 
     * TODO 02/25/2010: What would be performance loss from re-fetching meta information on server-side?
     */
    getTileURL: function (serverId, x, y) {
        var file, format, params;

        file   = this.image.filepath + "/" + this.image.filename;
        format = (this.layeringOrder === 1 ? "jpg" : "png");

        params = {
            "action"           : "getTile",
            "uri"              : file,
            "x"                : x,
            "y"                : y,
            "format"           : format,
            "date"             : this.image.date,
            "tileScale"        : this.viewport.imageScale,
            "ts"               : this.tileSize,
            "jp2Width"         : this.image.width,
            "jp2Height"        : this.image.height,
            "jp2Scale"         : this.image.scale,
            "obs"              : this.image.observatory,
            "inst"             : this.image.instrument,
            "det"              : this.image.detector,
            "meas"             : this.image.measurement,
            "sunCenterOffsetX" : this.image.offsetX,
            "sunCenterOffsetY" : this.image.offsetY                        
        };
        return this.baseURL + "?" + $.param(params);
    },

    /**
     * @description Tests all four corners of the visible image area to see if they are within the 
     *              transparent circle region of LASCO C2 and LASCO C3 images. It uses the distance
     *              formula: d = sqrt( (x2 - x1)^2 + (y2 - y1)^2 ) to find the distance from the center to 
     *              each corner, and if that distance is less than the radius, it is inside the circle region. 
     * @param {Object} radius -- The radius of the circle region in the jp2 image
     * @param {Object} center -- The center coordinate of the jp2 image (jp2Width / 2). 
     * @param {Object} left -- Left coordinate of the selected region
     * @param {Object} top -- Top coordinate of the selected region
     * @param {Object} width -- width of the selected region
     * @param {Object} height -- height of the selected region
     * @return false as soon as it finds a distance outside the radius, or true if it doesn't.
     */
    insideCircle: function (radius, center, left, top, width, height) {
        var right = left + width, bottom = top + height, distance, distX, distY, corners, c;
        corners = {
            topLeft        : {x: left,  y: top},
            topRight    : {x: right, y: top},
            bottomLeft    : {x: left,  y: bottom},
            bottomRight    : {x: right, y: bottom}
        };

        for (c in corners) {
            // Make JSLint happy...
            if (true) {
                distX = Math.pow(center - corners[c].x, 2);
                distY = Math.pow(center - corners[c].y, 2);
                distance = Math.sqrt(distX + distY);
                if (distance > radius) {
                    return false;
                }
            }
        }

        return true;
    },
    
    /**
     * @description Returns a stringified version of the tile layer for use in URLs, etc
     * @return string String representation of the tile layer
     */
    serialize: function () {
        return this.image.observatory + "," + this.image.instrument + "," + this.image.detector + "," +
               this.image.measurement + "," + (this.visible ? "1" : "0") + "," + this.opacity;
    },
    
    /**
     * @description Returns a JSON representation of the tile layer for use by the UserSettings manager
     * @return JSON A JSON representation of the tile layer     
     */
    toJSON: function () {
        return {
            "server"     : this.image.server,
            "observatory": this.image.observatory,
            "instrument" : this.image.instrument,
            "detector"   : this.image.detector,
            "measurement": this.image.measurement,
            "visible"    : this.visible,
            "opacity"    : this.opacity
        };
    },
    
    /**
     * @description Sets up event-handlers to deal with viewport motion
     */
    _setupEventHandlers: function () {
        var self = this;
        
        $(document).bind('viewport-move', $.proxy(this.viewportMove, this))
                   .bind('toggle-layer-visibility', function (event, id) {
                        if (self.id === id) {
                            self.toggleVisibility();
                            self.tileLayers.save();
                        }
                    })
                   .bind('tile-layer-data-source-changed',
                       function (event, id, obs, inst, det, meas, sourceId, name, layeringOrder) {
                            if (self.id === id) {
                                self.updateDataSource(obs, inst, det, meas, sourceId, name, layeringOrder);
                                self.tileLayers.save();
                            }
                        });
    }
});
